import 'server-only'

import { listOrgMembers } from '@/features/users/queries'
import { PAGE_SIZE, type TicketInventoryStatus, type TicketPaymentStatus } from '@/lib/constants'
import { pageBeyondEnd } from '@/lib/list-page'
import type { ListSort } from '@/lib/list-sort'

export {
  TICKET_SORT_COLUMNS,
  type TicketSortColumn,
} from './sort-options'
import type { TicketSortColumn } from './sort-options'
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
  /** Orden pedido desde la URL, ya validado contra `TICKET_SORT_COLUMNS`. */
  sort?: ListSort<TicketSortColumn> | null
}

/**
 * Las columnas por las que un VENDEDOR puede pedir orden (P1-B, D-214).
 *
 * Son los `id` de las columnas de `TicketsTable`, para que la cabecera pulsada
 * y el parametro de la URL sean el mismo nombre. Estan TODAS las que la
 * pantalla ensena.
 *
 * Que esten todas es lo que arreglo `v_seller_ticket_list` (migracion 0076).
 * Antes faltaban cuatro, y no por capricho: el nombre del vendedor lo resolvia
 * un mapa en memoria, `clients` tiene dos claves ajenas hacia `tickets` —asi
 * que PostgREST no sabia por cual ordenar—, y «Falta» y «Progreso» son
 * `sale_price - paid_amount` y su cociente, que no existian como columna. La
 * vista las tiene las cuatro, calculadas con las mismas reglas que
 * `ticketFinancials`, y PostgREST las ordena como cualquier otra.
 *
 * La lista del PERSONAL es otra y vive en `admin-queries.ts`: alli no puede
 * haber ni cliente ni dinero (D-198).
 */


/** De nombre de columna a columna de la vista. Lo que no este aqui no se pide. */
const TICKET_SORT_DB: Record<TicketSortColumn, string> = {
  dailyNumber: 'daily_number',
  raffleShortCode: 'raffle_short_code',
  sellerName: 'seller_name',
  clientName: 'client_name',
  inventoryStatus: 'inventory_status',
  paymentStatus: 'payment_status',
  paidAmount: 'paid_amount',
  // Las dos calculadas. Valen NULL en una boleta sin vender —que es lo que la
  // pantalla pinta como «—»— y por eso caen al final con `nullsFirst: false`.
  pendingAmount: 'pending_amount',
  percentage: 'paid_ratio',
  salePrice: 'sale_price',
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
  /**
   * Cuando se registro la entrega FISICA del paz y salvo al cliente actual.
   * `null` = por entregar (BR-I15, D-170). No tiene ninguna relacion con el
   * pago: una boleta Sin pagar puede tenerlo entregado, y al reves.
   */
  clearanceDeliveredAt: string | null
  /**
   * El estado lo puso la migracion `0049` al estrenar la funcion, no una
   * persona: su fecha es tecnica y la interfaz NO la enseña (D-170).
   */
  clearanceAssumedDelivered: boolean
}

/*
  LA LISTA DE UN VENDEDOR SE LEE DE `v_seller_ticket_list`, no de `tickets`
  (D-214). La vista es `security_invoker`: hereda `tickets_select` y
  `clients_select`, de modo que un vendedor sigue viendo exactamente sus
  boletas y el nombre de sus clientes, ni una fila mas.

  Lo que gana: el nombre del cliente, el del vendedor, el saldo y el progreso
  son COLUMNAS, asi que la base puede ordenarlos. Antes el nombre del vendedor
  costaba ademas una consulta aparte (`sellerNameMap`) en cada pagina.
*/
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
  raffle_name,
  raffle_short_code,
  seller_id,
  seller_name,
  client_id,
  client_name,
  clearance_receipt_delivered_at,
  clearance_receipt_assumed_delivered
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
  raffle_name: string | null
  raffle_short_code: string | null
  seller_id: string
  seller_name: string | null
  client_id: string | null
  client_name: string | null
  clearance_receipt_delivered_at: string | null
  clearance_receipt_assumed_delivered: boolean
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
    supabase.from('v_seller_ticket_list').select(TICKET_SELECT, { count: 'exact' }),
    filters,
  )

  /*
    EL ORDEN LO APLICA LA BASE, sobre el conjunto filtrado entero (P1-B).
    Antes `DataTable` reordenaba en el navegador las 25 filas ya servidas, de
    modo que «Precio» de mayor a menor daba el mayor DE LA PAGINA.

    `nullsFirst: false` a proposito: en PostgreSQL un `desc` pone los nulos
    PRIMERO, y una boleta sin vender no tiene precio. Sin esto, ordenar por
    «Precio» encabezaria la lista con las que ni siquiera lo tienen.

    Y `id` cierra SIEMPRE, tambien en el orden por defecto: sin un desempate
    estable, dos boletas creadas en el mismo instante pueden cambiar de pagina
    entre dos consultas y una se veria dos veces mientras otra no se ve nunca.
  */
  const ordered = filters.sort
    ? query.order(TICKET_SORT_DB[filters.sort.column], {
        ascending: filters.sort.direction === 'asc',
        nullsFirst: false,
      })
    : query.order('created_at', { ascending: false })

  const { data, error, count } = await ordered
    .order('id', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (error) {
    if (!pageBeyondEnd(error)) throw error
    // La pagina no existe: cero filas, pero el total de verdad.
    const { count: real } = await applyTicketFilters(
      supabase.from('v_seller_ticket_list').select('id', { head: true, count: 'exact' }),
      filters,
    )
    return { rows: [], total: real ?? 0, page, pageSize }
  }

  return {
    rows: ((data ?? []) as TicketRow[]).map(mapTicketRow),
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
 *     filas de la pagina que ya se esta viendo. Cuando SI se pide una columna
 *     desde la cabecera, esa columna manda sobre la relevancia y el orden lo
 *     sigue aplicando la funcion, sobre el conjunto entero (P1-B, 0075).
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
    // Con orden pedido manda la cabecera, no la relevancia: quien pulsa
    // «Precio» estando en una busqueda quiere los resultados por precio. La
    // funcion vuelve a comprobar el nombre contra su propia lista blanca
    // (migracion 0075), porque la pantalla no es una frontera.
    p_sort_column: filters.sort ? filters.sort.column : undefined,
    p_sort_direction: filters.sort ? filters.sort.direction : undefined,
  })

  if (error) throw error

  const rows = data ?? []
  const sellerNames = await sellerNameMap()

  /*
    Igual que las demas: una pagina que no existe devuelve cero filas, y con
    ellas se iria el recuento. Se vuelve a pedir la primera, y solo entonces.
  */
  let total = Number(rows[0]?.total_count ?? 0)
  if (rows.length === 0 && page > 1) {
    const { data: primera } = await supabase.rpc('search_tickets', {
      p_search: search,
      p_raffle_id: filters.raffleId,
      p_seller_id: filters.sellerId,
      p_client_id: filters.clientId,
      p_inventory_status: filters.inventoryStatus,
      p_payment_status: filters.paymentStatus,
      p_limit: 1,
      p_offset: 0,
    })
    total = Number(primera?.[0]?.total_count ?? 0)
  }

  return {
    total,
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
      clearanceDeliveredAt: row.clearance_receipt_delivered_at,
      clearanceAssumedDelivered: row.clearance_receipt_assumed_delivered,
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

/**
 * Proyeccion del DETALLE, contra `tickets`. No es `TICKET_SELECT`, que desde
 * D-214 describe las columnas de `v_seller_ticket_list`: aqui hacen falta
 * campos que el listado no ensena, y una sola fila no necesita que la base
 * resuelva ningun orden.
 */
const TICKET_DETAIL_SELECT = `
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
  clearance_receipt_delivered_at,
  clearance_receipt_assumed_delivered,
  raffle:raffles!tickets_raffle_org_fk ( name, short_code ),
  client:clients!tickets_client_org_fk ( id, name )
`

/** La fila del detalle, con la rifa y el cliente todavia anidados. */
type TicketDetailRow = Omit<
  TicketRow,
  'raffle_name' | 'raffle_short_code' | 'seller_name' | 'client_name'
> & {
  raffle: { name: string; short_code: string } | null
  client: { id: string; name: string } | null
}

/** La deja con la forma plana de la vista, para reutilizar `mapTicketRow`. */
function flattenDetailRow(row: TicketDetailRow, sellerNames: Map<string, string>): TicketRow {
  return {
    ...row,
    raffle_name: row.raffle?.name ?? null,
    raffle_short_code: row.raffle?.short_code ?? null,
    seller_name: sellerNames.get(row.seller_id) ?? null,
    client_name: row.client?.name ?? null,
  }
}

export async function getTicketDetail(ticketId: string): Promise<TicketDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tickets')
    .select(
      // `client_contact` es un segundo alias de la MISMA relacion que ya trae
      // `TICKET_SELECT`: se pide aparte para no cargar el telefono en cada fila
      // del listado, igual que `raffle_full` hace con la rifa.
      `${TICKET_DETAIL_SELECT}, base_price, approved_at, cancelled_at, cancel_reason, assigned_at,
       raffle_full:raffles!tickets_raffle_org_fk ( status, ticket_price ),
       client_contact:clients!tickets_client_org_fk ( phone )`,
    )
    .eq('id', ticketId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as TicketDetailRow & {
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
    ...mapTicketRow(flattenDetailRow(row, sellerNames)),
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
// se traen una vez y se cruzan en memoria (sin N+1). Lo reutiliza tambien la
// lectura administrativa (`admin-queries.ts`).
export async function sellerNameMap(): Promise<Map<string, string>> {
  const members = await listOrgMembers(['owner', 'admin', 'seller'])
  return new Map(members.map((member) => [member.profileId, member.fullName]))
}

function mapTicketRow(row: TicketRow): TicketListItem {
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
    raffleName: row.raffle_name ?? '',
    raffleShortCode: row.raffle_short_code ?? '',
    sellerId: row.seller_id,
    // El nombre llega en la misma fila. `I-015`: si quien consulta no puede ver
    // ese perfil se pierde el nombre, nunca la boleta.
    sellerName: row.seller_name ?? 'Vendedor',
    clientId: row.client_id,
    clientName: row.client_name,
    clearanceDeliveredAt: row.clearance_receipt_delivered_at,
    clearanceAssumedDelivered: row.clearance_receipt_assumed_delivered,
  }
}
