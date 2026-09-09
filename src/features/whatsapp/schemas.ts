import { z } from 'zod'

import { GROUP_URL_REGEX, INVITE_MESSAGE_MAX_LENGTH, WHATSAPP_COPY } from './invite'

/**
 * Validacion de la configuracion de WhatsApp del vendedor (BR-W01..BR-W03).
 *
 * Capa de cliente Y de servidor, como el resto de `schemas.ts` del proyecto. La
 * tercera capa son los CHECK de la migracion 0050 y la propia RPC, que son las
 * que mandan: aqui se repite para poder dar el mensaje antes de ir al servidor.
 *
 * `profileId` NO es un campo. El vendedor sale de la sesion en la Server Action
 * y de `auth.uid()` dentro de la RPC, asi que no existe ningun identificador
 * que alguien pudiera manipular para configurar a otro (BR-W07).
 */

/**
 * El enlace del grupo.
 *
 * Se recorta antes de validar porque quien lo pega desde WhatsApp arrastra
 * espacios y un salto de linea, y rechazarle un enlace correcto por eso seria
 * culparle de lo que hizo el portapapeles.
 *
 * La cadena vacia es valida y significa «todavia no lo he configurado» o «lo
 * quito»: dejar el campo en blanco tiene que poder guardarse.
 */
const groupUrlSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || GROUP_URL_REGEX.test(value), {
    message: WHATSAPP_COPY.groupField.invalid,
  })

export const whatsappSettingsSchema = z
  .object({
    groupUrl: groupUrlSchema,
    useCustomMessage: z.boolean(),
    customMessage: z
      .string()
      .max(
        INVITE_MESSAGE_MAX_LENGTH,
        `El mensaje no puede superar ${INVITE_MESSAGE_MAX_LENGTH} caracteres.`,
      ),
  })
  // El interruptor encendido sin texto no es un estado: seria un vendedor cuya
  // invitacion sale vacia. Lo mismo que comprueba el CHECK
  // `memberships_whatsapp_message_coherent`, dicho aqui con palabras.
  .refine((values) => !values.useCustomMessage || values.customMessage.trim() !== '', {
    path: ['customMessage'],
    message: WHATSAPP_COPY.messageField.empty,
  })

export type WhatsappSettingsInput = z.input<typeof whatsappSettingsSchema>
export type WhatsappSettingsValues = z.infer<typeof whatsappSettingsSchema>
