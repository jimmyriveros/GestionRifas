import { describe, expect, it } from 'vitest'

import {
  detectMapping,
  isMappingComplete,
  matchColumn,
  normalizeHeader,
} from '@/features/tickets/import/columns'
import { parseCsv } from '@/features/tickets/import/csv'
import { ImportParseError } from '@/features/tickets/import/errors'
import { parseJsonTickets } from '@/features/tickets/import/json'
import { importableRows, reviewRows } from '@/features/tickets/import/review'
import { tableToRows } from '@/features/tickets/import/rows'

/**
 * Importacion de boletas desde CSV y JSON (BR-N12, D-081).
 *
 * Toda la capa de lectura y revision es PURA, asi que se prueba aqui entera:
 * formatos de archivo, reconocimiento de encabezados, mapeo manual y los
 * estados de cada fila. Lo que necesita base de datos —que una combinacion ya
 * exista en la rifa, los permisos, el guardado— se prueba en `tests/db` y en
 * las end-to-end.
 *
 * La regla que se vigila en casi todos los casos es la misma: los numeros son
 * TEXTO. «0046» entra y sale «0046»; «46» entra y sale «46».
 */

/** Lee un CSV y lo deja en filas, como hace el importador. */
function filasDe(csv: string) {
  const table = parseCsv(csv)
  const mapping = detectMapping(table.headers)
  expect(isMappingComplete(mapping)).toBe(true)
  return tableToRows(table, mapping)
}

describe('normalizeHeader y matchColumn', () => {
  it('reconoce el encabezado escrito de todas las formas razonables', () => {
    for (const header of [
      'Premio semanal',
      'premio semanal',
      'Premio Semanal',
      'premio_semanal',
      '  PREMIO   SEMANAL  ',
      'weekly_number',
      'weekly number',
      'Weekly Number',
    ]) {
      expect(matchColumn(header), header).toBe('weekly')
    }

    for (const header of [
      'Premio diario',
      'premio diario',
      'Premio Diario',
      'premio_diario',
      'daily_number',
      'daily number',
      'Daily Number',
    ]) {
      expect(matchColumn(header), header).toBe('daily')
    }
  })

  it('normaliza acentos para reconocer, pero eso no toca ningun valor', () => {
    expect(normalizeHeader('Número Diario')).toBe('numero diario')
    expect(matchColumn('Número diario')).toBe('daily')
  })

  it('no reconoce una columna que no es ninguna de las dos', () => {
    expect(matchColumn('#')).toBeNull()
    expect(matchColumn('Observaciones')).toBeNull()
    expect(matchColumn('')).toBeNull()
  })
})

describe('CSV', () => {
  it('CASO 1 — archivo minimo: dos columnas y cuatro boletas', () => {
    const filas = filasDe('Premio semanal,Premio diario\n7607,3332\n3929,9654\n540,6265\n1180,6905')

    expect(filas).toHaveLength(4)
    expect(filas[0]).toEqual({ rowNumber: 1, dailyNumber: '3332', weeklyNumber: '7607' })
    expect(filas[3]).toEqual({ rowNumber: 4, dailyNumber: '6905', weeklyNumber: '1180' })
  })

  it('CASO 2 — la columna «#» es informativa y se ignora', () => {
    const filas = filasDe('#,Premio semanal,Premio diario\n1,7607,3332\n2,3929,9654')

    expect(filas).toHaveLength(2)
    expect(filas[0]).toEqual({ rowNumber: 1, dailyNumber: '3332', weeklyNumber: '7607' })
  })

  it('CASO 3 — tal como lo exporta Excel: marca BOM y saltos de linea de Windows', () => {
    const filas = filasDe('﻿Premio semanal,Premio diario\r\n7607,3332\r\n3929,9654\r\n')

    expect(filas).toHaveLength(2)
    expect(filas[0]?.weeklyNumber).toBe('7607')
  })

  it('CASO 4 — separado por punto y coma, que es lo que da Excel en español', () => {
    const table = parseCsv('Premio semanal;Premio diario\n7607;3332\n3929;9654')
    expect(table.delimiter).toBe(';')

    const filas = tableToRows(table, detectMapping(table.headers))
    expect(filas[0]).toEqual({ rowNumber: 1, dailyNumber: '3332', weeklyNumber: '7607' })
  })

  it('aguanta espacios sobrantes alrededor de encabezados y valores', () => {
    const filas = filasDe(' Premio semanal , Premio diario \n 7607 , 3332 ')
    expect(filas[0]).toEqual({ rowNumber: 1, dailyNumber: '3332', weeklyNumber: '7607' })
  })

  it('respeta las comillas: una celda entrecomillada no se parte por el separador', () => {
    const table = parseCsv('"Premio, semanal","Premio diario"\n"7607","3332"')
    expect(table.headers).toEqual(['Premio, semanal', 'Premio diario'])
    expect(table.rows[0]).toEqual(['7607', '3332'])
  })

  it('descarta las filas en blanco que Excel deja al final', () => {
    const filas = filasDe('Premio semanal,Premio diario\n7607,3332\n\n,\n')
    expect(filas).toHaveLength(1)
  })

  it('rechaza el archivo entero solo cuando no hay nada que leer', () => {
    expect(() => parseCsv('')).toThrow(ImportParseError)
    expect(() => parseCsv('   \n  ')).toThrow(ImportParseError)
    expect(() => parseCsv('Premio semanal\n7607')).toThrow(/dos columnas/)
  })

  it('CASO 7 — con encabezados desconocidos no rechaza: pide el mapeo', () => {
    const table = parseCsv('Columna A,Columna B\n7607,3332')
    const mapping = detectMapping(table.headers)

    expect(isMappingComplete(mapping)).toBe(false)
    expect(table.rows).toHaveLength(1)
  })

  it('CASO 8 — con el mapeo puesto a mano, las filas salen bien', () => {
    const table = parseCsv('Columna A,Columna B\n7607,3332')
    // La persona eligio: A es el semanal, B es el diario.
    const filas = tableToRows(table, { weekly: 0, daily: 1 })

    expect(filas[0]).toEqual({ rowNumber: 1, dailyNumber: '3332', weeklyNumber: '7607' })
  })
})

describe('JSON', () => {
  it('CASO 5 — formato canonico', () => {
    const filas = parseJsonTickets(
      JSON.stringify([
        { weekly_number: '7607', daily_number: '3332' },
        { weekly_number: '3929', daily_number: '9654' },
      ]),
    )

    expect(filas).toHaveLength(2)
    expect(filas[0]).toEqual({ rowNumber: 1, dailyNumber: '3332', weeklyNumber: '7607' })
  })

  it('acepta los nombres en español', () => {
    const filas = parseJsonTickets('[{"premio_semanal":"7607","premio_diario":"3332"}]')
    expect(filas[0]).toEqual({ rowNumber: 1, dailyNumber: '3332', weeklyNumber: '7607' })
  })

  it('un numero sin comillas se acepta y se convierte a texto sin perder nada', () => {
    // JSON no admite ceros a la izquierda en un numero, asi que no hay forma de
    // que este camino pierda un cero: `0046` ni siquiera seria JSON valido.
    const filas = parseJsonTickets('[{"weekly_number":7607,"daily_number":3332}]')
    expect(filas[0]?.dailyNumber).toBe('3332')
    expect(typeof filas[0]?.dailyNumber).toBe('string')
  })

  it('CASO 6 — rechaza el archivo cuando no hay nada que interpretar', () => {
    expect(() => parseJsonTickets('{')).toThrow(/mal escrito/)
    expect(() => parseJsonTickets('[]')).toThrow(/ninguna boleta/)
    expect(() => parseJsonTickets('{"weekly_number":"1"}')).toThrow(/lista de boletas/)
    expect(() => parseJsonTickets('[{"otra_cosa":"1"}]')).toThrow(/no encontramos los números/i)
  })

  it('un objeto suelto sin un campo NO tumba el archivo: llega como fila incompleta', () => {
    const filas = parseJsonTickets(
      '[{"weekly_number":"7607","daily_number":"3332"},{"weekly_number":"3929"}]',
    )

    expect(filas).toHaveLength(2)
    expect(filas[1]).toEqual({ rowNumber: 2, dailyNumber: '', weeklyNumber: '3929' })
  })
})

describe('Revision de las filas', () => {
  const fila = (rowNumber: number, dailyNumber: string, weeklyNumber: string) => ({
    rowNumber,
    dailyNumber,
    weeklyNumber,
  })

  it('CASO 13 — los ceros de delante se conservan, y «46» no se convierte en «0046»', () => {
    const review = reviewRows([fila(1, '0046', '0007'), fila(2, '46', '7')])

    expect(review.valid).toBe(2)
    expect(importableRows(review)).toEqual([
      { rowNumber: 1, dailyNumber: '0046', weeklyNumber: '0007' },
      { rowNumber: 2, dailyNumber: '46', weeklyNumber: '7' },
    ])
  })

  it('CASO 9 y 10 — falta uno de los dos numeros', () => {
    const review = reviewRows([fila(1, '3332', ''), fila(2, '', '7607')])

    expect(review.invalid).toBe(2)
    expect(review.rows[0]?.status).toBe('invalid')
    expect(review.rows[0]?.problem).toMatch(/le falta uno de los dos números/)
    expect(review.rows[1]?.problem).toMatch(/le falta uno de los dos números/)
  })

  it('CASO 11 — mas de cuatro digitos', () => {
    const review = reviewRows([fila(1, '9999', '12345')])

    expect(review.invalid).toBe(1)
    expect(review.rows[0]?.problem).toBe('El número semanal debe tener entre 1 y 4 dígitos.')
  })

  it('CASO 12 — letras y simbolos', () => {
    const review = reviewRows([fila(1, '12A4', '7607'), fila(2, '-123', '12.5')])

    expect(review.invalid).toBe(2)
    expect(review.rows[0]?.problem).toBe('El número diario debe tener entre 1 y 4 dígitos.')
    expect(review.rows[1]?.problem).toMatch(/diario.*semanal/s)
  })

  it('CASO 14 — combinacion repetida dentro del propio archivo', () => {
    const review = reviewRows([
      fila(1, '3332', '7607'),
      fila(2, '9654', '3929'),
      fila(3, '3332', '7607'),
    ])

    expect(review.valid).toBe(2)
    expect(review.duplicates).toBe(1)
    // La primera aparicion se conserva; la copia es la que se marca.
    expect(review.rows[0]?.status).toBe('valid')
    expect(review.rows[2]?.status).toBe('duplicate')
    expect(review.rows[2]?.problem).toMatch(/repetida en la fila 1/i)
  })

  it('CASO 15 — combinacion que ya existe en la rifa', () => {
    const review = reviewRows(
      [fila(1, '3332', '7607'), fila(2, '9654', '3929')],
      new Set(['3332/7607']),
    )

    expect(review.taken).toBe(1)
    expect(review.valid).toBe(1)
    expect(review.rows[0]?.status).toBe('taken')
    // No se dice de quien es: para un vendedor, revelarlo seria filtrar datos
    // de otro vendedor (BR-U07).
    expect(review.rows[0]?.problem).toBe('Esa combinación ya existe en esta rifa.')
    expect(review.rows[0]?.problem).not.toMatch(/vendedor/i)
  })

  it('el resumen cuadra: total = validas + repetidas + tomadas + invalidas', () => {
    const review = reviewRows(
      [
        fila(1, '3332', '7607'),
        fila(2, '9654', '3929'),
        fila(3, '3332', '7607'),
        fila(4, '12345', '9999'),
        fila(5, '0001', '0002'),
      ],
      new Set(['0001/0002']),
    )

    expect(review.total).toBe(5)
    expect(review.valid + review.duplicates + review.taken + review.invalid).toBe(review.total)
    expect(review).toMatchObject({ valid: 2, duplicates: 1, taken: 1, invalid: 1 })
  })

  it('CASO 17 — 1.000 filas se revisan sin despeinarse', () => {
    const filas = Array.from({ length: 1000 }, (_, index) =>
      fila(
        index + 1,
        String(index % 10000).padStart(4, '0'),
        String(9999 - index).padStart(4, '0'),
      ),
    )

    const inicio = performance.now()
    const review = reviewRows(filas)
    const tardanza = performance.now() - inicio

    expect(review.total).toBe(1000)
    expect(review.valid).toBe(1000)
    // Holgado a proposito: lo que se comprueba es que no sea cuadratico.
    expect(tardanza).toBeLessThan(500)
  })
})
