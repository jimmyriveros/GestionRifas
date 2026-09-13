import { z } from 'zod'

import { WEEKLY_RESULTS_COPY } from './copy'
import { WEEKLY_RESULTS_MESSAGE_MAX_LENGTH } from './message'

/**
 * Validación del mensaje propio de «Resultados de la semana» (BR-H09, D-197).
 *
 * La usa la Server Action. Las otras dos capas son la RPC
 * `set_seller_weekly_results_message` y los CHECK de la 0056, que son los que
 * mandan: aquí se repite para responder con una frase antes de ir a la base.
 *
 * NO HAY CAMPO DE VENDEDOR, NI DE ORGANIZACIÓN: el vendedor sale de la sesión en
 * la acción y de `auth.uid()` en la RPC (BR-H10). `z.object` descarta cualquier
 * campo de más que llegue en la petición.
 */
export const weeklyResultsMessageSchema = z
  .object({
    useCustomMessage: z.boolean(),
    // Se recorta ANTES de medir: lo que se guarda es el texto recortado, y es el
    // que mide el CHECK. `length` de JavaScript cuenta unidades UTF-16 y el de
    // PostgreSQL, caracteres: con emojis esta capa es MÁS estricta, nunca menos.
    customMessage: z
      .string()
      .trim()
      .max(WEEKLY_RESULTS_MESSAGE_MAX_LENGTH, WEEKLY_RESULTS_COPY.share.messageTooLong),
  })
  // El interruptor encendido sin texto no es un estado: lo mismo que comprueba el
  // CHECK `memberships_weekly_results_message_coherent`, dicho con palabras.
  .refine((values) => !values.useCustomMessage || values.customMessage !== '', {
    path: ['customMessage'],
    message: WEEKLY_RESULTS_COPY.share.messageEmpty,
  })

export type WeeklyResultsMessageInput = z.input<typeof weeklyResultsMessageSchema>
