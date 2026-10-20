import { describe, expect, it } from 'vitest'

import { catalogWhatsappMessage } from '@/features/catalog/whatsapp'
import { combinationAt, generationSample, generationTotal, groupRangeProblem, paddedRanges } from '@/features/inventory/rules'
import { generationRangesProblem } from '@/features/inventory/schemas'
import { prizeGroupProblem, prizePreviewSentence } from '@/features/raffle-prizes/copy'
import {
  prizeNumberMatches,
  resolvePrizeLinks,
  type PrizeCandidate,
} from '@/features/raffle-prizes/matching'
import { numberGroupsIssue, NUMBER_GROUP_FORM_DEFAULTS } from '@/features/raffles/number-groups'
import { validateBulkRows } from '@/features/tickets/bulk/duplicates'
import { importColumns } from '@/features/tickets/import/sample'
import { ticketNumbersLabel, ticketNumbersLegend } from '@/features/tickets/components/TicketNumbers'
import {
  groupNumberProblem,
  LEGACY_NUMBER_FORMAT,
  numberFormatFromRow,
  numberFormatLegend,
  numberGroupPhrase,
  numberGroupsProblem,
  ticketNumbersProblem,
  type RaffleNumberFormat,
} from '@/lib/ticket-number-format'

/**
 * D-261: los números de una boleta los define su rifa. Estas son las reglas
 * puras —las mismas frases que la base, que las compara letra por letra en
 * `tests/db/raffle-number-groups.test.ts`— y lo que hacen con ellas los
 * formularios, el generador, el catálogo y el motor de premios.
 */

const single = (digits: 2 | 3 | 4, name = 'Número'): RaffleNumberFormat => ({
  groups: [{ slot: 'daily_number', name, digits }],
})
const two = (d1: 2 | 3 | 4, d2: 2 | 3 | 4, n1 = 'Mayor', n2 = 'Seco'): RaffleNumberFormat => ({
  groups: [
    { slot: 'daily_number', name: n1, digits: d1 },
    { slot: 'weekly_number', name: n2, digits: d2 },
  ],
})

describe('la estructura de una rifa (BR-N19, BR-N20)', () => {
  it('lee la fila de la base: uno o dos grupos, con sus nombres y cifras', () => {
    expect(
      numberFormatFromRow({
        number_group_count: 1,
        first_group_name: 'Número',
        first_group_digits: 3,
        second_group_name: null,
        second_group_digits: null,
      }),
    ).toEqual(single(3))
    expect(
      numberFormatFromRow({
        number_group_count: 2,
        first_group_name: 'Diario',
        first_group_digits: 4,
        second_group_name: 'Semanal',
        second_group_digits: 4,
      }),
    ).toEqual(LEGACY_NUMBER_FORMAT)
  })

  it('valida los grupos al crear la rifa, con las frases de la base', () => {
    const ok = { count: 2, firstName: 'Mayor', firstDigits: 3, secondName: 'Seco', secondDigits: 2 }
    expect(numberGroupsProblem(ok)).toBeNull()
    expect(numberGroupsProblem({ ...ok, count: 3 })).toBe('Cada boleta tiene uno o dos números.')
    expect(numberGroupsProblem({ ...ok, firstName: '' })).toBe('Escribe el nombre del primer número.')
    expect(numberGroupsProblem({ ...ok, secondName: null })).toBe('Escribe el nombre del segundo número.')
    expect(numberGroupsProblem({ ...ok, count: 1 })).toBe(
      'Con un solo número por boleta no hay segundo número.',
    )
    expect(numberGroupsProblem({ ...ok, firstName: 'M' })).toBe(
      'El nombre de cada número tiene de 2 a 20 caracteres.',
    )
    expect(numberGroupsProblem({ ...ok, secondName: 'x'.repeat(21) })).toBe(
      'El nombre de cada número tiene de 2 a 20 caracteres.',
    )
    expect(numberGroupsProblem({ ...ok, firstName: 'Ma\nyor' })).toBe(
      'El nombre de cada número va en una sola línea, sin caracteres invisibles.',
    )
    expect(numberGroupsProblem({ ...ok, secondDigits: 5 })).toBe('Cada número tiene 2, 3 o 4 cifras.')
    expect(numberGroupsProblem({ ...ok, secondName: 'mayor' })).toBe(
      'Los dos números necesitan nombres distintos.',
    )
    expect(
      numberGroupsProblem({ count: 1, firstName: 'Número', firstDigits: 2, secondName: null, secondDigits: null }),
    ).toBeNull()
  })

  it('el formulario pinta cada problema junto a su campo', () => {
    expect(numberGroupsIssue(NUMBER_GROUP_FORM_DEFAULTS)).toBeNull()
    expect(numberGroupsIssue({ ...NUMBER_GROUP_FORM_DEFAULTS, firstGroupName: ' ' })).toEqual({
      path: 'firstGroupName',
      message: 'Escribe el nombre del primer número.',
    })
    expect(numberGroupsIssue({ ...NUMBER_GROUP_FORM_DEFAULTS, secondGroupName: 'DIARIO' })).toEqual({
      path: 'secondGroupName',
      message: 'Los dos números necesitan nombres distintos.',
    })
    // Con un solo número, lo escrito en el segundo no cuenta.
    expect(
      numberGroupsIssue({ ...NUMBER_GROUP_FORM_DEFAULTS, groupCount: 1, secondGroupName: '' }),
    ).toBeNull()
  })
})

describe('el formato exacto de una boleta (BR-N21, BR-N22)', () => {
  const allWidths = [2, 3, 4] as const

  it('cada número con exactamente las cifras de su grupo, en todas las combinaciones', () => {
    for (const d1 of allWidths) {
      expect(ticketNumbersProblem(single(d1), '0'.repeat(d1), null, true)).toBeNull()
      for (const d2 of allWidths) {
        const format = two(d1, d2)
        expect(ticketNumbersProblem(format, '9'.repeat(d1), '0'.repeat(d2), true)).toBeNull()
        expect(ticketNumbersProblem(format, '9'.repeat(d1), '0'.repeat(d2 + 1), true)).toBe(
          `El número «Seco» lleva exactamente ${d2} cifras, y ${'0'.repeat(d2 + 1)} tiene ${d2 + 1}.`,
        )
      }
    }
  })

  it('no rellena ni recorta: dice qué escribir', () => {
    expect(ticketNumbersProblem(LEGACY_NUMBER_FORMAT, '7', '1234', true)).toBe(
      'El número «Diario» lleva exactamente 4 cifras: escribe 0007.',
    )
    expect(ticketNumbersProblem(single(3), '12345', null, true)).toBe(
      'El número «Número» lleva exactamente 3 cifras, y 12345 tiene 5.',
    )
    expect(ticketNumbersProblem(single(2), '1a', null, true)).toBe(
      'El número «Número» lleva solo cifras, sin letras ni símbolos.',
    )
  })

  it('los ceros de delante forman parte del número', () => {
    expect(ticketNumbersProblem(single(2), '07', null, true)).toBeNull()
    expect(ticketNumbersProblem(single(4), '0000', null, true)).toBeNull()
    expect(ticketNumbersProblem(two(4, 3), '0012', '007', true)).toBeNull()
  })

  it('un grupo que no existe no se representa con nada', () => {
    expect(ticketNumbersProblem(single(3), '123', '', true)).toBeNull()
    expect(ticketNumbersProblem(single(3), '123', '456', true)).toBe(
      'Esta rifa tiene un solo número por boleta («Número»): la boleta no lleva otro número.',
    )
    expect(ticketNumbersProblem(single(3), '123', '0', true)).toBe(
      'Esta rifa tiene un solo número por boleta («Número»): la boleta no lleva otro número.',
    )
  })

  it('fuera del borrador cada grupo necesita su número; un borrador puede faltar', () => {
    expect(ticketNumbersProblem(two(3, 2), '123', null, true)).toBe('Escribe el número «Seco».')
    expect(ticketNumbersProblem(two(3, 2), '123', null, false)).toBeNull()
    expect(ticketNumbersProblem(single(2), null, null, true)).toBe('Escribe el número «Número».')
    expect(groupNumberProblem({ slot: 'daily_number', name: 'Mayor', digits: 3 }, '07', true)).toBe(
      'El número «Mayor» lleva exactamente 3 cifras: escribe 007.',
    )
  })
})

describe('crear en lote y el formulario del vendedor, con la rifa (D-261)', () => {
  const row = (dailyNumber: string, weeklyNumber = '') => ({ dailyNumber, weeklyNumber })

  it('con un solo número, la fila está completa con ese número y no repite', () => {
    const result = validateBulkRows([row('123'), row('123'), row('7'), row('')], {
      format: single(3),
      requireComplete: true,
    })
    expect(result[0]?.rowError).toBeUndefined()
    expect(result[1]?.rowError).toBe('Número repetido en la fila 1.')
    expect(result[2]?.dailyError).toBe('El número «Número» lleva exactamente 3 cifras: escribe 007.')
    expect(result[3]?.rowError).toBe('Escribe el número «Número».')
  })

  it('con dos, la combinación entera es la que no se repite', () => {
    const result = validateBulkRows([row('123', '45'), row('123', '46'), row('123', '45')], {
      format: two(3, 2),
    })
    expect(result[0]?.rowError).toBeUndefined()
    expect(result[1]?.rowError).toBeUndefined()
    expect(result[2]?.rowError).toBe('Combinación repetida en la fila 1.')
  })

  it('lo que ya existe en la rifa, con la clave de su estructura', () => {
    expect(
      validateBulkRows([row('123')], { format: single(3), existingCombos: new Set(['123/']) })[0]
        ?.rowError,
    ).toBe('Ese número ya existe en esta rifa.')
  })
})

describe('el generador lee el ancho de la rifa (BR-N15, D-261)', () => {
  const groups4 = [{ name: 'Diario', digits: 4 }]

  it('del 0 al 5 en un grupo de cuatro cifras es 0000…0005', () => {
    const ranges = paddedRanges(groups4, { dailyFrom: '0', dailyTo: '5', weeklyFrom: '', weeklyTo: '' })
    expect(ranges).toEqual({ daily: { from: '0000', to: '0005' }, weekly: null })
    expect(generationTotal(ranges)).toBe(6)
    expect(combinationAt(ranges, 0)).toEqual({ daily: '0000', weekly: null })
    expect(combinationAt(ranges, 5)).toEqual({ daily: '0005', weekly: null })
    expect(generationSample(ranges).first.map((c) => c.daily)).toEqual(['0000', '0001', '0002'])
  })

  it('con dos, las combinaciones de los dos rangos con el ancho de cada uno', () => {
    const groups = [
      { name: 'Mayor', digits: 3 },
      { name: 'Seco', digits: 2 },
    ]
    const ranges = paddedRanges(groups, { dailyFrom: '7', dailyTo: '8', weeklyFrom: '0', weeklyTo: '1' })
    expect(generationTotal(ranges)).toBe(4)
    expect([0, 1, 2, 3].map((k) => combinationAt(ranges, k))).toEqual([
      { daily: '007', weekly: '00' },
      { daily: '007', weekly: '01' },
      { daily: '008', weekly: '00' },
      { daily: '008', weekly: '01' },
    ])
  })

  it('rechaza lo que excede las cifras, sin recortar, y lo demás con su frase', () => {
    const group = { name: 'Seco', digits: 2 }
    expect(groupRangeProblem('0', '99', group)).toBeNull()
    expect(groupRangeProblem('00', '100', group)).toBe(
      'El número «Seco» tiene 2 cifras: su rango va como mucho del 00 al 99.',
    )
    expect(groupRangeProblem('', '9', group)).toBe(
      'Escribe el primer y el último número del rango de «Seco».',
    )
    expect(groupRangeProblem('1a', '9', group)).toBe(
      'Escribe el rango de «Seco» solo con cifras, sin letras ni símbolos.',
    )
    expect(groupRangeProblem('9', '1', group)).toBe(
      'En el rango de «Seco», el primer número no puede ser mayor que el último.',
    )
  })

  it('el tope de 100.000 sigue: con un grupo no se llega, con dos sí', () => {
    expect(
      generationRangesProblem(groups4, { dailyFrom: '0', dailyTo: '9999', weeklyFrom: '', weeklyTo: '' }),
    ).toBeNull()
    expect(
      generationRangesProblem(
        [
          { name: 'Mayor', digits: 3 },
          { name: 'Seco', digits: 3 },
        ],
        { dailyFrom: '0', dailyTo: '999', weeklyFrom: '0', weeklyTo: '100' },
      )?.message,
    ).toBe(
      'Esos rangos dan 101.000 combinaciones. El generador crea hasta 100.000 de una vez: acorta uno de los dos rangos.',
    )
  })
})

describe('cómo se pinta y se nombra (D-261)', () => {
  it('una boleta de un número: sin separador ni segundo campo', () => {
    const ticket = { dailyNumber: '387', weeklyNumber: null, numberFormat: single(3) }
    expect(ticketNumbersLabel(ticket)).toBe('387')
    expect(ticketNumbersLegend(ticket)).toBe('Número')
  })

  it('la leyenda dice los nombres de SU rifa, en una lista que mezcla rifas', () => {
    expect(ticketNumbersLegend({ dailyNumber: '123', weeklyNumber: '45', numberFormat: two(3, 2) })).toBe(
      'Mayor · Seco',
    )
    expect(
      ticketNumbersLegend({ dailyNumber: '1234', weeklyNumber: '5678', numberFormat: LEGACY_NUMBER_FORMAT }),
    ).toBe('Diario · Semanal')
    expect(numberFormatLegend(single(2))).toBe('Número')
  })

  it('el nombre dentro de una frase no se repite ni se inventa', () => {
    expect(numberGroupPhrase('Diario')).toBe('número diario')
    expect(numberGroupPhrase('Número')).toBe('número')
    expect(numberGroupPhrase('Mayor')).toBe('número mayor')
  })

  it('el mensaje de WhatsApp nombra la boleta con los números de su rifa', () => {
    expect(
      catalogWhatsappMessage({ sellerShortName: 'Ana', dailyNumber: '1234', weeklyNumber: '5678' }),
    ).toBe('Hola, Ana. Quiero solicitar la boleta con diario 1234 y semanal 5678 de la rifa. ¿Sigue disponible?')
    expect(
      catalogWhatsappMessage({
        sellerShortName: 'Ana',
        dailyNumber: '387',
        weeklyNumber: '07',
        numberFormat: two(3, 2),
      }),
    ).toBe('Hola, Ana. Quiero solicitar la boleta con mayor 387 y seco 07 de la rifa. ¿Sigue disponible?')
    expect(
      catalogWhatsappMessage({
        sellerShortName: 'Ana',
        dailyNumber: '387',
        weeklyNumber: null,
        numberFormat: single(3),
      }),
    ).toBe('Hola, Ana. Quiero solicitar la boleta 387 de la rifa. ¿Sigue disponible?')
  })
})

describe('premios: el grupo que usan y cuántas cifras comparan (BR-J24, BR-J25)', () => {
  it('cuatro, últimas tres y últimas dos, con los ceros de delante', () => {
    expect(prizeNumberMatches('5387', '5387', 'four')).toBe(true)
    expect(prizeNumberMatches('387', '5387', 'last_three')).toBe(true)
    expect(prizeNumberMatches('0387', '5387', 'last_three')).toBe(true)
    expect(prizeNumberMatches('87', '5387', 'last_two')).toBe(true)
    expect(prizeNumberMatches('187', '5387', 'last_two')).toBe(true)
    expect(prizeNumberMatches('07', '5307', 'last_two')).toBe(true)
    expect(prizeNumberMatches('7', '5307', 'last_two')).toBe(false)
    expect(prizeNumberMatches('70', '5307', 'last_two')).toBe(false)
  })

  it('un premio no exige más cifras que las de su número ni uno que no existe', () => {
    expect(prizeGroupProblem('Seco', two(4, 2), 'weekly_number', 'last_two')).toBeNull()
    expect(prizeGroupProblem('Seco', two(4, 2), 'weekly_number', 'last_three')).toBe(
      'El premio «Seco» compara 3 cifras, pero el número «Seco» tiene 2. Elige menos cifras.',
    )
    expect(prizeGroupProblem('Mayor', two(3, 2), 'daily_number', 'four')).toBe(
      'El premio «Mayor» compara 4 cifras, pero el número «Mayor» tiene 3. Elige menos cifras.',
    )
    expect(prizeGroupProblem('Mayor', two(3, 2), 'daily_number', 'last_three')).toBeNull()
    expect(prizeGroupProblem('Otro', single(3), 'weekly_number', 'last_two')).toBe(
      'El premio «Otro» juega con un número que esta rifa no tiene. Elige «Número».',
    )
  })

  it('la frase del premio usa el nombre del número y sus cifras', () => {
    expect(
      prizePreviewSentence({
        rules: [{ startDate: '2026-11-02', endDate: '2026-11-02', weekdays: [1], lotteryMode: 'corresponding', lotteryCode: null }],
        numberField: 'weekly_number',
        digits: 'last_two',
        reward: { mode: 'fixed', options: [{ description: null, amount: 50_000 }] },
        numberFormat: two(3, 2),
      }),
    ).toContain('juega con las dos últimas cifras del número seco')
  })
})

describe('mandan las más cifras: 4 > 3 > 2 (BR-J07)', () => {
  const candidate = (over: Partial<PrizeCandidate>): PrizeCandidate => ({
    prizeId: 'p4',
    versionId: 'v',
    numberField: 'daily_number',
    digits: 'four',
    ticketId: 't1',
    raffleId: 'r1',
    clientId: 'c1',
    ...over,
  })

  it('con cuatro, el cliente pierde las de tres y las de dos de sus otras boletas y números', () => {
    const result = resolvePrizeLinks([
      candidate({ prizeId: 'p4', digits: 'four', ticketId: 't1' }),
      candidate({ prizeId: 'p3', digits: 'last_three', ticketId: 't2' }),
      candidate({ prizeId: 'p2', digits: 'last_two', ticketId: 't1', numberField: 'weekly_number' }),
    ])
    expect(result.map((c) => c.prizeId)).toEqual(['p4'])
  })

  it('sin cuatro, las de tres mandan sobre las de dos; solo dos, se quedan', () => {
    expect(
      resolvePrizeLinks([
        candidate({ prizeId: 'p3', digits: 'last_three' }),
        candidate({ prizeId: 'p2', digits: 'last_two', numberField: 'weekly_number' }),
      ]).map((c) => c.prizeId),
    ).toEqual(['p3'])
    expect(
      resolvePrizeLinks([candidate({ prizeId: 'p2', digits: 'last_two' })]).map((c) => c.prizeId),
    ).toEqual(['p2'])
  })

  it('no elige entre las de la misma cantidad máxima: se quedan todas', () => {
    expect(
      resolvePrizeLinks([
        candidate({ prizeId: 'p3a', digits: 'last_three', ticketId: 't1' }),
        candidate({ prizeId: 'p3b', digits: 'last_three', ticketId: 't2', numberField: 'weekly_number' }),
        candidate({ prizeId: 'p2', digits: 'last_two', ticketId: 't3' }),
      ]).map((c) => c.prizeId),
    ).toEqual(['p3a', 'p3b'])
  })

  it('no cruza clientes, rifas ni boletas sin cliente', () => {
    const result = resolvePrizeLinks([
      candidate({ prizeId: 'p4', digits: 'four', clientId: 'c1' }),
      candidate({ prizeId: 'p2-otro-cliente', digits: 'last_two', clientId: 'c2', ticketId: 't9' }),
      candidate({ prizeId: 'p2-otra-rifa', digits: 'last_two', raffleId: 'r2', ticketId: 't8' }),
      candidate({ prizeId: 'p2-sin-cliente', digits: 'last_two', clientId: null, ticketId: 't7' }),
    ])
    expect(result.map((c) => c.prizeId).sort()).toEqual(
      ['p2-otra-rifa', 'p2-otro-cliente', 'p2-sin-cliente', 'p4'].sort(),
    )
  })
})

describe('las columnas del importador (D-261)', () => {
  it('la rifa de siempre conserva las columnas de su Excel, en su orden', () => {
    expect(importColumns(LEGACY_NUMBER_FORMAT)).toEqual([
      { slot: 'weekly_number', header: 'Premio semanal', question: '¿Cuál columna es el premio semanal?' },
      { slot: 'daily_number', header: 'Premio diario', question: '¿Cuál columna es el premio diario?' },
    ])
  })

  it('otra rifa las nombra como sus números, y con uno solo hay una columna', () => {
    expect(
      importColumns({
        groups: [
          { slot: 'daily_number', name: 'Mayor', digits: 4 },
          { slot: 'weekly_number', name: 'Seco', digits: 2 },
        ],
      }).map((column) => [column.header, column.question]),
    ).toEqual([
      ['Mayor', '¿Cuál columna es «Mayor»?'],
      ['Seco', '¿Cuál columna es «Seco»?'],
    ])
    expect(
      importColumns({ groups: [{ slot: 'daily_number', name: 'Número', digits: 3 }] }).map(
        (column) => column.header,
      ),
    ).toEqual(['Número'])
  })
})
