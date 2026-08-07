import { z } from 'zod'

import { PHONE_REGEX } from '@/lib/constants'

/**
 * Validacion de clientes (BR-C02): nombre y telefono obligatorios; alias, correo
 * y notas opcionales. Los mismos limites que los CHECK de la tabla `clients`.
 */

export const clientFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres.')
    .max(120, 'El nombre no puede superar 120 caracteres.'),
  alias: z.string().trim().max(60, 'El alias no puede superar 60 caracteres.'),
  phone: z.string().trim().regex(PHONE_REGEX, 'Ingresa un teléfono válido (7 a 20 dígitos).'),
  // Opcional de verdad: se acepta la cadena vacia y se guarda como NULL.
  email: z.union([z.literal(''), z.email('Ingresa un correo válido.')]),
  notes: z.string().trim().max(1000, 'Las notas no pueden superar 1.000 caracteres.'),
})
export type ClientFormInput = z.infer<typeof clientFormSchema>

export const createClientSchema = clientFormSchema
export type CreateClientInput = z.infer<typeof createClientSchema>

export const updateClientSchema = clientFormSchema.extend({
  clientId: z.uuid('Cliente no válido.'),
})
export type UpdateClientInput = z.infer<typeof updateClientSchema>

/**
 * Termino de busqueda que llega a una Server Action.
 *
 * El tope de 100 caracteres no es una regla de negocio: es no dejar que alguien
 * mande un texto enorme y obligue a la base de datos a comparar trigramas
 * contra el. Nadie busca a un cliente con cien caracteres.
 */
export const searchTermSchema = z.string().trim().min(1).max(100)

export const setClientArchivedSchema = z.object({
  clientId: z.uuid('Cliente no válido.'),
  archived: z.boolean(),
})
export type SetClientArchivedInput = z.infer<typeof setClientArchivedSchema>

export const clientFormDefaults: ClientFormInput = {
  name: '',
  alias: '',
  phone: '',
  email: '',
  notes: '',
}

/** Campos de `clients` que aceptan los formularios. Sin mass assignment. */
export function toClientRow(values: ClientFormInput) {
  return {
    name: values.name,
    alias: values.alias === '' ? null : values.alias,
    phone: values.phone,
    email: values.email === '' ? null : values.email,
    notes: values.notes === '' ? null : values.notes,
  }
}
