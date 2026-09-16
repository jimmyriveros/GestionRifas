import { describe, expect, it } from 'vitest'

import {
  PRIZE_CHANGE_LABELS,
  PRIZE_FORM_COPY,
  PRIZE_HISTORY_COPY,
  PRIZE_PANEL_COPY,
  PRIZE_SCHEDULE_COPY,
  RAFFLE_WIZARD_COPY,
} from '@/features/raffle-prizes/copy'
import { raffleReviewProblems, type ReviewPrize } from '@/features/raffle-prizes/review'
import {
  rangeRule,
  recurringRule,
  ruleKind,
  singleDateRule,
} from '@/features/raffle-prizes/schedule'
import {
  prizeFormDefaults,
  prizeFormSchema,
  toCreatePrizeArgs,
  toPublishPrizeArgs,
} from '@/features/raffle-prizes/schemas'

/**
 * Lo puro del PANEL de premios (Entrega 2, D-202): el contrato del formulario,
 * lo que impide activar una rifa y la forma con la que se pinta cada período.
 *
 * El contrato del dominio —calendario, cifras, recompensa y textos— vive en
 * `raffle-prizes.test.ts`; aquí solo está lo que añade la pantalla.
 */

const RIFA = { startDate: '2026-12-01', endDate: '2026-12-31' }

const FORMULARIO = {
  title: 'Premio diario',
  category: 'daily' as const,
  reward: { mode: 'fixed' as const, options: [{ description: null, amount: 500_000 }] },
  numberField: 'daily_number' as const,
  digits: 'four' as const,
  conditions: '',
  rules: [singleDateRule('2026-12-21')],
}

// =============================================================================
describe('el formulario de un premio (D-202)', () => {
  it('valida lo mismo que las dos acciones, sin identificadores', () => {
    const parsed = prizeFormSchema.parse(FORMULARIO)
    expect(parsed.title).toBe('Premio diario')
    expect(Object.keys(prizeFormSchema.shape)).not.toContain('raffleId')
    expect(Object.keys(prizeFormSchema.shape)).not.toContain('prizeId')
  })

  it('el formulario en blanco trae una alternativa y cuatro cifras', () => {
    expect(prizeFormDefaults.digits).toBe('four')
    expect(prizeFormDefaults.reward.options).toHaveLength(1)
    expect(prizeFormDefaults.reward.mode).toBe('fixed')
  })

  it('los mismos valores sirven para crear y para publicar una versión nueva', () => {
    const values = prizeFormSchema.parse(FORMULARIO)

    const create = toCreatePrizeArgs({
      ...values,
      raffleId: '11111111-2222-4333-8444-555555555555',
    })
    expect(create.p_raffle_id).toBe('11111111-2222-4333-8444-555555555555')
    expect(create.p_reward_mode).toBe('fixed')
    expect(create.p_reward_options).toEqual([{ description: null, amount: 500_000 }])

    const publish = toPublishPrizeArgs({
      ...values,
      prizeId: '22222222-2222-4333-8444-555555555555',
      expectedVersionId: '33333333-2222-4333-8444-555555555555',
    })
    expect(publish.p_expected_version_id).toBe('33333333-2222-4333-8444-555555555555')
    expect(publish.p_rules).toEqual(create.p_rules)
    expect(publish.p_reward_options).toEqual(create.p_reward_options)
  })

  it('las aclaraciones vacías NO viajan como null: se omiten (HANDOFF §9)', () => {
    const values = prizeFormSchema.parse(FORMULARIO)
    expect('p_conditions' in toCreatePrizeArgs({ ...values, raffleId: RIFA_ID })).toBe(false)

    const conAclaraciones = prizeFormSchema.parse({ ...FORMULARIO, conditions: 'Sin cambio.' })
    expect(toCreatePrizeArgs({ ...conAclaraciones, raffleId: RIFA_ID }).p_conditions).toBe(
      'Sin cambio.',
    )
  })

  it('un premio sin calendario no se puede guardar', () => {
    expect(prizeFormSchema.safeParse({ ...FORMULARIO, rules: [] }).success).toBe(false)
  })

  it('«Premio único» con dos alternativas se rechaza antes de llegar al servidor', () => {
    const resultado = prizeFormSchema.safeParse({
      ...FORMULARIO,
      reward: {
        mode: 'fixed',
        options: [
          { description: null, amount: 1000 },
          { description: null, amount: 2000 },
        ],
      },
    })
    expect(resultado.success).toBe(false)
  })
})

const RIFA_ID = '11111111-2222-4333-8444-555555555555'

// =============================================================================
describe('qué impide activar una rifa (D-202)', () => {
  const diario: ReviewPrize = {
    id: 'a',
    title: 'Premio diario',
    numberField: 'daily_number',
    digits: 'four',
    rules: [recurringRule('2026-12-01', '2026-12-18', [1, 2, 3, 4, 5])],
  }

  const mayor: ReviewPrize = {
    id: 'b',
    title: 'Premio mayor',
    numberField: 'daily_number',
    digits: 'four',
    rules: [singleDateRule('2026-12-21')],
  }

  it('sin premios, lo dice y no dice nada más', () => {
    expect(raffleReviewProblems([], RIFA)).toEqual([RAFFLE_WIZARD_COPY.blockedNoPrizes])
  })

  it('una configuración válida no tiene nada que decir', () => {
    expect(raffleReviewProblems([diario, mayor], RIFA)).toEqual([])
  })

  it('un premio con fechas fuera de la rifa se nombra', () => {
    const fuera: ReviewPrize = { ...mayor, id: 'c', rules: [singleDateRule('2027-01-04')] }
    const problemas = raffleReviewProblems([fuera], RIFA)
    expect(problemas).toHaveLength(1)
    expect(problemas[0]).toContain('Premio mayor')
    expect(problemas[0]).toContain('01/12/2026')
  })

  it('dos premios que se cruzan se nombran los dos, con el día', () => {
    const cruzado: ReviewPrize = {
      ...diario,
      rules: [recurringRule('2026-12-01', '2026-12-31', [1, 2, 3, 4, 5])],
    }
    const problemas = raffleReviewProblems([cruzado, mayor], RIFA)
    expect(problemas).toHaveLength(1)
    expect(problemas[0]).toContain('Premio diario')
    expect(problemas[0]).toContain('Premio mayor')
    expect(problemas[0]).toContain('21/12/2026')
  })

  it('el mismo cruce se dice UNA vez, no dos con los nombres al revés', () => {
    const cruzado: ReviewPrize = {
      ...diario,
      rules: [recurringRule('2026-12-01', '2026-12-31', [1, 2, 3, 4, 5])],
    }
    expect(raffleReviewProblems([mayor, cruzado], RIFA)).toHaveLength(1)
  })

  it('cuatro cifras y últimas tres el mismo día no son un problema (BR-J07)', () => {
    const tresCifras: ReviewPrize = { ...mayor, id: 'd', digits: 'last_three' }
    expect(raffleReviewProblems([mayor, tresCifras], RIFA)).toEqual([])
  })
})

// =============================================================================
describe('con qué control se vuelve a pintar un período (D-202)', () => {
  it('una fecha, un tramo seguido y unos días elegidos', () => {
    expect(ruleKind(singleDateRule('2026-12-21'))).toBe('single')
    expect(ruleKind(rangeRule('2026-12-01', '2026-12-05'))).toBe('range')
    expect(ruleKind(recurringRule('2026-12-01', '2026-12-31', [6]))).toBe('recurring')
  })

  it('un tramo que incluye todos sus días no se presenta como recurrente', () => {
    const seguido = recurringRule('2026-12-01', '2026-12-05', [2, 3, 4, 5, 6])
    expect(ruleKind(seguido)).toBe('range')
  })
})

// =============================================================================
describe('los textos del panel (BR-L15, UX_COPY_GUIDELINES)', () => {
  function textos(value: unknown): string[] {
    if (typeof value === 'string') return [value]
    if (typeof value === 'function') return []
    if (value && typeof value === 'object') return Object.values(value).flatMap(textos)
    return []
  }

  it('«ganador» no aparece en ningún texto nuevo', () => {
    const todos = [
      PRIZE_PANEL_COPY,
      PRIZE_FORM_COPY,
      PRIZE_SCHEDULE_COPY,
      PRIZE_HISTORY_COPY,
      RAFFLE_WIZARD_COPY,
      PRIZE_CHANGE_LABELS,
    ].flatMap(textos)

    expect(todos.length).toBeGreaterThan(50)
    for (const texto of todos) expect(texto.toLowerCase()).not.toContain('ganador')
  })

  it('el panel no promete que un premio se elimine: se archiva', () => {
    for (const texto of textos(PRIZE_PANEL_COPY)) {
      expect(texto.toLowerCase()).not.toContain('eliminar')
      expect(texto.toLowerCase()).not.toContain('borrar')
    }
  })

  it('archivar dice qué deja de pasar, no cómo se llama la acción (D-199)', () => {
    expect(PRIZE_PANEL_COPY.archived).toContain('ya no aplica para los próximos sorteos')
    expect(PRIZE_PANEL_COPY.restored).toContain('vuelve a aplicar')
  })
})
