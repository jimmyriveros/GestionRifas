import { describe, expect, it } from 'vitest'

import {
  comboKey,
  countErrors,
  hasErrors,
  isComplete,
  isEmptyRow,
  selectSendableRows,
  validateBulkRows,
} from '@/features/tickets/bulk/duplicates'
import type { BulkTicketRow } from '@/features/tickets/schemas'

/**
 * Validacion por fila de la creacion masiva (CLAUDE.md 15, BR-N10).
 * Cubre las pruebas obligatorias 7, 8 y 9 de la Fase 3.
 */

function row(dailyNumber: string, weeklyNumber: string): BulkTicketRow {
  return { dailyNumber, weeklyNumber }
}

describe('comboKey', () => {
  it('distingue combinaciones con ceros iniciales (BR-N03)', () => {
    expect(comboKey('0007', '0012')).not.toBe(comboKey('7', '12'))
  })
})

describe('isComplete / isEmptyRow', () => {
  it('una fila con los dos numeros esta completa', () => {
    expect(isComplete(row('1234', '5678'))).toBe(true)
    expect(isEmptyRow(row('1234', '5678'))).toBe(false)
  })

  it('una fila sin ningun numero es un borrador valido', () => {
    expect(isComplete(row('', ''))).toBe(false)
    expect(isEmptyRow(row('', ''))).toBe(true)
  })
})

describe('validateBulkRows: formato de los numeros', () => {
  it('acepta de 1 a 4 digitos y conserva los ceros iniciales', () => {
    const result = validateBulkRows([row('1', '0000'), row('007', '9999')])
    expect(hasErrors(result)).toBe(false)
  })

  it('rechaza mas de 4 digitos (prueba obligatoria 7)', () => {
    const result = validateBulkRows([row('12345', '1234')])
    expect(result[0]?.dailyError).toBeDefined()
    expect(countErrors(result)).toBe(1)
  })

  it('rechaza caracteres que no son digitos', () => {
    const result = validateBulkRows([row('12A4', '1234'), row('-123', '1234'), row('12.5', '1')])
    expect(result[0]?.dailyError).toBeDefined()
    expect(result[1]?.dailyError).toBeDefined()
    expect(result[2]?.dailyError).toBeDefined()
  })

  it('exige los dos numeros o ninguno (BR-N09)', () => {
    const result = validateBulkRows([row('1234', ''), row('', '5678')])
    expect(result[0]?.rowError).toContain('los dos numeros')
    expect(result[1]?.rowError).toContain('los dos numeros')
  })

  it('acepta filas completamente vacias como borrador', () => {
    const result = validateBulkRows([row('', ''), row('', '')])
    expect(hasErrors(result)).toBe(false)
  })
})

describe('validateBulkRows: duplicados dentro del formulario (prueba obligatoria 8)', () => {
  it('marca la segunda aparicion e indica la fila original', () => {
    const result = validateBulkRows([row('1234', '5678'), row('0001', '0002'), row('1234', '5678')])
    expect(result[0]?.rowError).toBeUndefined()
    expect(result[2]?.rowError).toBe('Combinacion repetida en la fila 1.')
  })

  it('no considera duplicado un numero individual repetido (BR-N07)', () => {
    const result = validateBulkRows([row('1234', '5678'), row('1234', '9999'), row('0001', '5678')])
    expect(hasErrors(result)).toBe(false)
  })

  it('no confunde 0007/0012 con 7/12 (BR-N03)', () => {
    const result = validateBulkRows([row('0007', '0012'), row('7', '12')])
    expect(hasErrors(result)).toBe(false)
  })

  it('marca todas las repeticiones posteriores, no solo la segunda', () => {
    const result = validateBulkRows([row('1', '1'), row('1', '1'), row('1', '1')])
    expect(countErrors(result)).toBe(2)
  })
})

describe('validateBulkRows: duplicados ya existentes en la base de datos (prueba obligatoria 9)', () => {
  it('marca la combinacion que ya existe en la rifa, sea de quien sea', () => {
    const existingCombos = new Set(['1234/5678'])
    const result = validateBulkRows([row('1234', '5678'), row('1234', '0001')], { existingCombos })
    expect(result[0]?.rowError).toBe('Esa combinacion ya existe en esta rifa.')
    expect(result[1]?.rowError).toBeUndefined()
  })

  it('sin combinaciones existentes no marca nada', () => {
    const result = validateBulkRows([row('1234', '5678')], { existingCombos: new Set() })
    expect(hasErrors(result)).toBe(false)
  })
})

describe('selectSendableRows', () => {
  it('envia solo las filas sin errores y conserva su indice original', () => {
    const rows = [row('1234', '5678'), row('12345', '1'), row('', ''), row('1234', '5678')]
    const validations = validateBulkRows(rows)
    const sendable = selectSendableRows(rows, validations)

    expect(sendable.map((item) => item.index)).toEqual([0, 2])
  })
})

describe('rendimiento con el lote maximo', () => {
  it('valida 1.000 filas sin degradarse', () => {
    const rows = Array.from({ length: 1000 }, (_, index) =>
      row(String(index % 10000).padStart(4, '0'), String((index + 1) % 10000).padStart(4, '0')),
    )

    const started = performance.now()
    const result = validateBulkRows(rows)
    const elapsed = performance.now() - started

    expect(result).toHaveLength(1000)
    expect(hasErrors(result)).toBe(false)
    // Umbral holgado: solo detecta que la validacion no sea cuadratica.
    expect(elapsed).toBeLessThan(500)
  })
})
