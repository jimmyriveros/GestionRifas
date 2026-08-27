import { describe, expect, it } from 'vitest'

import { parseAbono } from '@/features/tickets/import/abono'
import {
  detectMapping,
  hasAbonoWithoutClientMapping,
  isMappingComplete,
  matchColumn,
  needsManualMapping,
} from '@/features/tickets/import/columns'
import { parseCsv } from '@/features/tickets/import/csv'
import { parseJsonTickets } from '@/features/tickets/import/json'
import { importableRows, reviewRows } from '@/features/tickets/import/review'
import { tableToRows } from '@/features/tickets/import/rows'
import {
  SAMPLE_CSV,
  SAMPLE_CSV_WITH_CLIENTS,
  SAMPLE_JSON,
  SAMPLE_JSON_WITH_CLIENTS,
} from '@/features/tickets/import/sample'

/**
 * La columna «Abono» del importador (BR-N14, D-129).
 *
 * En su propio archivo y no dentro de `ticket-import.test.ts` por lo mismo que
 * el resto del proyecto separa lo que crece: son tres capas distintas —leer la
 * casilla, revisar la fila y comparar CSV con JSON— y mezclarlas con las 33
 * pruebas anteriores haria ilegibles las dos cosas.
 *
 * Lo que se vigila en casi todos los casos es la misma regla: el precio NO esta
 * escrito aqui como una constante global. Entra en cada llamada, igual que
 * entra en la aplicacion desde `raffles.ticket_price` (D-098). Por eso hay
 * casos con una rifa de $120.000 y con una de $50.000: si alguien volviera a
 * atar el importador a una cifra fija, la segunda tanda falla.
 */

const PRECIO = 120_000

/** Lee un CSV y lo deja en filas, como hace el importador. */
function filasDe(csv: string) {
  const table = parseCsv(csv)
  const mapping = detectMapping(table.headers)
  expect(isMappingComplete(mapping)).toBe(true)
  return tableToRows(table, mapping)
}

describe('Lectura de la casilla «Abono»', () => {
  it('CASO 7 — una casilla vacía significa que la boleta no lleva abono', () => {
    expect(parseAbono('', PRECIO)).toEqual({ kind: 'none' })
    expect(parseAbono('   ', PRECIO)).toEqual({ kind: 'none' })
  })

  it('CASOS 8, 9 y 10 — la tabla del encargo, entera', () => {
    const equivalencias: [string, number][] = [
      ['20', 20_000],
      ['50', 50_000],
      ['120', 120_000],
      ['20.000', 20_000],
      ['50.000', 50_000],
      ['120.000', 120_000],
      ['20000', 20_000],
      ['50000', 50_000],
      ['120000', 120_000],
    ]

    for (const [escrito, pesos] of equivalencias) {
      expect(parseAbono(escrito, PRECIO), escrito).toEqual({ kind: 'amount', amount: pesos })
    }
  })

  it('acepta la coma como separador de miles y el símbolo de moneda', () => {
    expect(parseAbono('50,000', PRECIO)).toEqual({ kind: 'amount', amount: 50_000 })
    expect(parseAbono('$50.000', PRECIO)).toEqual({ kind: 'amount', amount: 50_000 })
    expect(parseAbono(' $ 50.000 ', PRECIO)).toEqual({ kind: 'amount', amount: 50_000 })
  })

  it('CASOS 11 y 12 — «Cancelado» es el precio completo, se escriba como se escriba', () => {
    for (const escrito of [
      'Cancelado',
      'cancelado',
      'CANCELADO',
      '  Cancelado  ',
      ' Cancelado ',
      'CanceladO',
    ]) {
      expect(parseAbono(escrito, PRECIO), JSON.stringify(escrito)).toEqual({
        kind: 'amount',
        amount: PRECIO,
      })
    }
  })

  it('CASO 13 — «Completa» NO vale, y el mensaje dice cuál es la palabra buena', () => {
    for (const escrito of ['Completa', 'completo', 'PAGADA', 'total']) {
      const resultado = parseAbono(escrito, PRECIO)
      expect(resultado.kind, escrito).toBe('error')
      expect(resultado.kind === 'error' && resultado.problem).toMatch(/«Cancelado»/)
    }
  })

  it('CASO 16 — un abono negativo se rechaza', () => {
    for (const escrito of ['-20', '-20.000', '-1']) {
      const resultado = parseAbono(escrito, PRECIO)
      expect(resultado.kind, escrito).toBe('error')
      expect(resultado.kind === 'error' && resultado.problem).toMatch(/negativo/i)
    }
  })

  it('CASO 17 — por encima del precio se rechaza, y se dicen las dos cifras', () => {
    const resultado = parseAbono('150.000', PRECIO)

    expect(resultado.kind).toBe('error')
    expect(resultado.kind === 'error' && resultado.problem).toBe(
      'El abono de $150.000 supera el precio de la boleta ($120.000).',
    )
  })

  it('cero no es un abono: se rechaza y se explica que la casilla puede quedar vacía', () => {
    const resultado = parseAbono('0', PRECIO)

    expect(resultado.kind).toBe('error')
    expect(resultado.kind === 'error' && resultado.problem).toMatch(/vacía/i)
  })

  it('un texto que no se entiende se rechaza, en vez de leerse a medias', () => {
    for (const escrito of ['abc', '20 mil', '12A4', '--5', '1.2.3', '20.00', '.000']) {
      expect(parseAbono(escrito, PRECIO).kind, escrito).toBe('error')
    }
  })

  it('«20,5» no se lee como veinte mil quinientos: un decimal no es un abono', () => {
    // Borrar los separadores sin mirarlos convertiria «20,5» en 205. El limite
    // de los grupos de tres cifras es justo lo que lo impide.
    expect(parseAbono('20,5', PRECIO).kind).toBe('error')
    expect(parseAbono('20.5', PRECIO).kind).toBe('error')
    expect(parseAbono('20,500', PRECIO)).toEqual({ kind: 'amount', amount: 20_500 })
  })

  it('el corte entre «miles» y «pesos» sale del precio, no de un 120 escrito en el código', () => {
    // Rifa de $50.000 (existe: «Rifa Control 2026»). El corte baja a 50 solo,
    // porque sale de dividir el precio, y «Cancelado» vale lo que vale ESA
    // boleta. Si alguien volviera a escribir 120.000 en el codigo, esto falla.
    expect(parseAbono('50', 50_000)).toEqual({ kind: 'amount', amount: 50_000 })
    expect(parseAbono('50.000', 50_000)).toEqual({ kind: 'amount', amount: 50_000 })
    expect(parseAbono('Cancelado', 50_000)).toEqual({ kind: 'amount', amount: 50_000 })
    expect(parseAbono('60.000', 50_000).kind).toBe('error') // no cabe en 50 mil
    // Y con el precio de $120.000 ese mismo «60» si son sesenta mil.
    expect(parseAbono('60', PRECIO)).toEqual({ kind: 'amount', amount: 60_000 })
  })

  it('por encima del corte se lee en pesos, aunque la cifra sea pequeña', () => {
    // Es la regla 2 del encargo aplicada literalmente: «un valor mayor que el
    // corte representa el valor completo en pesos». Un «500» son quinientos
    // pesos, no quinientos mil, y por eso la vista previa enseña el importe ya
    // convertido ANTES de confirmar: es ahi donde se ve el dedazo.
    expect(parseAbono('500', PRECIO)).toEqual({ kind: 'amount', amount: 500 })
    expect(parseAbono('121', PRECIO)).toEqual({ kind: 'amount', amount: 121 })
    expect(parseAbono('120', PRECIO)).toEqual({ kind: 'amount', amount: 120_000 })
  })
})

describe('Revisión de filas con abono', () => {
  const conCliente = (rowNumber: number, daily: string, weekly: string, abono?: string) => ({
    rowNumber,
    dailyNumber: daily,
    weeklyNumber: weekly,
    clientName: 'Carlos Gómez',
    clientPhone: '3001234567',
    ...(abono !== undefined ? { abono } : {}),
  })

  const opciones = { allowClientAssignments: true, ticketPrice: PRECIO }

  it('CASO 14 — «Cancelado» deja la boleta Pagada y «20» la deja Abonada', () => {
    const review = reviewRows(
      [conCliente(1, '0046', '7821', 'Cancelado'), conCliente(2, '0158', '9014', '20')],
      opciones,
    )

    expect(review.valid).toBe(2)
    expect(review.rows[0]).toMatchObject({ abonoAmount: 120_000, expectedPaymentStatus: 'paid' })
    expect(review.rows[1]).toMatchObject({ abonoAmount: 20_000, expectedPaymentStatus: 'partial' })
  })

  it('CASO 7 — sin abono la boleta queda Sin pagar y no viaja ningún importe', () => {
    const review = reviewRows([conCliente(1, '0046', '7821', '')], opciones)

    expect(review.rows[0]).toMatchObject({ expectedPaymentStatus: 'unpaid' })
    expect(review.rows[0]).not.toHaveProperty('abonoAmount')
    expect(review.withAbono).toBe(0)
    expect(review.abonoTotal).toBe(0)
    expect(importableRows(review)[0]).not.toHaveProperty('abono')
  })

  it('una boleta sin cliente no tiene estado de pago, porque no se vende', () => {
    const review = reviewRows(
      [{ rowNumber: 1, dailyNumber: '0046', weeklyNumber: '7821' }],
      opciones,
    )

    expect(review.rows[0]).toMatchObject({ status: 'valid', expectedPaymentStatus: null })
  })

  it('un abono sin cliente se rechaza: sin venta no hay dónde aplicarlo', () => {
    const review = reviewRows(
      [{ rowNumber: 1, dailyNumber: '0046', weeklyNumber: '7821', abono: '20' }],
      opciones,
    )

    expect(review.invalid).toBe(1)
    expect(review.rows[0]?.problem).toMatch(/nombre y el celular/i)
  })

  it('el resumen suma solo los abonos de las filas que de verdad se van a importar', () => {
    const review = reviewRows(
      [
        conCliente(1, '0046', '7821', '20'),
        conCliente(2, '0158', '9014', 'Cancelado'),
        conCliente(3, '0159', '9015', ''),
        // Esta no entra: su numero no es valido, asi que su abono tampoco cuenta.
        conCliente(4, '12345', '9016', '50'),
      ],
      opciones,
    )

    expect(review.withAbono).toBe(2)
    expect(review.abonoTotal).toBe(140_000)
    expect(review.invalid).toBe(1)
  })

  it('el importe viaja al servidor en PESOS, no como el texto del archivo', () => {
    const review = reviewRows([conCliente(1, '0046', '7821', '20')], opciones)

    expect(importableRows(review)[0]).toEqual({
      rowNumber: 1,
      dailyNumber: '0046',
      weeklyNumber: '7821',
      clientName: 'Carlos Gómez',
      clientPhone: '3001234567',
      abono: 20_000,
    })
  })

  it('sin precio conocido no se inventa uno: la fila se marca y se dice por qué', () => {
    const review = reviewRows([conCliente(1, '0046', '7821', '20')], {
      allowClientAssignments: true,
    })

    expect(review.invalid).toBe(1)
    expect(review.rows[0]?.problem).toMatch(/precio de la rifa/i)
  })

  it('un abono mal escrito no tumba las filas buenas del mismo archivo', () => {
    const review = reviewRows(
      [
        conCliente(1, '0046', '7821', '20'),
        conCliente(2, '0158', '9014', 'Completa'),
        conCliente(3, '0159', '9015', '150.000'),
      ],
      opciones,
    )

    expect(review.valid).toBe(1)
    expect(review.invalid).toBe(2)
    expect(review.rows[1]?.problem).toMatch(/«Cancelado»/)
    expect(review.rows[2]?.problem).toMatch(/supera el precio/i)
  })

  it('CASOS 3 y 5 — el mismo celular en formatos distintos es UN cliente con sus abonos', () => {
    const review = reviewRows(
      [
        { ...conCliente(1, '0046', '7821', '20'), clientPhone: '3214495114' },
        { ...conCliente(2, '0158', '9014', '50'), clientPhone: '321 449 5114' },
        { ...conCliente(3, '0159', '9015', 'Cancelado'), clientPhone: '321-449-5114' },
      ],
      opciones,
    )

    expect(review.valid).toBe(3)
    expect(review.clients).toHaveLength(1)
    expect(review.clients[0]).toMatchObject({ status: 'new', tickets: 3 })
    expect(review.clientsNew).toBe(1)
    expect(review.clientsExisting).toBe(0)
    // Cada abono es de SU boleta: no se suman ni se reparten entre las tres.
    expect(review.rows.map((row) => row.abonoAmount)).toEqual([20_000, 50_000, 120_000])
    expect(review.abonoTotal).toBe(190_000)
  })

  it('CASO 6 — el mismo celular con dos nombres bloquea las filas, abono incluido', () => {
    const review = reviewRows(
      [
        { ...conCliente(1, '0046', '7821', '20'), clientName: 'Sara Valentina' },
        { ...conCliente(2, '0158', '9014', '20'), clientName: 'Sara V. Ríos' },
      ],
      opciones,
    )

    expect(review).toMatchObject({ valid: 0, clientConflicts: 2, withAbono: 0, abonoTotal: 0 })
  })
})

describe('CSV y JSON pasan por el mismo sitio', () => {
  const opciones = { allowClientAssignments: true, ticketPrice: PRECIO }

  /** El ejemplo del encargo, en sus dos formatos. */
  const CSV = [
    'Nombre,Celular,Premio semanal,Premio diario,Abono',
    'Suegro,1111111125,4992,0717,50.000',
    'Jimmy,1111111126,3386,9111,',
    'Sara Valentina,3214495114,2207,7932,20',
    'Sara Valentina,3214495114,5392,1117,Cancelado',
  ].join('\n')

  const JSON_EQUIVALENTE = JSON.stringify([
    {
      Nombre: 'Suegro',
      Celular: '1111111125',
      'Premio semanal': '4992',
      'Premio diario': '0717',
      Abono: '50.000',
    },
    {
      Nombre: 'Jimmy',
      Celular: '1111111126',
      'Premio semanal': '3386',
      'Premio diario': '9111',
      Abono: '',
    },
    {
      Nombre: 'Sara Valentina',
      Celular: '3214495114',
      'Premio semanal': '2207',
      'Premio diario': '7932',
      Abono: '20',
    },
    {
      Nombre: 'Sara Valentina',
      Celular: '3214495114',
      'Premio semanal': '5392',
      'Premio diario': '1117',
      Abono: 'Cancelado',
    },
  ])

  it('reconoce los encabezados del encargo, incluidos «Nombre» y «Abono»', () => {
    expect(matchColumn('Nombre')).toBe('clientName')
    expect(matchColumn('Celular')).toBe('clientPhone')
    expect(matchColumn('Abono')).toBe('abono')
    expect(matchColumn('ABONO')).toBe('abono')
    expect(matchColumn('  abono  ')).toBe('abono')
    expect(matchColumn('Abono realizado')).toBe('abono')
  })

  it('CASO 18 — los ceros de delante sobreviven al recorrido entero', () => {
    const filas = filasDe(CSV)

    expect(filas[0]?.dailyNumber).toBe('0717')
    expect(importableRows(reviewRows(filas, opciones))[0]?.dailyNumber).toBe('0717')

    const otras = filasDe('Premio semanal,Premio diario\n1234,0045')
    expect(otras[0]?.dailyNumber).toBe('0045')
    expect(importableRows(reviewRows(otras, opciones))[0]?.dailyNumber).toBe('0045')
  })

  it('CASO 24 — el mismo archivo en CSV y en JSON da exactamente el mismo resultado', () => {
    const desdeCsv = reviewRows(filasDe(CSV), opciones)
    const desdeJson = reviewRows(parseJsonTickets(JSON_EQUIVALENTE), opciones)

    expect(importableRows(desdeJson)).toEqual(importableRows(desdeCsv))
    expect(desdeJson.rows.map((row) => row.expectedPaymentStatus)).toEqual(
      desdeCsv.rows.map((row) => row.expectedPaymentStatus),
    )
    expect(desdeJson.abonoTotal).toBe(desdeCsv.abonoTotal)

    // Y ese resultado es el que dice el encargo: 4 boletas, 3 clientes, 3 abonos.
    expect(desdeCsv).toMatchObject({ valid: 4, withClient: 4, withAbono: 3, abonoTotal: 190_000 })
    expect(desdeCsv.clients).toHaveLength(3)
    expect(desdeCsv.rows.map((row) => row.expectedPaymentStatus)).toEqual([
      'partial',
      'unpaid',
      'partial',
      'paid',
    ])
  })

  it('el JSON sigue aceptando las claves de siempre, mezcladas con las nuevas', () => {
    const filas = parseJsonTickets(
      JSON.stringify([
        {
          daily_number: '0717',
          weekly_number: '4992',
          client_name: 'Suegro',
          celular: '1111111125',
          abono: '50.000',
        },
        {
          dailyNumber: '9111',
          weeklyNumber: '3386',
          clientName: 'Jimmy',
          clientPhone: '1111111126',
        },
        {
          premio_diario: '7932',
          premio_semanal: '2207',
          cliente: 'Sara',
          telefono: '3214495114',
          Abono: '20',
        },
      ]),
    )

    expect(filas[0]).toMatchObject({ dailyNumber: '0717', clientName: 'Suegro', abono: '50.000' })
    expect(filas[1]).toMatchObject({ dailyNumber: '9111', clientName: 'Jimmy' })
    expect(filas[1]).not.toHaveProperty('abono')
    expect(filas[2]).toMatchObject({ dailyNumber: '7932', clientName: 'Sara', abono: '20' })
  })

  it('CASOS 22 y 23 — con marca BOM y con las columnas en otro orden', () => {
    const filas = filasDe(
      '﻿Abono;Premio diario;Nombre;Premio semanal;Celular\r\n20;0717;Suegro;4992;1111111125\r\n',
    )

    expect(filas[0]).toEqual({
      rowNumber: 1,
      dailyNumber: '0717',
      weeklyNumber: '4992',
      clientName: 'Suegro',
      clientPhone: '1111111125',
      abono: '20',
    })
    expect(reviewRows(filas, opciones).rows[0]).toMatchObject({
      status: 'valid',
      abonoAmount: 20_000,
    })
  })

  it('CASO 1 — un archivo de solo los dos números sigue funcionando igual que siempre', () => {
    const filas = filasDe('Premio semanal,Premio diario\n7607,3332\n3929,9654')
    const review = reviewRows(filas, opciones)

    expect(filas[0]).toEqual({ rowNumber: 1, dailyNumber: '3332', weeklyNumber: '7607' })
    expect(review).toMatchObject({ valid: 2, withClient: 0, withoutClient: 2, withAbono: 0 })
    expect(importableRows(review)).toEqual([
      { rowNumber: 1, dailyNumber: '3332', weeklyNumber: '7607' },
      { rowNumber: 2, dailyNumber: '9654', weeklyNumber: '3929' },
    ])
    expect(needsManualMapping(detectMapping(['Premio semanal', 'Premio diario']))).toBe(false)
  })

  it('CASOS 19, 20 y 21 — las reglas de los números no cambian al añadir el abono', () => {
    const review = reviewRows(
      [
        { rowNumber: 1, dailyNumber: '0717', weeklyNumber: '4992', abono: '' },
        // Mas de cuatro cifras y caracteres que no son digitos (BR-N02).
        { rowNumber: 2, dailyNumber: '12345', weeklyNumber: '4992' },
        { rowNumber: 3, dailyNumber: '12A4', weeklyNumber: '4992' },
        // Repetida dentro del propio archivo.
        { rowNumber: 4, dailyNumber: '0717', weeklyNumber: '4992' },
        // Ya existe en la rifa.
        { rowNumber: 5, dailyNumber: '9111', weeklyNumber: '3386' },
      ],
      { ...opciones, existingCombos: new Set(['9111/3386']) },
    )

    expect(review).toMatchObject({ valid: 1, invalid: 2, duplicates: 1, taken: 1 })
  })

  it('un archivo con «Abono» pero sin cliente reconocible para a preguntar', () => {
    const mapping = detectMapping(['Premio semanal', 'Premio diario', 'Abono'])

    expect(isMappingComplete(mapping)).toBe(true)
    expect(hasAbonoWithoutClientMapping(mapping)).toBe(true)
    expect(needsManualMapping(mapping)).toBe(true)
  })
})

describe('Los archivos de ejemplo que ofrece el importador', () => {
  const opciones = { allowClientAssignments: true, ticketPrice: PRECIO }

  /**
   * Se importan a si mismos.
   *
   * Es la prueba con menos aparato y la que mas vale: el ejemplo es lo primero
   * que descarga alguien que no ha importado nada nunca, y si no pasa su propia
   * vista previa, esa persona abandona en el primer intento. Ademas ata el
   * ejemplo a la lectura del archivo: anadir una columna al ejemplo sin
   * ensenarsela al importador rompe aqui.
   */
  it('el CSV con clientes y abonos pasa su propia vista previa', () => {
    const review = reviewRows(filasDe(SAMPLE_CSV_WITH_CLIENTS), opciones)

    expect(review.total).toBe(4)
    expect(review.valid).toBe(4)
    expect(review.invalid).toBe(0)
    // Tres con cliente y una sin vender; dos de las tres traen abono.
    expect(review).toMatchObject({ withClient: 3, withoutClient: 1, withAbono: 2 })
    expect(review.rows.map((row) => row.expectedPaymentStatus)).toEqual([
      'partial',
      'paid',
      'unpaid',
      null,
    ])
  })

  it('el JSON con clientes y abonos da exactamente lo mismo', () => {
    const desdeJson = reviewRows(parseJsonTickets(SAMPLE_JSON_WITH_CLIENTS), opciones)
    const desdeCsv = reviewRows(filasDe(SAMPLE_CSV_WITH_CLIENTS), opciones)

    expect(importableRows(desdeJson)).toEqual(importableRows(desdeCsv))
  })

  it('el ejemplo de solo dos columnas sigue siendo de solo dos columnas', () => {
    const review = reviewRows(filasDe(SAMPLE_CSV), opciones)

    expect(review).toMatchObject({ valid: 2, withClient: 0, withAbono: 0 })
    expect(reviewRows(parseJsonTickets(SAMPLE_JSON), opciones).valid).toBe(2)
  })
})
