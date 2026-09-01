import { z } from 'zod'

import { paymentMethodSchema } from '@/features/payments/schemas'
import type { AppRole } from '@/lib/constants'
import { todayBogota } from '@/lib/dates'

/**
 * Filtros de los reportes (CLAUDE.md §24).
 *
 * Viven en la URL, no en estado de React: un reporte filtrado es una direccion
 * que se puede compartir, guardar y volver a abrir, y el enlace de exportacion
 * a CSV no es mas que la misma consulta con otro formato de salida.
 *
 * Todo lo que llega de la URL se valida aqui antes de tocar la base de datos.
 * Un `raffleId` que no sea un uuid se descarta en vez de propagarse a PostgREST
 * y provocar un error de servidor.
 */

/**
 * Catalogo COMPLETO de reportes: la union de los dos portales, no lo que ve
 * ninguno de ellos por separado. Es el dominio del parametro `report` de la
 * URL; lo que cada portal OFRECE lo deciden `OWNER_REPORT_KEYS` y
 * `SELLER_REPORT_KEYS`.
 *
 * Los cinco primeros cubren los siete que exige CLAUDE.md §24 (ver D-055).
 * «Ventas por fecha» se anadio despues y solo para el vendedor (D-151).
 */
export const REPORT_KEYS = [
  /** Ventas, recaudo y saldo pendiente por vendedor: reportes 1, 2 y 3. */
  'sellers',
  /** Boletas vendidas en un dia o un rango, fechadas por `sale_date` (D-151). */
  'sales-by-date',
  /** Boletas por estado de inventario y de pago: reporte 4. */
  'ticket-status',
  /** Boletas por rifa: reporte 7. */
  'raffles',
  /** Clientes con saldo pendiente: reporte 5. */
  'client-balances',
  /** Pagos por rango de fechas: reporte 6. */
  'payments',
] as const

export type ReportKey = (typeof REPORT_KEYS)[number]

export const REPORT_LABELS: Record<ReportKey, string> = {
  sellers: 'Por vendedor',
  'sales-by-date': 'Ventas por fecha',
  'ticket-status': 'Boletas por estado',
  raffles: 'Boletas por rifa',
  'client-balances': 'Clientes con saldo',
  payments: 'Pagos por fecha',
}

export const REPORT_DESCRIPTIONS: Record<ReportKey, string> = {
  sellers: 'Boletas, ventas, recaudo y saldo pendiente de cada vendedor.',
  'sales-by-date': 'Las boletas que vendiste en las fechas que elijas, con lo que llevan abonado.',
  'ticket-status': 'Cuántas boletas hay en cada estado de inventario y de pago.',
  raffles: 'Inventario y dinero de cada rifa.',
  'client-balances': 'Clientes que todavía deben dinero, del que más debe al que menos.',
  payments: 'Recaudo día a día dentro del rango de fechas elegido.',
}

/**
 * Que reportes ofrece cada portal, y en que orden.
 *
 * EL PRIMERO DE LA LISTA ES EL PREDETERMINADO DE ESE PORTAL (`resolveReport`).
 * No hay un predeterminado global: uno solo no podria ser a la vez «Por
 * vendedor» para el personal —que compara a unos con otros— y «Ventas por
 * fecha» para el vendedor, que lo primero que necesita al entrar es lo que
 * vendio hoy (D-151, §12 del encargo).
 */
export const OWNER_REPORT_KEYS: readonly ReportKey[] = [
  'sellers',
  'ticket-status',
  'raffles',
  'client-balances',
  'payments',
]

/** Reportes disponibles en el portal del vendedor (CLAUDE.md §24: sin datos ajenos). */
export const SELLER_REPORT_KEYS: readonly ReportKey[] = [
  'sales-by-date',
  'ticket-status',
  'raffles',
  'client-balances',
  'payments',
]

/** Los reportes que puede pedir un rol. Lo usan las dos paginas y el CSV. */
export function reportKeysForRole(role: AppRole): readonly ReportKey[] {
  return role === 'seller' ? SELLER_REPORT_KEYS : OWNER_REPORT_KEYS
}

/**
 * Que reporte se muestra de verdad, dado lo que pide la URL y lo que ofrece
 * este portal.
 *
 * Un reporte que este portal no ofrece —un enlace copiado del otro, un valor
 * inventado a mano— cae al PRIMERO de su lista en vez de romper la pagina o de
 * enseñar algo que no le corresponde. No es la barrera de seguridad: esa es la
 * RLS, y ademas el Route Handler del CSV rechaza con 403 lo que no esta en la
 * lista del rol.
 *
 * `?? 'sellers'` no llega a ocurrir —los dos portales pasan listas no vacias—
 * pero evita un `as` que ocultaria el caso si alguien pasara una lista vacia.
 */
export function resolveReport(report: ReportKey, allowed: readonly ReportKey[]): ReportKey {
  return allowed.includes(report) ? report : (allowed[0] ?? 'sellers')
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Un valor que viene de la URL puede ser `string`, `string[]` o faltar. Se
 * queda con el primero y trata la cadena vacia como ausencia, para que
 * `?sellerId=` no llegue como filtro.
 */
function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === '' ? undefined : raw
}

export const reportFiltersSchema = z.object({
  report: z.enum(REPORT_KEYS).catch('sellers'),
  raffleId: z.uuid().optional().catch(undefined),
  sellerId: z.uuid().optional().catch(undefined),
  dateFrom: isoDate.optional().catch(undefined),
  dateTo: isoDate.optional().catch(undefined),
  method: paymentMethodSchema.optional().catch(undefined),
  status: z.enum(['active', 'voided']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

export type ReportFilters = z.infer<typeof reportFiltersSchema>

/**
 * Normaliza los parametros de busqueda de una ruta o de un Route Handler.
 *
 * Usa `.catch()` en cada campo a proposito: un filtro corrupto en la URL debe
 * ignorarse y mostrar el reporte sin el, no romper la pagina con un error.
 */
export function parseReportFilters(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): ReportFilters {
  const get = (key: string) =>
    params instanceof URLSearchParams ? (params.get(key) ?? undefined) : first(params[key])

  return reportFiltersSchema.parse({
    report: get('report'),
    raffleId: get('raffleId'),
    sellerId: get('sellerId'),
    dateFrom: get('dateFrom'),
    dateTo: get('dateTo'),
    method: get('method'),
    status: get('status'),
    page: get('page') ?? 1,
  })
}

/** Que filtros tienen sentido en cada reporte (los demas ni se muestran ni se aplican). */
export const REPORT_FILTER_FIELDS: Record<
  ReportKey,
  readonly ('raffle' | 'seller' | 'dates' | 'method' | 'status')[]
> = {
  sellers: ['raffle'],
  'sales-by-date': ['dates'],
  'ticket-status': ['raffle', 'seller'],
  raffles: [],
  'client-balances': ['seller'],
  payments: ['seller', 'dates', 'method', 'status'],
}

/**
 * Las fechas EFECTIVAS de «Ventas por fecha».
 *
 * POR QUE NO HAY REDIRECCION (§3 del encargo). Entrar a `/seller/reports` tiene
 * que mostrar las ventas de HOY sin escribir antes las fechas en la URL: una
 * redireccion solo para eso obligaria a cargar la pantalla dos veces y dejaria
 * una entrada de mas en el historial del navegador. El dia de hoy no se guarda
 * en la direccion, se DEDUCE de su ausencia.
 *
 * POR QUE ESTA FUNCION ES LA UNICA QUE LO DECIDE. Pantalla, indicadores,
 * paginacion y CSV tienen que consultar exactamente el mismo conjunto. Si cada
 * uno aplicara su propia regla para «no hay fechas», bastaria con que uno
 * dijera «hoy» y otro «todo» para que el archivo descargado no cuadrara con lo
 * que se estaba viendo.
 *
 * UN SOLO EXTREMO TAMBIEN VALE: el que falta es hoy. Escribir solo «Desde» es
 * «desde ese dia hasta hoy», que es lo que significa en el habla. Y como los
 * dos campos de la pantalla se rellenan con estas mismas fechas, lo que se lee
 * arriba es siempre lo que se esta consultando abajo.
 *
 * `invalid` NO se corrige silenciosamente. Con «Desde» posterior a «Hasta» no
 * se consulta un rango inventado —ni vacio, ni dado la vuelta—: se dice lo que
 * pasa y se deja corregir (§3).
 */
export type SalesDateRange = {
  /** 'AAAA-MM-DD' en America/Bogota. */
  from: string
  to: string
  /** `from` es posterior a `to`: no hay nada que consultar. */
  invalid: boolean
}

export function resolveSalesDateRange(
  filters: Pick<ReportFilters, 'dateFrom' | 'dateTo'>,
  /** Se inyecta en las pruebas; en produccion es siempre el dia de Bogota. */
  today: string = todayBogota(),
): SalesDateRange {
  const from = filters.dateFrom ?? today
  const to = filters.dateTo ?? today
  // Comparacion de texto: 'AAAA-MM-DD' ordena igual como cadena que como fecha.
  return { from, to, invalid: from > to }
}
