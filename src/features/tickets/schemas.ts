import { z } from 'zod'

import { BULK_TICKET_MAX, BULK_TICKET_MIN, TICKET_NUMBER_REGEX } from '@/lib/constants'

/**
 * Validacion de boletas. Es la capa de CLIENTE y de SERVIDOR (BR-N10); la
 * tercera capa es la propia base de datos, que repite todo esto con CHECK e
 * indices unicos y es la que manda.
 *
 * Los numeros son TEXTO de principio a fin: convertirlos a numero perderia los
 * ceros iniciales y `007` dejaria de ser distinto de `7` (BR-N03).
 */

export const ticketNumberSchema = z
  .string()
  .trim()
  .regex(TICKET_NUMBER_REGEX, 'Debe tener entre 1 y 4 digitos, sin letras ni simbolos.')

/** Numero que puede quedar vacio: solo valido en boletas en borrador (BR-N09). */
export const optionalTicketNumberSchema = z.union([z.literal(''), ticketNumberSchema])

export const inventoryStatusSchema = z.enum([
  'draft',
  'pending_approval',
  'available',
  'assigned',
  'cancelled',
])

export const paymentStatusSchema = z.enum(['unpaid', 'partial', 'paid'])

export const createTicketSchema = z.object({
  raffleId: z.uuid('Selecciona una rifa.'),
  sellerId: z.uuid('Selecciona un vendedor.'),
  dailyNumber: ticketNumberSchema,
  weeklyNumber: ticketNumberSchema,
})
export type CreateTicketInput = z.infer<typeof createTicketSchema>

export const updateTicketNumbersSchema = z.object({
  ticketId: z.uuid('Boleta no valida.'),
  dailyNumber: ticketNumberSchema,
  weeklyNumber: ticketNumberSchema,
})
export type UpdateTicketNumbersInput = z.infer<typeof updateTicketNumbersSchema>

export const reassignTicketSellerSchema = z.object({
  ticketId: z.uuid('Boleta no valida.'),
  sellerId: z.uuid('Selecciona un vendedor.'),
})
export type ReassignTicketSellerInput = z.infer<typeof reassignTicketSellerSchema>

// El motivo minimo de 5 caracteres lo exige tambien cancel_ticket en la base de
// datos; se repite aqui para dar el mensaje antes de ir al servidor.
export const cancelTicketSchema = z.object({
  ticketId: z.uuid('Boleta no valida.'),
  reason: z
    .string()
    .trim()
    .min(5, 'Explica el motivo con al menos 5 caracteres.')
    .max(500, 'El motivo no puede superar 500 caracteres.'),
})
export type CancelTicketInput = z.infer<typeof cancelTicketSchema>

export const approveTicketsSchema = z.object({
  ticketIds: z.array(z.uuid()).min(1, 'Selecciona al menos una boleta.'),
})
export type ApproveTicketsInput = z.infer<typeof approveTicketsSchema>

// ---------------------------------------------------------------------------
// Creacion masiva (CLAUDE.md 15)
// ---------------------------------------------------------------------------

export const bulkTicketRowSchema = z.object({
  dailyNumber: optionalTicketNumberSchema,
  weeklyNumber: optionalTicketNumberSchema,
})
export type BulkTicketRow = z.infer<typeof bulkTicketRowSchema>

export const bulkCreateTicketsSchema = z.object({
  raffleId: z.uuid('Selecciona una rifa.'),
  sellerId: z.uuid('Selecciona un vendedor.'),
  rows: z
    .array(bulkTicketRowSchema)
    .min(BULK_TICKET_MIN, 'Indica al menos una boleta.')
    .max(BULK_TICKET_MAX, `No se pueden crear mas de ${BULK_TICKET_MAX} boletas por lote.`),
})
export type BulkCreateTicketsInput = z.infer<typeof bulkCreateTicketsSchema>

export const bulkGenerateSchema = z.object({
  raffleId: z.uuid('Selecciona una rifa.'),
  sellerId: z.uuid('Selecciona un vendedor.'),
  quantity: z
    .number()
    .int('Indica una cantidad entera.')
    .min(BULK_TICKET_MIN, 'La cantidad minima es 1.')
    .max(BULK_TICKET_MAX, `La cantidad maxima es ${BULK_TICKET_MAX}.`),
})
export type BulkGenerateInput = z.infer<typeof bulkGenerateSchema>
