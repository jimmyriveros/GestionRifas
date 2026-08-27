import { z } from 'zod'

import { userFormSchema } from '@/features/users/schemas'
import { COMMISSION_MODEL_VALUES } from '@/lib/constants'

/**
 * Como se le paga a un integrante (BR-G24, D-127).
 *
 * Aqui solo se comprueba la FORMA: que el modelo sea uno de los dos y que, con
 * el fijo, haya una cifra entera de pesos mayor que cero (BR-P02). El TOPE —la
 * mitad del precio de la rifa— depende de un dato que el navegador no tiene y
 * que ademas puede cambiar mientras el formulario esta abierto, asi que lo
 * aplica el trigger `memberships_validate_commission`. Esto es la primera
 * linea, no la unica (docs/SECURITY.md 1).
 *
 * El importe viaja SIEMPRE que el modelo sea fijo y se ignora cuando es por
 * tramos: quien decide si guardarlo es la base de datos, no el navegador. Un
 * formulario manipulado que enviara `tiered` con importe se topa ademas con la
 * restriccion `memberships_commission_model_amount`.
 */
export const commissionModelSchema = z.enum(COMMISSION_MODEL_VALUES)

const fixedCommissionAmount = z
  .number('Escribe cuánto ganará por cada boleta.')
  .int('La ganancia se escribe en pesos, sin centavos.')
  .positive('La ganancia debe ser mayor que cero.')
  .nullable()

/**
 * Los dos campos, con la regla que los une: el fijo exige importe.
 *
 * Se escribe una sola vez y la comparten el alta y la edicion, que son dos
 * pantallas distintas de la misma decision.
 */
export const commissionFields = {
  commissionModel: commissionModelSchema,
  fixedCommissionAmount: fixedCommissionAmount.optional(),
}

export function requireAmountForFixed(
  values: { commissionModel: string; fixedCommissionAmount?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (values.commissionModel === 'fixed_per_ticket' && !values.fixedCommissionAmount) {
    ctx.addIssue({
      code: 'custom',
      path: ['fixedCommissionAmount'],
      message: 'Escribe cuánto ganará por cada boleta que cobre completa.',
    })
  }
}

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
