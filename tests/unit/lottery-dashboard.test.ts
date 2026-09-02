import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildLotteryDashboard,
  LOTTERY_DASHBOARD_COPY,
  LOTTERY_DASHBOARD_TIMEOUT_MS,
  lotteryDashboardWindow,
  matchSummaryText,
  raffleSummaryText,
  toDrawView,
  type LotteryScheduleSnapshot,
} from '@/features/lottery/dashboard'

const ROOT = process.cwd()

function snap(
  overrides: Partial<LotteryScheduleSnapshot> & Pick<LotteryScheduleSnapshot, 'id'>,
): LotteryScheduleSnapshot {
  return {
    lotteryCode: 'bogota',
    drawNumber: '2800',
    referenceDate: '2026-04-02',
    originalScheduledAt: '2026-04-02T23:00:00-05:00',
    officialScheduledAt: '2026-04-02T23:00:00-05:00',
    scheduleStatus: 'scheduled',
    changeReason: null,
    sourceUrl: 'https://www.loteriadebogota.com/',
    sourceAuthority: 'Lotería de Bogotá',
    verifiedAt: '2026-04-01T12:00:00-05:00',
    result: null,
    matches: [],
    ...overrides,
  }
}

function confirmed(
  id: string,
  extras: Partial<LotteryScheduleSnapshot> = {},
): LotteryScheduleSnapshot {
  return snap({
    id,
    scheduleStatus: 'completed',
    result: {
      id: `res-${id}`,
      winningNumber: '0046',
      series: '123',
      validationStatus: 'confirmed',
      sourceKind: null,
      consensusSources: null,
      sourceUrl: 'https://www.loteriadebogota.com/',
      fetchedAt: '2026-04-02T23:40:00-05:00',
      confirmedAt: '2026-04-02T23:40:00-05:00',
    },
    ...extras,
  })
}

describe('ventana de lectura del Panel', () => {
  it('cubre diez dias atras y veintiuno adelante', () => {
    expect(lotteryDashboardWindow('2026-04-02')).toEqual({
      from: '2026-03-23',
      to: '2026-04-23',
    })
  })
})

describe('sorteo actual segun la fecha oficial, no el dia nominal (D-147)', () => {
  it('Bogota adelantada al martes aparece el martes, no el jueves', () => {
    const bogota = confirmed('bog-adv', {
      lotteryCode: 'bogota',
      referenceDate: '2026-04-02',
      originalScheduledAt: '2026-04-02T23:00:00-05:00',
      officialScheduledAt: '2026-03-31T23:00:00-05:00',
      scheduleStatus: 'rescheduled_earlier',
      changeReason: 'official_change',
    })
    const cruz = snap({
      id: 'cruz-tue',
      lotteryCode: 'cruz_roja',
      drawNumber: '9001',
      referenceDate: '2026-03-31',
      originalScheduledAt: '2026-03-31T23:00:00-05:00',
      officialScheduledAt: '2026-03-31T23:00:00-05:00',
    })

    const view = buildLotteryDashboard([bogota, cruz], '2026-03-31')
    expect(view.kind).toBe('ready')
    if (view.kind !== 'ready') return
    expect(view.todayDraws.map((d) => d.lotteryCode).sort()).toEqual(['bogota', 'cruz_roja'])
    const adelantada = view.todayDraws.find((d) => d.lotteryCode === 'bogota')
    expect(adelantada?.winningNumber).toBe('0046')
    expect(adelantada?.scheduleNotice).toContain('anticipadamente')
    expect(adelantada?.scheduleNotice?.toLowerCase()).not.toContain('hoy')
  })

  it('Cruz Roja aplazada al jueves aparece el jueves', () => {
    const cruz = snap({
      id: 'cruz-later',
      lotteryCode: 'cruz_roja',
      drawNumber: '9002',
      referenceDate: '2026-12-08',
      originalScheduledAt: '2026-12-08T23:00:00-05:00',
      officialScheduledAt: '2026-12-10T23:00:00-05:00',
      scheduleStatus: 'rescheduled_later',
      changeReason: 'holiday',
    })
    const view = buildLotteryDashboard([cruz], '2026-12-10')
    expect(view.kind).toBe('ready')
    if (view.kind !== 'ready') return
    expect(view.todayDraws).toHaveLength(1)
    expect(view.todayDraws[0]?.lotteryCode).toBe('cruz_roja')
    expect(view.todayDraws[0]?.resultKind).toBe('none')
  })

  it('dos loterias con la misma fecha oficial salen las dos', () => {
    const meta = confirmed('meta-same', {
      lotteryCode: 'meta',
      referenceDate: '2026-08-12',
      officialScheduledAt: '2026-08-14T22:50:00-05:00',
      scheduleStatus: 'rescheduled_later',
    })
    const medellin = confirmed('med-same', {
      lotteryCode: 'medellin',
      referenceDate: '2026-08-14',
      officialScheduledAt: '2026-08-14T23:10:00-05:00',
      result: {
        id: 'res-med-same',
        winningNumber: '7788',
        series: null,
        validationStatus: 'confirmed',
        sourceKind: null,
        consensusSources: null,
        sourceUrl: 'https://loteriademedellin.com.co/resultados/',
        fetchedAt: '2026-08-14T23:30:00-05:00',
        confirmedAt: '2026-08-14T23:30:00-05:00',
      },
    })
    const view = buildLotteryDashboard([meta, medellin], '2026-08-14')
    expect(view.kind).toBe('ready')
    if (view.kind !== 'ready') return
    expect(view.todayDraws.map((d) => d.lotteryCode)).toEqual(['meta', 'medellin'])
    expect(view.todayDraws.map((d) => d.winningNumber)).toEqual(['0046', '7788'])
    expect(view.previousConfirmed).toBeNull()
  })

  it('un resultado anterior no se presenta como el de hoy', () => {
    const ayer = confirmed('boy-ayer', {
      lotteryCode: 'boyaca',
      referenceDate: '2026-04-04',
      officialScheduledAt: '2026-04-04T22:50:00-05:00',
    })
    const hoy = snap({
      id: 'cun-hoy',
      lotteryCode: 'cundinamarca',
      drawNumber: '4815',
      referenceDate: '2026-04-06',
      officialScheduledAt: '2026-04-06T23:20:00-05:00',
      result: {
        id: 'res-pend',
        winningNumber: null,
        series: null,
        validationStatus: 'pending',
        sourceKind: null,
        consensusSources: null,
        sourceUrl: null,
        fetchedAt: '2026-04-06T23:50:00-05:00',
        confirmedAt: null,
      },
    })
    const view = buildLotteryDashboard([ayer, hoy], '2026-04-06')
    expect(view.kind).toBe('ready')
    if (view.kind !== 'ready') return
    expect(view.todayDraws).toHaveLength(1)
    expect(view.todayDraws[0]?.lotteryCode).toBe('cundinamarca')
    expect(view.todayDraws[0]?.winningNumber).toBeNull()
    expect(view.todayDraws[0]?.resultKind).toBe('pending')
    expect(view.previousConfirmed?.lotteryCode).toBe('boyaca')
    expect(view.previousConfirmed?.winningNumber).toBe('0046')
  })

  it('si hoy ya esta confirmado, no se repite como ultimo resultado', () => {
    const hoy = confirmed('hoy-ok', {
      lotteryCode: 'meta',
      referenceDate: '2026-08-12',
      officialScheduledAt: '2026-08-12T22:50:00-05:00',
    })
    const view = buildLotteryDashboard([hoy], '2026-08-12')
    expect(view.kind).toBe('ready')
    if (view.kind !== 'ready') return
    expect(view.todayDraws[0]?.winningNumber).toBe('0046')
    expect(view.previousConfirmed).toBeNull()
  })

  it('un domingo sin sorteo muestra el proximo y el ultimo, separados', () => {
    const sabado = confirmed('boy-sat', {
      lotteryCode: 'boyaca',
      referenceDate: '2026-04-04',
      officialScheduledAt: '2026-04-04T22:50:00-05:00',
    })
    const lunes = snap({
      id: 'cun-lun',
      lotteryCode: 'cundinamarca',
      drawNumber: '4816',
      referenceDate: '2026-04-06',
      officialScheduledAt: '2026-04-06T23:20:00-05:00',
    })
    const view = buildLotteryDashboard([sabado, lunes], '2026-04-05')
    expect(view.kind).toBe('ready')
    if (view.kind !== 'ready') return
    expect(view.todayDraws).toHaveLength(0)
    expect(view.nextDraw?.lotteryCode).toBe('cundinamarca')
    expect(view.previousConfirmed?.lotteryCode).toBe('boyaca')
    expect(view.previousConfirmed?.winningNumber).toBe('0046')
  })
})

describe('estados de programacion en el recuadro', () => {
  it('un sorteo cancelado de esta semana avisa y no busca coincidencias', () => {
    const cancelled = snap({
      id: 'med-x',
      lotteryCode: 'medellin',
      drawNumber: '1',
      referenceDate: '2026-04-03',
      officialScheduledAt: '2026-04-03T23:10:00-05:00',
      scheduleStatus: 'cancelled',
      changeReason: 'force_majeure',
    })
    const view = buildLotteryDashboard([cancelled], '2026-03-31')
    expect(view.kind).toBe('ready')
    if (view.kind !== 'ready') return
    expect(view.weekAlerts).toHaveLength(1)
    expect(view.weekAlerts[0]?.scheduleNotice).toContain('No habrá sorteo')
    expect(view.weekAlerts[0]?.scheduleNotice).toContain('No se buscarán coincidencias')
  })

  it('horario por confirmar no inventa una fecha oficial', () => {
    const row = snap({
      id: 'unv',
      lotteryCode: 'bogota',
      referenceDate: '2026-04-02',
      officialScheduledAt: null,
      originalScheduledAt: null,
      scheduleStatus: 'schedule_unverified',
    })
    const draw = toDrawView(row)
    expect(draw.officialDate).toBe('2026-04-02')
    expect(draw.scheduleNotice).toBe('Horario por confirmar.')
    expect(draw.winningNumber).toBeNull()
  })

  it('un festivo sin traslado usa el aviso de programacion oficial', () => {
    const row = snap({
      id: 'fest',
      lotteryCode: 'cundinamarca',
      referenceDate: '2026-01-12',
      officialScheduledAt: '2026-01-12T23:20:00-05:00',
      scheduleStatus: 'scheduled',
      changeReason: 'holiday',
    })
    const draw = toDrawView(row)
    expect(draw.scheduleNotice).toContain('aunque es festivo')
    expect(draw.scheduleNotice?.toLowerCase()).not.toContain('hoy')
  })
})

describe('coincidencias y textos (BR-L15, BR-L07)', () => {
  it('conserva 0046 como texto y muestra la serie informativa', () => {
    const draw = toDrawView(confirmed('n46'))
    expect(draw.winningNumber).toBe('0046')
    expect(draw.series).toBe('123')
    expect(draw.winningNumber).not.toBe('46')
  })

  it('resume vendidas, disponibles y tardias sin decir ganador', () => {
    const draw = toDrawView(
      confirmed('m1', {
        matches: [
          {
            ticketId: 't1',
            assignmentStatus: 'sold',
            matchedNumber: '0046',
            raffleName: 'Rifa A',
            dailyNumber: '0046',
            weeklyNumber: '1111',
            clientName: 'Ana',
          },
          {
            ticketId: 't2',
            assignmentStatus: 'available',
            matchedNumber: '0046',
            raffleName: 'Rifa B',
            dailyNumber: '0046',
            weeklyNumber: '2222',
            clientName: null,
          },
          {
            ticketId: 't3',
            assignmentStatus: 'late_assignment',
            matchedNumber: '0046',
            raffleName: 'Rifa A',
            dailyNumber: '0046',
            weeklyNumber: '3333',
            clientName: null,
          },
        ],
      }),
    )
    const text = matchSummaryText(draw, 'staff')
    expect(text).toContain('1 boleta asignada antes del sorteo')
    expect(text).toContain('1 boleta disponible')
    expect(text).toContain('1 boleta asignada después del sorteo')
    expect(text?.toLowerCase()).not.toMatch(/ganador/)
    expect(raffleSummaryText(draw.raffleNames)).toBe('en 2 rifas')
  })

  it('sin coincidencias distingue al vendedor del personal', () => {
    const draw = toDrawView(confirmed('none'))
    expect(matchSummaryText(draw, 'seller')).toBe(LOTTERY_DASHBOARD_COPY.noMatchSeller)
    expect(matchSummaryText(draw, 'staff')).toBe(LOTTERY_DASHBOARD_COPY.noMatchStaff)
  })

  it('ningun texto del recuadro llama ganador a nadie', () => {
    const textos = Object.values(LOTTERY_DASHBOARD_COPY).join(' ')
    expect(textos.toLowerCase()).not.toMatch(/ganador/)
  })
})

describe('el Panel no consulta fuentes oficiales (BR-L20)', () => {
  it('la consulta local no importa descarga ni sincronizacion', () => {
    const source = readFileSync(join(ROOT, 'src/features/lottery/queries.ts'), 'utf8')
    expect(source).toContain("import 'server-only'")
    expect(source).not.toMatch(/from ['"]\.\/fetch['"]/)
    expect(source).not.toMatch(/from ['"]\.\/sync['"]/)
    expect(source).not.toMatch(/from ['"]\.\/adapters['"]/)
    expect(source).not.toMatch(/from ['"]\.\/publication['"]/)
    expect(source).not.toMatch(/downloadLottery|fetchOfficial|syncDueLottery/)
    expect(source).not.toMatch(/from ['"]\.\/job['"]/)
    expect(source).not.toMatch(/runLotterySyncTick/)
  })

  it('los dos paneles muestran el recuadro y no descargan', () => {
    const owner = readFileSync(join(ROOT, 'src/app/(protected)/owner/dashboard/page.tsx'), 'utf8')
    const seller = readFileSync(join(ROOT, 'src/app/(protected)/seller/dashboard/page.tsx'), 'utf8')
    const section = readFileSync(
      join(ROOT, 'src/features/lottery/components/LotteryResultsSection.tsx'),
      'utf8',
    )
    expect(section).toContain('getLotteryDashboard')
    for (const source of [owner, seller, section]) {
      expect(source).not.toMatch(/from ['"]@\/features\/lottery\/fetch['"]/)
      expect(source).not.toMatch(/from ['"]@\/features\/lottery\/sync['"]/)
      expect(source).not.toMatch(/from ['"]@\/features\/lottery\/adapters['"]/)
      expect(source).not.toMatch(/from ['"]@\/features\/lottery\/job['"]/)
    }
  })
})

/**
 * El recuadro esta aislado del resto del Panel (D-155, BR-L25).
 *
 * Estas comprobaciones leen el codigo fuente a proposito: lo que hay que
 * impedir es que alguien vuelva a meter `getLotteryDashboard` en el
 * `Promise.all` de una de las dos paginas «para tenerlo todo junto». Eso
 * compila, pasa todas las pruebas de pantalla y devuelve el defecto de esta
 * etapa sin ningun sintoma. La prueba de que el aislamiento FUNCIONA, con
 * tiempos reales, esta en `lottery-panel-streaming.test.tsx`.
 */
describe('el Panel no espera por las loterias (D-155)', () => {
  const owner = readFileSync(join(ROOT, 'src/app/(protected)/owner/dashboard/page.tsx'), 'utf8')
  const seller = readFileSync(join(ROOT, 'src/app/(protected)/seller/dashboard/page.tsx'), 'utf8')
  const section = readFileSync(
    join(ROOT, 'src/features/lottery/components/LotteryResultsSection.tsx'),
    'utf8',
  )

  it('ninguna de las dos paginas espera la consulta de loterias', () => {
    for (const source of [owner, seller]) {
      expect(source).not.toContain('getLotteryDashboard')
      expect(source).not.toMatch(/from ['"]@\/features\/lottery\/queries['"]/)
      expect(source).toContain('<LotteryResultsSection')
    }
  })

  it('el recuadro se dibuja dentro de un limite de Suspense', () => {
    expect(section).toContain("from 'react'")
    expect(section).toContain('<Suspense')
    expect(section).toContain('LotteryResultsFallback')
  })

  it('el hueco de espera usa los textos de LOTTERY_DASHBOARD_COPY', () => {
    expect(LOTTERY_DASHBOARD_COPY.loading).toBe('Buscando los resultados oficiales…')
    expect(section).toContain('COPY.loading')
    expect(section).toContain('COPY.title')
    expect(section).toContain('aria-busy')
  })

  it('la lectura local lleva un plazo maximo, y cubre las dos consultas', () => {
    const queries = readFileSync(join(ROOT, 'src/features/lottery/queries.ts'), 'utf8')
    expect(LOTTERY_DASHBOARD_TIMEOUT_MS).toBeGreaterThan(0)
    expect(queries).toContain('AbortSignal.timeout(LOTTERY_DASHBOARD_TIMEOUT_MS)')
    // Un solo `deadline` compartido: dos plazos independientes permitirian que
    // la lectura entera tardase el doble de lo presupuestado.
    expect(queries.match(/AbortSignal\.timeout\(/g)).toHaveLength(1)
    expect(queries.match(/\.abortSignal\(deadline\)/g)).toHaveLength(2)
  })
})
