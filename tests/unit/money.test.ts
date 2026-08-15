import { describe, expect, it } from 'vitest'

import { formatCOP, parseCOP } from '@/lib/money'

describe('formatCOP', () => {
  it('formatea cero', () => {
    expect(formatCOP(0)).toBe('$0')
  })

  it('formatea con separador de miles colombiano', () => {
    expect(formatCOP(25_000)).toBe('$25.000')
    expect(formatCOP(100_000)).toBe('$100.000')
    // El precio vigente de la boleta, tal como debe verse en pantalla (BR-P01).
    expect(formatCOP(120_000)).toBe('$120.000')
  })

  it('no deja espacio entre el simbolo y la cifra', () => {
    expect(formatCOP(100_000)).not.toMatch(/\s/)
  })

  it('formatea montos grandes (1000 boletas x $120.000)', () => {
    expect(formatCOP(120_000_000)).toBe('$120.000.000')
  })
})

describe('parseCOP', () => {
  it('extrae el entero de una entrada formateada', () => {
    expect(parseCOP('$100.000')).toBe(100_000)
  })

  it('extrae digitos aunque no tengan formato de moneda', () => {
    expect(parseCOP('25.000')).toBe(25_000)
  })

  it('devuelve null para entrada vacia o sin digitos', () => {
    expect(parseCOP('')).toBeNull()
    expect(parseCOP('abc')).toBeNull()
  })
})
