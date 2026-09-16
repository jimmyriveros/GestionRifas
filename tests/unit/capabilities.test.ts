/**
 * La capacidad central en la aplicación: Dueño, Administrador y Vendedor
 * (D-200, D-202).
 *
 * De lo más puro a lo que se toca:
 *
 *   1. EL RESOLVEDOR (`hasCapability`) con la política predeterminada, que recibe
 *      la membresía completa.
 *   2. LA GUARDA Y LAS ACCIONES que dependen de él —`authorizeCapability`,
 *      `createRaffle` y una acción de premios—, con la sesión y Supabase
 *      sustituidos. Y lo que de verdad fija la arquitectura: si se REEMPLAZA el
 *      resolvedor, las acciones obedecen al nuevo sin cambiar una línea suya.
 *      Es lo que tendrá que hacer el módulo de permisos por administrador.
 *   3. QUE NADIE VUELVA A DECIDIR UNA CAPACIDAD mirando la tabla por rol.
 *
 * La comparación con PostgreSQL —el catálogo, la política por rol y la
 * resolución con la sesión de cada rol— está en `tests/db/raffle-prizes.test.ts`
 * (J1-06 y J1-08): la base es la autoridad y la aplicación, su espejo.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RAFFLE_WIZARD_COPY } from '@/features/raffle-prizes/copy'
import { APP_CAPABILITIES } from '@/lib/auth/capabilities'
import type { ActiveMembership } from '@/lib/auth/session'
import type { AppRole } from '@/lib/constants'

vi.mock('@/lib/auth/session', () => ({ getAuthUser: vi.fn(), getActiveMembership: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/capability-resolver', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/capability-resolver')>()
  // Por omisión, el resolvedor de verdad. Las pruebas de reemplazo le cambian la
  // política y `afterEach` se la devuelve.
  return { hasCapability: vi.fn(real.hasCapability) }
})

const resolver = await import('@/lib/auth/capability-resolver')
const realResolver = await vi.importActual<typeof import('@/lib/auth/capability-resolver')>(
  '@/lib/auth/capability-resolver',
)
const session = await import('@/lib/auth/session')
const supabaseServer = await import('@/lib/supabase/server')
const { authorizeCapability } = await import('@/lib/auth/guards')
const { createRaffle } = await import('@/features/raffles/actions')
const { archivePrize } = await import('@/features/raffle-prizes/actions')

const hasCapability = vi.mocked(resolver.hasCapability)

const ROLES: readonly AppRole[] = ['owner', 'admin', 'seller']
const DENIED = 'No tienes permiso para realizar esta acción.'
const PRIZE_ID = '11111111-2222-4333-8444-555555555551'
const VERSION_ID = '11111111-2222-4333-8444-555555555552'

function membership(role: AppRole): ActiveMembership {
  return {
    organizationId: '11111111-2222-4333-8444-555555555555',
    organizationName: 'Rifas',
    role,
    profileId: `22222222-2222-4333-8444-55555555555${ROLES.indexOf(role)}`,
    fullName: 'Persona de prueba',
    email: `${role}@demo.test`,
    alias: null,
    activatedAt: '2026-01-01T00:00:00Z',
  }
}

const RIFA = {
  name: 'Rifa de prueba',
  description: '',
  ticketPrice: 120_000,
  startDate: '2026-11-02',
  endDate: '2026-12-31',
  allowSellerTicketCreation: false,
}

/** Un Supabase de mentira que registra lo que la acción intentó escribir. */
function fakeSupabase() {
  const insert = vi.fn((_values: Record<string, unknown>) => ({
    select: () => ({ single: async () => ({ data: { id: 'rifa-nueva' }, error: null }) }),
  }))
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    data: null,
    error: null,
  }))
  const client = { from: vi.fn(() => ({ insert })), rpc }
  vi.mocked(supabaseServer.createClient).mockResolvedValue(client as never)
  return { client, insert, rpc }
}

function signIn(role: AppRole): ActiveMembership {
  const m = membership(role)
  vi.mocked(session.getAuthUser).mockResolvedValue({ id: m.profileId } as never)
  vi.mocked(session.getActiveMembership).mockResolvedValue(m)
  return m
}

beforeEach(() => {
  vi.mocked(supabaseServer.createClient).mockReset()
  hasCapability.mockClear()
})

afterEach(() => {
  hasCapability.mockImplementation(realResolver.hasCapability)
})

// =============================================================================
describe('el resolvedor central (D-200, D-202)', () => {
  it('Dueño: todas las capacidades del catálogo', async () => {
    for (const capability of APP_CAPABILITIES) {
      expect(await realResolver.hasCapability(membership('owner'), capability)).toBe(true)
    }
  })

  it('Administrador: la de premios, por la política predeterminada', async () => {
    expect(await realResolver.hasCapability(membership('admin'), 'raffles.prizes.manage')).toBe(
      true,
    )
  })

  it('Vendedor: ninguna', async () => {
    for (const capability of APP_CAPABILITIES) {
      expect(await realResolver.hasCapability(membership('seller'), capability)).toBe(false)
    }
  })

  it('es asíncrono: quien lo llama ya espera, así que mañana puede ser una lectura', () => {
    const answer = realResolver.hasCapability(membership('owner'), 'raffles.prizes.manage')
    expect(answer).toBeInstanceOf(Promise)
  })
})

// =============================================================================
describe('la guarda pregunta al resolvedor con la membresía completa', () => {
  it('Dueño y Administrador pasan; el Vendedor recibe el rechazo de siempre', async () => {
    for (const role of ROLES) {
      signIn(role)
      const auth = await authorizeCapability('raffles.prizes.manage')
      if (role === 'seller') expect(auth).toEqual({ error: DENIED })
      else expect('membership' in auth && auth.membership.role).toBe(role)
    }
  })

  it('le pasa al resolvedor la MISMA membresía de la sesión, no el rol suelto', async () => {
    const m = signIn('admin')
    await authorizeCapability('raffles.prizes.manage')
    expect(hasCapability).toHaveBeenCalledTimes(1)
    expect(hasCapability.mock.calls[0]![0]).toBe(m)
    expect(hasCapability.mock.calls[0]![1]).toBe('raffles.prizes.manage')
  })

  it('con `roles`, un rol fuera de la lista se rechaza SIN consultar la capacidad', async () => {
    signIn('seller')
    hasCapability.mockResolvedValue(true)
    const auth = await authorizeCapability('raffles.prizes.manage', { roles: ['owner', 'admin'] })
    expect(auth).toEqual({ error: DENIED })
    expect(hasCapability).not.toHaveBeenCalled()
  })

  it('sin sesión no se llega al resolvedor', async () => {
    vi.mocked(session.getAuthUser).mockResolvedValue(null)
    const auth = await authorizeCapability('raffles.prizes.manage')
    expect('error' in auth).toBe(true)
    expect(hasCapability).not.toHaveBeenCalled()
  })
})

// =============================================================================
describe('createRaffle depende de la guarda central (BR-R01, D-202)', () => {
  it('Dueño y Administrador crean la rifa configurable, en su organización', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const m = signIn(role)
      const { insert } = fakeSupabase()

      const result = await createRaffle(RIFA)

      expect(result).toEqual({ ok: true, data: { id: 'rifa-nueva' } })
      expect(insert).toHaveBeenCalledTimes(1)
      expect(insert.mock.calls[0]![0]).toMatchObject({
        organization_id: m.organizationId,
        created_by: m.profileId,
        prize_mode: 'configurable',
      })
    }
  })

  it('el Vendedor se rechaza antes de abrir la base, aunque tuviera la capacidad', async () => {
    signIn('seller')
    hasCapability.mockResolvedValue(true)
    const { insert } = fakeSupabase()

    expect(await createRaffle(RIFA)).toEqual({ error: DENIED })
    expect(insert).not.toHaveBeenCalled()
    expect(supabaseServer.createClient).not.toHaveBeenCalled()
  })

  it('si el resolvedor niega la capacidad, responde con la frase de la base y no escribe', async () => {
    signIn('owner')
    hasCapability.mockResolvedValue(false)

    expect(await createRaffle(RIFA)).toEqual({ error: RAFFLE_WIZARD_COPY.noCapability })
    expect(supabaseServer.createClient).not.toHaveBeenCalled()
  })
})

// =============================================================================
describe('reemplazar el resolvedor basta: las acciones no se tocan (D-202)', () => {
  /**
   * Una política distinta de la predeterminada —la que podría traer el módulo
   * de permisos—: un Administrador SIN la capacidad de premios.
   */
  const withoutAdminPrizes = async (m: ActiveMembership, capability: string) =>
    m.role === 'owner' || (m.role === 'admin' && capability !== 'raffles.prizes.manage')

  it('un Administrador sin la capacidad ya no crea rifas configurables', async () => {
    signIn('admin')
    hasCapability.mockImplementation(withoutAdminPrizes)

    expect(await createRaffle(RIFA)).toEqual({ error: RAFFLE_WIZARD_COPY.noCapability })
    expect(supabaseServer.createClient).not.toHaveBeenCalled()
  })

  it('ni archiva premios; el Dueño, con la misma política, sí', async () => {
    hasCapability.mockImplementation(withoutAdminPrizes)

    signIn('admin')
    expect(await archivePrize({ prizeId: PRIZE_ID, expectedVersionId: VERSION_ID })).toEqual({
      error: DENIED,
    })
    expect(supabaseServer.createClient).not.toHaveBeenCalled()

    signIn('owner')
    const { rpc } = fakeSupabase()
    expect(await archivePrize({ prizeId: PRIZE_ID, expectedVersionId: VERSION_ID })).toEqual({
      ok: true,
    })
    expect(rpc).toHaveBeenCalledWith('archive_raffle_prize', {
      p_prize_id: PRIZE_ID,
      p_expected_version_id: VERSION_ID,
    })
  })

  it('con la política de hoy, las acciones de premios admiten a Dueño y Administrador', async () => {
    for (const role of ROLES) {
      signIn(role)
      const { rpc } = fakeSupabase()
      const result = await archivePrize({ prizeId: PRIZE_ID, expectedVersionId: VERSION_ID })
      if (role === 'seller') {
        expect(result).toEqual({ error: DENIED })
        expect(rpc).not.toHaveBeenCalled()
      } else {
        expect(result).toEqual({ ok: true })
      }
    }
  })
})

// =============================================================================
describe('nadie decide una capacidad mirando la tabla por rol (estructural)', () => {
  const SRC = join(process.cwd(), 'src')

  function sources(dir = SRC): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return sources(path)
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
    })
  }

  const FILES = sources().map((path) => ({
    path: relative(process.cwd(), path).replace(/\\/g, '/'),
    source: readFileSync(path, 'utf8'),
  }))

  it('solo `lib/auth` lee la política por rol', () => {
    const readers = FILES.filter(({ source }) => source.includes('ROLE_DEFAULT_CAPABILITIES'))
      .map(({ path }) => path)
      .sort()
    expect(readers).toEqual(['src/lib/auth/capabilities.ts', 'src/lib/auth/capability-resolver.ts'])
  })

  it('quien nombra una capacidad la resuelve con la guarda o con el resolvedor', () => {
    const users = FILES.filter(
      ({ path, source }) =>
        !path.startsWith('src/lib/auth/') && source.includes("'raffles.prizes.manage'"),
    )
    // Las cuatro pantallas del proceso y las dos familias de acciones.
    expect(users.length).toBeGreaterThanOrEqual(6)

    const unresolved = users
      .filter(({ source }) => !/\b(hasCapability|authorizeCapability)\(/.test(source))
      .map(({ path }) => path)
    expect(unresolved).toEqual([])
  })

  it('ninguna pantalla ni acción vuelve a preguntar por el rol para una capacidad', () => {
    const offenders = FILES.filter(({ source }) =>
      /roleHasCapability|ROLE_DEFAULT_CAPABILITIES\[/.test(source),
    )
      .map(({ path }) => path)
      .filter((path) => path !== 'src/lib/auth/capability-resolver.ts')
    expect(offenders).toEqual([])
  })

  it('createRaffle y todas las acciones de premios usan la guarda central', () => {
    const actionBodies = (path: string) => {
      const source = readFileSync(join(process.cwd(), path), 'utf8')
      return source.split(/(?=export async function )/).filter((part) => part.startsWith('export'))
    }

    const createRaffleBody = actionBodies('src/features/raffles/actions.ts').find((body) =>
      body.startsWith('export async function createRaffle('),
    )
    expect(createRaffleBody).toContain('authorizeCapability(')

    const prizeActions = actionBodies('src/features/raffle-prizes/actions.ts')
    expect(prizeActions.length).toBeGreaterThanOrEqual(6)
    for (const body of prizeActions) expect(body).toContain('authorizeCapability(')
  })
})
