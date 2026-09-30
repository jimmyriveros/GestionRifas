/**
 * LA RESTAURACIÓN QUE SE DETIENE ANTE EL PRIMER FALLO, sin base (D-240, `RUNBOOK` §5.2).
 *
 * `scripts/restore-backup.ts` ejecuta el vaciado, los tres archivos del respaldo y el
 * paso posterior, cada uno solo si el anterior terminó. Aquí se prueba lo que decide sin
 * conectarse: cómo parte `roles.sql`, cuál es el ÚNICO error que tolera y qué respaldo se
 * niega a cargar antes de tocar nada. Que un vaciado que se niega no deja pasar ninguna
 * fila se prueba contra la base (`tests/db/restore-backup.test.ts`).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

import {
  AFTER_RESTORE_SQL,
  backupProblems,
  EMPTY_PUBLIC_SQL,
  parseOptions,
  RESTORE_STEPS,
  splitRoleStatements,
  toleratedRoleError,
  type BackupFiles,
} from '../../scripts/restore-backup'

/** La forma real de un `roles.sql` de `supabase db dump --role-only` (sin datos). */
const ROLES = [
  '',
  'SET default_transaction_read_only = off;',
  '',
  "SET client_encoding = 'UTF8';",
  'SET standard_conforming_strings = on;',
  '',
  '--',
  '-- Roles',
  '--',
  `ALTER ROLE "anon" SET "statement_timeout" TO '3s';`,
  `ALTER ROLE "authenticated" SET "statement_timeout" TO '8s';`,
  'GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin";',
  '',
  'RESET ALL;',
  '',
].join('\n')
const GRANT = 'GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin";'

const respaldo = (parcial: Partial<BackupFiles> = {}): BackupFiles => ({
  roles: ROLES,
  schema: 'SET statement_timeout = 0;\nCREATE TABLE IF NOT EXISTS "public"."t" ("id" integer);\n',
  data: 'SET session_replication_role = replica;\n-- \\restrict abc\nINSERT INTO "public"."t" ("id") VALUES\n\t(1);\nRESET ALL;\n',
  ...parcial,
})

describe('B1 — el orden de los pasos y sus guardas', () => {
  it('B1-01: vaciar, roles, esquema, datos y el paso posterior, en ese orden', () => {
    expect([...RESTORE_STEPS]).toEqual([
      'vaciar public',
      'roles.sql',
      'schema.sql',
      'data.sql',
      'después de restaurar',
    ])
  })

  it('B1-02: el vaciado comprueba la pausa ANTES de borrar nada, en una sola transacción', () => {
    const script = readFileSync(EMPTY_PUBLIC_SQL, 'utf8')
    const guarda = script.indexOf('La pausa de publicación no está cerrada: no se vacía public')
    const primerBorrado = script.indexOf("execute format('drop")
    expect(guarda).toBeGreaterThan(0)
    expect(primerBorrado).toBeGreaterThan(guarda)
    expect(script.match(/^begin;$/gm)).toHaveLength(1)
    expect(script.match(/^commit;$/gm)).toHaveLength(1)
  })

  it('B1-03: el paso posterior también exige la pausa cerrada y public restaurado', () => {
    const script = readFileSync(AFTER_RESTORE_SQL, 'utf8')
    expect(script).toContain('La pausa de publicación no está cerrada. No se cambió nada.')
    expect(script).toContain('public no está restaurado')
    expect(script.indexOf('raise exception')).toBeLessThan(script.indexOf('create trigger'))
  })
})

describe('B2 — roles.sql, sentencia por sentencia', () => {
  it('B2-01: cada línea es una sentencia; los comentarios y los huecos no cuentan', () => {
    expect(splitRoleStatements(ROLES)).toEqual([
      'SET default_transaction_read_only = off;',
      "SET client_encoding = 'UTF8';",
      'SET standard_conforming_strings = on;',
      `ALTER ROLE "anon" SET "statement_timeout" TO '3s';`,
      `ALTER ROLE "authenticated" SET "statement_timeout" TO '8s';`,
      GRANT,
      'RESET ALL;',
    ])
    expect(splitRoleStatements(ROLES.replace(/\n/g, '\r\n'))).toHaveLength(7)
    expect(splitRoleStatements('-- nada\n\n')).toEqual([])
  })

  it('B2-02: una sentencia partida, con cuerpo o con una cadena abierta no se parte a ciegas', () => {
    for (const raro of [
      'ALTER ROLE "anon"\n  SET "statement_timeout" TO \'3s\';',
      'DO $$ begin null; end $$;',
      'ALTER ROLE "anon" SET "x" TO \'a;',
      'RESET ALL',
    ]) {
      expect(() => splitRoleStatements(raro)).toThrow(/no sabe partirla/)
    }
  })
})

describe('B3 — la única excepción: esa sentencia, con ese código', () => {
  it('B3-01: `GRANT SET ON PARAMETER "log_min_messages"` con 42501 se tolera', () => {
    expect(toleratedRoleError(GRANT, '42501')).toBe(true)
    expect(
      toleratedRoleError('GRANT SET ON PARAMETER "log_min_messages" TO "otro_rol";', '42501'),
    ).toBe(true)
  })

  it('B3-02: la misma sentencia con otro error NO se tolera', () => {
    for (const code of ['42704', '55P03', '57014', '08006', 'XX000', undefined]) {
      expect(toleratedRoleError(GRANT, code)).toBe(false)
    }
  })

  it('B3-03: otra sentencia con ese mismo código NO se tolera', () => {
    for (const statement of [
      `ALTER ROLE "anon" SET "statement_timeout" TO '3s';`,
      'GRANT SET ON PARAMETER "statement_timeout" TO "supabase_realtime_admin";',
      'GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin"; DROP TABLE x;',
      'GRANT ALL ON SCHEMA public TO "anon";',
      `CREATE ROLE "log_min_messages";`,
      'RESET ALL;',
    ]) {
      expect(toleratedRoleError(statement, '42501')).toBe(false)
    }
  })
})

describe('B4 — el respaldo se comprueba antes de conectar', () => {
  it('B4-01: un respaldo con la forma de siempre se acepta; un `\\restrict` comentado no estorba', () => {
    expect(backupProblems(respaldo())).toEqual([])
  })

  it('B4-02: un archivo vacío se rechaza, sea cual sea', () => {
    expect(backupProblems(respaldo({ roles: '  \n' }))).toEqual(['roles.sql está vacío.'])
    expect(backupProblems(respaldo({ schema: '' }))[0]).toBe('schema.sql está vacío.')
    expect(backupProblems(respaldo({ data: '' }))[0]).toBe('data.sql está vacío.')
  })

  it('B4-03: órdenes de psql o un COPY desde la entrada se rechazan, con el archivo que las trae', () => {
    const base = respaldo()
    expect(backupProblems(respaldo({ schema: `\\restrict abc\n${base.schema}` }))[0]).toMatch(
      /^schema\.sql trae órdenes de psql/,
    )
    expect(backupProblems(respaldo({ schema: `${base.schema}\\connect otra\n` }))[0]).toMatch(
      /^schema\.sql trae/,
    )
    expect(
      backupProblems(
        respaldo({
          data: 'INSERT INTO "public"."t" VALUES (1);\nCOPY "public"."t" ("id") FROM stdin;\n1\n\\.\n',
        }),
      )[0],
    ).toMatch(/^data\.sql trae órdenes de psql/)
  })

  it('B4-04: un volcado de datos que nombra el esquema auth no se carga', () => {
    const problemas = backupProblems(
      respaldo({
        data: 'INSERT INTO "auth"."users" ("id") VALUES (1);\nINSERT INTO "public"."t" VALUES (1);\n',
      }),
    )
    expect(problemas).toHaveLength(1)
    expect(problemas[0]).toMatch(/nombra el esquema «auth»/)
    // Una COLUMNA llamada auth —la de push_subscriptions— no es el esquema (RUNBOOK §5.1).
    expect(
      backupProblems(
        respaldo({ data: 'INSERT INTO "public"."push_subscriptions" ("auth") VALUES (\'x\');\n' }),
      ),
    ).toEqual([])
  })

  it('B4-05: un esquema sin tablas, unos datos sin filas o unos roles que no se saben partir, tampoco', () => {
    expect(backupProblems(respaldo({ schema: 'SET statement_timeout = 0;\n' }))).toEqual([
      'schema.sql no crea ninguna tabla.',
    ])
    expect(backupProblems(respaldo({ data: 'RESET ALL;\n' }))).toEqual([
      'data.sql no inserta ninguna fila.',
    ])
    expect(backupProblems(respaldo({ roles: 'DO $$ begin null; end $$;' }))[0]).toMatch(
      /no sabe partirla/,
    )
  })
})

describe('B5 — la orden', () => {
  it('B5-01: la carpeta y un solo destino; nada más', () => {
    expect(parseOptions(['../respaldo', '--local'])).toEqual({
      target: { kind: 'local', projectRef: null },
      folder: '../respaldo',
    })
    expect(
      parseOptions(['r', '--production', '--project-ref', 'proyectoficticioabcd']).target,
    ).toEqual({
      kind: 'production',
      projectRef: 'proyectoficticioabcd',
    })
    expect(() => parseOptions(['--local'])).toThrow(/Falta la carpeta del respaldo/)
    expect(() => parseOptions(['r'])).toThrow(/un solo destino/)
    expect(() => parseOptions(['r', '--local', '--production'])).toThrow(/un solo destino/)
    expect(() => parseOptions(['r', '--local', '--seguir-aunque-falle'])).toThrow(/No reconozco/)
    expect(() => parseOptions(['r', 'otra', '--local'])).toThrow(/No reconozco «otra»/)
  })
})
