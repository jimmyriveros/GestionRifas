import { z } from 'zod'

import { PHONE_REGEX } from '@/lib/constants'

/**
 * Alta y edicion de usuarios de la organizacion.
 *
 * El rol `owner` NO es elegible: transferir la propiedad esta fuera del MVP
 * (BR-U04) y ninguna pantalla debe poder crear un segundo dueno. La politica
 * `memberships_insert_staff` lo impide ademas en la base de datos.
 */

const fullName = z
  .string()
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres.')
  .max(120, 'El nombre no puede superar 120 caracteres.')

const alias = z.string().trim().max(60, 'El alias no puede superar 60 caracteres.')

// BR-U08: telefono obligatorio, alias opcional.
const phone = z.string().trim().regex(PHONE_REGEX, 'Ingresa un teléfono válido (7 a 20 dígitos).')

export const manageableRoleSchema = z.enum(['admin', 'seller'])
export type ManageableRole = z.infer<typeof manageableRoleSchema>

/**
 * Campos que muestra el formulario, iguales en alta y edicion. El correo solo
 * se envia al crear (en edicion es de solo lectura) y el rol lo fija la
 * pantalla, no la persona.
 */
export const userFormSchema = z.object({
  fullName,
  alias,
  phone,
  // Se limpia ANTES de validar. Escrito al reves —`z.email().trim()`— un correo
  // pegado con un espacio al final se rechazaba con «Ingresa un correo válido»,
  // que es un mensaje que no ayuda a arreglar nada. Importa sobre todo al
  // CORREGIR un correo mal escrito (BR-E16): ahi la gente pega, no teclea.
  email: z.string().trim().toLowerCase().pipe(z.email('Ingresa un correo válido.')),
})
export type UserFormInput = z.infer<typeof userFormSchema>

export const createUserSchema = userFormSchema.extend({ role: manageableRoleSchema })
export type CreateUserInput = z.infer<typeof createUserSchema>

export const updateUserSchema = z.object({
  profileId: z.uuid('Usuario no válido.'),
  fullName,
  alias,
  phone,
})
export type UpdateUserInput = z.infer<typeof updateUserSchema>

export const setUserActiveSchema = z.object({
  profileId: z.uuid('Usuario no válido.'),
  isActive: z.boolean(),
})
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>

export const resendInvitationSchema = z.object({
  profileId: z.uuid('Usuario no válido.'),
})

export const userFormDefaults: UserFormInput = {
  fullName: '',
  alias: '',
  phone: '',
  email: '',
}
