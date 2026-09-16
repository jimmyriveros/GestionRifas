import { describe, expect, it } from 'vitest'

import { notificationHref, notificationMessage } from '@/features/notifications/text'
import {
  PRIZE_CATEGORY_LABELS,
  PRIZE_DIGITS_LABELS,
  PRIZE_REWARD_MODE_LABELS,
  PRIZE_COPY,
  prizeActorLabel,
  prizeConflictMessage,
  prizeLotteryLabel,
  prizePreviewSentence,
  rewardOptionText,
  rewardText,
  scheduleSummary,
  summarizeRule,
  validityText,
} from '@/features/raffle-prizes/copy'
import {
  applicableVersion,
  prizeNumberMatches,
  resolvePrizeLinks,
  type PrizeCandidate,
} from '@/features/raffle-prizes/matching'
import {
  createPrizeSchema,
  prizeHistorySchema,
  prizeRulesProblem,
  prizeVersionTargetSchema,
  publishPrizeVersionSchema,
  reorderPrizesSchema,
  toCreatePrizeArgs,
  PRIZE_LIMITS,
} from '@/features/raffle-prizes/schemas'
import {
  canonicalRules,
  expandRule,
  expandRules,
  lotteryForWeekday,
  overlappingDay,
  rangeRule,
  recurringRule,
  ruleProblem,
  rulesEqual,
  prizeConflict,
  singleDateRule,
  toRulePayload,
  validityRange,
  type PrizeRule,
  type PrizeScheduleSubject,
} from '@/features/raffle-prizes/schedule'
import { APP_CAPABILITIES, roleHasCapability } from '@/lib/auth/capabilities'

/**
 * Premios configurables por rifa, Entrega 1 (BR-J01..BR-J14, D-199, D-200).
 *
 * Lo que se prueba aquí es el CONTRATO: el calendario, la semántica de las
 * cifras, la capacidad, los esquemas y los textos. Quién puede escribir y qué
 * queda en la base lo prueba `tests/db/raffle-prizes.test.ts`.
 *
 * Diciembre de 2026, que es la configuración de aceptación: el 1 es martes, el 5
 * y el 19 son sábados, el 15 es martes, el 16 miércoles y el 21 LUNES.
 */

const RAFFLE = { startDate: '2026-12-01', endDate: '2026-12-31' }

function rule(overrides: Partial<PrizeRule> = {}): PrizeRule {
  return {
    startDate: '2026-12-01',
    endDate: '2026-12-31',
    weekdays: [1, 2, 3, 4, 5],
    lotteryMode: 'corresponding',
    lotteryCode: null,
    ...overrides,
  }
}

// =============================================================================
describe('el calendario: un día, un rango y una recurrencia (BR-J04)', () => {
  it('«una fecha» es un período de un día, con el día que le toca', () => {
    const lunes = singleDateRule('2026-12-21')
    expect(lunes).toMatchObject({ startDate: '2026-12-21', endDate: '2026-12-21', weekdays: [1] })
    expect(expandRule(lunes)).toEqual([{ referenceDate: '2026-12-21', lottery: 'cundinamarca' }])
  })

  it('«un rango» toma los días con lotería que caen dentro, sin domingo', () => {
    // Del martes 1 al sábado 5 de diciembre.
    const rango = rangeRule('2026-12-01', '2026-12-05')
    expect(rango.weekdays).toEqual([2, 3, 4, 5, 6])
    expect(expandRule(rango).map((o) => o.lottery)).toEqual([
      'cruz_roja',
      'meta',
      'bogota',
      'medellin',
      'boyaca',
    ])
  })

  it('un rango de una semana completa no incluye el domingo', () => {
    const rango = rangeRule('2026-12-01', '2026-12-14')
    expect(rango.weekdays).toEqual([1, 2, 3, 4, 5, 6])
    expect(expandRule(rango).some((o) => o.referenceDate === '2026-12-06')).toBe(false)
  })

  it('«se repite ciertos días» expande solo esos días', () => {
    const sabados = recurringRule('2026-12-01', '2026-12-31', [6])
    expect(expandRule(sabados).map((o) => o.referenceDate)).toEqual([
      '2026-12-05',
      '2026-12-12',
      '2026-12-19',
      '2026-12-26',
    ])
  })

  it('varias ventanas separadas son un solo premio', () => {
    const rules = [rangeRule('2026-12-01', '2026-12-05'), rangeRule('2026-12-16', '2026-12-19')]
    const dias = expandRules(rules).map((o) => o.referenceDate)
    expect(dias).toHaveLength(9)
    expect(dias[0]).toBe('2026-12-01')
    expect(dias.at(-1)).toBe('2026-12-19')
    expect(overlappingDay(rules)).toBeNull()
  })

  it('dos ventanas que comparten un día se detectan', () => {
    const rules = [rangeRule('2026-12-01', '2026-12-05'), rangeRule('2026-12-05', '2026-12-10')]
    expect(overlappingDay(rules)).toBe('2026-12-05')
  })
})

// =============================================================================
describe('el domingo no juega, y la lotería fija solo en su día (BR-J04, BR-J05)', () => {
  it('el domingo se rechaza', () => {
    expect(
      ruleProblem(rule({ startDate: '2026-12-06', endDate: '2026-12-06', weekdays: [7] })),
    ).toBe('sunday')
    expect(lotteryForWeekday(7)).toBeNull()
  })

  it('la lotería correspondiente sale del día', () => {
    expect(lotteryForWeekday(1)).toBe('cundinamarca')
    expect(lotteryForWeekday(6)).toBe('boyaca')
  })

  it('una lotería fija en un día que no es el suyo se rechaza', () => {
    const malo = rule({
      startDate: '2026-12-05',
      endDate: '2026-12-05',
      weekdays: [6],
      lotteryMode: 'fixed',
      lotteryCode: 'cundinamarca',
    })
    expect(ruleProblem(malo)).toBe('fixed_lottery_weekday')
  })

  it('fija y correspondiente dan la MISMA lotería en una fecha válida (D-143)', () => {
    const fija = rule({
      startDate: '2026-12-21',
      endDate: '2026-12-21',
      weekdays: [1],
      lotteryMode: 'fixed',
      lotteryCode: 'cundinamarca',
    })
    expect(expandRule(fija)).toEqual(expandRule(singleDateRule('2026-12-21')))
  })

  it('un período que no incluye ninguno de sus días se rechaza', () => {
    // Del martes 1 al miércoles 2, pidiendo sábados.
    expect(ruleProblem(rule({ endDate: '2026-12-02', weekdays: [6] }))).toBe('weekday_not_covered')
  })

  it('un período fuera de las fechas de la rifa se rechaza', () => {
    expect(ruleProblem(rule({ endDate: '2027-01-05' }), RAFFLE)).toBe('outside_raffle')
  })
})

// =============================================================================
describe('la forma canónica', () => {
  it('ordena los días, quita repetidos y olvida la lotería cuando no es fija', () => {
    const [canonico] = canonicalRules([
      rule({ weekdays: [5, 1, 5, 2], lotteryMode: 'corresponding', lotteryCode: 'boyaca' }),
    ])
    expect(canonico?.weekdays).toEqual([1, 2, 5])
    expect(canonico?.lotteryCode).toBeNull()
  })

  it('dos calendarios iguales en otro orden son el mismo', () => {
    const a = [rangeRule('2026-12-16', '2026-12-19'), rangeRule('2026-12-01', '2026-12-05')]
    const b = [rangeRule('2026-12-01', '2026-12-05'), rangeRule('2026-12-16', '2026-12-19')]
    expect(rulesEqual(a, b)).toBe(true)
    expect(toRulePayload(a)).toEqual(toRulePayload(b))
  })

  it('el payload de la RPC lleva las claves que espera la migración', () => {
    expect(toRulePayload([singleDateRule('2026-12-21')])).toEqual([
      {
        start_date: '2026-12-21',
        end_date: '2026-12-21',
        weekdays: [1],
        lottery_mode: 'corresponding',
        lottery_code: null,
      },
    ])
  })
})

// =============================================================================
describe('las cifras: 0046, 046, 1046 y 46 (BR-J06, BR-J07)', () => {
  it('cuatro cifras es igualdad textual exacta', () => {
    expect(prizeNumberMatches('0046', '0046', 'four')).toBe(true)
    expect(prizeNumberMatches('46', '0046', 'four')).toBe(false)
    expect(prizeNumberMatches('1046', '0046', 'four')).toBe(false)
  })

  it('las tres últimas exigen un número de al menos tres caracteres', () => {
    expect(prizeNumberMatches('0046', '0046', 'last_three')).toBe(true)
    expect(prizeNumberMatches('1046', '0046', 'last_three')).toBe(true)
    expect(prizeNumberMatches('046', '0046', 'last_three')).toBe(true)
    expect(prizeNumberMatches('46', '0046', 'last_three')).toBe(false)
  })

  it('un número mayor que no tiene cuatro cifras no coincide con nada', () => {
    expect(prizeNumberMatches('046', '046', 'last_three')).toBe(false)
    expect(prizeNumberMatches('0046', '046', 'four')).toBe(false)
  })

  it('las cuatro cifras mandan sobre las tres para la misma boleta y resultado', () => {
    const candidatos: PrizeCandidate[] = [
      { prizeId: 'p1', versionId: 'v1', numberField: 'daily_number', digits: 'four' },
      { prizeId: 'p2', versionId: 'v2', numberField: 'daily_number', digits: 'last_three' },
      { prizeId: 'p3', versionId: 'v3', numberField: 'weekly_number', digits: 'last_three' },
    ]
    expect(resolvePrizeLinks(candidatos).map((c) => c.prizeId)).toEqual(['p1'])
  })

  it('sin coincidencia de cuatro cifras, las de tres se conservan', () => {
    const candidatos: PrizeCandidate[] = [
      { prizeId: 'p2', versionId: 'v2', numberField: 'daily_number', digits: 'last_three' },
      { prizeId: 'p3', versionId: 'v3', numberField: 'weekly_number', digits: 'last_three' },
    ]
    expect(resolvePrizeLinks(candidatos)).toHaveLength(2)
  })

  it('dos premios de la misma especificidad se conservan los dos', () => {
    const candidatos: PrizeCandidate[] = [
      { prizeId: 'p1', versionId: 'v1', numberField: 'weekly_number', digits: 'four' },
      { prizeId: 'p5', versionId: 'v5', numberField: 'weekly_number', digits: 'four' },
    ]
    expect(resolvePrizeLinks(candidatos)).toHaveLength(2)
  })
})

// =============================================================================
describe('la versión que aplica a un sorteo (BR-J09)', () => {
  const versiones = [
    {
      id: 'v1',
      versionNumber: 1,
      publishedAt: '2026-11-20T10:00:00-05:00',
      status: 'active' as const,
    },
    {
      id: 'v2',
      versionNumber: 2,
      publishedAt: '2026-12-10T09:00:00-05:00',
      status: 'active' as const,
    },
  ]

  it('un sorteo anterior al cambio conserva la versión con la que se anunció', () => {
    expect(applicableVersion(versiones, '2026-12-03T22:30:00-05:00')?.id).toBe('v1')
  })

  it('un sorteo posterior usa la versión nueva', () => {
    expect(applicableVersion(versiones, '2026-12-17T22:30:00-05:00')?.id).toBe('v2')
  })

  it('en el instante exacto del corte la ocurrencia ya está bloqueada', () => {
    expect(applicableVersion(versiones, '2026-12-10T09:00:00-05:00')?.id).toBe('v1')
  })

  it('sin ninguna versión anterior al corte, el premio no aplica', () => {
    expect(applicableVersion(versiones, '2026-11-01T22:30:00-05:00')).toBeNull()
  })

  it('si la versión que aplica está archivada, quien llame lo verá y no aplicará', () => {
    const archivado = [
      versiones[0]!,
      {
        id: 'v2',
        versionNumber: 2,
        publishedAt: '2026-12-10T09:00:00-05:00',
        status: 'archived' as const,
      },
    ]
    expect(applicableVersion(archivado, '2026-12-17T22:30:00-05:00')?.status).toBe('archived')
  })
})

// =============================================================================
describe('el resumen en español (D-199)', () => {
  it('escribe la frase del encargo', () => {
    expect(
      prizePreviewSentence({
        rules: [rangeRule('2026-12-01', '2026-12-05'), rangeRule('2026-12-16', '2026-12-19')],
        numberField: 'weekly_number',
        digits: 'four',
        reward: { mode: 'fixed', options: [{ description: null, amount: 1_000_000 }] },
      }),
    ).toBe(
      'Del 1 al 5 de diciembre y del 16 al 19 de diciembre juega con las cuatro cifras del número semanal y la lotería correspondiente de cada día por $1.000.000.',
    )
  })

  it('nombra la lotería cuando todos sus días juegan con la misma', () => {
    expect(
      prizePreviewSentence({
        rules: [recurringRule('2026-12-01', '2026-12-31', [6])],
        numberField: 'weekly_number',
        digits: 'four',
        reward: { mode: 'fixed', options: [{ description: null, amount: 2_000_000 }] },
      }),
    ).toBe(
      'Los sábados del 1 al 31 de diciembre juega con las cuatro cifras del número semanal y la lotería de Boyacá por $2.000.000.',
    )
  })

  it('dice «las tres últimas cifras» y el premio en especie tal como se escribió', () => {
    expect(
      prizePreviewSentence({
        rules: [singleDateRule('2026-12-21')],
        numberField: 'daily_number',
        digits: 'last_three',
        reward: { mode: 'fixed', options: [{ description: 'una camioneta', amount: null }] },
      }),
    ).toBe(
      'El 21 de diciembre juega con las tres últimas cifras del número diario y la lotería de Cundinamarca por una camioneta.',
    )
  })

  it('«de lunes a viernes» cuando los días son seguidos', () => {
    expect(summarizeRule(rule())).toBe('de lunes a viernes del 1 al 31 de diciembre')
    expect(scheduleSummary([rule()])).toBe('De lunes a viernes del 1 al 31 de diciembre')
  })

  it('escribe el año solo cuando el período cruza de año', () => {
    expect(summarizeRule(rangeRule('2026-12-28', '2027-01-02'))).toBe(
      'del 28 de diciembre de 2026 al 2 de enero de 2027',
    )
  })

  it('la columna «Lotería» dice el nombre o «Correspondiente»', () => {
    expect(prizeLotteryLabel([recurringRule('2026-12-01', '2026-12-31', [6])])).toBe('Boyacá')
    expect(prizeLotteryLabel([rule()])).toBe('Correspondiente')
  })

  it('sin actor, una versión la publicó el sistema', () => {
    expect(prizeActorLabel(null)).toBe('Sistema')
    expect(prizeActorLabel('  ')).toBe('Sistema')
    expect(prizeActorLabel('Ana Torres')).toBe('Ana Torres')
  })

  it('«ganador» no aparece en ningún texto del módulo (BR-L15)', () => {
    const textos = [
      ...Object.values(PRIZE_CATEGORY_LABELS),
      ...Object.values(PRIZE_DIGITS_LABELS),
      ...Object.values(PRIZE_REWARD_MODE_LABELS),
      ...Object.values(PRIZE_COPY.ruleProblems),
      ...Object.values(PRIZE_COPY.form),
      prizePreviewSentence({
        rules: [singleDateRule('2026-12-21')],
        numberField: 'daily_number',
        digits: 'four',
        reward: { mode: 'fixed', options: [{ description: 'una camioneta', amount: null }] },
      }),
      prizePreviewSentence({
        rules: [singleDateRule('2026-12-21')],
        numberField: 'daily_number',
        digits: 'four',
        reward: {
          mode: 'winner_choice',
          options: [
            { description: 'Camioneta KIA', amount: null },
            { description: null, amount: 120_000_000 },
          ],
        },
      }),
      prizeConflictMessage('Premio diario', { other: 'Premio mayor', referenceDate: '2026-12-21' }),
    ]
    for (const texto of textos) expect(texto.toLowerCase()).not.toContain('ganador')
  })
})

// =============================================================================
describe('los esquemas: sin organización, sin actor y sin rol (BR-J10)', () => {
  const base = {
    raffleId: '11111111-2222-4333-8444-555555555555',
    title: 'Premio diario',
    category: 'daily' as const,
    reward: { mode: 'fixed' as const, options: [{ description: null, amount: 500_000 }] },
    numberField: 'daily_number' as const,
    conditions: '',
    rules: [rule()],
  }

  it('ninguno declara organizationId, actor ni rol', () => {
    const prohibidos = ['organizationId', 'organization_id', 'actor', 'actorId', 'role', 'sellerId']
    for (const schema of [
      createPrizeSchema,
      publishPrizeVersionSchema,
      prizeVersionTargetSchema,
      reorderPrizesSchema,
      prizeHistorySchema,
    ]) {
      const claves = Object.keys(schema.shape ?? {})
      for (const prohibido of prohibidos) expect(claves).not.toContain(prohibido)
    }
  })

  it('un campo de más se rechaza, no se ignora', () => {
    const conOrganizacion = createPrizeSchema.safeParse({
      ...base,
      organizationId: '11111111-2222-4333-8444-555555555555',
    })
    expect(conOrganizacion.success).toBe(false)
  })

  it('las cifras son cuatro si no se dicen', () => {
    const parsed = createPrizeSchema.parse(base)
    expect(parsed.digits).toBe('four')
    expect(toCreatePrizeArgs(parsed).p_digits).toBe('four')
  })

  it('al publicar, las cifras son obligatorias', () => {
    const sinCifras = publishPrizeVersionSchema.safeParse({
      ...base,
      prizeId: base.raffleId,
      expectedVersionId: base.raffleId,
    })
    expect(sinCifras.success).toBe(false)
  })

  it('la categoría no decide el número ni las cifras (BR-J03)', () => {
    const semanalEnCategoriaDiaria = createPrizeSchema.safeParse({
      ...base,
      category: 'daily',
      numberField: 'weekly_number',
      rules: [
        {
          startDate: '2026-12-21',
          endDate: '2026-12-21',
          weekdays: [1],
          lotteryMode: 'fixed',
          lotteryCode: 'cundinamarca',
        },
      ],
    })
    expect(semanalEnCategoriaDiaria.success).toBe(true)
  })

  it('una alternativa lleva dinero, especie o las dos cosas, pero nunca nada (D-201)', () => {
    for (const option of [
      { description: null, amount: 500_000 },
      { description: 'Camioneta KIA', amount: null },
      { description: 'Renault Alaskan 2023', amount: 20_000_000 },
    ]) {
      expect(
        createPrizeSchema.safeParse({ ...base, reward: { mode: 'fixed', options: [option] } })
          .success,
      ).toBe(true)
    }

    expect(
      createPrizeSchema.safeParse({
        ...base,
        reward: { mode: 'fixed', options: [{ description: null, amount: null }] },
      }).success,
    ).toBe(false)
  })

  it('los límites de texto y de valor son los de la base', () => {
    expect(
      createPrizeSchema.safeParse({ ...base, title: 'x'.repeat(PRIZE_LIMITS.titleMax) }).success,
    ).toBe(true)
    expect(
      createPrizeSchema.safeParse({ ...base, title: 'x'.repeat(PRIZE_LIMITS.titleMax + 1) })
        .success,
    ).toBe(false)
    expect(
      createPrizeSchema.safeParse({
        ...base,
        reward: { mode: 'fixed', options: [{ description: null, amount: PRIZE_LIMITS.cashMax }] },
      }).success,
    ).toBe(true)
    expect(
      createPrizeSchema.safeParse({
        ...base,
        reward: {
          mode: 'fixed',
          options: [{ description: null, amount: PRIZE_LIMITS.cashMax + 1 }],
        },
      }).success,
    ).toBe(false)
    expect(
      createPrizeSchema.safeParse({
        ...base,
        conditions: 'x'.repeat(PRIZE_LIMITS.conditionsMax + 1),
      }).success,
    ).toBe(false)
  })

  it('el calendario vacío, con más de diez períodos o con días repetidos se rechaza', () => {
    expect(createPrizeSchema.safeParse({ ...base, rules: [] }).success).toBe(false)

    // Once períodos de un día, saltándose los domingos: uno más que el tope.
    const once = Array.from({ length: 14 }, (_, index) =>
      singleDateRule(`2026-12-${String(index + 1).padStart(2, '0')}`),
    )
      .filter((r) => r.weekdays[0] !== 7)
      .slice(0, PRIZE_LIMITS.rulesMax + 1)
    expect(once).toHaveLength(PRIZE_LIMITS.rulesMax + 1)
    expect(createPrizeSchema.safeParse({ ...base, rules: once }).success).toBe(false)

    expect(
      createPrizeSchema.safeParse({
        ...base,
        rules: [rangeRule('2026-12-01', '2026-12-05'), rangeRule('2026-12-05', '2026-12-10')],
      }).success,
    ).toBe(false)
  })

  it('el calendario se compara contra las fechas de la rifa', () => {
    expect(prizeRulesProblem([rule()], RAFFLE)).toBeNull()
    expect(prizeRulesProblem([rule({ endDate: '2027-01-10' })], RAFFLE)).toContain(
      'dentro de las fechas de la rifa',
    )
  })

  it('el orden con repetidos se rechaza', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    expect(reorderPrizesSchema.safeParse({ raffleId: id, prizeIds: [id, id] }).success).toBe(false)
  })
})

// =============================================================================
describe('la capacidad central (D-200, BR-J10)', () => {
  it('el Dueño tiene todas; el Administrador, la de premios; el Vendedor, ninguna', () => {
    for (const capability of APP_CAPABILITIES) {
      expect(roleHasCapability('owner', capability)).toBe(true)
      expect(roleHasCapability('seller', capability)).toBe(false)
    }
    expect(roleHasCapability('admin', 'raffles.prizes.manage')).toBe(true)
  })
})

// =============================================================================
describe('el aviso de un cambio de premio (BR-J11)', () => {
  const data = {
    raffle_id: '11111111-2222-4333-8444-555555555555',
    raffle_name: 'Rifa Navidad 2026',
    prize_id: '22222222-2222-4333-8444-555555555555',
    prize_title: 'Premio diario',
    version_number: 2,
  }

  it('dice la rifa, el premio y que cambiaron sus condiciones', () => {
    const mensaje = notificationMessage('raffle_prize.changed', { ...data, change: 'updated' })
    expect(mensaje).toContain('Premio diario')
    expect(mensaje).toContain('Rifa Navidad 2026')
    expect(mensaje).toContain('condiciones')
  })

  it('distingue crear, archivar y restaurar', () => {
    expect(notificationMessage('raffle_prize.changed', { ...data, change: 'created' })).toContain(
      'premio nuevo',
    )
    expect(notificationMessage('raffle_prize.changed', { ...data, change: 'archived' })).toContain(
      'ya no aplica',
    )
    expect(notificationMessage('raffle_prize.changed', { ...data, change: 'restored' })).toContain(
      'vuelve a aplicar',
    )
  })

  it('no lleva clientes, pagos, saldos ni precios de venta', () => {
    const mensaje = notificationMessage('raffle_prize.changed', {
      ...data,
      change: 'updated',
      // Aunque alguien metiera esto en `data`, el texto no lo escribe.
      client_name: 'Ana Torres',
      sale_price: 120000,
    })
    expect(mensaje).not.toContain('Ana Torres')
    expect(mensaje).not.toContain('120')
  })

  it('aguanta un aviso sin datos', () => {
    expect(notificationMessage('raffle_prize.changed', {})).toContain('premio')
  })

  it('no lleva a ninguna pantalla mientras el vendedor no tenga una (BR-J11)', () => {
    expect(notificationHref('raffle_prize.changed')).toBeNull()
  })
})

// =============================================================================
describe('la recompensa: una sola o varias alternativas (BR-J02, D-201)', () => {
  const base = {
    raffleId: '11111111-2222-4333-8444-555555555555',
    title: 'Premio mayor',
    category: 'main' as const,
    numberField: 'daily_number' as const,
    conditions: '',
    rules: [singleDateRule('2026-12-21')],
  }

  /** Las cuatro alternativas del 21 de diciembre, tal como las pidió el dueño. */
  const alternativas = [
    { description: 'Camioneta KIA', amount: null },
    { description: 'Renault Alaskan 2023', amount: 20_000_000 },
    { description: null, amount: 120_000_000 },
    { description: 'Renault Logan Zen público 2023', amount: 70_000_000 },
  ]

  it('un premio único en dinero', () => {
    const parsed = createPrizeSchema.parse({
      ...base,
      reward: { mode: 'fixed', options: [{ description: null, amount: 500_000 }] },
    })
    expect(rewardText(parsed.reward)).toBe('$500.000')
    expect(toCreatePrizeArgs(parsed).p_reward_mode).toBe('fixed')
    expect(toCreatePrizeArgs(parsed).p_reward_options).toEqual([
      { description: null, amount: 500_000 },
    ])
  })

  it('un premio único en especie', () => {
    const parsed = createPrizeSchema.parse({
      ...base,
      reward: { mode: 'fixed', options: [{ description: 'Camioneta KIA', amount: null }] },
    })
    expect(rewardText(parsed.reward)).toBe('Camioneta KIA')
  })

  it('un premio único que entrega una cosa Y dinero', () => {
    const parsed = createPrizeSchema.parse({
      ...base,
      reward: {
        mode: 'fixed',
        options: [{ description: 'Renault Alaskan 2023', amount: 20_000_000 }],
      },
    })
    expect(rewardText(parsed.reward)).toBe('Renault Alaskan 2023 y $20.000.000')
  })

  it('cuatro alternativas excluyentes, en su orden (el premio mayor del 21 de diciembre)', () => {
    const parsed = createPrizeSchema.parse({
      ...base,
      reward: { mode: 'winner_choice', options: alternativas },
    })

    expect(toCreatePrizeArgs(parsed).p_reward_options).toEqual(alternativas)
    expect(rewardText(parsed.reward)).toBe(
      'una de estas alternativas: Camioneta KIA, Renault Alaskan 2023 y $20.000.000, $120.000.000 o Renault Logan Zen público 2023 y $70.000.000',
    )
  })

  it('el orden de las alternativas se conserva tal como llega', () => {
    const alReves = [...alternativas].reverse()
    const parsed = createPrizeSchema.parse({
      ...base,
      reward: { mode: 'winner_choice', options: alReves },
    })
    expect(toCreatePrizeArgs(parsed).p_reward_options).toEqual(alReves)
    expect(rewardOptionText(parsed.reward.options[0]!)).toBe(
      'Renault Logan Zen público 2023 y $70.000.000',
    )
  })

  it('«Premio único» con más de una alternativa se rechaza', () => {
    const resultado = createPrizeSchema.safeParse({
      ...base,
      reward: { mode: 'fixed', options: alternativas.slice(0, 2) },
    })
    expect(resultado.success).toBe(false)
    expect(JSON.stringify(resultado.error?.issues)).toContain('una sola recompensa')
  })

  it('«Alternativas a elegir» con una sola se rechaza', () => {
    const resultado = createPrizeSchema.safeParse({
      ...base,
      reward: { mode: 'winner_choice', options: [alternativas[0]!] },
    })
    expect(resultado.success).toBe(false)
    expect(JSON.stringify(resultado.error?.issues)).toContain('al menos dos')
  })

  it('dos alternativas iguales se rechazan', () => {
    const resultado = createPrizeSchema.safeParse({
      ...base,
      reward: { mode: 'winner_choice', options: [alternativas[0]!, alternativas[0]!] },
    })
    expect(resultado.success).toBe(false)
    expect(JSON.stringify(resultado.error?.issues)).toContain('dos alternativas iguales')
  })

  it('el tope de alternativas es el de la base', () => {
    const muchas = Array.from({ length: PRIZE_LIMITS.rewardOptionsMax + 1 }, (_, index) => ({
      description: null,
      amount: (index + 1) * 1000,
    }))
    expect(
      createPrizeSchema.safeParse({ ...base, reward: { mode: 'winner_choice', options: muchas } })
        .success,
    ).toBe(false)
    expect(
      createPrizeSchema.safeParse({
        ...base,
        reward: { mode: 'winner_choice', options: muchas.slice(0, PRIZE_LIMITS.rewardOptionsMax) },
      }).success,
    ).toBe(true)
  })

  it('la vista previa dice las alternativas con «o», no con «y»', () => {
    expect(
      prizePreviewSentence({
        rules: [singleDateRule('2026-12-21')],
        numberField: 'daily_number',
        digits: 'four',
        reward: { mode: 'winner_choice', options: alternativas },
      }),
    ).toBe(
      'El 21 de diciembre juega con las cuatro cifras del número diario y la lotería de Cundinamarca por una de estas alternativas: Camioneta KIA, Renault Alaskan 2023 y $20.000.000, $120.000.000 o Renault Logan Zen público 2023 y $70.000.000.',
    )
  })
})

// =============================================================================
describe('desde cuándo y hasta cuándo aplica un premio (D-201)', () => {
  it('el primer y el último día que juega de verdad, no las fechas escritas', () => {
    // Los sábados de diciembre: el período empieza el 1, pero el premio, el 5.
    expect(validityRange([recurringRule('2026-12-01', '2026-12-31', [6])])).toEqual({
      from: '2026-12-05',
      to: '2026-12-26',
    })
    expect(validityText([recurringRule('2026-12-01', '2026-12-31', [6])])).toBe(
      'Del 5 al 26 de diciembre',
    )
  })

  it('varios períodos separados siguen teniendo una sola vigencia', () => {
    const rules = [rangeRule('2026-12-01', '2026-12-05'), rangeRule('2026-12-16', '2026-12-19')]
    expect(validityRange(rules)).toEqual({ from: '2026-12-01', to: '2026-12-19' })
    expect(validityText(rules)).toBe('Del 1 al 19 de diciembre')
  })

  it('un solo día se dice como un solo día', () => {
    expect(validityText([singleDateRule('2026-12-21')])).toBe('Solo el 21 de diciembre')
  })

  it('sin calendario no se inventa ninguna fecha', () => {
    expect(validityRange([])).toBeNull()
    expect(validityText([])).toBe('')
  })
})

// =============================================================================
describe('dos premios que se cruzan son un conflicto, no una suma (BR-J08, D-201)', () => {
  const diario: PrizeScheduleSubject = {
    title: 'Premio diario',
    numberField: 'daily_number',
    digits: 'four',
    rules: [recurringRule('2026-11-02', '2026-11-27', [1, 2, 3, 4, 5])],
  }

  const mayor: PrizeScheduleSubject = {
    title: 'Premio mayor',
    numberField: 'daily_number',
    digits: 'four',
    rules: [singleDateRule('2026-12-21')],
  }

  it('el mismo día, el mismo número y las mismas cifras chocan', () => {
    const diarioHastaDiciembre: PrizeScheduleSubject = {
      ...diario,
      rules: [recurringRule('2026-11-02', '2026-12-31', [1, 2, 3, 4, 5])],
    }
    const conflicto = prizeConflict(diarioHastaDiciembre, [mayor])
    expect(conflicto).toEqual({ other: 'Premio mayor', referenceDate: '2026-12-21' })
    expect(prizeConflictMessage(diarioHastaDiciembre.title, conflicto!)).toBe(
      'El premio «Premio diario» y el premio «Premio mayor» juegan el 21/12/2026 con el mismo número de la boleta, las mismas cifras y la misma lotería. Cambia las fechas, el número o las cifras de uno de los dos.',
    )
  })

  it('cerrando el premio diario el 27 de noviembre no queda ningún cruce', () => {
    expect(prizeConflict(diario, [mayor])).toBeNull()
    expect(prizeConflict(mayor, [diario])).toBeNull()
  })

  it('el premio de fin de semana cerrado el 28 de noviembre tampoco cruza con los sábados de diciembre', () => {
    const finDeSemana: PrizeScheduleSubject = {
      title: 'Premio fin de semana',
      numberField: 'weekly_number',
      digits: 'four',
      rules: [recurringRule('2026-11-07', '2026-11-28', [6])],
    }
    const especialSemanal: PrizeScheduleSubject = {
      title: 'Premio especial semanal',
      numberField: 'weekly_number',
      digits: 'four',
      rules: [rangeRule('2026-12-01', '2026-12-05'), rangeRule('2026-12-16', '2026-12-19')],
    }
    expect(prizeConflict(finDeSemana, [especialSemanal])).toBeNull()
  })

  it('cuatro cifras y últimas tres conviven el mismo día a propósito (BR-J07)', () => {
    const tresCifras: PrizeScheduleSubject = {
      title: 'Premio de tres cifras',
      numberField: 'daily_number',
      digits: 'last_three',
      rules: [singleDateRule('2026-12-21')],
    }
    expect(prizeConflict(mayor, [tresCifras])).toBeNull()
    expect(prizeConflict(tresCifras, [mayor])).toBeNull()

    // Y la prioridad sigue siendo la de siempre: las cuatro dejan fuera las tres.
    const candidatos: PrizeCandidate[] = [
      { prizeId: 'p1', versionId: 'v1', numberField: 'daily_number', digits: 'four' },
      { prizeId: 'p2', versionId: 'v2', numberField: 'daily_number', digits: 'last_three' },
    ]
    expect(resolvePrizeLinks(candidatos).map((c) => c.prizeId)).toEqual(['p1'])
  })

  it('el otro número de la boleta no choca', () => {
    const semanal: PrizeScheduleSubject = { ...mayor, numberField: 'weekly_number' }
    expect(prizeConflict(mayor, [semanal])).toBeNull()
  })

  it('la recompensa no salva un cruce: se compara la regla de juego, no lo que paga', () => {
    const otro: PrizeScheduleSubject = { ...mayor, title: 'Otro premio del 21' }
    expect(prizeConflict(mayor, [otro])?.other).toBe('Otro premio del 21')
  })

  it('con varios cruces se dice el primero', () => {
    const a: PrizeScheduleSubject = {
      ...mayor,
      title: 'Premio A',
      rules: [rangeRule('2026-12-01', '2026-12-05')],
    }
    const b: PrizeScheduleSubject = {
      ...mayor,
      title: 'Premio B',
      rules: [rangeRule('2026-12-03', '2026-12-10')],
    }
    expect(prizeConflict(b, [a])).toEqual({ other: 'Premio A', referenceDate: '2026-12-03' })
  })
})
