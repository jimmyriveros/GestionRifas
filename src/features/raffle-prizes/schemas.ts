import { z } from 'zod'

import { LOTTERY_CODES } from '@/features/lottery/constants'

import { PRIZE_CATEGORY_VALUES, PRIZE_COPY, PRIZE_REWARD_MODE_VALUES } from './copy'
import {
  canonicalRules,
  overlappingDay,
  PRIZE_RULES_MAX,
  ruleProblem,
  toRulePayload,
  type PrizeRule,
} from './schedule'

/**
 * El contrato de escritura de los premios configurables (BR-J01..BR-J14).
 *
 * Capa de cliente Y de servidor, como el resto de `schemas.ts` del proyecto. La
 * tercera capa —la que manda— son los CHECK y las RPC de la migración `0058`, y
 * los límites de aquí son EXACTAMENTE los de allí: una prueba de base de datos
 * los compara en el borde.
 *
 * NO HAY ORGANIZACIÓN, NI ACTOR, NI ROL. La rifa manda la organización y la
 * persona sale de la sesión; los esquemas son `strictObject`, así que un campo
 * de más no se ignora: se rechaza.
 */

export const PRIZE_LIMITS = {
  titleMin: 2,
  titleMax: 80,
  descriptionMin: 2,
  descriptionMax: 160,
  conditionsMax: 1000,
  cashMin: 1,
  cashMax: 10_000_000_000,
  /** Alternativas por premio. El mismo que el CHECK de `position` en la base. */
  rewardOptionsMax: 6,
  rulesMax: PRIZE_RULES_MAX,
  /** Premios vigentes por rifa. Lo comprueba la RPC con la rifa bloqueada. */
  activePrizesMax: 50,
  historyPageSize: 20,
} as const

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, PRIZE_COPY.ruleProblems.invalid_date)
  .refine((value) => !Number.isNaN(Date.parse(value)), PRIZE_COPY.ruleProblems.invalid_date)

export const prizeDigitsSchema = z.enum(['four', 'last_three'])
export const prizeNumberFieldSchema = z.enum(['daily_number', 'weekly_number'])
export const prizeCategorySchema = z.enum(PRIZE_CATEGORY_VALUES)
export const prizeLotteryModeSchema = z.enum(['corresponding', 'fixed'])

export const prizeRuleSchema = z
  .strictObject({
    startDate: isoDate,
    endDate: isoDate,
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, PRIZE_COPY.ruleProblems.no_weekdays)
      .max(6, PRIZE_COPY.ruleProblems.no_weekdays),
    lotteryMode: prizeLotteryModeSchema,
    lotteryCode: z.enum(LOTTERY_CODES).nullable(),
  })
  .superRefine((rule, ctx) => {
    const problem = ruleProblem(rule)
    if (problem) {
      ctx.addIssue({ code: 'custom', message: PRIZE_COPY.ruleProblems[problem] })
    }
  })

export type PrizeRuleInput = z.infer<typeof prizeRuleSchema>

export const prizeRewardModeSchema = z.enum(PRIZE_REWARD_MODE_VALUES)

/**
 * Una alternativa (D-201): dinero, algo en especie, o las dos cosas.
 *
 * El texto vacío se trata como ausente, igual que hace la base con
 * `nullif(btrim(...), '')`: un campo que se dejó en blanco no es una
 * descripción de dos caracteres mal escrita.
 */
export const prizeRewardOptionSchema = z
  .strictObject({
    description: z
      .union([z.string(), z.null()])
      .transform((value) => {
        const trimmed = (value ?? '').trim()
        return trimmed === '' ? null : trimmed
      })
      .pipe(
        z
          .string()
          .min(PRIZE_LIMITS.descriptionMin, PRIZE_COPY.form.descriptionShort)
          .max(PRIZE_LIMITS.descriptionMax, PRIZE_COPY.form.descriptionLong)
          .nullable(),
      ),
    amount: z
      .number({ error: PRIZE_COPY.form.amountRequired })
      .int(PRIZE_COPY.form.amountNotInteger)
      .min(PRIZE_LIMITS.cashMin, PRIZE_COPY.form.amountRequired)
      .max(PRIZE_LIMITS.cashMax, PRIZE_COPY.form.amountTooHigh)
      .nullable(),
  })
  .refine(
    (option) => option.description !== null || option.amount !== null,
    PRIZE_COPY.form.optionEmpty,
  )

export type PrizeRewardOptionInput = z.infer<typeof prizeRewardOptionSchema>

/**
 * La recompensa entera. El MODO es explícito y no se deduce contando: `fixed`
 * con dos alternativas es un error de quien escribe, no un descubrimiento.
 */
export const prizeRewardSchema = z
  .strictObject({
    mode: prizeRewardModeSchema,
    options: z
      .array(prizeRewardOptionSchema)
      .min(1, PRIZE_COPY.form.rewardRequired)
      .max(PRIZE_LIMITS.rewardOptionsMax, PRIZE_COPY.form.optionsTooMany),
  })
  .superRefine((reward, ctx) => {
    if (reward.mode === 'fixed' && reward.options.length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: PRIZE_COPY.form.fixedNeedsOne })
    }
    if (reward.mode === 'winner_choice' && reward.options.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: PRIZE_COPY.form.choiceNeedsTwo })
    }

    const seen = new Set<string>()
    for (const option of reward.options) {
      const key = `${option.description ?? ''}|${option.amount ?? ''}`
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: PRIZE_COPY.form.optionsRepeated,
        })
        break
      }
      seen.add(key)
    }
  })

export type PrizeRewardInput = z.infer<typeof prizeRewardSchema>

/** Dos períodos de un mismo premio no pueden compartir un día (BR-J04). */
function rejectOverlaps(rules: PrizeRule[], ctx: z.RefinementCtx) {
  if (overlappingDay(rules) !== null) {
    ctx.addIssue({ code: 'custom', path: ['rules'], message: PRIZE_COPY.form.rulesOverlap })
  }
}

const prizeFields = {
  title: z
    .string()
    .trim()
    .min(PRIZE_LIMITS.titleMin, PRIZE_COPY.form.titleShort)
    .max(PRIZE_LIMITS.titleMax, PRIZE_COPY.form.titleLong),
  category: prizeCategorySchema,
  reward: prizeRewardSchema,
  numberField: prizeNumberFieldSchema,
  conditions: z.string().trim().max(PRIZE_LIMITS.conditionsMax, PRIZE_COPY.form.conditionsLong),
  rules: z
    .array(prizeRuleSchema)
    .min(1, PRIZE_COPY.form.rulesRequired)
    .max(PRIZE_LIMITS.rulesMax, PRIZE_COPY.form.rulesTooMany),
}

/**
 * Al crear, las cifras son CUATRO si no se dice otra cosa (BR-J06). Al publicar
 * una versión nueva son obligatorias: omitirlas devolvería a cuatro cifras un
 * premio configurado con las tres últimas sin que nadie lo pidiera.
 */
export const createPrizeSchema = z
  .strictObject({
    raffleId: z.uuid(PRIZE_COPY.form.raffleRequired),
    digits: prizeDigitsSchema.default('four'),
    ...prizeFields,
  })
  .superRefine((value, ctx) => rejectOverlaps(value.rules, ctx))

export type CreatePrizeInput = z.input<typeof createPrizeSchema>
export type CreatePrizeValues = z.infer<typeof createPrizeSchema>

export const publishPrizeVersionSchema = z
  .strictObject({
    prizeId: z.uuid(PRIZE_COPY.form.prizeRequired),
    expectedVersionId: z.uuid(PRIZE_COPY.form.versionRequired),
    digits: prizeDigitsSchema,
    ...prizeFields,
  })
  .superRefine((value, ctx) => rejectOverlaps(value.rules, ctx))

export type PublishPrizeVersionInput = z.infer<typeof publishPrizeVersionSchema>

/** Archivar y restaurar: solo el premio y la versión que se estaba viendo. */
export const prizeVersionTargetSchema = z.strictObject({
  prizeId: z.uuid(PRIZE_COPY.form.prizeRequired),
  expectedVersionId: z.uuid(PRIZE_COPY.form.versionRequired),
})

export type PrizeVersionTargetInput = z.infer<typeof prizeVersionTargetSchema>

export const reorderPrizesSchema = z.strictObject({
  raffleId: z.uuid(PRIZE_COPY.form.raffleRequired),
  prizeIds: z
    .array(z.uuid(PRIZE_COPY.form.prizeRequired))
    .min(1, PRIZE_COPY.form.orderInvalid)
    .max(PRIZE_LIMITS.activePrizesMax, PRIZE_COPY.form.orderInvalid)
    .refine((ids) => new Set(ids).size === ids.length, PRIZE_COPY.form.orderInvalid),
})

export type ReorderPrizesInput = z.infer<typeof reorderPrizesSchema>

export const prizeHistorySchema = z.strictObject({
  prizeId: z.uuid(PRIZE_COPY.form.prizeRequired),
  page: z.number().int().min(1).default(1),
})

export type PrizeHistoryInput = z.infer<typeof prizeHistorySchema>

/**
 * Los argumentos de las RPC. Están aquí, y no en cada acción, porque son parte
 * del contrato: si cambia un nombre de parámetro, cambia en un solo sitio.
 */
/** Las alternativas, en su orden: la base guarda la posición tal como llega. */
export function toRewardPayload(reward: PrizeRewardInput) {
  return reward.options.map((option) => ({
    description: option.description,
    amount: option.amount,
  }))
}

export function toCreatePrizeArgs(values: CreatePrizeValues) {
  return {
    p_raffle_id: values.raffleId,
    p_title: values.title,
    p_category: values.category,
    p_reward_mode: values.reward.mode,
    p_reward_options: toRewardPayload(values.reward),
    p_number_field: values.numberField,
    p_rules: toRulePayload(values.rules),
    p_digits: values.digits,
    p_conditions: values.conditions === '' ? null : values.conditions,
  }
}

export function toPublishPrizeArgs(values: PublishPrizeVersionInput) {
  return {
    p_prize_id: values.prizeId,
    p_expected_version_id: values.expectedVersionId,
    p_title: values.title,
    p_category: values.category,
    p_reward_mode: values.reward.mode,
    p_reward_options: toRewardPayload(values.reward),
    p_number_field: values.numberField,
    p_digits: values.digits,
    p_rules: toRulePayload(values.rules),
    p_conditions: values.conditions === '' ? null : values.conditions,
  }
}

/**
 * El primer problema del calendario contra las fechas de la rifa, para poder
 * decirlo en el formulario. La base lo vuelve a comprobar (BR-J04).
 */
export function prizeRulesProblem(
  rules: PrizeRule[],
  raffle: { startDate: string; endDate: string },
): string | null {
  for (const rule of canonicalRules(rules)) {
    const problem = ruleProblem(rule, raffle)
    if (problem) return PRIZE_COPY.ruleProblems[problem]
  }
  return overlappingDay(rules) === null ? null : PRIZE_COPY.form.rulesOverlap
}

/**
 * Lo que trae el formulario en blanco: un premio único en dinero, con cuatro
 * cifras. La alternativa existe desde el principio porque siempre hay al menos
 * una: lo que falta por escribir es su valor.
 */
export const prizeFormDefaults: CreatePrizeInput = {
  raffleId: '',
  title: '',
  category: 'daily',
  reward: { mode: 'fixed', options: [{ description: null, amount: 0 }] },
  numberField: 'daily_number',
  digits: 'four',
  conditions: '',
  rules: [],
}
