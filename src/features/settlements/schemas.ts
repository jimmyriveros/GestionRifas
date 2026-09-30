import { z } from 'zod'

import { SETTLEMENT_COPY } from './copy'

/**
 * Validacion del cierre de cuentas (D-241).
 *
 * ESTO ADELANTA MENSAJES, NO DECIDE NADA. Quien valida de verdad es la base: el
 * saldo, el tope de una entrega, quien puede confirmar y el valor de un premio
 * los comprueba la RPC con el cerrojo de la cuenta tomado (BR-Z05..BR-Z12). Un
 * importe que llegue del navegador nunca se usa para calcular: es lo que la
 * persona dice que recibio, y la base lo compara con el saldo real.
 *
 * El dinero son PESOS ENTEROS: `int()` impide que llegue un decimal (BR-P02).
 */

/** AAAA-MM-DD y una fecha que existe: «2026-02-31» no llega a la base. */
const isoDate = z
  .string({ error: 'Elige una fecha.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige una fecha.')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date(Date.UTC(y!, m! - 1, d!))
    return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d
  }, 'Elige una fecha.')

const money = z
  .number({ error: SETTLEMENT_COPY.receiptDialog.emptyAmount })
  .int('El valor debe ser un número entero de pesos.')
  .min(1, SETTLEMENT_COPY.receiptDialog.emptyAmount)
  .max(100_000_000_000, 'Ese valor es demasiado alto. Revísalo.')

/** Confirmar una entrega (quien recibe) o una devolucion (el vendedor que la recibe). */
export const recordTransferSchema = z.object({
  raffleId: z.uuid(),
  sellerId: z.uuid(),
  kind: z.enum(['delivery', 'refund']),
  amount: money,
  receivedOn: isoDate,
  /** El saldo que la persona tenia a la vista: si cambio, no se guarda nada. */
  expectedBalance: z.number().int(),
  /** Uno por dialogo abierto: el reintento o el doble clic no escriben dos veces. */
  requestId: z.uuid(),
})
export type RecordTransferInput = z.infer<typeof recordTransferSchema>

/** Registrar quien pago un premio. `payerId` falta cuando lo pago el dueño. */
export const recordPrizePaymentSchema = z
  .object({
    raffleId: z.uuid(),
    matchId: z.uuid(),
    prizeId: z.uuid(),
    payer: z.enum(['seller', 'organization'], { error: SETTLEMENT_COPY.prizeDialog.choosePayer }),
    payerId: z.uuid().optional(),
    /** Solo cuando el valor del premio no se conoce: en especie o con alternativas. */
    amount: z
      .number({ error: SETTLEMENT_COPY.prizeDialog.emptyValue })
      .int('El valor debe ser un número entero de pesos.')
      .min(1, SETTLEMENT_COPY.prizeDialog.emptyValue)
      .max(10_000_000_000, 'Ese valor es demasiado alto. Revísalo.')
      .optional(),
    paidOn: isoDate,
    requestId: z.uuid(),
  })
  .refine((data) => (data.payer === 'seller') === (data.payerId !== undefined), {
    message: SETTLEMENT_COPY.prizeDialog.choosePayer,
    path: ['payerId'],
  })
export type RecordPrizePaymentInput = z.infer<typeof recordPrizePaymentSchema>

const reason = z
  .string()
  .trim()
  .min(5, SETTLEMENT_COPY.voidDialog.reasonLength)
  .max(500, SETTLEMENT_COPY.voidDialog.reasonLength)

export const voidTransferSchema = z.object({ transferId: z.uuid(), reason })
export const voidPrizePaymentSchema = z.object({ paymentId: z.uuid(), reason })

export const confirmCloseSchema = z.object({
  raffleId: z.uuid(),
  sellerId: z.uuid(),
  fingerprint: z.string().regex(/^[0-9a-f]{32}$/),
})

// -----------------------------------------------------------------------------
// Los filtros de la URL
// -----------------------------------------------------------------------------

export const SETTLEMENT_STATUS_FILTERS = ['all', 'open', 'closed', 'no_activity'] as const
export type SettlementStatusFilter = (typeof SETTLEMENT_STATUS_FILTERS)[number]

/**
 * Los filtros del listado del personal, tal como llegan en la URL. Cada campo
 * lleva su `.catch()`: un valor corrupto se ignora en vez de romper la pantalla
 * o llegar crudo a la base (el criterio de `parsePrizeAwardFilters`).
 */
const listSchema = z.object({
  raffleId: z.uuid().optional().catch(undefined),
  search: z.string().trim().max(80).optional().catch(undefined),
  status: z.enum(SETTLEMENT_STATUS_FILTERS).catch('all'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
})

export type SettlementListFilters = {
  raffleId?: string
  search?: string
  status: SettlementStatusFilter
  page: number
}

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === '' ? undefined : raw
}

/** La rifa de la URL (`?raffleId=`), la que usan las cuatro pantallas. */
export function parseSettlementRaffle(params: RawParams): string | undefined {
  const parsed = z.uuid().safeParse(first(params.raffleId))
  return parsed.success ? parsed.data : undefined
}

export function parseSettlementListFilters(params: RawParams): SettlementListFilters {
  const parsed = listSchema.parse({
    raffleId: first(params.raffleId),
    search: first(params.q),
    status: first(params.status) ?? 'all',
    page: first(params.page) ?? 1,
  })
  return {
    raffleId: parsed.raffleId,
    search: parsed.search === '' ? undefined : parsed.search,
    status: parsed.status,
    page: parsed.page,
  }
}
