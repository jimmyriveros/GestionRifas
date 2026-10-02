// @vitest-environment node
/**
 * I-115 (D-248): un fallo al LEER la membresía no es una cuenta inactiva.
 *
 * Antes, `getActiveMembership` devolvía `null` también cuando la consulta fallaba —el 401
 * `PGRST303` de I-202, un 5xx, la red— y las guardas cerraban la sesión en todos los dispositivos
 * diciendo «Tu cuenta está inactiva». Aquí, sin base ni navegador:
 *
 *   · la lectura LANZA `MembershipCheckError` ante cualquier fallo que no sea la pausa (D-239);
 *   · una pantalla deja subir el error —lo recoge la página de error con «Reintentar»— y NO cierra
 *     la sesión; una acción, el inicio de sesión y las rutas de la API tampoco;
 *   · y lo que sí es una cuenta inactiva o ausente sigue cerrando la sesión y diciéndolo, igual que
 *     antes, y la pausa sigue llevando a `/mantenimiento`.
 *
 * Con base y navegador: `tests/e2e/membresia-sin-comprobar.spec.ts` (dos sesiones, la recuperación
 * sin volver a entrar y la cuenta desactivada). Los mismos simulacros que `maintenance-pause.test.ts`.
 */
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`)
  }),
}))
// La ruta de la imagen no llega a dibujar nada aquí; se evita cargar `next/og` y sus fuentes.
vi.mock('@/features/weekly-results/image/render', () => ({ renderWeeklyResultsPng: vi.fn() }))

import { redirect } from 'next/navigation'

import { GET as exportReport } from '@/app/api/reports/export/route'
import { GET as weeklyImage } from '@/app/api/weekly-results/image/route'
import { login } from '@/features/auth/actions'
import { authorizeAction, requireActiveMembership } from '@/lib/auth/guards'
import { MEMBERSHIP_CHECK_MESSAGE, MembershipCheckError } from '@/lib/auth/membership-check'
import { getActiveMembership } from '@/lib/auth/session'
import {
  MAINTENANCE_PATH,
  MAINTENANCE_PAUSE_MESSAGE,
  MaintenancePauseError,
} from '@/lib/maintenance-pause'
import * as supabaseServer from '@/lib/supabase/server'

const USER_ID = '11111111-2222-4333-8444-555555555555'
const ORG_ID = '99999999-8888-4777-8666-555555555555'
const INACTIVE = 'Tu cuenta está inactiva. Contacta a tu administrador.'

type Result = { data: unknown; error: unknown; status: number }

/** Un cliente de Supabase que responde a la membresía con lo que se le diga. */
function clientAnswering(result: Result) {
  const signOut = vi.fn().mockResolvedValue({ error: null })
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut,
    },
    from: () => ({ select: () => ({ eq: () => Promise.resolve(result) }) }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  vi.mocked(supabaseServer.createClient).mockResolvedValue(client as never)
  return { signOut }
}

/** Una membresía de vendedor, activa o no. */
function membership(active: boolean): Result {
  return {
    data: [
      {
        organization_id: ORG_ID,
        role: 'seller',
        is_active: active,
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

/** Los fallos de lectura que NO son una cuenta inactiva. */
const FAILURES: Array<[string, Result]> = [
  [
    'PGRST303 «JWT issued at future» (I-202)',
    {
      data: null,
      error: { code: 'PGRST303', message: 'JWT issued at future', details: null, hint: null },
      status: 401,
    },
  ],
  [
    'el servicio caído (503)',
    {
      data: null,
      error: { code: 'PGRST000', message: 'caida', details: null, hint: null },
      status: 503,
    },
  ],
  [
    'la red (estado 0)',
    {
      data: null,
      error: { code: '', message: 'TypeError: fetch failed', details: '', hint: '' },
      status: 0,
    },
  ],
]
const JWT_FUTURE = FAILURES[0]![1]

const PAUSED: Result = {
  data: null,
  error: { code: 'RIFAS_PAUSA', message: MAINTENANCE_PAUSE_MESSAGE, details: null, hint: null },
  status: 423,
}

afterEach(() => {
  vi.mocked(supabaseServer.createClient).mockReset()
  vi.mocked(redirect).mockClear()
})

describe('I-115: leer la membresía distingue el fallo de la cuenta inactiva', () => {
  it.each(FAILURES)(
    '%s LANZA MembershipCheckError en vez de devolver «sin membresía»',
    async (_, result) => {
      clientAnswering(result)
      await expect(getActiveMembership()).rejects.toBeInstanceOf(MembershipCheckError)
    },
  )

  it('una membresía inactiva sigue siendo null', async () => {
    clientAnswering(membership(false))
    await expect(getActiveMembership()).resolves.toBeNull()
  })

  it('sin ninguna membresía, null', async () => {
    clientAnswering({ data: [], error: null, status: 200 })
    await expect(getActiveMembership()).resolves.toBeNull()
  })

  it('la pausa sigue siendo la pausa (D-239)', async () => {
    clientAnswering(PAUSED)
    await expect(getActiveMembership()).rejects.toBeInstanceOf(MaintenancePauseError)
  })
})

describe('I-115: una pantalla no cierra la sesión por un fallo de lectura', () => {
  it.each(FAILURES)(
    '%s: el error sube a la página de error, sin signOut ni «inactiva»',
    async (_, result) => {
      const { signOut } = clientAnswering(result)
      await expect(requireActiveMembership()).rejects.toBeInstanceOf(MembershipCheckError)
      expect(signOut).not.toHaveBeenCalled()
      expect(redirect).not.toHaveBeenCalled()
    },
  )

  it('una cuenta inactiva de verdad sigue cerrando la sesión y diciéndolo', async () => {
    const { signOut } = clientAnswering(membership(false))
    await expect(requireActiveMembership()).rejects.toThrow('REDIRECT:/login?error=inactive')
    expect(signOut).toHaveBeenCalledTimes(1)
    // Sin argumentos: el alcance del cierre legítimo no cambia (global por defecto).
    expect(signOut).toHaveBeenCalledWith()
  })

  it('la pausa sigue llevando a /mantenimiento sin cerrar nada', async () => {
    const { signOut } = clientAnswering(PAUSED)
    await expect(requireActiveMembership()).rejects.toThrow(`REDIRECT:${MAINTENANCE_PATH}`)
    expect(signOut).not.toHaveBeenCalled()
  })
})

describe('I-115: una Server Action dice que no pudo comprobar, y no hace nada', () => {
  it.each(FAILURES)('%s: devuelve el mensaje temporal y no cierra la sesión', async (_, result) => {
    const { signOut } = clientAnswering(result)
    await expect(authorizeAction(['seller'])).resolves.toEqual({ error: MEMBERSHIP_CHECK_MESSAGE })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('una cuenta inactiva sigue recibiendo su mensaje', async () => {
    clientAnswering(membership(false))
    await expect(authorizeAction(['seller'])).resolves.toEqual({ error: INACTIVE })
  })

  it('el texto dice qué pasó y cómo salir, sin culpar ni hablar de cuentas', () => {
    expect(MEMBERSHIP_CHECK_MESSAGE).toBe(
      'No pudimos comprobar tu acceso. Vuelve a intentarlo en unos segundos.',
    )
    expect(MEMBERSHIP_CHECK_MESSAGE).not.toMatch(/inactiv|permiso|sesi[oó]n/i)
  })
})

describe('I-115: el inicio de sesión conserva la sesión si no pudo comprobar el acceso', () => {
  const credentials = { email: 'vendedora@ejemplo.test', password: 'valor-ficticio-123' }

  it.each(FAILURES)(
    '%s: no cierra la sesión y manda a la portada, que vuelve a comprobar',
    async (_, result) => {
      const { signOut } = clientAnswering(result)
      await expect(login(credentials)).rejects.toThrow('REDIRECT:/')
      expect(redirect).toHaveBeenCalledWith('/')
      expect(signOut).not.toHaveBeenCalled()
    },
  )

  it('con `next`, vuelve a donde iba', async () => {
    clientAnswering(JWT_FUTURE)
    await expect(login({ ...credentials, next: '/seller/tickets' })).rejects.toThrow(
      'REDIRECT:/seller/tickets',
    )
  })

  it('una cuenta inactiva sigue cerrando la sesión y diciéndolo', async () => {
    const { signOut } = clientAnswering(membership(false))
    await expect(login(credentials)).resolves.toEqual({ error: INACTIVE })
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('la pausa sigue llevando a /mantenimiento', async () => {
    const { signOut } = clientAnswering(PAUSED)
    await expect(login(credentials)).rejects.toThrow(`REDIRECT:${MAINTENANCE_PATH}`)
    expect(signOut).not.toHaveBeenCalled()
  })
})

describe('I-115: las rutas de la API responden un fallo temporal, no «inactiva»', () => {
  it('exportar un reporte: 503 con el mensaje temporal', async () => {
    const { signOut } = clientAnswering(JWT_FUTURE)
    const res = await exportReport(
      new NextRequest('http://localhost/api/reports/export?report=payments'),
    )
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: MEMBERSHIP_CHECK_MESSAGE })
    expect(signOut).not.toHaveBeenCalled()
  })

  it('la imagen de la semana: 503 con el mensaje temporal y sin caché', async () => {
    clientAnswering(JWT_FUTURE)
    const res = await weeklyImage(new NextRequest('http://localhost/api/weekly-results/image'))
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    await expect(res.json()).resolves.toEqual({ error: MEMBERSHIP_CHECK_MESSAGE })
  })

  it('una cuenta inactiva sigue recibiendo 403', async () => {
    clientAnswering(membership(false))
    const res = await exportReport(
      new NextRequest('http://localhost/api/reports/export?report=payments'),
    )
    expect(res.status).toBe(403)
  })
})
