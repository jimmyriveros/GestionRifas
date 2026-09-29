/**
 * El diagnóstico previo de la `0078`, sin base (D-238, `RUNBOOK` §10.1).
 *
 * `scripts/earning-precheck.ts` lee el esquema ANTERIOR (`0077`) dentro de una
 * transacción `repeatable read read only` de `gate-db.ts`. Aquí se prueba lo que no
 * necesita base: que ninguna de sus consultas escribe ni instala nada, que no lee
 * tablas que solo existen después de migrar, y cómo decide el veredicto. Contra una
 * base local en `0077` con los problemas sembrados se ensayó entero (`TEST_RESULTS`,
 * D-238): encontró los cinco y predijo exactamente lo que después listó
 * `commission_agreement_problems()`.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

import {
  DISCOUNTS_SQL,
  FIXED_CAP_SQL,
  LEDGER_SQL,
  PAIRS_SQL,
  RECOUNT_SQL,
  SCHEMA_SQL,
  SHORTFALL_SQL,
  THREE_LEVELS_SQL,
  TIERS_SQL,
  tierProblems,
  verdict,
  VOLUME_SQL,
  type Finding,
} from '../../scripts/earning-precheck'

const CONSULTAS = {
  RECOUNT_SQL,
  LEDGER_SQL,
  TIERS_SQL,
  THREE_LEVELS_SQL,
  FIXED_CAP_SQL,
  PAIRS_SQL,
  SHORTFALL_SQL,
  DISCOUNTS_SQL,
  SCHEMA_SQL,
  VOLUME_SQL,
}

describe('P-01: el diagnóstico solo lee', () => {
  it.each(Object.entries(CONSULTAS))(
    '%s no escribe, no instala y no cambia la sesión',
    (_nombre, sql) => {
      expect(sql.trim().toLowerCase()).toMatch(/^(with|select)\b/)
      expect(sql).not.toMatch(
        /\b(insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|copy|call|do|perform|set|lock|vacuum|analyze|refresh|comment)\b/i,
      )
    },
  )

  it('no lee ninguna tabla que solo exista después de la 0078', () => {
    for (const [nombre, sql] of Object.entries(CONSULTAS)) {
      // El esquema pregunta por ellas como texto, para saber si ya se migró.
      const sinLiterales = sql.replace(/'[^']*'/g, "''")
      expect(sinLiterales, nombre).not.toMatch(
        /\b(commission_tier_lists|commission_tier_list_items|direct_commission_mode|direct_fixed_amount|direct_tier_list_id|team_tier_list_id|tier_tickets_paid|team_shortfall)\b/,
      )
    }
  })
})

describe('P-02: los tramos que la 0078 no aceptaría (BR-G32)', () => {
  const base = {
    tramos: 4,
    primero: 1,
    ultimo_desde: 51,
    tarifa_maxima: 40_000,
    no_crece: false,
    integrantes_por_tramos_que_cobraron: false,
  }

  it('una lista válida no tiene problemas', () => {
    expect(tierProblems(base)).toEqual([])
  })

  it('sin tramos solo bloquea si ya cobraron integrantes por tramos', () => {
    expect(tierProblems({ ...base, tramos: 0 })).toEqual([])
    expect(tierProblems({ ...base, tramos: 0, integrantes_por_tramos_que_cobraron: true })).toEqual(
      ['sin tramos y con integrantes por tramos que ya cobraron'],
    )
  })

  it('cada regla, por separado', () => {
    expect(tierProblems({ ...base, tramos: 21 })).toEqual(['21 tramos (máximo 20)'])
    expect(tierProblems({ ...base, primero: 2 })).toEqual(['el primer tramo empieza en 2'])
    expect(tierProblems({ ...base, ultimo_desde: 100_001 })).toEqual([
      'un tramo empieza después de la boleta 100.000',
    ])
    expect(tierProblems({ ...base, tarifa_maxima: 10_000_001 })).toEqual([
      'una tarifa pasa de $10.000.000',
    ])
    expect(tierProblems({ ...base, no_crece: true })).toEqual([
      'un tramo no paga más que el anterior',
    ])
  })
})

describe('P-03: el veredicto lo pone lo más grave', () => {
  const hallazgo = (gravedad: Finding['gravedad'], filas: number): Finding => ({
    codigo: gravedad,
    gravedad,
    titulo: gravedad,
    filas: Array.from({ length: filas }, (_, i) => ({ i })),
  })

  it('sin filas en ningún hallazgo, limpio; lo informativo no cuenta', () => {
    expect(verdict([hallazgo('bloquea', 0), hallazgo('decide', 0), hallazgo('informa', 3)])).toBe(
      'limpio',
    )
  })

  it('lo que el dueño decide detiene, y lo que la 0078 no aceptaría detiene antes', () => {
    expect(verdict([hallazgo('decide', 1), hallazgo('informa', 1)])).toBe('decide')
    expect(verdict([hallazgo('decide', 1), hallazgo('bloquea', 1)])).toBe('bloquea')
  })
})
