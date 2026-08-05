import { z } from 'zod'

import { paymentMethodSchema } from '@/features/payments/schemas'

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

/** Los cinco reportes cubren los siete que exige CLAUDE.md §24 (ver D-055). */
export const REPORT_KEYS = [
  /** Ventas, recaudo y saldo pendiente por vendedor: reportes 1, 2 y 3. */
  'sellers',
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
  'ticket-status': 'Boletas por estado',
  raffles: 'Boletas por rifa',
  'client-balances': 'Clientes con saldo',
  payments: 'Pagos por fecha',
}

export const REPORT_DESCRIPTIONS: Record<ReportKey, string> = {
  sellers: 'Boletas, ventas, recaudo y saldo pendiente de cada vendedor.',
  'ticket-status': 'Cuántas boletas hay en cada estado de inventario y de pago.',
  raffles: 'Inventario y dinero de cada rifa.',
  'client-balances': 'Clientes que todavía deben dinero, del que más debe al que menos.',
  payments: 'Recaudo día a día dentro del rango de fechas elegido.',
}

/** Reportes disponibles en el portal del vendedor (CLAUDE.md §24: sin datos ajenos). */
export const SELLER_REPORT_KEYS: readonly ReportKey[] = [
  'ticket-status',
  'raffles',
  'client-balances',
  'payments',
]

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
  'ticket-status': ['raffle', 'seller'],
  raffles: [],
  'client-balances': ['seller'],
  payments: ['seller', 'dates', 'method', 'status'],
}
