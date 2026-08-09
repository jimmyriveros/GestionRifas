import { z } from 'zod'

import { BULK_TICKET_MAX, BULK_TICKET_MIN } from '@/lib/constants'
import { clientFormSchema } from '@/features/clients/schemas'

import { ticketNumberSchema } from '../schemas'

/**
 * Lo que el navegador manda al servidor al confirmar una importacion.
 *
 * Es la SEGUNDA capa de validacion, no la primera ni la ultima: la primera es
 * la vista previa y la ultima es la restriccion `tickets_combo_unique`. Aqui se
 * repite todo porque una Server Action se puede invocar sin pasar por la
 * pantalla, y lo que llega no es de fiar (docs/SECURITY.md 5).
 *
 * Los dos numeros son obligatorios: una boleta importada no puede quedar a
 * medias. El borrador con numeros vacios existe en la carga manual del
 * personal, donde es una decision consciente; en un archivo es un error.
 */

export const importClientSchema = z.object({
  name: clientFormSchema.shape.name,
  phone: clientFormSchema.shape.phone,
})

export const importTicketRowSchema = z
  .object({
    dailyNumber: ticketNumberSchema,
    weeklyNumber: ticketNumberSchema,
    clientName: importClientSchema.shape.name.optional(),
    clientPhone: importClientSchema.shape.phone.optional(),
  })
  .refine((row) => Boolean(row.clientName) === Boolean(row.clientPhone), {
    message: 'Escribe el nombre y el celular del cliente, o deja ambos campos vacíos.',
  })
export type ImportTicketRow = z.infer<typeof importTicketRowSchema>

/** De donde salio el archivo. Se guarda en la bitacora (BR-N12). */
export const importSourceSchema = z.enum(['csv', 'json'])
export type ImportSource = z.infer<typeof importSourceSchema>

export const importTicketsSchema = z.object({
  raffleId: z.uuid('Selecciona una rifa.'),
  /**
   * Solo lo usa el personal. Un vendedor NO puede indicarlo: su identidad sale
   * de la sesion, y si lo manda se ignora (BR-U07).
   */
  sellerId: z.uuid('Selecciona un vendedor.').optional(),
  source: importSourceSchema,
  rows: z
    .array(importTicketRowSchema)
    .min(BULK_TICKET_MIN, 'No hay ninguna boleta para importar.')
    .max(BULK_TICKET_MAX, `No se pueden importar más de ${BULK_TICKET_MAX} boletas a la vez.`),
})
export type ImportTicketsInput = z.infer<typeof importTicketsSchema>

export const checkCombinationsSchema = z.object({
  raffleId: z.uuid('Selecciona una rifa.'),
  sellerId: z.uuid('Selecciona un vendedor.').optional(),
  rows: z
    .array(importTicketRowSchema)
    .max(BULK_TICKET_MAX, `No se pueden comprobar más de ${BULK_TICKET_MAX} boletas a la vez.`),
})
