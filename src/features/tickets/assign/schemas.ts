import { z } from 'zod'

import { clientFormSchema } from '@/features/clients/schemas'
import { BULK_SELECTION_MAX } from '@/lib/constants'

/**
 * Asignacion de boletas a un cliente (BR-I07, BR-P03, BR-P09, BR-B02).
 *
 * `ticketIds` es una LISTA desde que existe la venta de varias boletas de una
 * vez: con una se comporta exactamente como antes, y con varias es la misma
 * operacion aplicada al lote. No hay dos caminos de asignacion (seccion 29 del
 * encargo).
 *
 * La fecha de venta es un dia calendario en America/Bogota, no un instante
 * (D-022). Si no se envia, la RPC usa `today_bogota()`.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Selecciona una fecha válida.')

const ticketIds = z
  .array(z.uuid('Boleta no válida.'))
  .min(1, 'Selecciona al menos una boleta.')
  .max(BULK_SELECTION_MAX, `No se pueden asignar más de ${BULK_SELECTION_MAX} boletas a la vez.`)

/**
 * Precio de venta de CADA boleta del lote (BR-P09, D-099).
 *
 * Opcional a proposito: sin el, la boleta se vende al precio vigente de la rifa,
 * que es lo que hacia el sistema entero antes de existir esta casilla y lo que
 * siguen haciendo la importacion masiva y cualquier llamada anterior.
 *
 * Aqui solo se comprueba la FORMA —entero de pesos, positivo (BR-P02)—. El
 * limite de verdad depende de la rifa y de la forma de pago del vendedor, asi
 * que lo aplica `assign_ticket_row` con la fila bloqueada; esto es la primera
 * linea, no la unica (docs/SECURITY.md 1).
 */
const salePrice = z
  .number('Escribe el precio de venta.')
  .int('El precio se escribe en pesos, sin centavos.')
  .positive('El precio de venta debe ser mayor que cero.')
  .optional()

export const assignTicketsSchema = z.object({
  ticketIds,
  clientId: z.uuid('Selecciona un cliente.'),
  saleDate: isoDate,
  salePrice,
})
export type AssignTicketsInput = z.infer<typeof assignTicketsSchema>

/** Crear el cliente y asignarle las boletas en el mismo paso (CLAUDE.md 17). */
export const assignTicketsToNewClientSchema = z.object({
  ticketIds,
  saleDate: isoDate,
  salePrice,
  client: clientFormSchema,
})
export type AssignTicketsToNewClientInput = z.infer<typeof assignTicketsToNewClientSchema>
