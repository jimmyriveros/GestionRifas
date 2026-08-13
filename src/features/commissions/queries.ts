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

export type CommissionSummary = {
  sellerId: string
  raffleId: string
  /**
   * Como se le paga (BR-G13). `true`: por tramos, porque pertenece a un equipo.
   * `false`: la mitad del precio vigente de la rifa por cada boleta cobrada.
   * La pantalla lo necesita porque a quien cobra la mitad no se le puede hablar
   * de «subir de nivel»: no hay niveles que subir.
   */
  byTiers: boolean
  /** Boletas pagadas por completo: las que cuentan para la comision (BR-G01). */
  ticketsPaid: number
  /** Lo que vale hoy cada boleta pagada. */
  rate: number
  /** Ganancia acumulada YA conseguida. */
  earned: number
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
  by_tiers: boolean
  tickets_paid: number
  rate: number
  earned: number
  next_min_tickets: number | null
  next_rate: number | null
  tickets_to_next: number | null
  projected_earned: number | null
}): CommissionSummary {
  return {
    sellerId: row.seller_id,
    raffleId: row.raffle_id,
    byTiers: row.by_tiers,
    ticketsPaid: Number(row.tickets_paid ?? 0),
    rate: Number(row.rate ?? 0),
    earned: Number(row.earned ?? 0),
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
