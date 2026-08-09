import { z } from 'zod'

import { BULK_SELECTION_MAX } from '@/lib/constants'

import { inventoryStatusSchema, paymentStatusSchema } from '../schemas'

/**
 * Validacion de las acciones masivas (BR-B01). Capa de cliente y de servidor;
 * la tercera y definitiva son las funciones `bulk_*` de la migracion 0020, que
 * vuelven a comprobarlo todo con las filas bloqueadas.
 *
 * La identidad de una boleta es SIEMPRE su `id` (seccion 18 del encargo). Ni
 * posiciones, ni indices, ni numeros de fila: los filtros y el orden los mueven.
 */

const ticketIds = z
  .array(z.uuid('Boleta no válida.'))
  .min(1, 'Selecciona al menos una boleta.')
  .max(BULK_SELECTION_MAX, `No se pueden procesar más de ${BULK_SELECTION_MAX} boletas a la vez.`)

/** El motivo minimo de 5 caracteres lo exige tambien la base de datos. */
const reason = z
  .string()
  .trim()
  .min(5, 'Explica el motivo con al menos 5 caracteres.')
  .max(500, 'El motivo no puede superar 500 caracteres.')

export const ticketIdsSchema = z.object({ ticketIds })
export type TicketIdsInput = z.infer<typeof ticketIdsSchema>

export const bulkCancelTicketsSchema = z.object({ ticketIds, reason })
export type BulkCancelTicketsInput = z.infer<typeof bulkCancelTicketsSchema>

export const bulkDeleteTicketsSchema = z.object({ ticketIds, reason })
export type BulkDeleteTicketsInput = z.infer<typeof bulkDeleteTicketsSchema>

export const bulkChangeTicketSellerSchema = z.object({
  ticketIds,
  sellerId: z.uuid('Selecciona un vendedor.'),
})
export type BulkChangeTicketSellerInput = z.infer<typeof bulkChangeTicketSellerSchema>

/**
 * Filtros con los que se pide «seleccionar todas las que coinciden»
 * (seccion 16 del encargo).
 *
 * Son los mismos de la lista y viajan desde la URL, asi que se validan con los
 * mismos enums que la consulta. No dan acceso a nada: la RLS decide que filas
 * existen para quien pregunta.
 */
export const ticketSelectionFiltersSchema = z.object({
  raffleId: z.uuid().optional(),
  sellerId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  inventoryStatus: inventoryStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  search: z.string().trim().max(50).optional(),
})
export type TicketSelectionFiltersInput = z.infer<typeof ticketSelectionFiltersSchema>
