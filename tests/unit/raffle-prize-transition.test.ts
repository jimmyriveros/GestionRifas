import { describe, expect, it } from 'vitest'

import { notificationHref, notificationMessage } from '@/features/notifications/text'
import { PRIZE_TRANSITION_COPY } from '@/features/raffle-prizes/copy'
import { raffleReviewProblems } from '@/features/raffle-prizes/review'
import {
  expandRules,
  fromRulePayload,
  lotteryForDate,
  prizeConflict,
  ruleProblem,
  singleDateRule,
  validityRange,
} from '@/features/raffle-prizes/schedule'
import {
  CONFIRMED_PRIZE_PLAN,
  confirmedPrizeStarts,
  confirmedRafflePrizes,
  periodsAvoiding,
  TransitionPlanError,
  transitionPreviewLines,
  type TransitionDraw,
  type TransitionPrizePayload,
  type TransitionResult,
} from '@/features/raffle-prizes/transition'

/**
 * La transición de una rifa existente a premios configurables — Entrega 4
 * (D-204, BR-J13).
 *
 * Lo que se prueba aquí es lo PURO: que la configuración confirmada es exacta,
 * desde qué sorteo empiezan el diario y el de los sábados, cómo se esquivan los
 * sorteos cancelados y qué se lee en la vista previa y en el aviso. Qué escribe
 * la base, quién puede hacerlo y qué no toca lo prueban
 * `tests/db/raffle-prize-transition.test.ts`.
 */

/** El miércoles 16 de septiembre de 2026, a una hora de Bogotá. */
function bogota(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-05:00`)
}

/** Un sorteo ordinario con su lotería del día y la hora de siempre. */
function draw(referenceDate: string, overrides: Partial<TransitionDraw> = {}): TransitionDraw {
  const lotteryCode = lotteryForDate(referenceDate)
  if (!lotteryCode) throw new Error(`El ${referenceDate} es domingo y no tiene lotería`)
  return {
    referenceDate,
    lotteryCode,
    scheduleStatus: 'scheduled',
    originalScheduledAt: `${referenceDate}T22:30:00-05:00`,
    officialScheduledAt: `${referenceDate}T22:30:00-05:00`,
    ...overrides,
  }
}

/** La configuración con el inicio que tendría si la transición fuera hoy, 16 de septiembre. */
const PRIZES = confirmedRafflePrizes({ dailyStart: '2026-09-16', saturdayStart: '2026-09-19' })

function prize(title: string): TransitionPrizePayload {
  const found = PRIZES.find((item) => item.title === title)
  if (!found) throw new Error(`No está el premio «${title}»`)
  return found
}

function occurrences(item: TransitionPrizePayload) {
  return expandRules(fromRulePayload(item.rules))
}

// =============================================================================
describe('los seis premios confirmados (D-204)', () => {
  it('T1: son exactamente seis, en su orden', () => {
    expect(PRIZES.map((item) => item.title)).toEqual([
      'Premio diario',
      'Premio fin de semana',
      'Premio principal',
      'Premio especial de tres cifras',
      'Premio especial semanal',
      'Premio especial del 15 de diciembre',
    ])
  })

  it('T2: el caso «semanal, un lunes, con Cundinamarca» fue un ejemplo y NO es un premio de la rifa', () => {
    const ejemplo = PRIZES.filter(
      (item) =>
        item.number_field === 'weekly_number' &&
        occurrences(item).some(
          (occurrence) =>
            occurrence.lottery === 'cundinamarca' &&
            new Date(`${occurrence.referenceDate}T12:00:00Z`).getUTCDay() === 1,
        ),
    )
    expect(ejemplo).toEqual([])
    expect(
      PRIZES.some((item) => item.reward_options.some((option) => option.amount === 400_000)),
    ).toBe(false)
    expect(occurrences(prize('Premio especial semanal')).map((o) => o.referenceDate)).not.toContain(
      '2026-12-14',
    )

    // Y como ejemplo genérico sigue siendo un calendario válido (BR-J03).
    expect(ruleProblem(singleDateRule('2026-12-14', 'fixed'))).toBeNull()
    expect(singleDateRule('2026-12-14', 'fixed').lotteryCode).toBe('cundinamarca')
  })

  it('T3: importes, número de la boleta, cifras, categoría y forma, exactos', () => {
    expect(
      PRIZES.map((item) => ({
        title: item.title,
        category: item.category,
        reward_mode: item.reward_mode,
        reward_options: item.reward_options,
        number_field: item.number_field,
        digits: item.digits,
        conditions: item.conditions,
      })),
    ).toEqual([
      {
        title: 'Premio diario',
        category: 'daily',
        reward_mode: 'fixed',
        reward_options: [{ description: null, amount: 500_000 }],
        number_field: 'daily_number',
        digits: 'four',
        conditions: null,
      },
      {
        title: 'Premio fin de semana',
        category: 'weekly',
        reward_mode: 'fixed',
        reward_options: [{ description: null, amount: 2_000_000 }],
        number_field: 'weekly_number',
        digits: 'four',
        conditions: null,
      },
      {
        title: 'Premio principal',
        category: 'main',
        reward_mode: 'winner_choice',
        reward_options: [
          { description: 'Camioneta KIA', amount: null },
          { description: 'Renault Alaskan modelo 2023', amount: 20_000_000 },
          { description: null, amount: 120_000_000 },
          { description: 'Renault Logan Zen público modelo 2023', amount: 70_000_000 },
        ],
        number_field: 'daily_number',
        digits: 'four',
        conditions: null,
      },
      {
        title: 'Premio especial de tres cifras',
        category: 'special',
        reward_mode: 'fixed',
        reward_options: [{ description: null, amount: 1_000_000 }],
        number_field: 'daily_number',
        digits: 'last_three',
        conditions: null,
      },
      {
        title: 'Premio especial semanal',
        category: 'special',
        reward_mode: 'fixed',
        reward_options: [{ description: null, amount: 1_000_000 }],
        number_field: 'weekly_number',
        digits: 'four',
        conditions: null,
      },
      {
        title: 'Premio especial del 15 de diciembre',
        category: 'special',
        reward_mode: 'fixed',
        reward_options: [{ description: null, amount: 7_000_000 }],
        number_field: 'weekly_number',
        digits: 'four',
        conditions: null,
      },
    ])
  })

  it('T4: el diario juega de lunes a viernes con la lotería de cada día y termina el 27 de noviembre', () => {
    const diario = prize('Premio diario')
    expect(diario.rules).toEqual([
      {
        start_date: '2026-09-16',
        end_date: '2026-11-27',
        weekdays: [1, 2, 3, 4, 5],
        lottery_mode: 'corresponding',
        lottery_code: null,
      },
    ])
    expect(validityRange(fromRulePayload(diario.rules))).toEqual({
      from: '2026-09-16',
      to: '2026-11-27',
    })
    expect(occurrences(diario).every((o) => o.referenceDate < '2026-12-01')).toBe(true)
  })

  it('T5: el de fin de semana juega los sábados con Boyacá y termina el 28 de noviembre', () => {
    const finDeSemana = prize('Premio fin de semana')
    expect(finDeSemana.rules).toEqual([
      {
        start_date: '2026-09-19',
        end_date: '2026-11-28',
        weekdays: [6],
        lottery_mode: 'fixed',
        lottery_code: 'boyaca',
      },
    ])
    expect(validityRange(fromRulePayload(finDeSemana.rules))?.to).toBe('2026-11-28')
    expect(new Set(occurrences(finDeSemana).map((o) => o.lottery))).toEqual(new Set(['boyaca']))
  })

  it('T6: ninguno de los dos cruza con los premios de diciembre, y ninguna pareja choca (BR-J08)', () => {
    const subjects = PRIZES.map((item, index) => ({
      id: String(index),
      title: item.title,
      numberField: item.number_field,
      digits: item.digits,
      rules: fromRulePayload(item.rules),
    }))

    expect(
      raffleReviewProblems(subjects, { startDate: '2026-09-01', endDate: '2026-12-31' }),
    ).toEqual([])
    for (const subject of subjects) {
      expect(
        prizeConflict(
          subject,
          subjects.filter((other) => other.id !== subject.id),
        ),
      ).toBeNull()
    }
  })

  it('T7: el principal es UN premio con cuatro alternativas ordenadas, el lunes 21 con Cundinamarca', () => {
    const principal = PRIZES.filter((item) => item.category === 'main')
    expect(principal).toHaveLength(1)
    expect(
      principal[0]!.reward_options.map((option) => option.description ?? option.amount),
    ).toEqual([
      'Camioneta KIA',
      'Renault Alaskan modelo 2023',
      120_000_000,
      'Renault Logan Zen público modelo 2023',
    ])
    expect(occurrences(principal[0]!)).toEqual([
      { referenceDate: '2026-12-21', lottery: 'cundinamarca' },
    ])
  })

  it('T8: cuatro cifras y últimas tres conviven el 21 de diciembre, con el mismo número y la misma lotería', () => {
    const principal = prize('Premio principal')
    const tresCifras = prize('Premio especial de tres cifras')

    expect(occurrences(tresCifras)).toEqual(occurrences(principal))
    expect([principal.number_field, tresCifras.number_field]).toEqual([
      'daily_number',
      'daily_number',
    ])
    expect([principal.digits, tresCifras.digits]).toEqual(['four', 'last_three'])
  })

  it('T9: el millón con el número semanal juega TODOS los días válidos de sus dos tramos, sábados incluidos', () => {
    expect(occurrences(prize('Premio especial semanal'))).toEqual([
      { referenceDate: '2026-12-01', lottery: 'cruz_roja' },
      { referenceDate: '2026-12-02', lottery: 'meta' },
      { referenceDate: '2026-12-03', lottery: 'bogota' },
      { referenceDate: '2026-12-04', lottery: 'medellin' },
      { referenceDate: '2026-12-05', lottery: 'boyaca' },
      { referenceDate: '2026-12-16', lottery: 'meta' },
      { referenceDate: '2026-12-17', lottery: 'bogota' },
      { referenceDate: '2026-12-18', lottery: 'medellin' },
      { referenceDate: '2026-12-19', lottery: 'boyaca' },
    ])
  })

  it('T10: el 15 de diciembre juega con el número semanal, cuatro cifras y Cruz Roja, como lotería correspondiente', () => {
    const quince = prize('Premio especial del 15 de diciembre')
    expect(quince.rules).toEqual([
      {
        start_date: '2026-12-15',
        end_date: '2026-12-15',
        weekdays: [2],
        lottery_mode: 'corresponding',
        lottery_code: null,
      },
    ])
    expect(occurrences(quince)).toEqual([{ referenceDate: '2026-12-15', lottery: 'cruz_roja' }])
  })

  it('T11: cada período cumple las reglas de un calendario dentro de la rifa (BR-J04, BR-J05)', () => {
    for (const item of PRIZES) {
      for (const rule of fromRulePayload(item.rules)) {
        expect(ruleProblem(rule, { startDate: '2026-09-01', endDate: '2026-12-31' })).toBeNull()
      }
    }
  })

  it('T12: una transición tardía deja en el diario solo los días que quedan', () => {
    const tarde = confirmedRafflePrizes({ dailyStart: '2026-11-25', saturdayStart: '2026-11-28' })
    expect(tarde[0]!.rules).toEqual([
      {
        start_date: '2026-11-25',
        end_date: '2026-11-27',
        weekdays: [3, 4, 5],
        lottery_mode: 'corresponding',
        lottery_code: null,
      },
    ])
    expect(fromRulePayload(tarde[0]!.rules).map((rule) => ruleProblem(rule))).toEqual([null])
  })

  it('T13: un sorteo cancelado parte el período y no queda en ningún calendario', () => {
    const conCancelados = confirmedRafflePrizes({
      dailyStart: '2026-09-16',
      saturdayStart: '2026-09-19',
      cancelledDates: ['2026-10-14', '2026-12-03'],
    })

    const diario = conCancelados[0]!
    expect(diario.rules.map((rule) => [rule.start_date, rule.end_date, rule.weekdays])).toEqual([
      ['2026-09-16', '2026-10-13', [1, 2, 3, 4, 5]],
      ['2026-10-15', '2026-11-27', [1, 2, 3, 4, 5]],
    ])
    expect(occurrences(diario).map((o) => o.referenceDate)).not.toContain('2026-10-14')

    const especial = conCancelados[4]!
    expect(occurrences(especial).map((o) => o.referenceDate)).toEqual([
      '2026-12-01',
      '2026-12-02',
      '2026-12-04',
      '2026-12-05',
      '2026-12-16',
      '2026-12-17',
      '2026-12-18',
      '2026-12-19',
    ])
    for (const rule of fromRulePayload(especial.rules)) expect(ruleProblem(rule)).toBeNull()
  })

  it('T14: lo que no se puede configurar sin una decisión del dueño se rechaza con una frase clara', () => {
    expect(() =>
      confirmedRafflePrizes({ dailyStart: '2026-11-30', saturdayStart: '2026-11-28' }),
    ).toThrow(TransitionPlanError)
    expect(() =>
      confirmedRafflePrizes({ dailyStart: '2026-11-27', saturdayStart: '2026-12-05' }),
    ).toThrow(/28 de noviembre/)
    expect(() =>
      confirmedRafflePrizes({ dailyStart: '2026-09-16', saturdayStart: '2026-09-18' }),
    ).toThrow(/sábado/)
    expect(() =>
      confirmedRafflePrizes({
        dailyStart: '2026-09-16',
        saturdayStart: '2026-09-19',
        cancelledDates: [CONFIRMED_PRIZE_PLAN.mainDate],
      }),
    ).toThrow(/21\/12\/2026/)
    expect(() =>
      confirmedRafflePrizes({ dailyStart: '2026-02-30', saturdayStart: '2026-09-19' }),
    ).toThrow(/no es una fecha válida/)
  })
})

// =============================================================================
describe('desde qué sorteo empiezan: el primero que todavía no se jugó (respuesta del dueño)', () => {
  const raffleStartDate = '2026-09-01'

  it('S1: antes de la hora de hoy, el diario empieza hoy y el de fin de semana el sábado', () => {
    const starts = confirmedPrizeStarts({
      draws: [draw('2026-09-15'), draw('2026-09-16'), draw('2026-09-19')],
      now: bogota('2026-09-16', '14:00'),
      raffleStartDate,
    })
    expect(starts).toEqual({
      dailyStart: '2026-09-16',
      saturdayStart: '2026-09-19',
      cancelledDates: [],
    })
  })

  it('S2: pasada la hora de hoy, el de hoy ya se jugó y empieza mañana', () => {
    const starts = confirmedPrizeStarts({
      draws: [draw('2026-09-16'), draw('2026-09-17')],
      now: bogota('2026-09-16', '23:00'),
      raffleStartDate,
    })
    expect(starts.dailyStart).toBe('2026-09-17')
  })

  it('S3: la hora EXACTA del corte ya cuenta como jugado (BR-J09, estricto)', () => {
    const starts = confirmedPrizeStarts({
      draws: [draw('2026-09-16')],
      now: bogota('2026-09-16', '22:30'),
      raffleStartDate,
    })
    expect(starts.dailyStart).toBe('2026-09-17')
  })

  it('S4: un sorteo adelantado que ya se jugó no es el primero pendiente', () => {
    const starts = confirmedPrizeStarts({
      draws: [
        draw('2026-09-17', {
          originalScheduledAt: '2026-09-17T22:30:00-05:00',
          officialScheduledAt: '2026-09-16T10:00:00-05:00',
          scheduleStatus: 'rescheduled_earlier',
        }),
      ],
      now: bogota('2026-09-16', '14:00'),
      raffleStartDate,
    })
    expect(starts.dailyStart).toBe('2026-09-16')
    const despues = confirmedPrizeStarts({
      draws: [
        draw('2026-09-16'),
        draw('2026-09-17', {
          originalScheduledAt: '2026-09-17T22:30:00-05:00',
          officialScheduledAt: '2026-09-16T10:00:00-05:00',
          scheduleStatus: 'rescheduled_earlier',
        }),
      ],
      now: bogota('2026-09-16', '23:00'),
      raffleStartDate,
    })
    expect(despues.dailyStart).toBe('2026-09-18')
  })

  it('S5: sin programación, el sorteo cuenta como pendiente; la base decidirá si su hora hace falta', () => {
    const starts = confirmedPrizeStarts({
      draws: [],
      now: bogota('2026-09-16', '23:59'),
      raffleStartDate,
    })
    expect(starts.dailyStart).toBe('2026-09-16')
  })

  it('S6: un cancelado se salta y se devuelve para que no entre en ningún calendario', () => {
    const starts = confirmedPrizeStarts({
      draws: [
        draw('2026-09-16', { scheduleStatus: 'cancelled' }),
        draw('2026-12-03', { scheduleStatus: 'cancelled' }),
        draw('2026-09-10', { scheduleStatus: 'cancelled' }),
      ],
      now: bogota('2026-09-16', '09:00'),
      raffleStartDate,
    })
    expect(starts.dailyStart).toBe('2026-09-17')
    expect(starts.cancelledDates).toEqual(['2026-09-16', '2026-12-03'])
  })

  it('S7: una rifa que todavía no empieza cuenta desde su primer día', () => {
    const starts = confirmedPrizeStarts({
      draws: [],
      now: bogota('2026-09-16', '09:00'),
      raffleStartDate: '2026-10-01',
    })
    expect(starts).toEqual({
      dailyStart: '2026-10-01',
      saturdayStart: '2026-10-03',
      cancelledDates: [],
    })
  })

  it('S8: sin ningún sorteo pendiente antes del cierre del diario, no se inventa nada', () => {
    expect(() =>
      confirmedPrizeStarts({ draws: [], now: bogota('2026-11-28', '09:00'), raffleStartDate }),
    ).toThrow(/27 de noviembre/)
  })

  it('S9: los períodos esquivan cualquier cancelado dentro del tramo', () => {
    expect(
      periodsAvoiding({
        startDate: '2026-09-19',
        endDate: '2026-10-10',
        weekdays: [6],
        cancelledDates: new Set(['2026-09-26']),
        lotteryCode: 'boyaca',
      }).map((rule) => [rule.startDate, rule.endDate]),
    ).toEqual([
      ['2026-09-19', '2026-09-19'],
      ['2026-10-03', '2026-10-10'],
    ])
  })
})

// =============================================================================
describe('la vista previa y el resultado (D-204)', () => {
  function result(overrides: Partial<TransitionResult> = {}): TransitionResult {
    return {
      applied: false,
      already_applied: false,
      transition_id: null,
      organization_id: '11111111-2222-4333-8444-555555555555',
      raffle_id: '22222222-2222-4333-8444-555555555555',
      raffle: {
        name: 'Rifa de prueba',
        status: 'active',
        start_date: '2026-09-01',
        end_date: '2026-12-31',
      },
      prize_ids: [],
      prizes: PRIZES.map((item, index) => ({
        ...item,
        position: index + 1,
        starts_on: null,
        ends_on: null,
        draws: 0,
      })),
      notified: 36,
      configuration_hash: 'a'.repeat(64),
      ...overrides,
    }
  }

  it('P1: dice que es una vista previa, la rifa, que el estado no cambia y el cambio de sistema', () => {
    const texto = transitionPreviewLines(result()).join('\n')
    expect(texto).toContain('Vista previa: no se cambió nada.')
    expect(texto).toContain('Nombre: Rifa de prueba')
    expect(texto).toContain('Estado: Activa (no cambia)')
    expect(texto).toContain('Fechas: del 01/09/2026 al 31/12/2026')
    expect(texto).toContain('Sistema de premios: el de siempre → premios configurables')
    expect(texto).toContain('Aviso: lo reciben 36 personas activas de la organización.')
  })

  it('P2: cada premio se lee entero: recompensa, número, cifras, calendario, vigencia y lotería', () => {
    const texto = transitionPreviewLines(result()).join('\n')
    expect(texto).toContain('Premios (6)')
    expect(texto).toContain('1. Premio diario · Diario')
    expect(texto).toContain('Juega con: Número diario · Cuatro cifras')
    expect(texto).toContain(
      'Calendario: De lunes a viernes del 16 de septiembre al 27 de noviembre',
    )
    expect(texto).toContain('Vigencia: Del 16 de septiembre al 27 de noviembre')
    expect(texto).toContain(
      'Entrega: Alternativas a elegir · una de estas alternativas: Camioneta KIA, Renault Alaskan modelo 2023 y $20.000.000, $120.000.000 o Renault Logan Zen público modelo 2023 y $70.000.000',
    )
    expect(texto).toContain('Juega con: Número diario · Últimas tres cifras')
    expect(texto).toContain('Vigencia: Solo el 21 de diciembre · 1 sorteo')
    expect(texto).toContain('Lotería: Cundinamarca')
    expect(texto).toContain('6. Premio especial del 15 de diciembre · Especial')
    expect(texto).toContain('Lotería: Cruz Roja')
    expect(texto).toContain('Vigencia: Del 1 al 19 de diciembre · 9 sorteos')
  })

  it('P3: aplicada, la dice aplicada y enseña los identificadores; repetida, dice que no cambió nada', () => {
    const aplicada = transitionPreviewLines(
      result({ applied: true, transition_id: '33333333-2222-4333-8444-555555555555' }),
    ).join('\n')
    expect(aplicada).toContain(PRIZE_TRANSITION_COPY.applied)
    expect(aplicada).toContain('Transición: 33333333-2222-4333-8444-555555555555')

    const repetida = transitionPreviewLines({
      applied: false,
      already_applied: true,
      transition_id: '33333333-2222-4333-8444-555555555555',
      organization_id: '11111111-2222-4333-8444-555555555555',
      raffle_id: '22222222-2222-4333-8444-555555555555',
      prize_ids: ['44444444-2222-4333-8444-555555555555'],
      notified: 0,
      configuration_hash: 'a'.repeat(64),
    }).join('\n')
    expect(repetida).toContain('con esta misma configuración. No se cambió nada.')
    expect(repetida).not.toContain('Aviso')
  })

  it('P4: un borrador no avisa', () => {
    const texto = transitionPreviewLines(
      result({
        raffle: {
          name: 'Borrador',
          status: 'draft',
          start_date: '2026-09-01',
          end_date: '2026-12-31',
        },
      }),
    ).join('\n')
    expect(texto).toContain('Aviso: ninguno, porque la rifa está en borrador.')
  })

  it('P5: ningún texto dice «ganador» ni habla el idioma del código', () => {
    const copy = PRIZE_TRANSITION_COPY
    const textos = [
      ...transitionPreviewLines(result()),
      copy.preview,
      copy.applied,
      copy.alreadyApplied,
      copy.failed,
      copy.mode,
      copy.noNotices,
      copy.status('Activa'),
      copy.dates('01/09/2026', '31/12/2026'),
      copy.prizesHeading(1),
      copy.draws(1),
      copy.notices(1),
    ].join('\n')
    expect(textos.toLowerCase()).not.toContain('ganador')
    expect(textos).not.toMatch(/\blegacy\b|\bwinner_choice\b|\bdaily_number\b/)
  })
})

// =============================================================================
describe('el aviso de la transición: uno solo para toda la rifa (BR-J11, D-204)', () => {
  const data = {
    raffle_id: '11111111-2222-4333-8444-555555555555',
    raffle_name: 'Rifa Navidad 2026',
    change: 'transitioned',
    prize_count: 6,
  }

  it('A1: dice la rifa, que vale para los próximos sorteos y cuántos premios tiene ahora', () => {
    expect(notificationMessage('raffle_prize.changed', data)).toBe(
      'Cambiaron los premios de Rifa Navidad 2026 para los próximos sorteos: ahora tiene 6 premios.',
    )
    expect(notificationMessage('raffle_prize.changed', { ...data, prize_count: 1 })).toBe(
      'Cambiaron los premios de Rifa Navidad 2026 para los próximos sorteos: ahora tiene 1 premio.',
    )
    expect(notificationMessage('raffle_prize.changed', { change: 'transitioned' })).toBe(
      'Cambiaron los premios de la rifa para los próximos sorteos.',
    )
  })

  it('A2: no lleva clientes, pagos, saldos ni precios de venta, ni lleva a ninguna pantalla', () => {
    const mensaje = notificationMessage('raffle_prize.changed', {
      ...data,
      client_name: 'Ana Torres',
      sale_price: 120000,
      paid_amount: 50000,
    })
    expect(mensaje).not.toContain('Ana Torres')
    expect(mensaje).not.toContain('120')
    expect(mensaje).not.toContain('50')
    expect(mensaje.toLowerCase()).not.toContain('ganador')
    expect(notificationHref('raffle_prize.changed')).toBeNull()
  })
})
