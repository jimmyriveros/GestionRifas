import { z } from 'zod'

import { clientFormSchema } from '@/features/clients/schemas'

/**
 * Asignacion de una boleta a un cliente (BR-I07, BR-P03).
 *
 * La fecha de venta es un dia calendario en America/Bogota, no un instante
 * (D-022). Si no se envia, la RPC usa `today_bogota()`.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Selecciona una fecha válida.')

export const assignTicketSchema = z.object({
  ticketId: z.uuid('Boleta no válida.'),
  clientId: z.uuid('Selecciona un cliente.'),
  saleDate: isoDate,
})
export type AssignTicketInput = z.infer<typeof assignTicketSchema>

/** Crear el cliente y asignarle la boleta en el mismo paso (CLAUDE.md 17). */
export const assignTicketToNewClientSchema = z.object({
  ticketId: z.uuid('Boleta no válida.'),
  saleDate: isoDate,
  client: clientFormSchema,
})
export type AssignTicketToNewClientInput = z.infer<typeof assignTicketToNewClientSchema>
