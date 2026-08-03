import { describe, expect, it } from 'vitest'

import { formatDateEs, todayBogota } from '@/lib/dates'

describe('todayBogota', () => {
  it('devuelve una fecha en formato YYYY-MM-DD', () => {
    expect(todayBogota()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatDateEs', () => {
  it('formatea una fecha UTC interpretandola en America/Bogota', () => {
    const result = formatDateEs('2026-01-15T12:00:00Z')
    expect(result).toContain('2026')
    expect(result).toContain('15')
  })

  it('un pago tarde en la noche de Bogota no cruza al dia siguiente en UTC', () => {
    // 23:30 en Bogota (UTC-5) del dia 31 equivale a 04:30 UTC del dia 1.
    // formatDateEs debe seguir mostrando el 31, no el 1.
    const result = formatDateEs('2026-02-01T04:30:00Z')
    expect(result).toContain('31')
  })
})
