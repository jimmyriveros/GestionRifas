import { z } from 'zod'

import { SELLER_TICKET_MAX } from '@/lib/constants'

import { ticketNumberSchema } from '../schemas'

/**
 * Creacion de boletas por parte del VENDEDOR (CLAUDE.md 16, BR-I03).
 *
 * A diferencia de la carga masiva del personal, aqui los dos numeros son
 * obligatorios: la boleta nace en `pending_approval` y ese estado no admite
 * numeros vacios (BR-N09). El vendedor no puede guardar borradores.
 */

export const sellerTicketRowSchema = z.object({
  dailyNumber: ticketNumberSchema,
  weeklyNumber: ticketNumberSchema,
})
export type SellerTicketRow = z.infer<typeof sellerTicketRowSchema>

/**
 * El vendedor solo corrige los numeros de sus boletas ANTES de que se aprueben
 * (matriz de permisos: `draft` / `pending_approval`). La politica
 * `tickets_update_seller` lo impone con USING y WITH CHECK.
 */
export const updateSellerTicketNumbersSchema = z.object({
  ticketId: z.uuid('Boleta no válida.'),
  dailyNumber: ticketNumberSchema,
  weeklyNumber: ticketNumberSchema,
})
export type UpdateSellerTicketNumbersInput = z.infer<typeof updateSellerTicketNumbersSchema>

export const createSellerTicketsSchema = z.object({
  raffleId: z.uuid('Selecciona una rifa.'),
  rows: z
    .array(sellerTicketRowSchema)
    .min(1, 'Indica al menos una boleta.')
    .max(SELLER_TICKET_MAX, `No puedes crear más de ${SELLER_TICKET_MAX} boletas de una vez.`),
})
export type CreateSellerTicketsInput = z.infer<typeof createSellerTicketsSchema>
