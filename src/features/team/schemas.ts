import { z } from 'zod'

import { userFormSchema } from '@/features/users/schemas'

/**
 * Edicion y borrado de un integrante del equipo (BR-E15..BR-E17).
 *
 * Los campos y sus mensajes son los MISMOS del alta: se extiende
 * `userFormSchema` en vez de repetir las reglas de nombre, alias, telefono y
 * correo. Si algun dia cambia el formato del telefono, cambia en un solo sitio.
 *
 * El correo viaja SIEMPRE, tambien cuando no cambio: quien decide si hay que
 * rotar la invitacion es la base de datos comparandolo con el actual, no el
 * navegador (`team_update_member`). Un formulario manipulado no puede provocar
 * un envio de correo que la base de datos no considere necesario.
 */
export const updateTeamMemberSchema = userFormSchema.extend({
  memberId: z.uuid('Vendedor no válido.'),
})
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>

export const deleteTeamMemberSchema = z.object({
  memberId: z.uuid('Vendedor no válido.'),
})
