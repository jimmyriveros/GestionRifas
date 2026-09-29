import { z } from 'zod'

import { commissionFields, requireAmountForFixed } from '@/features/commissions/schemas'
import { userFormSchema } from '@/features/users/schemas'

/**
 * Como se le paga a un integrante (BR-G24, D-127): los dos campos y la regla que
 * los une viven en `features/commissions/schemas.ts` desde D-237, porque ahora
 * los usan tambien el alta y el cambio del personal. Aqui solo se componen.
 *
 * El importe viaja SIEMPRE que el modelo sea fijo y se ignora cuando es por
 * tramos: quien decide si guardarlo es la base de datos, no el navegador. El
 * TOPE —lo que el propio vendedor padre gana por boleta en el peor caso— lo
 * aplica el disparador `memberships_validate_seller_agreements` (BR-G28).
 */

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

/**
 * Alta de un integrante: los datos de la persona MAS como se le va a pagar.
 *
 * Van juntos y no en dos pasos porque es una sola decision del vendedor padre y
 * un solo formulario: separarlos dejaria al integrante recien creado con la
 * configuracion por defecto durante el rato que tardara el segundo paso, y ese
 * rato es tiempo en el que ya puede vender.
 */
export const createTeamMemberSchema = userFormSchema
  .extend(commissionFields)
  .superRefine(requireAmountForFixed)
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>

/** Cambiar como se le paga a un integrante que ya existe (BR-G25). */
export const setTeamCommissionSchema = z
  .object({ memberId: z.uuid('Vendedor no válido.'), ...commissionFields })
  .superRefine(requireAmountForFixed)
export type SetTeamCommissionInput = z.infer<typeof setTeamCommissionSchema>
