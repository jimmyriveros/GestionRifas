import { describe, expect, it } from 'vitest'

import { AVAILABILITY_LABELS, INVENTORY_COPY } from '../../src/features/inventory/copy'
import {
  combinationAt,
  formatCount,
  GENERATION_MAX,
  generationSample,
  generationTotal,
  minutesLeft,
  parseAvailability,
  parseCustody,
  RANGE_MESSAGES,
  rangeProblem,
  remainingChunks,
} from '../../src/features/inventory/rules'
import {
  generationRangesProblem,
  generationStartSchema,
  holdSettingsSchema,
} from '../../src/features/inventory/schemas'
import { whyNot, type TicketEligibility } from '../../src/features/tickets/selection/eligibility'

/**
 * Las reglas puras del inventario comun (D-257). Las MISMAS frases y constantes
 * existen en la 0081, y `tests/db/common-inventory.test.ts` compara las dos
 * versiones; aqui se prueba lo que la pantalla calcula sola: el orden y el ancho
 * de las combinaciones, la muestra y los textos.
 */

describe('rangos del generador (BR-N15)', () => {
  it('valida el ancho explicito, las cifras y el orden, con las frases del formulario', () => {
    expect(rangeProblem('', '9')).toBe(RANGE_MESSAGES.empty)
    expect(rangeProblem('0', '')).toBe(RANGE_MESSAGES.empty)
    expect(rangeProblem('1A', '99')).toBe(RANGE_MESSAGES.format)
    expect(rangeProblem('12345', '1')).toBe(RANGE_MESSAGES.format)
    expect(rangeProblem(' 1', '9')).toBe(RANGE_MESSAGES.format)
    expect(rangeProblem('0', '99')).toBe(RANGE_MESSAGES.width)
    expect(rangeProblem('007', '10')).toBe(RANGE_MESSAGES.width)
    expect(rangeProblem('09', '01')).toBe(RANGE_MESSAGES.order)
    expect(rangeProblem('00', '99')).toBeNull()
    expect(rangeProblem('9999', '9999')).toBeNull()
  })

  it('cuenta las combinaciones de los dos rangos', () => {
    expect(
      generationTotal({ daily: { from: '00', to: '02' }, weekly: { from: '10', to: '11' } }),
    ).toBe(6)
    expect(
      generationTotal({ daily: { from: '0000', to: '9999' }, weekly: { from: '00', to: '09' } }),
    ).toBe(GENERATION_MAX)
  })

  it('las genera en el orden de la base, diario por diario, con sus ceros', () => {
    const ranges = { daily: { from: '00', to: '02' }, weekly: { from: '10', to: '11' } }
    const todas = Array.from({ length: 6 }, (_, i) => combinationAt(ranges, i))
    expect(todas.map((c) => `${c.daily}/${c.weekly}`)).toEqual([
      '00/10',
      '00/11',
      '01/10',
      '01/11',
      '02/10',
      '02/11',
    ])
    // 007 a 010 sigue siendo de tres cifras: nunca 7, 8, 9, 10.
    const ancho = { daily: { from: '007', to: '010' }, weekly: { from: '5', to: '5' } }
    expect(Array.from({ length: 4 }, (_, i) => combinationAt(ancho, i).daily)).toEqual([
      '007',
      '008',
      '009',
      '010',
    ])
  })

  it('la muestra es de las primeras y las ultimas, sin repetir cuando son pocas', () => {
    const muchas = generationSample({
      daily: { from: '0000', to: '9999' },
      weekly: { from: '00', to: '09' },
    })
    expect(muchas.first.map((c) => `${c.daily}/${c.weekly}`)).toEqual([
      '0000/00',
      '0000/01',
      '0000/02',
    ])
    expect(muchas.last.map((c) => `${c.daily}/${c.weekly}`)).toEqual([
      '9999/07',
      '9999/08',
      '9999/09',
    ])

    const pocas = generationSample({
      daily: { from: '1', to: '2' },
      weekly: { from: '3', to: '4' },
    })
    expect([...pocas.first, ...pocas.last].map((c) => `${c.daily}/${c.weekly}`)).toEqual([
      '1/3',
      '1/4',
      '2/3',
      '2/4',
    ])
  })

  it('cuenta los bloques que quedan', () => {
    expect(remainingChunks(100_000, 0)).toBe(20)
    expect(remainingChunks(100_000, 95_000)).toBe(1)
    expect(remainingChunks(6, 6)).toBe(0)
  })

  it('más de 100.000 se rechaza con la frase de la base (D-261: con los números de la rifa)', () => {
    // El esquema solo mira la forma; el tope y el ancho los da la rifa.
    expect(
      generationStartSchema.safeParse({
        raffleId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        dailyFrom: '0000',
        dailyTo: '9999',
        weeklyFrom: '00',
        weeklyTo: '10',
      }).success,
    ).toBe(true)
    const groups = [
      { name: 'Diario', digits: 4 },
      { name: 'Semanal', digits: 2 },
    ]
    expect(
      generationRangesProblem(groups, {
        dailyFrom: '0000',
        dailyTo: '9999',
        weeklyFrom: '00',
        weeklyTo: '10',
      }),
    ).toEqual({
      field: 'weekly',
      message:
        'Esos rangos dan 110.000 combinaciones. El generador crea hasta 100.000 de una vez: acorta uno de los dos rangos.',
    })
  })
})

describe('formato y lectura', () => {
  it('escribe los recuentos con puntos de miles, tambien los de cuatro cifras', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(5000)).toBe('5.000')
    expect(formatCount(100_000)).toBe('100.000')
    expect(formatCount(1_234_567)).toBe('1.234.567')
  })

  it('los minutos que quedan se redondean hacia arriba y nunca son negativos', () => {
    const vence = Date.parse('2026-10-19T15:30:00Z')
    expect(minutesLeft(vence, Date.parse('2026-10-19T15:00:00Z'))).toBe(30)
    expect(minutesLeft(vence, Date.parse('2026-10-19T15:29:01Z'))).toBe(1)
    expect(minutesLeft(vence, Date.parse('2026-10-19T15:31:00Z'))).toBe(0)
  })

  it('lo que llega de la base y no se reconoce no se inventa', () => {
    expect(parseAvailability('free')).toBe('free')
    expect(parseAvailability('otra cosa')).toBe('unavailable')
    expect(parseCustody('common')).toBe('common')
    expect(parseCustody('todo')).toBeUndefined()
    expect(parseCustody(undefined)).toBeUndefined()
  })

  it('el cupo y la duracion tienen sus limites', () => {
    const base = { raffleId: crypto.randomUUID() }
    expect(
      holdSettingsSchema.safeParse({ ...base, durationMinutes: 30, maxActivePerSeller: 10 })
        .success,
    ).toBe(true)
    expect(
      holdSettingsSchema.safeParse({ ...base, durationMinutes: 4, maxActivePerSeller: 10 }).success,
    ).toBe(false)
    expect(
      holdSettingsSchema.safeParse({ ...base, durationMinutes: 30, maxActivePerSeller: 101 })
        .success,
    ).toBe(false)
    expect(
      holdSettingsSchema.safeParse({ ...base, durationMinutes: 30, maxActivePerSeller: 0 }).success,
    ).toBe(true)
  })
})

describe('textos (UX_COPY_GUIDELINES, Anexo A)', () => {
  /** Todas las cadenas del modulo, tambien las que salen de funciones. */
  function textos(): string[] {
    const out: string[] = []
    const visitar = (valor: unknown) => {
      if (typeof valor === 'string') out.push(valor)
      else if (typeof valor === 'function') {
        const fn = valor as (...args: unknown[]) => unknown
        for (const args of [
          [1],
          [2, 10],
          [0],
          [3, 3],
          [12, 10],
          ['00', '02', 3, 2, 2],
          ['2026-10-19T15:30:00Z'],
        ]) {
          try {
            const r = fn(...(args as unknown[]))
            if (typeof r === 'string') out.push(r)
          } catch {
            /* firma distinta: se prueba con la siguiente */
          }
        }
      } else if (valor && typeof valor === 'object') Object.values(valor).forEach(visitar)
    }
    visitar(INVENTORY_COPY)
    visitar(AVAILABILITY_LABELS)
    return out
  }

  it('no usa los terminos que el glosario prohibe', () => {
    const prohibidas = /\b(reserv\w*|ticket|cupón|stock|bolsa|ganador\w*|comisi\w+|link)\b/i
    for (const texto of textos()) expect(texto, texto).not.toMatch(prohibidas)
  })

  it('detras de una hora no va otro punto: «p. m.» ya lo trae', () => {
    const conHora = textos().filter((texto) => /\b[ap]\. m\./.test(texto))
    expect(conHora.length).toBeGreaterThan(0)
    for (const texto of textos()) expect(texto, texto).not.toMatch(/\.\./)
  })

  it('no promete un envio ni un certificado', () => {
    for (const texto of textos()) {
      expect(texto, texto).not.toMatch(/\b(enviad[oa]|certificad[oa]|garantizad[oa])\b/i)
    }
  })

  it('el catalogo interno dice solo libre, tuya, apartada por ti o no disponible', () => {
    expect(AVAILABILITY_LABELS).toEqual({
      free: 'Libre',
      held_by_me: 'Apartada por ti',
      mine: 'En tus boletas',
      unavailable: 'No disponible',
    })
  })
})

describe('por que el personal no puede (D-257)', () => {
  function fila(overrides: Partial<Extract<TicketEligibility, { audience: 'staff' }>>) {
    return {
      audience: 'staff' as const,
      ticketId: 'b',
      dailyNumber: '1234',
      weeklyNumber: '5678',
      inventoryStatus: 'available' as const,
      sellerId: null,
      heldBy: null,
      raffleId: 'r',
      raffleActive: true,
      can: {
        approve: false,
        assign: false,
        cancel: false,
        changeSeller: false,
        delete: false,
        assignToSeller: false,
        recover: false,
      },
      ...overrides,
    }
  }

  it('una apartada no admite ninguna accion de inventario', () => {
    const apartada = fila({ heldBy: 'vendedor' })
    for (const accion of ['assignToSeller', 'cancel', 'delete', 'changeSeller'] as const) {
      expect(whyNot(apartada, accion)).toBe('Está apartada por un vendedor.')
    }
  })

  it('asignar y recuperar se explican por quien tiene la boleta', () => {
    expect(whyNot(fila({ sellerId: 'v' }), 'assignToSeller')).toBe('Ya la tiene un vendedor.')
    expect(whyNot(fila({}), 'recover')).toBe('Ya está en el inventario común.')
    expect(whyNot(fila({ sellerId: 'v', inventoryStatus: 'assigned' }), 'recover')).toBe(
      'Ya está vendida.',
    )
    expect(whyNot(fila({}), 'changeSeller')).toBe(
      'Está en el inventario común: asígnala a un vendedor.',
    )
  })
})
