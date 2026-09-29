import { z } from 'zod'

import { COMMISSION_MODEL_VALUES } from '@/lib/constants'

import { hasTierProblems, TIER_LIMITS, TIER_MESSAGES, tierListSchema, tierProblems } from './tiers'

/**
 * Como se le paga a un vendedor, visto por los formularios y por las acciones
 * (BR-G24, D-127, D-237).
 *
 * Aqui solo se comprueba la FORMA: una de las dos formas de pago, una cifra
 * entera de pesos con el fijo (BR-P02) y una lista de tramos bien escrita. Lo
 * que depende de datos que el navegador no tiene —el tope que le cabe a un
 * integrante, las rebajas ya concedidas, las rifas cerradas— lo aplican el
 * disparador y las RPC. Esto es la primera linea, no la unica
 * (docs/SECURITY.md 1).
 *
 * Los dos valores de `commissionModel` se llaman igual que los dos modos del
 * acuerdo administrativo que el personal puede asignar (`tiered`,
 * `fixed_per_ticket`): la mitad no se asigna nunca (BR-G30), asi que un mismo
 * campo sirve a las dos altas y a los dos cambios.
 */
export const commissionModelSchema = z.enum(COMMISSION_MODEL_VALUES, 'Elige cómo se le va a pagar.')

export const MISSING_FIXED_AMOUNT = 'Escribe cuánto ganará por cada boleta que cobre completa.'

const fixedCommissionAmount = z
  .number('Escribe cuánto ganará por cada boleta.')
  .int('La ganancia se escribe en pesos, sin centavos.')
  .positive('La ganancia debe ser mayor que cero.')
  // El mismo limite de cordura que la base (BR-G32) y la misma frase.
  .max(TIER_LIMITS.maxRate, TIER_MESSAGES.rateTooHigh)
  .nullable()

/**
 * Los dos campos, con la regla que los une: el fijo exige importe. Los
 * comparten el alta y el cambio, del personal y del vendedor padre.
 */
export const commissionFields = {
  commissionModel: commissionModelSchema,
  fixedCommissionAmount: fixedCommissionAmount.optional(),
}

export function requireAmountForFixed(
  values: { commissionModel?: string | null; fixedCommissionAmount?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (values.commissionModel === 'fixed_per_ticket' && !values.fixedCommissionAmount) {
    ctx.addIssue({ code: 'custom', path: ['fixedCommissionAmount'], message: MISSING_FIXED_AMOUNT })
  }
}

/**
 * Una lista MIENTRAS se escribe: un tramo recien agregado tiene los dos campos
 * vacios. La forma estricta —enteros en orden— la comprueba el refinamiento con
 * `tierProblems`, que es la misma funcion que pinta el error de cada fila.
 */
const editableTiers = z.array(
  z.object({
    minTickets: z.number().int(TIER_MESSAGES.notInteger).nullable(),
    rate: z.number().int(TIER_MESSAGES.notInteger).nullable(),
  }),
)

/**
 * Los tramos personalizados del acuerdo administrativo (BR-G29). `null` o
 * ausentes = la lista general vigente. Solo cuentan con `tiered`.
 */
export function requireValidCustomTiers(
  values: {
    commissionModel?: string | null
    customTiers?: ReadonlyArray<{ minTickets: number | null; rate: number | null }> | null
  },
  ctx: z.RefinementCtx,
): void {
  if (values.commissionModel !== 'tiered' || !values.customTiers) return
  const problems = tierProblems(values.customTiers)
  if (!hasTierProblems(problems)) return
  const message = problems.list ?? Object.values(problems.rows)[0] ?? TIER_MESSAGES.missing
  ctx.addIssue({ code: 'custom', path: ['customTiers'], message })
}

/** El acuerdo del personal, en un formulario: con tramos a medio escribir. */
export const agreementFormFields = {
  ...commissionFields,
  customTiers: editableTiers.nullable().optional(),
}

/** El acuerdo del personal, en el servidor: tramos completos. */
export const agreementFields = {
  ...commissionFields,
  customTiers: tierListSchema.nullable().optional(),
}

/**
 * Cambiar el acuerdo administrativo de un vendedor (BR-G31). La accion lo
 * valida con esto; el dialogo, con la version de formulario.
 */
export const setSellerAgreementSchema = z
  .object({ sellerId: z.uuid('Vendedor no válido.'), ...agreementFields })
  .superRefine(requireAmountForFixed)
export type SetSellerAgreementInput = z.infer<typeof setSellerAgreementSchema>

// Un vendedor con la mitad del precio abre el dialogo sin ninguna tarjeta
// elegida: la mitad no se ofrece (BR-G30) y marcar otra por defecto seria
// decidir por quien lo esta cambiando.
export const sellerAgreementFormSchema = z
  .object({
    sellerId: z.uuid('Vendedor no válido.'),
    ...agreementFormFields,
    commissionModel: commissionModelSchema.nullable(),
  })
  .superRefine((values, ctx) => {
    if (values.commissionModel === null) {
      ctx.addIssue({ code: 'custom', path: ['commissionModel'], message: 'Elige cómo se le va a pagar.' })
      return
    }
    requireAmountForFixed(values, ctx)
    requireValidCustomTiers(values, ctx)
  })
export type SellerAgreementFormInput = z.infer<typeof sellerAgreementFormSchema>

/** Guardar la lista general entera (BR-G29). */
export const saveCommissionTemplateSchema = z.object({ tiers: tierListSchema })
export type SaveCommissionTemplateInput = z.infer<typeof saveCommissionTemplateSchema>

export const commissionTemplateFormSchema = z
  .object({ tiers: editableTiers })
  .superRefine((values, ctx) => {
    const problems = tierProblems(values.tiers)
    if (!hasTierProblems(problems)) return
    const message = problems.list ?? Object.values(problems.rows)[0] ?? TIER_MESSAGES.missing
    ctx.addIssue({ code: 'custom', path: ['tiers'], message })
  })
export type CommissionTemplateFormInput = z.infer<typeof commissionTemplateFormSchema>
