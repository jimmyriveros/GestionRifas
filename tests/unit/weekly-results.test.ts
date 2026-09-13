/**
 * «Resultados de la semana»: qué semana es, qué hay listo, cómo se escribe y qué
 * se comparte (BR-H01..BR-H07, D-194).
 *
 * Todo lo de aquí es PURO y se prueba sin base, sin reloj y sin navegador: la
 * semana recibe el día de Bogotá como texto, el estado recibe filas fabricadas y
 * compartir recibe un doble de `navigator`. Las fechas se eligieron por lo que
 * rompen: un domingo, el sábado en que todavía se juega Boyacá, el cambio de mes,
 * el de año y el 29 de febrero.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LOTTERY_CODES, type LotteryCode } from '@/features/lottery/constants'
import { isoWeekday } from '@/features/lottery/parse/excel-date'
import { LOTTERY_NOMINAL_WEEKDAY } from '@/features/lottery/sources'
import {
  missingLotteriesText,
  WEEKLY_RESULTS_COPY,
  weeklyResultsMessage,
} from '@/features/weekly-results/copy'
import {
  buildWeeklyResults,
  weeklyLotteryStatus,
  weeklyResultsRaffleName,
  type LotteryValidationStatus,
  type WeeklyScheduleRow,
} from '@/features/weekly-results/results'
import {
  canShareFile,
  imageShareData,
  saveFile,
  weeklyResultsImageUrl,
} from '@/features/weekly-results/share'
import {
  formatWeekLong,
  formatWeekShort,
  lastCompletedWeek,
  lotteryReferenceDate,
  parseWeekParam,
  weeklyResultsFileName,
  type ResultsWeek,
} from '@/features/weekly-results/week'

const AUG: ResultsWeek = { monday: '2026-08-17', saturday: '2026-08-22' }

const NUMBERS: Record<LotteryCode, string> = {
  cundinamarca: '2718',
  cruz_roja: '3141',
  meta: '0046',
  bogota: '1618',
  medellin: '5772',
  boyaca: '0007',
}

/** Una fila por lotería, en el día nominal de esa semana, con lo que se le pase. */
function rows(
  week: ResultsWeek,
  overrides: Partial<Record<LotteryCode, WeeklyScheduleRow['result'] | 'sin-fila'>> = {},
): WeeklyScheduleRow[] {
  return LOTTERY_CODES.flatMap((code): WeeklyScheduleRow[] => {
    const override = overrides[code]
    if (override === 'sin-fila') return []
    return [
      {
        lotteryCode: code,
        referenceDate: lotteryReferenceDate(week, code),
        result:
          override === undefined
            ? { winningNumber: NUMBERS[code], validationStatus: 'confirmed' }
            : override,
      },
    ]
  })
}

function result(winningNumber: string | null, validationStatus: LotteryValidationStatus) {
  return { winningNumber, validationStatus }
}

describe('la semana del resumen es la última TERMINADA, de lunes a sábado (BR-H01)', () => {
  it('un domingo, la que acaba de cerrar', () => {
    expect(lastCompletedWeek('2026-08-23')).toEqual({
      monday: '2026-08-17',
      saturday: '2026-08-22',
    })
  })

  it('un lunes, la semana completa anterior', () => {
    expect(lastCompletedWeek('2026-08-24')).toEqual({
      monday: '2026-08-17',
      saturday: '2026-08-22',
    })
  })

  it('un martes, la misma', () => {
    expect(lastCompletedWeek('2026-08-25')).toEqual({
      monday: '2026-08-17',
      saturday: '2026-08-22',
    })
  })

  it('un sábado NO presenta la semana en curso: Boyacá todavía no ha jugado', () => {
    expect(lastCompletedWeek('2026-08-29')).toEqual({
      monday: '2026-08-17',
      saturday: '2026-08-22',
    })
    // Y al día siguiente, sí.
    expect(lastCompletedWeek('2026-08-30')).toEqual({
      monday: '2026-08-24',
      saturday: '2026-08-29',
    })
  })

  it('cruza de mes', () => {
    expect(lastCompletedWeek('2026-09-06')).toEqual({
      monday: '2026-08-31',
      saturday: '2026-09-05',
    })
    expect(lastCompletedWeek('2026-09-01')).toEqual({
      monday: '2026-08-24',
      saturday: '2026-08-29',
    })
  })

  it('cruza de año', () => {
    expect(lastCompletedWeek('2026-01-04')).toEqual({
      monday: '2025-12-29',
      saturday: '2026-01-03',
    })
    expect(lastCompletedWeek('2026-01-01')).toEqual({
      monday: '2025-12-22',
      saturday: '2025-12-27',
    })
  })

  it('con el 29 de febrero dentro, en un año bisiesto', () => {
    expect(lastCompletedWeek('2028-03-05')).toEqual({
      monday: '2028-02-28',
      saturday: '2028-03-04',
    })
    expect(lastCompletedWeek('2028-03-06')).toEqual({
      monday: '2028-02-28',
      saturday: '2028-03-04',
    })
    expect(
      lotteryReferenceDate({ monday: '2028-02-28', saturday: '2028-03-04' }, 'cruz_roja'),
    ).toBe('2028-02-29')
  })

  it('sin 29 de febrero en un año que no lo es', () => {
    expect(lastCompletedWeek('2027-03-02')).toEqual({
      monday: '2027-02-22',
      saturday: '2027-02-27',
    })
    expect(lotteryReferenceDate({ monday: '2027-02-22', saturday: '2027-02-27' }, 'boyaca')).toBe(
      '2027-02-27',
    )
  })

  it('cualquier día de un año entero da un lunes y su sábado, ya pasados', () => {
    let day = '2026-01-01'
    for (let index = 0; index < 400; index += 1) {
      const week = lastCompletedWeek(day)
      expect(isoWeekday(week.monday), day).toBe(1)
      expect(isoWeekday(week.saturday), day).toBe(6)
      expect(week.saturday < day, day).toBe(true)
      const next = new Date(`${day}T12:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      day = next.toISOString().slice(0, 10)
    }
  })
})

describe('la semana que acepta la dirección de la imagen (BR-H05)', () => {
  const SATURDAY = '2026-08-29'

  it('acepta el lunes de una semana terminada', () => {
    expect(parseWeekParam('2026-08-17', SATURDAY)).toEqual(AUG)
    expect(parseWeekParam('2026-08-03', SATURDAY)).toEqual({
      monday: '2026-08-03',
      saturday: '2026-08-08',
    })
  })

  it('rechaza la semana en curso, y la acepta el domingo', () => {
    expect(parseWeekParam('2026-08-24', SATURDAY)).toBeNull()
    expect(parseWeekParam('2026-08-24', '2026-08-30')).toEqual({
      monday: '2026-08-24',
      saturday: '2026-08-29',
    })
  })

  it('rechaza lo que no es el lunes de una fecha real', () => {
    for (const value of [
      null,
      '',
      '2026-08-18',
      '2026-8-17',
      '17/08/2026',
      '2026-08-17T00:00',
      '2026-02-30',
      '2026-13-01',
      "2026-08-17'; drop table",
      ' 2026-08-17',
    ]) {
      expect(parseWeekParam(value, SATURDAY), String(value)).toBeNull()
    }
  })
})

describe('las seis loterías, siempre en el mismo orden (BR-H02)', () => {
  it('el orden y los días salen de las constantes de loterías', () => {
    const built = buildWeeklyResults(AUG, rows(AUG))
    expect(built.results.map((item) => item.code)).toEqual([...LOTTERY_CODES])
    for (const item of built.results) {
      expect(isoWeekday(item.referenceDate)).toBe(LOTTERY_NOMINAL_WEEKDAY[item.code])
    }
    expect(built.results.map((item) => item.referenceDate)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
    ])
  })

  it('Boyacá se compara con el número semanal y las demás con el diario', () => {
    const built = buildWeeklyResults(AUG, rows(AUG))
    expect(
      built.results.filter((item) => item.matchField === 'weekly_number').map((item) => item.code),
    ).toEqual(['boyaca'])
    expect(built.results.filter((item) => item.matchField === 'daily_number')).toHaveLength(5)
  })

  it('el orden no depende del orden en que llegan las filas', () => {
    const built = buildWeeklyResults(AUG, [...rows(AUG)].reverse())
    expect(built.results.map((item) => item.code)).toEqual([...LOTTERY_CODES])
  })
})

describe('listo solo con los seis confirmados (BR-H03)', () => {
  it('seis confirmados: listo', () => {
    const built = buildWeeklyResults(AUG, rows(AUG))
    expect(built.kind).toBe('ready')
    expect(built.results.every((item) => item.status === 'confirmed')).toBe(true)
  })

  it('el cero inicial se conserva tal cual: 0046 no es 46', () => {
    const built = buildWeeklyResults(AUG, rows(AUG))
    const meta = built.results.find((item) => item.code === 'meta')
    expect(meta?.winningNumber).toBe('0046')
    expect(built.results.find((item) => item.code === 'boyaca')?.winningNumber).toBe('0007')
  })

  it('con un resultado pendiente, la semana entera está pendiente', () => {
    const built = buildWeeklyResults(AUG, rows(AUG, { meta: result(null, 'pending') }))
    expect(built.kind).toBe('pending')
    if (built.kind !== 'pending') return
    expect(built.missing).toEqual(['meta'])
    expect(built.results.find((item) => item.code === 'meta')).toMatchObject({
      status: 'pending',
      winningNumber: null,
    })
  })

  it('sin la programación de un sorteo, también falta', () => {
    const built = buildWeeklyResults(AUG, rows(AUG, { cundinamarca: 'sin-fila' }))
    expect(built.kind).toBe('pending')
    if (built.kind === 'pending') expect(built.missing).toEqual(['cundinamarca'])
  })

  it('con varios pendientes, los nombra todos y en el orden de la semana', () => {
    const built = buildWeeklyResults(
      AUG,
      rows(AUG, { boyaca: null, cruz_roja: result(null, 'pending'), bogota: 'sin-fila' }),
    )
    expect(built.kind).toBe('pending')
    if (built.kind === 'pending') expect(built.missing).toEqual(['cruz_roja', 'bogota', 'boyaca'])
  })

  it('un conflicto no cuenta y su número NO se enseña (BR-L08)', () => {
    const built = buildWeeklyResults(AUG, rows(AUG, { bogota: result('9217', 'conflict') }))
    expect(built.kind).toBe('pending')
    expect(built.results.find((item) => item.code === 'bogota')).toMatchObject({
      status: 'conflict',
      winningNumber: null,
    })
  })

  it('un rechazado no cuenta', () => {
    const built = buildWeeklyResults(AUG, rows(AUG, { medellin: result(null, 'rejected') }))
    expect(built.kind).toBe('pending')
    expect(built.results.find((item) => item.code === 'medellin')?.status).toBe('rejected')
  })

  it('un «confirmado» sin cuatro cifras exactas no es un número publicable', () => {
    for (const bad of ['46', '12345', '12a4', ' 046', null]) {
      const built = buildWeeklyResults(AUG, rows(AUG, { meta: result(bad, 'confirmed') }))
      expect(built.kind, String(bad)).toBe('pending')
      expect(
        built.results.find((item) => item.code === 'meta'),
        String(bad),
      ).toMatchObject({
        status: 'invalid',
        winningNumber: null,
      })
    }
  })

  it('una fila con otro día no cuela un sorteo de otra semana', () => {
    const otherDay = rows(AUG).map((row) =>
      row.lotteryCode === 'cundinamarca' ? { ...row, referenceDate: '2026-08-10' } : row,
    )
    const built = buildWeeklyResults(AUG, otherDay)
    expect(built.kind).toBe('pending')
    if (built.kind === 'pending') expect(built.missing).toEqual(['cundinamarca'])
  })

  it('sin resultado es pendiente', () => {
    expect(weeklyLotteryStatus(null)).toBe('pending')
    expect(weeklyLotteryStatus(result('1234', 'pending'))).toBe('pending')
  })
})

describe('la rifa de la imagen es la del catálogo, sin adivinar ninguna (BR-H04)', () => {
  const settings = {
    raffleId: '00000000-0000-4000-8000-000000000002',
    raffleName: 'Sorteo Camioneta KIA 2026',
    raffleStatus: 'active' as const,
  }

  it('con rifa activa o cerrada, su nombre tal como está guardado', () => {
    expect(weeklyResultsRaffleName(settings)).toBe('Sorteo Camioneta KIA 2026')
    expect(weeklyResultsRaffleName({ ...settings, raffleStatus: 'closed' })).toBe(
      'Sorteo Camioneta KIA 2026',
    )
  })

  it('sin configuración, sin rifa o con una que no juega, ninguna', () => {
    expect(weeklyResultsRaffleName(null)).toBeNull()
    expect(
      weeklyResultsRaffleName({ raffleId: null, raffleName: null, raffleStatus: null }),
    ).toBeNull()
    expect(weeklyResultsRaffleName({ ...settings, raffleStatus: 'draft' })).toBeNull()
    expect(weeklyResultsRaffleName({ ...settings, raffleStatus: 'cancelled' })).toBeNull()
    expect(weeklyResultsRaffleName({ ...settings, raffleStatus: null })).toBeNull()
  })
})

describe('cómo se escribe la semana', () => {
  it('en corto, para la cápsula de la imagen', () => {
    expect(formatWeekShort(AUG)).toBe('17–22 AGO 2026')
    expect(formatWeekShort({ monday: '2026-08-03', saturday: '2026-08-08' })).toBe('3–8 AGO 2026')
    expect(formatWeekShort({ monday: '2026-08-31', saturday: '2026-09-05' })).toBe(
      '31 AGO – 5 SEP 2026',
    )
    expect(formatWeekShort({ monday: '2025-12-29', saturday: '2026-01-03' })).toBe(
      '29 DIC 2025 – 3 ENE 2026',
    )
  })

  it('entera, para el mensaje y la pantalla', () => {
    expect(formatWeekLong(AUG)).toBe('del 17 al 22 de agosto de 2026')
    expect(formatWeekLong({ monday: '2026-08-31', saturday: '2026-09-05' })).toBe(
      'del 31 de agosto al 5 de septiembre de 2026',
    )
    expect(formatWeekLong({ monday: '2025-12-29', saturday: '2026-01-03' })).toBe(
      'del 29 de diciembre de 2025 al 3 de enero de 2026',
    )
  })

  it('el archivo se llama por el lunes de la semana', () => {
    expect(weeklyResultsFileName(AUG)).toBe('resultados-semana-2026-08-17.png')
  })

  it('la dirección de la imagen solo lleva la semana: nada de vendedor ni de rifa', () => {
    expect(weeklyResultsImageUrl(AUG)).toBe('/api/weekly-results/image?week=2026-08-17')
  })

  it('las loterías que faltan se nombran como se dicen', () => {
    expect(missingLotteriesText(['meta'])).toBe('Meta')
    expect(missingLotteriesText(['meta', 'bogota'])).toBe('Meta y Bogotá')
    expect(missingLotteriesText(['cundinamarca', 'meta', 'bogota'])).toBe(
      'Cundinamarca, Meta y Bogotá',
    )
  })
})

describe('el mensaje predeterminado (BR-H06)', () => {
  it('dice exactamente esto para la semana del 17 al 22 de agosto de 2026', () => {
    expect(weeklyResultsMessage(AUG)).toBe(
      '🎉 Resultados de la semana\n\n' +
        'Estos fueron los números mayores del 17 al 22 de agosto de 2026. Revisa tu boleta en la imagen. 🍀\n\n' +
        'Recuerda: de lunes a viernes se verifica el número diario. El sábado se verifica el número semanal con Boyacá.',
    )
  })

  it('la semana es dinámica', () => {
    expect(weeklyResultsMessage({ monday: '2025-12-29', saturday: '2026-01-03' })).toContain(
      'los números mayores del 29 de diciembre de 2025 al 3 de enero de 2026.',
    )
  })

  it('no lleva enlaces, ni marcadores, ni números de resultados', () => {
    const message = weeklyResultsMessage(AUG)
    expect(message).not.toMatch(/https?:|chat\.whatsapp|wa\.me|\{\{/)
    for (const number of Object.values(NUMBERS)) expect(message).not.toContain(number)
  })
})

/** Todas las cadenas de un objeto de textos, llamando a las funciones con valores de muestra. */
function allTexts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    return allTexts(fn('Meta y Bogotá', 2, 'Número diario'))
  }
  if (value && typeof value === 'object') return Object.values(value).flatMap(allTexts)
  return []
}

describe('ningún texto certifica un premio ni dice que algo se envió (BR-L15, BR-W08)', () => {
  it('ni «ganador» ni «enviado» en ninguna parte', () => {
    const texts = [...allTexts(WEEKLY_RESULTS_COPY), weeklyResultsMessage(AUG)]
    for (const text of texts) {
      expect(text, text).not.toMatch(/ganador|ganadora|premiad|enviad|se envió|entregad/i)
    }
  })
})

describe('compartir un ARCHIVO, no un enlace (BR-H07)', () => {
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'resultados-semana-2026-08-17.png', {
    type: 'image/png',
  })

  it('sin `navigator.share` o sin `canShare`, no se puede', () => {
    expect(canShareFile(undefined, file)).toBe(false)
    expect(canShareFile({}, file)).toBe(false)
    expect(canShareFile({ share: async () => {} }, file)).toBe(false)
  })

  it('con `canShare` que rechaza archivos, o que falla, tampoco', () => {
    expect(canShareFile({ share: async () => {}, canShare: () => false }, file)).toBe(false)
    expect(
      canShareFile(
        {
          share: async () => {},
          canShare: () => {
            throw new Error('no')
          },
        },
        file,
      ),
    ).toBe(false)
  })

  it('con `canShare` que acepta el archivo, sí', () => {
    const canShare = vi.fn(() => true)
    expect(canShareFile({ share: async () => {}, canShare }, file)).toBe(true)
    expect(canShare).toHaveBeenCalledWith({ files: [file] })
  })

  it('manda título y mensaje cuando el navegador los acepta con el archivo', () => {
    const data = imageShareData({ canShare: () => true }, file, 'Resultados de la semana', 'Hola')
    expect(data).toEqual({ files: [file], title: 'Resultados de la semana', text: 'Hola' })
  })

  it('si no los acepta, manda solo la imagen', () => {
    const canShare = (data?: ShareData) => !data?.text
    expect(imageShareData({ canShare }, file, 'Resultados de la semana', 'Hola')).toEqual({
      files: [file],
    })
  })
})

describe('descargar el archivo que ya está en memoria', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('crea un enlace con el nombre, lo pulsa y no lo deja en la página', () => {
    const clicks: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.getAttribute('href') ?? '', download: this.download })
    })

    saveFile('blob:http://localhost/imagen', 'resultados-semana-2026-08-17.png')

    expect(clicks).toEqual([
      { href: 'blob:http://localhost/imagen', download: 'resultados-semana-2026-08-17.png' },
    ])
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })
})
