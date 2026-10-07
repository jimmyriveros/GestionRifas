// @vitest-environment node
/**
 * D-253: el destino después de ingresar (`next`) no puede sacar a nadie de Rifas.
 *
 * `safeNextPath` aceptaba cualquier texto que empezara por `/` y no por `//`. El router de Next
 * resuelve el destino de una Server Action con `new URL(destino, dirección actual)`
 * (`assignLocation`), igual que un navegador resuelve una cabecera `Location`, y ese parser
 * convierte `\` en `/` y elimina tabuladores y saltos de línea: `/\evil.test/path` o
 * `/<TAB>/evil.test` se vuelven `//evil.test…`, otro sitio. Aquí, sin base ni navegador y con datos
 * ficticios, se resuelve cada destino como lo hace Next y se exige que se quede en el mismo origen.
 *
 * El callback (`/auth/callback`) antepone el origen al destino, así que no podía salir del sitio;
 * con esas mismas variantes aterrizaba en una ruta rota del mismo origen (`//evil.test/path`).
 *
 * Con base y navegador: `tests/e2e/destino-tras-ingresar.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`)
  }),
}))

import { redirect } from 'next/navigation'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

import LoginPage from '@/app/(public)/login/page'
import { GET as authCallback } from '@/app/auth/callback/route'
import { login } from '@/features/auth/actions'
import { LoginForm } from '@/features/auth/components/LoginForm'
import * as supabaseServer from '@/lib/supabase/server'

/** El primer elemento de `type` dentro de un árbol de React ya construido (sin pintarlo). */
function findElement(node: ReactNode, type: unknown): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child as ReactNode, type)
      if (found) return found
    }
    return null
  }
  if (!isValidElement(node)) return null
  if (node.type === type) return node
  return findElement((node.props as { children?: ReactNode }).children, type)
}

const ORIGIN = 'http://localhost:3000'
/** La página desde la que se envía el formulario: lo que Next usa como base para resolver. */
const LOGIN_PAGE = `${ORIGIN}/login?next=algo`
const USER_ID = '11111111-2222-4333-8444-555555555555'
const ORG_ID = '99999999-8888-4777-8666-555555555555'

/** Destinos que llevan a otro sitio, o a una ruta que no es de la aplicación. */
const HOSTILE: Array<[string, string]> = [
  ['barra invertida', '/\\evil.test/path'],
  ['barra invertida tras la barra', '/\\/evil.test/path'],
  ['tabulador', '/\t/evil.test'],
  ['salto de línea', '/\n/evil.test'],
  ['retorno de carro', '/\r/evil.test'],
  ['retorno y salto', '/\r\n/evil.test'],
  ['dos barras', '//evil.test'],
  ['dirección completa', 'https://evil.test/path'],
  ['esquema javascript', 'javascript:alert(1)'],
  ['segmento .. que deja dos barras', '/..//evil.test'],
  ['segmento . con barra invertida', '/./\\evil.test'],
  ['sin barra inicial', 'evil.test'],
  ['espacio inicial', ' /seller/tickets'],
  ['carácter nulo', '/\u0000/evil.test'],
  ['demasiado largo', `/${'a'.repeat(4096)}`],
]

/** Destinos de Rifas que tienen que seguir funcionando tal cual. */
const LEGIT: string[] = [
  '/',
  '/seller/tickets',
  '/seller/clients',
  '/owner/tickets?raffle=r-1&page=2',
  '/seller/tickets#filtros',
  '/seller/tickets?estado=assigned#lista',
  '/reset-password',
]

type MembershipRow = { data: unknown; error: unknown; status: number }

function sellerMembership(): MembershipRow {
  return {
    data: [
      {
        organization_id: ORG_ID,
        role: 'seller',
        is_active: true,
        profile: {
          full_name: 'Vendedora de prueba',
          email: 'vendedora@ejemplo.test',
          alias: null,
          is_active: true,
          activated_at: '2026-01-01T00:00:00Z',
        },
        organization: { name: 'Rifas de prueba', is_active: true },
      },
    ],
    error: null,
    status: 200,
  }
}

const READ_FAILURE: MembershipRow = {
  data: null,
  error: { code: 'PGRST303', message: 'JWT issued at future', details: null, hint: null },
  status: 401,
}

function supabaseAnswering(membership: MembershipRow, exchangeError: unknown = null) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: {}, error: exchangeError }),
    },
    from: () => ({ select: () => ({ eq: () => Promise.resolve(membership) }) }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  vi.mocked(supabaseServer.createClient).mockResolvedValue(client as never)
  return client
}

/** Cada prueba entra con un correo distinto: el límite de intentos es por correo. */
let n = 0
function credentials() {
  n += 1
  return { email: `destino-${n}@ejemplo.test`, password: 'valor-ficticio-123' }
}

/** El destino que pidió la acción con `redirect()`. */
async function loginTarget(next: unknown): Promise<string> {
  try {
    await login({ ...credentials(), next })
  } catch (error) {
    const match = /^REDIRECT:(.*)$/s.exec((error as Error).message)
    if (match) return match[1]!
    throw error
  }
  throw new Error('login no redirigió')
}

/** Dónde acaba el navegador: `new URL(destino, dirección actual)`, como `assignLocation` de Next. */
function landing(target: string, base = LOGIN_PAGE): URL {
  return new URL(target, base)
}

afterEach(() => {
  vi.mocked(supabaseServer.createClient).mockReset()
  vi.mocked(redirect).mockClear()
})

describe('D-253: al ingresar, un `next` manipulado no saca a nadie de Rifas', () => {
  it.each(HOSTILE)('%s: vuelve al panel de su rol, en el mismo origen', async (_, next) => {
    supabaseAnswering(sellerMembership())
    const target = await loginTarget(next)
    const url = landing(target)
    expect(url.origin, `«${target}» se resuelve fuera de Rifas`).toBe(ORIGIN)
    expect(target).toBe('/seller/dashboard')
  })

  it.each(HOSTILE)(
    '%s: tampoco cuando no se pudo comprobar el acceso (D-248), que va a la portada',
    async (_, next) => {
      const client = supabaseAnswering(READ_FAILURE)
      const target = await loginTarget(next)
      expect(landing(target).origin).toBe(ORIGIN)
      expect(target).toBe('/')
      // La sesión recién creada se conserva, como dice D-248.
      expect(client.auth.signOut).not.toHaveBeenCalled()
    },
  )

  it.each(LEGIT)('«%s», un destino de Rifas, se conserva tal cual', async (next) => {
    supabaseAnswering(sellerMembership())
    const target = await loginTarget(next)
    expect(target).toBe(next)
    expect(landing(target).origin).toBe(ORIGIN)
  })

  it('sin `next`, el panel de su rol (BR-A02)', async () => {
    supabaseAnswering(sellerMembership())
    await expect(loginTarget(undefined)).resolves.toBe('/seller/dashboard')
  })
})

describe('D-253: la página de ingreso solo le pasa al formulario una ruta de Rifas', () => {
  /** El `next` que recibe `LoginForm` al pintar `/login` sin sesión. */
  async function formNext(next: unknown): Promise<unknown> {
    const client = supabaseAnswering(sellerMembership())
    client.auth.getUser.mockResolvedValue({ data: { user: null } })
    const tree = await LoginPage({ searchParams: Promise.resolve({ next } as never) })
    const found = findElement(tree, LoginForm)
    expect(found, 'la página no pintó el formulario').not.toBeNull()
    return (found!.props as { next?: unknown }).next
  }

  it.each(HOSTILE)('%s: el formulario no lo lleva', async (_, next) => {
    await expect(formNext(next)).resolves.toBeUndefined()
  })

  it.each(LEGIT)('«%s» llega al formulario tal cual', async (next) => {
    await expect(formNext(next)).resolves.toBe(next)
  })

  it('repetido (`?next=a&next=b`), Next lo entrega como lista: no se usa ninguno', async () => {
    // Antes la lista viajaba a la acción, y su esquema la rechazaba con «Revisa los datos
    // ingresados.»: desde ese enlace no se podía entrar.
    await expect(formNext(['/seller/tickets', '/owner'])).resolves.toBeUndefined()
  })
})

describe('D-253: el callback de Auth vuelve a una ruta de Rifas', () => {
  async function callbackLocation(next: string | null, code: string | null = 'codigo-ficticio') {
    const url = new URL(`${ORIGIN}/auth/callback`)
    if (code !== null) url.searchParams.set('code', code)
    if (next !== null) url.searchParams.set('next', next)
    const response = await authCallback(new Request(url))
    expect(response.status).toBe(307)
    return response.headers.get('location')!
  }

  it('la invitación y la recuperación siguen llegando a /reset-password', async () => {
    supabaseAnswering(sellerMembership())
    await expect(callbackLocation('/reset-password')).resolves.toBe(`${ORIGIN}/reset-password`)
  })

  it('sin `next`, la portada', async () => {
    supabaseAnswering(sellerMembership())
    await expect(callbackLocation(null)).resolves.toBe(`${ORIGIN}/`)
  })

  it.each(HOSTILE)('%s: la portada, nunca otra ruta ni otro sitio', async (_, next) => {
    supabaseAnswering(sellerMembership())
    const location = await callbackLocation(next)
    expect(new URL(location).origin).toBe(ORIGIN)
    expect(location).toBe(`${ORIGIN}/`)
  })

  it('sin código o con un código que Auth rechaza, el aviso de enlace vencido', async () => {
    supabaseAnswering(sellerMembership())
    await expect(callbackLocation('/reset-password', null)).resolves.toBe(
      `${ORIGIN}/login?error=auth_callback`,
    )
    supabaseAnswering(sellerMembership(), { message: 'invalid flow state' })
    await expect(callbackLocation('/reset-password')).resolves.toBe(
      `${ORIGIN}/login?error=auth_callback`,
    )
  })
})
