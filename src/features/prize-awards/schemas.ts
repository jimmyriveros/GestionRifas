import { z } from 'zod'

/**
 * Los filtros de «Premios ganados», tal como llegan en la URL (D-208, Etapa 2).
 *
 * Viven en la dirección, no en estado de React: un historial filtrado se puede
 * compartir, recargar y recorrer con «Atrás», y el servidor vuelve a consultar
 * filtrando en PostgreSQL (`AGENTS.md` §6).
 *
 * Cada campo lleva su `.catch()`: un valor corrupto se IGNORA y la pantalla se
 * pinta sin él, en vez de romperse o de llegar crudo a la base. Es el mismo
 * criterio de `parseReportFilters`.
 *
 * LOS DOS PORTALES NO ACEPTAN LO MISMO, y no es un detalle de interfaz:
 *
 *   * el vendedor puede acotar por CLIENTE —es el enlace «Ver premios» de su
 *     ficha— y nunca por vendedor: todo lo que ve es suyo;
 *   * el personal puede acotar por VENDEDOR y nunca por cliente: no recibe ni
 *     envía ningún identificador de cliente (BR-Q01, BR-J21). Un `clientId` en
 *     su dirección se descarta aquí, antes de tocar nada.
 */

export type PrizeAwardAudience = 'seller' | 'staff'

/** AAAA-MM-DD y una fecha que existe: «2026-02-31» no llega a la base. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date(Date.UTC(y!, m! - 1, d!))
    return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d
  })

const filtersSchema = z.object({
  raffleId: z.uuid().optional().catch(undefined),
  sellerId: z.uuid().optional().catch(undefined),
  clientId: z.uuid().optional().catch(undefined),
  dateFrom: isoDate.optional().catch(undefined),
  dateTo: isoDate.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

export type PrizeAwardFilters = {
  raffleId?: string
  /** Solo el personal. */
  sellerId?: string
  /** Solo el vendedor. */
  clientId?: string
  dateFrom?: string
  dateTo?: string
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === '' ? undefined : raw
}

export function parsePrizeAwardFilters(
  params: RawParams,
  audience: PrizeAwardAudience,
): PrizeAwardFilters {
  const parsed = filtersSchema.parse({
    raffleId: first(params.raffleId),
    sellerId: first(params.sellerId),
    clientId: first(params.clientId),
    dateFrom: first(params.dateFrom),
    dateTo: first(params.dateTo),
    page: first(params.page) ?? 1,
  })

  return {
    raffleId: parsed.raffleId,
    sellerId: audience === 'staff' ? parsed.sellerId : undefined,
    clientId: audience === 'seller' ? parsed.clientId : undefined,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    page: parsed.page,
  }
}

/**
 * «Desde» posterior a «Hasta». No se corrige solo ni se consulta: la pantalla
 * lo dice y deja corregirlo (la misma regla de «Ventas por fecha», D-151).
 * Consultarlo devolvería cero premios, y cero no es la respuesta: es un filtro
 * que no tiene sentido.
 */
export function prizeAwardDatesReversed(filters: PrizeAwardFilters): boolean {
  return Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
}

/** Si la persona acotó algo. La página no cuenta: no es un filtro. */
export function prizeAwardHasFilters(filters: PrizeAwardFilters): boolean {
  return Boolean(
    filters.raffleId ?? filters.sellerId ?? filters.clientId ?? filters.dateFrom ?? filters.dateTo,
  )
}

/** Las claves de la URL que son filtros: lo que «Limpiar filtros» quita. */
export const PRIZE_AWARD_FILTER_KEYS = [
  'raffleId',
  'sellerId',
  'clientId',
  'dateFrom',
  'dateTo',
] as const

/**
 * La dirección del historial con estos filtros. Se arma aquí y no a mano en
 * cada enlace —«Ver premios», «Ver todos los premios», la primera página—, para
 * que ninguno se olvide de un filtro ni cuele uno que no toca. La página 1 no
 * se escribe: es la de siempre.
 */
export function prizeAwardsHref(basePath: string, filters: Partial<PrizeAwardFilters>): string {
  const params = new URLSearchParams()
  for (const key of PRIZE_AWARD_FILTER_KEYS) {
    const value = filters[key]
    if (value) params.set(key, value)
  }
  if (filters.page && filters.page > 1) params.set('page', String(filters.page))
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}
