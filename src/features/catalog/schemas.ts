import { z } from 'zod'

import { normalizeWhatsappNumber, WHATSAPP_REGEX } from './whatsapp'

/**
 * Validacion de la configuracion del catalogo publico (BR-K04..BR-K06).
 *
 * Capa de cliente Y de servidor, como el resto de `schemas.ts` del proyecto. La
 * tercera capa son los CHECK de la migracion 0043, que son los que mandan: aqui
 * se repiten para poder dar el mensaje antes de ir al servidor.
 */

/**
 * El WhatsApp publico.
 *
 * Se NORMALIZA antes de validar —`transform` va primero— porque quien lo
 * escribe teclea «300 123 4567» o «+57 300 123-4567», no la forma canonica. Lo
 * que se guarda son siempre digitos con indicativo.
 */
export const whatsappNumberSchema = z
  .string()
  .transform((value) => normalizeWhatsappNumber(value) ?? '')
  .refine((value) => WHATSAPP_REGEX.test(value), {
    message: 'Escribe el número de WhatsApp con indicativo. Ejemplo: 573001234567.',
  })

/**
 * Guardar la configuracion.
 *
 * `enabled` no viaja solo: encender el catalogo exige que la rifa y el WhatsApp
 * esten puestos, y eso se comprueba aqui ademas de en la base de datos. El
 * `slug` NO es un campo del formulario: lo genera el servidor (BR-K02) y solo
 * se cambia con la accion explicita de regenerarlo.
 */
export const catalogSettingsSchema = z
  .object({
    profileId: z.uuid('Vendedor no válido.'),
    enabled: z.boolean(),
    whatsappNumber: z.union([z.literal(''), whatsappNumberSchema]),
    raffleId: z.union([z.literal(''), z.uuid('Selecciona una rifa.')]),
  })
  .refine((values) => !values.enabled || values.whatsappNumber !== '', {
    path: ['whatsappNumber'],
    message: 'Para publicar el catálogo necesitas un número de WhatsApp.',
  })
  .refine((values) => !values.enabled || values.raffleId !== '', {
    path: ['raffleId'],
    message: 'Elige la rifa que quieres publicar.',
  })

export type CatalogSettingsInput = z.input<typeof catalogSettingsSchema>
export type CatalogSettingsValues = z.infer<typeof catalogSettingsSchema>

/** Regenerar el enlace: una accion aparte, nunca un efecto de guardar. */
export const regenerateCatalogSlugSchema = z.object({
  profileId: z.uuid('Vendedor no válido.'),
})
