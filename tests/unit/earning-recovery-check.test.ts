/**
 * La comprobación previa de la recuperación (D-239, `RUNBOOK` §10.6), sin base.
 *
 * `scripts/earning-recovery-check.ts` ejecuta en solo lectura el GUARDIA del script
 * de recuperación, leído del propio archivo, y clasifica el estado de las
 * migraciones. Aquí: que hay exactamente un guardia y que solo consulta, que el
 * estado sale del historial Y del esquema juntos —nunca de uno solo—, y el camino
 * que se imprime en cada caso. Contra la base se ensayó en los cuatro estados
 * (`TEST_RESULTS`, D-239) y `earning-agreements.test.ts` lo corre de verdad.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

import {
  classifyRelease,
  pathFor,
  RECOVERY_SQL,
  recoveryGuard,
  RELEASE_STATE_SQL,
  type ReleaseFacts,
} from '../../scripts/earning-recovery-check'

const SCRIPT = readFileSync(RECOVERY_SQL, 'utf8')

describe('R-01: el guardia es uno, del propio script, y solo consulta', () => {
  it('hay exactamente un guardia, y es el bloque que abre el script', () => {
    const guard = recoveryGuard(SCRIPT)
    expect(guard.startsWith('do $guard$')).toBe(true)
    expect(guard.endsWith('$guard$;')).toBe(true)
    // Va antes de cualquier cambio: la primera sentencia que escribe viene después.
    expect(SCRIPT.indexOf('-- guardia:fin')).toBeLessThan(
      SCRIPT.indexOf('create table commission_tiers'),
    )
  })

  it('no escribe, no instala y no cambia la sesión', () => {
    const sinLiterales = recoveryGuard(SCRIPT)
      .replace(/--.*$/gm, '')
      .replace(/'[^']*'/g, "''")
    expect(sinLiterales).not.toMatch(
      /\b(insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|copy|call|perform|lock|vacuum|analyze|refresh|comment|set_config|nextval)\b/i,
    )
  })

  it('dice TODAS las condiciones a la vez, no solo la primera', () => {
    const guard = recoveryGuard(SCRIPT)
    // Cuatro condiciones acumuladas y UNA excepción al final con todas.
    expect(guard.match(/motivos := motivos \|\|/g)).toHaveLength(4)
    expect(guard).toContain(
      "raise exception E'No se revierte:\\n%', array_to_string(motivos, E'\\n');",
    )
  })

  it('un script con dos guardias, o sin marcas, no se acepta', () => {
    expect(() => recoveryGuard('select 1;')).toThrow('exactamente un guardia')
    const doble = `-- guardia:inicio\nselect 1;\n-- guardia:fin\n-- guardia:inicio\nselect 2;\n-- guardia:fin`
    expect(() => recoveryGuard(doble)).toThrow('exactamente un guardia')
  })

  it('la consulta del estado solo lee', () => {
    expect(RELEASE_STATE_SQL.trim().toLowerCase()).toMatch(/^select\b/)
    expect(RELEASE_STATE_SQL).not.toMatch(
      /\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i,
    )
  })
})

describe('R-02: el estado sale del historial y del esquema juntos', () => {
  const base: ReleaseFacts = {
    ultima: '0077',
    desde_0077: ['0077'],
    tabla_0077: true,
    tabla_0078: false,
    funciones_0079: 0,
  }

  it('0077, 0078 y 0079 cuando los dos dicen lo mismo', () => {
    expect(classifyRelease(base)).toEqual({ estado: '0077', motivos: [] })
    expect(
      classifyRelease({
        ...base,
        ultima: '0078',
        desde_0077: ['0077', '0078'],
        tabla_0077: false,
        tabla_0078: true,
      }),
    ).toEqual({ estado: '0078', motivos: [] })
    expect(
      classifyRelease({
        ultima: '0079',
        desde_0077: ['0077', '0078', '0079'],
        tabla_0077: false,
        tabla_0078: true,
        funciones_0079: 2,
      }),
    ).toEqual({ estado: '0079', motivos: [] })
  })

  it.each([
    [
      'el historial dice 0079 y las funciones son de la 0078',
      {
        desde_0077: ['0077', '0078', '0079'],
        tabla_0077: false,
        tabla_0078: true,
        funciones_0079: 0,
      },
    ],
    [
      'el historial dice 0078 y el esquema sigue en 0077',
      {
        desde_0077: ['0077', '0078'],
        tabla_0077: true,
        tabla_0078: false,
        funciones_0079: 0,
      },
    ],
    [
      'el historial dice 0077 y el esquema ya migró',
      {
        desde_0077: ['0077'],
        tabla_0077: false,
        tabla_0078: true,
        funciones_0079: 0,
      },
    ],
    [
      'un historial con una migración posterior',
      {
        desde_0077: ['0077', '0078', '0079', '0080'],
        tabla_0077: false,
        tabla_0078: true,
        funciones_0079: 2,
      },
    ],
    [
      'una sola de las dos funciones de la 0079',
      {
        desde_0077: ['0077', '0078', '0079'],
        tabla_0077: false,
        tabla_0078: true,
        funciones_0079: 1,
      },
    ],
  ])('%s: incoherente, con su motivo', (_caso, parcial) => {
    const result = classifyRelease({ ...base, ...parcial })
    expect(result.estado).toBe('incoherente')
    expect(result.motivos.length).toBeGreaterThan(0)
  })
})

describe('R-03: el camino que corresponde', () => {
  it('desde 0079 se repara el historial de las DOS; desde 0078, solo de la 0078', () => {
    expect(pathFor('0079', 'se_puede_volver').join('\n')).toContain('--status reverted 0079 0078')
    const desde0078 = pathFor('0078', 'se_puede_volver').join('\n')
    expect(desde0078).toContain('--status reverted 0078 ')
    expect(desde0078).not.toContain('reverted 0079')
    expect(desde0078).toContain('CONTINUAR')
    expect(desde0078).toContain('SOLO 0079')
  })

  it('la recuperación va con su ejecutable, su foto de referencia y lock_timeout, y el código anterior DESPUÉS', () => {
    const lines = pathFor('0079', 'se_puede_volver')
    // `psql` no está en el equipo desde el que se opera: la orden es la del repositorio (D-240).
    expect(lines.join('\n')).not.toContain('psql')
    expect(lines[1]).toContain('scripts/earning-recovery.ts <foto de antes de migrar>')
    expect(lines[1]).toContain('--lock-timeout 5s')
    expect(lines.findIndex((l) => l.includes('código anterior'))).toBeGreaterThan(
      lines.findIndex((l) => l.includes('migration repair')),
    )
  })

  it('si no se puede volver, no se sirve el código anterior ni se fuerza nada', () => {
    const text = pathFor('0079', 'no_se_puede_volver').join('\n')
    expect(text).toContain('NO se vuelve al código anterior')
    expect(text).toContain('la pausa CERRADA y el código nuevo')
    expect(text).toContain('Nunca se fuerza la recuperación')
  })

  it('un estado incoherente detiene sin reparar nada', () => {
    const text = pathFor('incoherente', 'incoherente').join('\n')
    expect(text).toContain('DETENER')
    expect(text).toContain('no se marca ninguna migración')
  })
})
