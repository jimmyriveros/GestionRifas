import 'server-only'

import { listOrgMembers } from '@/features/users/queries'
import { PAGE_SIZE, type TicketInventoryStatus, type TicketPaymentStatus } from '@/lib/constants'
import { isTicketSearchTerm, normalizeSearchTerm } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'

/**
 * Lecturas de boletas. La politica `tickets_select` ya limita las filas a la
 * organizacion (y, para un vendedor, a las suyas): los filtros de aqui son de
 * usabilidad y eficiencia, no de seguridad (docs/ARCHITECTURE.md 7.1).
 */

export type TicketFilters = {
  raffleId?: string
  sellerId?: string
  clientId?: string
  inventoryStatus?: TicketInventoryStatus
  paymentStatus?: TicketPaymentStatus
  /**
   * Un solo termino para las dos formas de buscar una boleta: sus numeros
   * —diario o semanal, enteros o en parte (BR-N11)— o el nombre del cliente
   * que la tiene (BR-N13). El codigo interno no participa en ninguna.
   */
  search?: string
  /**
   * Boletas concretas por su id: lo usa la seleccion multiple, que se acumula
   * entre busquedas distintas y por tanto no se puede describir con filtros
   * (BR-B01). Convive con el resto de filtros, aunque en la practica se usa sola.
   */
  ticketIds?: readonly string[]
  page?: number
  pageSize?: number
}

export type TicketListItem = {
  id: string
  internalCode: string
  dailyNumber: string | null
  weeklyNumber: string | null
  inventoryStatus: TicketInventoryStatus
  paymentStatus: TicketPaymentStatus
  salePrice: number | null
  paidAmount: number
  saleDate: string | null
  createdAt: string
  raffleId: string
  raffleName: string
  raffleShortCode: string
  sellerId: string
  sellerName: string
  clientId: string | null
  clientName: string | null
}

const TICKET_SELECT = `
  id,
  internal_code,
  daily_number,
  weekly_number,
  inventory_status,
  payment_status,
  sale_price,
  paid_amount,
  sale_date,
  created_at,
  raffle_id,
  seller_id,
  client_id,
  raffle:raffles!tickets_raffle_org_fk ( name, short_code ),
  client:clients!tickets_client_org_fk ( id, name )
`

type TicketRow = {
  id: string
  internal_code: string
  daily_number: string | null
  weekly_number: string | null
  inventory_status: TicketInventoryStatus
  payment_status: TicketPaymentStatus
  sale_price: number | null
  paid_amount: number
  sale_date: string | null
  created_at: string
  raffle_id: string
  seller_id: string
  client_id: string | null
  raffle: { name: string; short_code: string } | null
  client: { id: string; name: string } | null
}

/**
 * Los filtros del listado, aplicados a una consulta ya empezada.
 *
 * Vive aparte porque lo usan DOS lecturas: la que pinta la tabla y la que
 * resuelve «seleccionar todas las que coinciden» (`listTicketIdsMatching`). Si
 * cada una escribiera sus propios `eq`, bastaria con que alguien anadiera un
 * filtro en un sitio para que la seleccion marcara boletas que no estan en
 * pantalla.
 *
 * El tipo es generico y auto-referente (`Q extends TicketQuery<Q>`) para que
 * valga igual sobre una consulta que pide todas las columnas y sobre una que
 * pide solo `id`, sin convertir nada a `any`.
 */
type TicketQuery<Q> = {
  in(column: 'id', values: string[]): Q
  eq(column: string, value: string): Q
}

function applyTicketFilters<Q extends TicketQuery<Q>>(query: Q, filters: TicketFilters): Q {
  let next = query
  if (filters.ticketIds) next = next.in('id', [...filters.ticketIds])
  if (filters.raffleId) next = next.eq('raffle_id', filters.raffleId)
  if (filters.sellerId) next = next.eq('seller_id', filters.sellerId)
  if (filters.clientId) next = next.eq('client_id', filters.clientId)
  if (filters.inventoryStatus) next = next.eq('inventory_status', filters.inventoryStatus)
  if (filters.paymentStatus) next = next.eq('payment_status', filters.paymentStatus)
  return next
}

export async function listTickets(
  filters: TicketFilters,
): Promise<{ rows: TicketListItem[]; total: number; page: number; pageSize: number }> {
  const pageSize = filters.pageSize ?? PAGE_SIZE
  const page = Math.max(1, filters.page ?? 1)

  const search = filters.search ? normalizeSearchTerm(filters.search) : ''
  if (search !== '') return searchTicketsMatching(filters, search, page, pageSize)

  const supabase = await createClient()
  const query = applyTicketFilters(
    supabase.from('tickets').select(TICKET_SELECT, { count: 'exact' }),
    filters,
  )

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (error) throw error

  const sellerNames = await sellerNameMap()

  return {
    rows: ((data ?? []) as TicketRow[]).map((row) => mapTicketRow(row, sellerNames)),
    total: count ?? 0,
    page,
    pageSize,
  }
}

/**
 * Busqueda de boletas con UN solo termino, ordenada por relevancia.
 *
 * El termino puede ser el numero de la boleta —diario o semanal, entero o en
 * parte (BR-N11)— o el nombre del cliente que la tiene (BR-N13). Quien busca no
 * tiene que decir cual de las dos cosas escribio: lo distingue la propia
 * funcion. El resultado es siempre una lista de BOLETAS; estamos en «Boletas».
 *
 * Va por la funcion `search_tickets` (migraciones 0018 y 0029) y no por
 * PostgREST por dos razones que no han cambiado:
 *
 *   * El ORDEN depende del termino buscado —el numero diario manda sobre el
 *     semanal; el nombre completo, sobre la coincidencia suelta— y eso no es
 *     una columna por la que se pueda ordenar. Reordenar en el navegador no
 *     vale: la lista esta paginada en servidor, asi que solo reacomodaria las
 *     filas de la pagina que ya se esta viendo.
 *   * Buscar por nombre exige cruzar `tickets` con `clients`, y ese cruce se
 *     resuelve en SQL. Traerse los clientes al navegador para compararlos ahi
 *     dejaria de funcionar en cuanto haya mas de una pagina de ellos (I-036).
 *
 * La funcion es `security invoker`: hereda `tickets_select` y `clients_select`,
 * de modo que un vendedor sigue encontrando unicamente sus boletas, tambien
 * cuando busca por el nombre de un cliente.
 */
async function searchTicketsMatching(
  filters: TicketFilters,
  search: string,
  page: number,
  pageSize: number,
): Promise<{ rows: TicketListItem[]; total: number; page: number; pageSize: number }> {
  // Un termino que no puede ser ni un numero de boleta ni un nombre —una sola
  // letra— se responde sin ir a la base de datos. La funcion aplica la misma
  // regla, asi que esto es un atajo, no la unica defensa.
  if (!isTicketSearchTerm(search)) {
    return { rows: [], total: 0, page, pageSize }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_tickets', {
    p_search: search,
    p_raffle_id: filters.raffleId,
    p_seller_id: filters.sellerId,
    p_client_id: filters.clientId,
    p_inventory_status: filters.inventoryStatus,
    p_payment_status: filters.paymentStatus,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  })

  if (error) throw error

  const rows = data ?? []
  const sellerNames = await sellerNameMap()

  return {
    // `total_count` viaja repetido en cada fila; sin filas, no hay resultados.
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      internalCode: row.internal_code,
      dailyNumber: row.daily_number,
      weeklyNumber: row.weekly_number,
      inventoryStatus: row.inventory_status,
      paymentStatus: row.payment_status,
      salePrice: row.sale_price,
      paidAmount: row.paid_amount,
      saleDate: row.sale_date,
      createdAt: row.created_at,
      raffleId: row.raffle_id,
      raffleName: row.raffle_name ?? '',
      raffleShortCode: row.raffle_short_code ?? '',
      sellerId: row.seller_id,
      sellerName: sellerNames.get(row.seller_id) ?? 'Vendedor',
      clientId: row.client_id,
      clientName: row.client_name,
    })),
    page,
    pageSize,
  }
}

/**
 * Solo los IDENTIFICADORES de las boletas que coinciden, y cuantas hay.
 *
 * Lo usa «seleccionar todas las que coinciden». Antes se resolvia llamando a
 * `listTickets` con tamano de pagina 1.000 y quedandose con `row.id`: el
 * servidor traia mil filas completas —con el nombre de la rifa y el del
 * cliente— para tirar el 95 % de cada una. Ahora se pide una sola columna
 * (D-103).
 *
 * Los filtros son los MISMOS gracias a `applyTicketFilters`, que es justo lo
 * que garantiza que se seleccione lo que se esta viendo. Cuando hay termino de
 * busqueda no hay atajo posible: el orden por relevancia lo decide
 * `search_tickets`, asi que ese camino sigue pasando por `listTickets`.
 */
export async function listTicketIds(
  filters: TicketFilters,
  limit: number,
): Promise<{ ids: string[]; total: number }> {
  const search = filters.search ? normalizeSearchTerm(filters.search) : ''
  if (search !== '') {
    const { rows, total } = await listTickets({ ...filters, page: 1, pageSize: limit })
    return { ids: rows.map((row) => row.id), total }
  }

  const supabase = await createClient()
  const query = applyTicketFilters(
    supabase.from('tickets').select('id', { count: 'exact' }),
    filters,
  )

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(0, limit - 1)

  if (error) throw error

  return { ids: (data ?? []).map((row) => row.id), total: count ?? 0 }
}

export type TicketDetail = TicketListItem & {
  approvedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  assignedAt: string | null
  raffleStatus: string
  raffleTicketPrice: number
  /**
   * Precio oficial CONGELADO al vender (BR-P10). `null` mientras no se ha
   * vendido, y tambien en las boletas vendidas antes de 0028 —que equivalen a
   * rebaja cero—.
   */
  basePrice: number | null
  /** Lo mas barato que se puede vender (BR-P11). Sale de SQL, no se deduce
   *  aqui: depende de la forma de pago del vendedor de esta boleta. */
  minSalePrice: number
  /**
   * Telefono del cliente, para la tarjeta que lleva a su ficha (D-101). Solo
   * en el DETALLE: el listado no lo necesita, y anadirlo alli obligaria a
   * cambiar las columnas que devuelve `search_tickets`.
   */
  clientPhone: string | null
  /**
   * La boleta tiene ALGUNA fila en `payment_allocations`, aunque el pago este
   * anulado o el importe se haya corregido a $0 (BR-I13, D-168).
   *
   * No sirve `paidAmount > 0`: ese es el saldo vigente y vuelve a cero al
   * anular. Lo que impide cambiar de cliente es el HISTORIAL, que no se borra.
   */
  hasPaymentHistory: boolean
  /** La boleta aparece en alguna coincidencia de loteria (BR-L14). */
  hasLotteryMatch: boolean
}

export async function getTicketDetail(ticketId: string): Promise<TicketDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tickets')
    .select(
      // `client_contact` es un segundo alias de la MISMA relacion que ya trae
      // `TICKET_SELECT`: se pide aparte para no cargar el telefono en cada fila
      // del listado, igual que `raffle_full` hace con la rifa.
      `${TICKET_SELECT}, base_price, approved_at, cancelled_at, cancel_reason, assigned_at,
       raffle_full:raffles!tickets_raffle_org_fk ( status, ticket_price ),
       client_contact:clients!tickets_client_org_fk ( phone )`,
    )
    .eq('id', ticketId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as TicketRow & {
    base_price: number | null
    approved_at: string | null
    cancelled_at: string | null
    cancel_reason: string | null
    assigned_at: string | null
    raffle_full: { status: string; ticket_price: number } | null
    client_contact: { phone: string } | null
  }

  // El limite se pregunta a la MISMA funcion que valida la venta, en vez de
  // recalcularlo aqui: dos formulas para el mismo limite acaban discrepando, y
  // la que se ve en pantalla no seria la que manda (BR-P11, D-099).
  // Los dos recuentos que deciden si se ofrece «Cambiar cliente» (BR-I13).
  // `head: true` con `count: 'exact'` no trae ni una fila: solo hace falta
  // saber si hay alguna (I-011). Las dos tablas ya estan acotadas por su
  // propia RLS —el vendedor ve las suyas, el personal las de su organizacion—,
  // asi que esto no ensena nada nuevo a nadie.
  const [sellerNames, limits, allocations, matches] = await Promise.all([
    sellerNameMap(),
    supabase.rpc('ticket_sale_price_limits', { p_ticket_id: ticketId }),
    supabase
      .from('payment_allocations')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', ticketId),
    supabase
      .from('lottery_ticket_matches')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', ticketId),
  ])

  if (limits.error) throw limits.error
  if (allocations.error) throw allocations.error
  if (matches.error) throw matches.error

  const rafflePrice = row.raffle_full?.ticket_price ?? 0

  return {
    ...mapTicketRow(row, sellerNames),
    approvedAt: row.approved_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    assignedAt: row.assigned_at,
    raffleStatus: row.raffle_full?.status ?? 'draft',
    raffleTicketPrice: rafflePrice,
    basePrice: row.base_price,
    minSalePrice: Number(limits.data?.[0]?.min_sale_price ?? rafflePrice),
    clientPhone: row.client_contact?.phone ?? null,
    hasPaymentHistory: (allocations.count ?? 0) > 0,
    hasLotteryMatch: (matches.count ?? 0) > 0,
  }
}

// El vendedor de una boleta apunta a `memberships`, no a `profiles`, asi que no
// puede incrustarse en la consulta. Los miembros de una organizacion son pocos:
// se traen una vez y se cruzan en memoria (sin N+1).
async function sellerNameMap(): Promise<Map<string, string>> {
  const members = await listOrgMembers(['owner', 'admin', 'seller'])
  return new Map(members.map((member) => [member.profileId, member.fullName]))
}

function mapTicketRow(row: TicketRow, sellerNames: Map<string, string>): TicketListItem {
  return {
    id: row.id,
    internalCode: row.internal_code,
    dailyNumber: row.daily_number,
    weeklyNumber: row.weekly_number,
    inventoryStatus: row.inventory_status,
    paymentStatus: row.payment_status,
    salePrice: row.sale_price,
    paidAmount: row.paid_amount,
    saleDate: row.sale_date,
    createdAt: row.created_at,
    raffleId: row.raffle_id,
    raffleName: row.raffle?.name ?? '',
    raffleShortCode: row.raffle?.short_code ?? '',
    sellerId: row.seller_id,
    sellerName: sellerNames.get(row.seller_id) ?? 'Vendedor',
    clientId: row.client_id,
    clientName: row.client?.name ?? null,
  }
}
