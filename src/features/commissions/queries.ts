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
export async function getCurrentCommissionRaffle(): Promise<RaffleOption | null> {
  const [rows, raffles] = await Promise.all([listCommissions(), listRaffleOptions()])

  const active = raffles.filter((raffle) => raffle.status === 'active')
  if (active.length <= 1) return active[0] ?? null

  const paidByRaffle = new Map<string, number>()
  for (const row of rows) {
    paidByRaffle.set(row.raffleId, (paidByRaffle.get(row.raffleId) ?? 0) + row.ticketsPaid)
  }

  return (
    [...active].sort(
      (a, b) =>
        (paidByRaffle.get(b.id) ?? 0) - (paidByRaffle.get(a.id) ?? 0) ||
        b.shortCode.localeCompare(a.shortCode),
    )[0] ?? null
  )
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
 * La comision de quien consulta, en la rifa indicada.
 *
 * Devuelve `null` cuando todavia no tiene ninguna boleta pagada en esa rifa: no
 * hay fila que leer, y eso es distinto de tener cero por haberla perdido. La
 * pantalla lo trata como «aun no has cobrado ninguna boleta».
 */
export async function getMyCommission(
  profileId: string,
  raffleId: string,
): Promise<CommissionSummary | null> {
  const rows = await listCommissions(raffleId)
  return rows.find((row) => row.sellerId === profileId) ?? null
}

/**
 * La comision de cada vendedor en una rifa, indexada por vendedor.
 *
 * Devuelve lo que quien consulta tiene derecho a ver, y eso lo decide la RLS:
 * un vendedor con equipo recibe el suyo y el de sus integrantes; el Dueño y el
 * Administrador, el de toda la organizacion (BR-G12). La misma consulta sirve a
 * «Mi equipo» y al portal administrativo.
 *
 * Acotada a UNA rifa a proposito: la comision es por rifa (BR-G04), asi que un
 * mapa por vendedor sin rifa mezclaria tramos de rifas distintas y mostraria un
 * numero que no significa nada.
 */
export async function getCommissionsBySeller(
  raffleId: string,
): Promise<Map<string, CommissionSummary>> {
  const rows = await listCommissions(raffleId)
  return new Map(rows.map((row) => [row.sellerId, row]))
}
