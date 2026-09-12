import { z } from 'zod'

import { REMINDER_COPY, REMINDER_MESSAGE_MAX_LENGTH } from './reminders'

/**
 * Validacion de un recordatorio de pago (BR-S02, BR-S06, D-185).
 *
 * Capa de cliente Y de servidor. La tercera son los CHECK de la `0051`
 * —`weekday_range`, `minute_precision`, `message_coherent`, `message_length`— y
 * la RPC, que son los que mandan.
 *
 * NO HAY CAMPO DE VENDEDOR: sale de la sesion y de `auth.uid()` (BR-S01).
 */

/**
 * La hora, como la entrega un `<input type="time">`: `HH:MM`.
 *
 * Se acepta tambien `HH:MM:SS` porque es como la devuelve PostgreSQL y es lo
 * que trae el formulario al editar. Los segundos se descartan al guardar: la
 * precision es de MINUTO y el CHECK `minute_precision` lo exige (BR-S02).
 */
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/

const reminderFields = {
  // ISO: 1 lunes … 7 domingo, igual que la columna y que `extract(isodow ...)`.
  weekday: z.coerce.number().int().min(1, 'Elige un día.').max(7, 'Elige un día.'),
  timeOfDay: z.string().trim().regex(TIME_REGEX, 'Elige una hora.'),
  useCustomMessage: z.boolean(),
  customMessage: z
    .string()
    .max(
      REMINDER_MESSAGE_MAX_LENGTH,
      `El mensaje no puede superar ${REMINDER_MESSAGE_MAX_LENGTH} caracteres.`,
    ),
}

/**
 * El interruptor encendido sin texto no es un estado: seria un recordatorio
 * cuyo mensaje sale vacio. Lo mismo que comprueba el CHECK
 * `seller_payment_reminders_message_coherent`, dicho aqui con palabras.
 */
function requireMessageWhenCustom(
  values: { useCustomMessage: boolean; customMessage: string },
  ctx: z.RefinementCtx,
) {
  if (values.useCustomMessage && values.customMessage.trim() === '') {
    ctx.addIssue({
      code: 'custom',
      path: ['customMessage'],
      message: REMINDER_COPY.form.empty,
    })
  }
}

export const paymentReminderSchema = z
  .object(reminderFields)
  .superRefine(requireMessageWhenCustom)
export type PaymentReminderInput = z.input<typeof paymentReminderSchema>

export const updateReminderSchema = z
  .object({ reminderId: z.uuid('Recordatorio no válido.'), ...reminderFields })
  .superRefine(requireMessageWhenCustom)

export const setReminderStatusSchema = z.object({
  reminderId: z.uuid('Recordatorio no válido.'),
  status: z.enum(['active', 'paused', 'archived']),
})

/**
 * «Ya lo mandé» (BR-S14). Solo el identificador: quien lo atiende sale de la
 * sesion, igual que en todo este modulo.
 */
export const attendOccurrenceSchema = z.object({
  occurrenceId: z.uuid('Recordatorio no válido.'),
})

/** Lo que trae el formulario en blanco: el viernes por la tarde, que es cuando se cobra. */
export const paymentReminderDefaults: PaymentReminderInput = {
  weekday: 5,
  timeOfDay: '18:00',
  useCustomMessage: false,
  customMessage: '',
}

/** `HH:MM` o `HH:MM:SS` → `HH:MM:00`, que es lo que acepta el CHECK. */
export function toMinutePrecision(time: string): string {
  return `${time.slice(0, 5)}:00`
}
