/**
 * La pausa de publicación (D-239, `RUNBOOK` §10), sin base.
 *
 * La base es la que impide operar (`supabase/maintenance/pausa.sql`); contra la
 * pila local se prueba en `tests/db/maintenance-pause.test.ts` y en la E2E
 * `pausa-publicacion.spec.ts`. Aquí, lo que no necesita base:
 *
 *   · que el SQL y la aplicación dicen lo mismo —código, estado, texto y cerrojo—,
 *     comparados letra por letra y no con la función que lo produce;
 *   · que la pausa no toca `public` y solo la ejecutan los tres roles de la API;
 *   · que la herramienta no acepta una orden a medias;
 *   · y que ninguna guarda confunde la pausa con una cuenta inactiva (I-115).
 */
import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`)
  }),
}))

import { redirect } from 'next/navigation'

import {
  buildIdFor,
  DRAIN_LOCK,
  latestMigrationInTree,
  parseOptions,
  probeShowsClosed,
} from '../../scripts/maintenance-pause'
import { authorizeAction, requireActiveMembership } from '@/lib/auth/guards'
import { MembershipCheckError } from '@/lib/auth/membership-check'
import { getActiveMembership } from '@/lib/auth/session'
import {
  isMaintenancePause,
  MAINTENANCE_PATH,
  MAINTENANCE_PAUSE_CODE,
  MAINTENANCE_PAUSE_MESSAGE,
  MAINTENANCE_PAUSE_STATUS,
  MaintenancePauseError,
} from '@/lib/maintenance-pause'
import * as supabaseServer from '@/lib/supabase/server'

const INSTALL = readFileSync('supabase/maintenance/pausa.sql', 'utf8')
const RETIRE = readFileSync('supabase/maintenance/pausa_retirar.sql', 'utf8')
const USER_ID = '11111111-2222-4333-8444-555555555555'

/** Un cliente de Supabase que responde a la membresía con lo que se le diga. */
function clientAnswering(result: { data: unknown; error: unknown; status: number }) {
  const signOut = vi.fn().mockResolvedValue({ error: null })
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
      signOut,
    },
    from: () => ({ select: () => ({ eq: () => Promise.resolve(result) }) }),
  }
  vi.mocked(supabaseServer.createClient).mockResolvedValue(client as never)
  return { signOut }
}

const PAUSED = {
  data: null,
  error: { code: 'RIFAS_PAUSA', message: MAINTENANCE_PAUSE_MESSAGE, details: null, hint: null },
  status: 423,
}

afterEach(() => {
  vi.mocked(supabaseServer.createClient).mockReset()
  vi.mocked(redirect).mockClear()
})

describe('M-01: el SQL y la aplicación dicen lo mismo', () => {
  it('el código, el estado HTTP y el texto de la base son los de la aplicación', () => {
    // Escritos a mano: si alguien cambia uno de los dos lados, esto falla.
    expect(MAINTENANCE_PAUSE_CODE).toBe('RIFAS_PAUSA')
    expect(MAINTENANCE_PAUSE_STATUS).toBe(423)
    expect(MAINTENANCE_PAUSE_MESSAGE).toBe(
      'Estamos actualizando Rifas. Vuelve a intentarlo en unos minutos.',
    )
    expect(INSTALL).toContain(`'code', '${MAINTENANCE_PAUSE_CODE}'`)
    expect(INSTALL).toContain(`'message', '${MAINTENANCE_PAUSE_MESSAGE}'`)
    expect(INSTALL).toContain(`'status', ${MAINTENANCE_PAUSE_STATUS}`)
  })

  it('el cerrojo del drenaje es el mismo en la función y en la herramienta', () => {
    expect([...DRAIN_LOCK]).toEqual([8675320, 1])
    expect(INSTALL).toContain(
      `pg_try_advisory_xact_lock_shared(${DRAIN_LOCK[0]}, ${DRAIN_LOCK[1]})`,
    )
  })

  it('la pantalla de la pausa es pública en el proxy', () => {
    expect(MAINTENANCE_PATH).toBe('/mantenimiento')
    expect(readFileSync('src/lib/supabase/proxy.ts', 'utf8')).toContain(`'${MAINTENANCE_PATH}',`)
  })
})

describe('M-02: la pausa no toca public y solo la ejecuta la API', () => {
  it('no crea, cambia ni borra nada en public', () => {
    const sinComentarios = INSTALL.replace(/--.*$/gm, '')
    expect(sinComentarios).not.toMatch(/\bpublic\s*\./i)
    expect(sinComentarios).not.toMatch(/\bschema\s+public\b/i)
    expect(sinComentarios).not.toMatch(/\b(delete|truncate|drop)\b/i)
  })

  it('SECURITY DEFINER con search_path vacío, y EXECUTE solo para anon, authenticated y service_role', () => {
    expect(INSTALL).toMatch(/security definer\s+set search_path = ''/)
    expect(INSTALL).toContain('revoke all on function pausa.comprobar_peticion() from public;')
    expect(INSTALL).toContain(
      'grant execute on function pausa.comprobar_peticion() to anon, authenticated, service_role;',
    )
    expect(INSTALL).toContain(
      'revoke all on table pausa.estado from public, anon, authenticated, service_role;',
    )
    expect(INSTALL.replace(/--.*$/gm, '').match(/\bgrant\b/gi)).toHaveLength(2)
  })

  it('se puede restaurar un respaldo tomado con ella instalada: nada de claves ni índices únicos', () => {
    // Su volcado de esquema la incluye, y una clave sale como `alter table … add
    // constraint`, que no se puede repetir: cortaba la restauración (ensayo de D-239).
    const sinComentarios = INSTALL.replace(/--.*$/gm, '')
    expect(sinComentarios).not.toMatch(/\b(primary key|unique|references|create index)\b/i)
    expect(sinComentarios).toContain(
      'insert into pausa.estado (id) select 1 where not exists (select 1 from pausa.estado);',
    )
  })

  it('se instala ABIERTA, no pisa otro gancho y engancha PostgREST al confirmar', () => {
    expect(INSTALL).toMatch(/cerrada\s+boolean not null default false/)
    expect(INSTALL).toContain("c.valor <> 'pgrst.db_pre_request=pausa.comprobar_peticion'")
    expect(INSTALL).toContain(
      "alter role authenticator set pgrst.db_pre_request = 'pausa.comprobar_peticion';",
    )
    expect(INSTALL.indexOf("notify pgrst, 'reload config'")).toBeLessThan(
      INSTALL.lastIndexOf('commit;'),
    )
  })

  it('retirar quita el gancho, se niega con la pausa cerrada y NO borra el esquema', () => {
    const sinComentarios = RETIRE.replace(/--.*$/gm, '')
    expect(sinComentarios).toContain('alter role authenticator reset pgrst.db_pre_request;')
    expect(sinComentarios).toContain("notify pgrst, 'reload config';")
    expect(sinComentarios).toContain('La pausa está cerrada: ábrela antes de retirarla.')
    expect(sinComentarios).not.toMatch(/\bdrop\b/i)
  })
})

describe('M-03: la orden de la herramienta, entera o nada', () => {
  const COMMIT = 'a'.repeat(40)
  const REF = 'abcdefghijklmnopqrst'

  it('cada orden con sus valores por defecto', () => {
    expect(parseOptions(['cerrar', '--local'])).toMatchObject({
      command: 'cerrar',
      target: { kind: 'local', projectRef: null },
      horizonMinutes: 60,
      drainSeconds: 30,
    })
    expect(parseOptions(['estado', '--production', '--project-ref', REF]).target).toEqual({
      kind: 'production',
      projectRef: REF,
    })
  })

  it.each([
    [[], 'Indica una orden'],
    [['borrar', '--local'], 'Indica una orden'],
    [['cerrar'], 'Indica un solo destino'],
    [['cerrar', '--production'], '--project-ref'],
    [['cerrar', '--local', '--horizonte', 'mucho'], '--horizonte es un número'],
    [['estado', '--local', '--horizonte', '5'], '--horizonte no se usa con «estado»'],
    [['abrir', '--local', '--commit', COMMIT], '«abrir» exige --migracion'],
    [['abrir', '--local', '--migracion', '0079'], '«abrir» exige --commit'],
    [['abrir', '--local', '--migracion', '0079', '--commit', 'abc1234'], '«abrir» exige --commit'],
    [['abrir', '--local', '--migracion', '79', '--commit', COMMIT], '«abrir» exige --migracion'],
    [['permitir', '--local'], '«permitir» lleva los perfiles'],
    [['permitir', USER_ID, '--ninguno', '--local'], '«permitir» lleva los perfiles'],
    [['permitir', 'dueño', '--local'], 'uuid'],
    [['cerrar', 'ya', '--local'], 'No reconozco «ya»'],
  ])('%j se rechaza', (argv, message) => {
    expect(() => parseOptions(argv)).toThrow(message)
  })

  it('permitir admite varios perfiles y los deja únicos', () => {
    const upper = USER_ID.toUpperCase()
    expect(parseOptions(['permitir', `${USER_ID},${upper}`, '--local']).allowed).toEqual([USER_ID])
    expect(parseOptions(['permitir', '--ninguno', '--local']).allowed).toEqual([])
  })

  it('el identificador de versión es el de next.config.ts: sha256 del commit, 12 cifras', () => {
    // sha256('abc') = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(buildIdFor('abc')).toBe('ba7816bf8f01')
  })

  it('código y base son pareja: la última migración que trae el commit', () => {
    const listado = [
      'supabase/migrations/0077_raffle_short_code_mil.sql',
      'supabase/migrations/0079_earning_reorganization_and_team_agreement_owner.sql',
      'supabase/migrations/0078_seller_earning_agreements.sql',
      'supabase/migrations/README.md',
    ].join('\r\n')
    expect(latestMigrationInTree(listado)).toBe('0079')
    expect(latestMigrationInTree('supabase/migrations/0077_raffle_short_code_mil.sql\n')).toBe(
      '0077',
    )
    expect(latestMigrationInTree('')).toBeNull()
  })

  it('solo 423 con RIFAS_PAUSA cuenta como cerrada', () => {
    expect(probeShowsClosed({ status: 423, pausa: 'cerrada', code: 'RIFAS_PAUSA' })).toBe(true)
    expect(probeShowsClosed({ status: 423, pausa: null, code: 'OTRA' })).toBe(false)
    expect(probeShowsClosed({ status: 200, pausa: 'abierta', code: null })).toBe(false)
    expect(probeShowsClosed({ status: 401, pausa: null, code: '42501' })).toBe(false)
  })
})

describe('M-04: ninguna guarda toma la pausa por una cuenta inactiva (I-115)', () => {
  it('se reconoce por el código, y un HEAD sin cuerpo por el estado', () => {
    expect(isMaintenancePause({ code: 'RIFAS_PAUSA' })).toBe(true)
    expect(isMaintenancePause({ code: '' }, 423)).toBe(true)
    expect(isMaintenancePause({ code: '42501' }, 401)).toBe(false)
    expect(isMaintenancePause(null, 423)).toBe(false)
  })

  it('leer la membresía durante la pausa LANZA, en vez de devolver «sin membresía»', async () => {
    clientAnswering(PAUSED)
    await expect(getActiveMembership()).rejects.toBeInstanceOf(MaintenancePauseError)
  })

  it('una pantalla lleva a /mantenimiento y NO cierra la sesión', async () => {
    const { signOut } = clientAnswering(PAUSED)
    await expect(requireActiveMembership()).rejects.toThrow(`REDIRECT:${MAINTENANCE_PATH}`)
    expect(signOut).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalledWith('/login?error=inactive')
  })

  it('una acción devuelve el texto de la pausa y conserva lo escrito', async () => {
    const { signOut } = clientAnswering(PAUSED)
    await expect(authorizeAction(['seller'])).resolves.toEqual({ error: MAINTENANCE_PAUSE_MESSAGE })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('otro fallo de la lectura no es la pausa: sube como MembershipCheckError y tampoco cierra nada (D-248)', async () => {
    // Hasta D-248 este fallo llevaba a /login?error=inactive y llamaba a signOut (I-115).
    const { signOut } = clientAnswering({
      data: null,
      error: { code: 'PGRST000', message: 'caida', details: null, hint: null },
      status: 503,
    })
    await expect(requireActiveMembership()).rejects.toBeInstanceOf(MembershipCheckError)
    expect(signOut).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})
