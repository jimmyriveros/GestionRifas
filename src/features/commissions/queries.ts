import 'server-only'

import { listRaffleOptions, type RaffleOption } from '@/features/raffles/queries'
import { createClient } from '@/lib/supabase/server'

/**
 * Lectura de comisiones.
 *
 * TODO pasa por `commission_summary` (migracion 0024): ninguna pantalla suma,
 * multiplica ni decide tramos por su cuenta. Es la regla del proyecto para el
 * dinero —se calcula en SQL— y ademas lo que pedia el encargo: una sola fuente
 * de verdad en el servidor.
 *
 * La funcion es `security invoker`, asi que quien pregunta recibe lo suyo, lo de
 * su equipo o —si es personal— lo de su organizacion, sin que este archivo tenga
 * que repetir esas condiciones.
 */

/**
 * Con que regla se le paga a este vendedor (BR-G13, BR-G24).
 *
 *   `half_price` — no pertenece a ningun equipo: la mitad del precio vigente de
 *                  la rifa. Incluye al vendedor que ARMO un equipo.
 *   `tiered`     — integrante de un equipo, por tramos.
 *   `fixed`      — integrante de un equipo, con una cifra fija pactada con su
 *                  vendedor padre.
 *
 * Las tres se explican con palabras distintas y ninguna sirve para las otras
 * dos: a quien cobra fijo no se le puede hablar de subir de nivel, y a quien
 * cobra la mitad tampoco, pero por motivos que no son el mismo.
 */
export type PayModel = 'half_price' | 'tiered' | 'fixed'

export type CommissionSummary = {
  sellerId: string
  raffleId: string
  payModel: PayModel
  /**
   * Verdadero solo con `tiered`. Es exactamente la condicion que habilita
   * hablar de «subir de nivel», y por eso sigue existiendo aparte de
   * `payModel`: las pantallas preguntan por la capacidad, no por el nombre.
   */
  byTiers: boolean
  /** Boletas pagadas por completo: las que cuentan para la comision (BR-G01). */
  ticketsPaid: number
  /** Lo que vale hoy cada boleta pagada. */
  rate: number
  /**
   * Ganancia acumulada por lo que vendio EL MISMO, con sus rebajas ya restadas
   * (BR-G17). No incluye lo que le deja su equipo: eso es `teamEarned`, y van
   * separadas porque son dinero de distinta naturaleza y la pantalla tiene que
   * poder decir cual es cual.
   */
  earned: number
  /** Boletas cobradas por los integrantes de su equipo (BR-G20). Cero sin equipo. */
  teamTicketsPaid: number
  /**
   * Lo que le queda por las ventas de su equipo: por cada boleta cobrada, la
   * mitad del precio menos la tarifa del integrante (BR-G20). Cero sin equipo.
   */
  teamEarned: number
  /** Lo que se le debe en total por esta rifa. Es lo que se le paga. */
  totalEarned: number
  /**
   * Lo que se ha dejado de ganar por rebajar boletas (BR-G17, D-099).
   *
   * Se DERIVA de las otras tres cifras, no se consulta: por definicion
   * `earned = ticketsPaid × rate − rebajas`, asi que la resta es exacta. Y es
   * ademas la unica forma segura de obtenerla aqui: `commission_summary` es
   * `security invoker`, de modo que un `join` contra `tickets` devolveria cero
   * para los integrantes de un equipo —su vendedor padre no ve sus boletas
   * (D-092)— sin que nada avisara (misma trampa que I-015).
   *
   * Cuando la ganancia toca su suelo de cero (BR-G19) esta cifra se queda corta:
   * lo rebajado de verdad fue mas. Solo sirve para explicar una ganancia, nunca
   * como dato contable.
   */
  discounts: number
  /** Cuantas boletas hacen falta para el siguiente nivel; null si no hay mas. */
  nextMinTickets: number | null
  nextRate: number | null
  ticketsToNext: number | null
  /** PROYECCION: lo que ganaria al llegar al siguiente nivel. No es dinero ganado. */
  projectedEarned: number | null
}

function mapRow(row: {
  seller_id: string
  raffle_id: string
  pay_model: string
  by_tiers: boolean
  tickets_paid: number
  rate: number
  earned: number
  team_tickets_paid: number
  team_earned: number
  next_min_tickets: number | null
  next_rate: number | null
  tickets_to_next: number | null
  projected_earned: number | null
}): CommissionSummary {
  const ticketsPaid = Number(row.tickets_paid ?? 0)
  const rate = Number(row.rate ?? 0)
  const earned = Number(row.earned ?? 0)
  const teamEarned = Number(row.team_earned ?? 0)

  return {
    sellerId: row.seller_id,
    raffleId: row.raffle_id,
    // `commission_summary` solo devuelve estos tres, pero el tipo generado dice
    // `string`: la comprobacion mantiene honesto el tipo sin confiar en un cast.
    payModel:
      row.pay_model === 'tiered' || row.pay_model === 'fixed' ? row.pay_model : 'half_price',
    byTiers: row.by_tiers,
    ticketsPaid,
    rate,
    earned,
    teamTicketsPaid: Number(row.team_tickets_paid ?? 0),
    teamEarned,
    totalEarned: earned + teamEarned,
    // Se deriva de lo PROPIO, nunca del total: sumarle lo del equipo daria cero
    // rebajas en cuanto un vendedor padre tuviera equipo (BR-G20).
    discounts: Math.max(0, ticketsPaid * rate - earned),
    nextMinTickets: row.next_min_tickets,
    nextRate: row.next_rate === null ? null : Number(row.next_rate),
    ticketsToNext: row.tickets_to_next,
    projectedEarned: row.projected_earned === null ? null : Number(row.projected_earned),
  }
}

async function listCommissions(raffleId?: string): Promise<CommissionSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('commission_summary', {
    p_raffle_id: raffleId,
  })

  if (error) throw error
  return (data ?? []).map(mapRow)
}

/**
 * De que rifa habla la comision que se muestra.
 *
 * El negocio opera una sola rifa activa (D-088) y entonces esto devuelve esa y
 * ya esta. Pero el modelo admite varias, y ahi «la mas reciente» resulto ser
 * una regla mala: al probarlo con la base de las pruebas —que acumula rifas
 * creadas por las E2E— eligio una rifa activa sin ventas y la pantalla mostro
 * $0 a un vendedor que tenia $80.000. La regla correcta es «donde esta el
 * trabajo»: entre las activas, aquella donde quien consulta acumula mas boletas
 * cobradas.
 *
 * Y la pantalla dice de que rifa habla: con una sola es redundante, con varias
 * es la diferencia entre informar y confundir.
 */
export type CommissionContext = {
  /** De qué rifa hablan las cifras. `null` si no hay ninguna activa. */
  raffle: RaffleOption | null
  /** Comisión de cada vendedor visible EN ESA rifa, por id de vendedor. */
  bySeller: Map<string, CommissionSummary>
}

/**
 * Todo lo que una pantalla necesita para hablar de comisión, en dos consultas.
 *
 * Elegir la rifa y leer las cifras salen de la MISMA lectura: pedirlas por
 * separado significaba llamar a `commission_summary` dos veces por pantalla
 * —una para decidir y otra para mostrar— y nada garantizaba que las dos vieran
 * lo mismo.
 */
export async function getCommissionContext(): Promise<CommissionContext> {
  const [rows, raffles] = await Promise.all([listCommissions(), listRaffleOptions()])

  const active = raffles.filter((raffle) => raffle.status === 'active')

  let elegida: RaffleOption | null = active[0] ?? null
  if (active.length > 1) {
    const paidByRaffle = new Map<string, number>()
    for (const row of rows) {
      paidByRaffle.set(row.raffleId, (paidByRaffle.get(row.raffleId) ?? 0) + row.ticketsPaid)
    }
    elegida =
      [...active].sort(
        (a, b) =>
          (paidByRaffle.get(b.id) ?? 0) - (paidByRaffle.get(a.id) ?? 0) ||
          b.shortCode.localeCompare(a.shortCode),
      )[0] ?? null
  }

  const bySeller = new Map<string, CommissionSummary>(
    rows.filter((row) => row.raffleId === elegida?.id).map((row) => [row.sellerId, row]),
  )

  return { raffle: elegida, bySeller }
}

/**
 * Lo que se paga por la primera boleta.
 *
 * Sirve para explicarle la regla a quien todavia no ha cobrado ninguna, que es
 * justo cuando no hay fila de comision que leer. Sale de la tabla de tramos, no
 * de una constante: si el negocio cambia lo que paga, el texto cambia con el.
 */
export async function getFirstTierRate(): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commission_tiers')
    .select('rate')
    .order('min_tickets', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return Number(data?.rate ?? 0)
}

export type CommissionTier = {
  /** Desde cuantas boletas cobradas aplica esta tarifa. */
  minTickets: number
  rate: number
}

/**
 * Los tramos vigentes de la organizacion, para poder ENSEÑARLOS.
 *
 * La tarjeta que ofrece «ganancia por tramos» tiene que decir cuales son, y no
 * puede llevarlos escritos: son filas de `commission_tiers` y el negocio puede
 * cambiarlos sin desplegar (BR-G03). Escritos en el componente, el dia que
 * cambiaran la pantalla prometeria una cifra y la base de datos pagaria otra.
 *
 * La politica `commission_tiers_select` deja leerlos a todo miembro de la
 * organizacion: son la regla del juego, no un dato de nadie.
 */
export async function listCommissionTiers(): Promise<CommissionTier[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commission_tiers')
    .select('min_tickets, rate')
    .order('min_tickets', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => ({
    minTickets: Number(row.min_tickets),
    rate: Number(row.rate),
  }))
}

/**
 * El tope de la ganancia fija: la mitad del precio de la rifa (BR-G23).
 *
 * Sale de la misma funcion que aplica el trigger, no de una cuenta hecha aqui:
 * si el formulario calculara su propio tope y la base de datos otro, el usuario
 * veria un mensaje de error despues de que la pantalla le dijera que su cifra
 * era valida. `null` significa que la organizacion no tiene ninguna rifa y no
 * hay precio contra el que medir.
 */
export async function getMaxFixedCommission(organizationId: string): Promise<number | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('team_max_fixed_commission', {
    p_organization_id: organizationId,
  })

  if (error) throw error
  return data === null ? null : Number(data)
}

/**
 * Quien aparece en `bySeller` lo decide la RLS, no este archivo: un vendedor
 * recibe lo suyo y lo de su equipo; el Dueño y el Administrador, lo de toda la
 * organizacion (BR-G12). La misma lectura sirve al panel del vendedor, a «Mi
 * equipo» y al portal administrativo.
 *
 * Que un vendedor no tenga fila NO es lo mismo que tener cero: significa que
 * todavia no ha cobrado ninguna boleta en esa rifa, y la pantalla lo dice con
 * palabras en vez de pintar un importe.
 */
