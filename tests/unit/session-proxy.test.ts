// @vitest-environment node
//
// El proxy corre en el runtime de servidor de Next. Con jsdom, auth-js creeria
// estar en un navegador (`window` y `document` existen) y cambiaria de camino.
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

import { updateSession } from '@/lib/supabase/proxy'

/**
 * El proxy traslada a la respuesta TODO lo que Supabase le pide escribir
 * (I-174, D-236).
 *
 * `@supabase/ssr` entrega en `setAll` dos cosas: las cookies de la sesion
 * —renovadas, o vaciadas con `Max-Age=0` cuando la sesion ya no sirve— y tres
 * cabeceras que impiden cachear esa respuesta. Hasta I-174 el proxy aplicaba
 * las cookies solo a la respuesta que deja pasar la peticion: la redireccion a
 * `/login` era una respuesta nueva y salia sin ellas, y las cabeceras no se
 * aplicaban en ninguna.
 *
 * TODO ES FICTICIO: el proyecto de Supabase es un dominio `.test` que no
 * existe, los tokens son cadenas inventadas y `fetch` esta sustituido, asi que
 * ninguna prueba sale a la red. Una salida no prevista hace fallar la prueba.
 *
 * Las expectativas se escriben A MANO —los atributos exactos de cada
 * Set-Cookie y las tres cabeceras— y no con las utilidades de la biblioteca:
 * una prueba que se compara consigo misma no detecta nada.
 */

const SUPABASE_URL = 'https://proyecto-ficticio.supabase.test'
/** `sb-<primera etiqueta del host>-auth-token`, como la nombra supabase-js. */
const SESSION_COOKIE = 'sb-proyecto-ficticio-auth-token'
const APP = 'https://rifas.test'
const CSP = {
  nonce: 'bm9uY2UtZmljdGljaW8=',
  policy: "default-src 'self'; script-src 'self' 'nonce-bm9uY2UtZmljdGljaW8=' 'strict-dynamic'",
}

/** Lo que `@supabase/ssr` 0.12.0 manda aplicar junto con las cookies. */
const NO_CACHE = {
  'cache-control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  expires: '0',
  pragma: 'no-cache',
}

/** 400 dias: la caducidad que `@supabase/ssr` pone a la cookie de sesion. */
const SESSION_MAX_AGE = 34_560_000
/** Tamano maximo de un fragmento de cookie en `@supabase/ssr`. */
const CHUNK = 3180

const now = () => Math.floor(Date.now() / 1000)

type Session = {
  access_token: string
  refresh_token: string
  expires_at: number
  expires_in: number
  token_type: 'bearer'
  user: ReturnType<typeof fakeUser>
}

function fakeUser(filler = '') {
  return {
    id: '00000000-0000-4000-8000-00000000f1c7',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'vendedor.ficticio@rifas.test',
    app_metadata: { provider: 'email' },
    // Relleno para que la sesion no quepa en una cookie y vaya en fragmentos.
    user_metadata: filler ? { relleno: filler } : {},
    created_at: '2026-09-01T00:00:00Z',
  }
}

function session(overrides: Partial<Session> & Pick<Session, 'access_token' | 'refresh_token'>) {
  return {
    expires_in: 3600,
    // Caducada hace una hora: obliga a renovarla en esta peticion.
    expires_at: now() - 3600,
    token_type: 'bearer' as const,
    user: fakeUser(),
    ...overrides,
  }
}

/** Codifica como `@supabase/ssr` (`base64-` + base64url) y trocea si no cabe. */
function sessionCookies(value: Session): [string, string][] {
  const encoded = `base64-${Buffer.from(JSON.stringify(value)).toString('base64url')}`
  if (encoded.length <= CHUNK) return [[SESSION_COOKIE, encoded]]
  const chunks: [string, string][] = []
  for (let i = 0; i * CHUNK < encoded.length; i += 1) {
    chunks.push([`${SESSION_COOKIE}.${i}`, encoded.slice(i * CHUNK, (i + 1) * CHUNK)])
  }
  return chunks
}

function decodeSession(value: string): Session {
  expect(value.startsWith('base64-')).toBe(true)
  return JSON.parse(Buffer.from(value.slice('base64-'.length), 'base64url').toString('utf8'))
}

function request(path: string, cookies: [string, string][] = []) {
  const headers = new Headers()
  if (cookies.length > 0) {
    headers.set('cookie', cookies.map(([name, value]) => `${name}=${value}`).join('; '))
  }
  return new NextRequest(new URL(path, APP), { headers })
}

// ---------------------------------------------------------------------------
// Auth simulado
// ---------------------------------------------------------------------------

type AuthCall = { path: string; authorization: string | null; refreshToken?: string }

let calls: AuthCall[]
let unexpected: string[]

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
  })
}

/**
 * Exactamente lo que responde GoTrue LOCAL al refresh token de una sesion
 * cerrada con alcance global (medido, `TEST_RESULTS` I-174), con la version de
 * API 2024-01-01. Es tambien el mensaje de la agrupacion de produccion.
 */
const REFRESH_TOKEN_NOT_FOUND = () =>
  json(400, {
    code: 'refresh_token_not_found',
    message: 'Invalid Refresh Token: Refresh Token Not Found',
  })

function renewed(filler = '') {
  return () =>
    json(200, {
      access_token: 'acceso-renovado',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now() + 3600,
      refresh_token: 'refresco-renovado',
      user: fakeUser(filler),
    })
}

/** `/user` solo reconoce el token que se le indica. */
function userFor(validAccessToken: string) {
  return (authorization: string | null) =>
    authorization === `Bearer ${validAccessToken}`
      ? json(200, fakeUser())
      : json(403, { code: 'bad_jwt', message: 'invalid JWT' })
}

function mockAuth(handlers: {
  token?: () => Response
  user?: (authorization: string | null) => Response
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const headers = new Headers(init?.headers)
      if (url.origin !== SUPABASE_URL) {
        unexpected.push(url.origin)
        throw new Error('salida de red no prevista')
      }
      const call: AuthCall = { path: url.pathname, authorization: headers.get('authorization') }
      if (url.pathname === '/auth/v1/token' && handlers.token) {
        call.refreshToken = JSON.parse(String(init?.body)).refresh_token
        calls.push(call)
        return handlers.token()
      }
      if (url.pathname === '/auth/v1/user' && handlers.user) {
        calls.push(call)
        return handlers.user(call.authorization)
      }
      unexpected.push(url.pathname)
      throw new Error('llamada a Auth no prevista')
    }),
  )
}

// ---------------------------------------------------------------------------
// Lectura de la respuesta
// ---------------------------------------------------------------------------

/** Cada Set-Cookie de la respuesta, por nombre, tal como sale. */
function setCookies(response: Response): Map<string, string> {
  const byName = new Map<string, string>()
  for (const line of response.headers.getSetCookie()) {
    byName.set(line.slice(0, line.indexOf('=')), line)
  }
  return byName
}

/** Borrado de `@supabase/ssr`: valor vacio y `Max-Age=0`, con la ruta y SameSite de siempre. */
const deletion = (name: string) => `${name}=; Path=/; Max-Age=0; SameSite=lax`

/** Escritura de `@supabase/ssr`: 400 dias, ruta raiz y SameSite=lax; ni HttpOnly ni Domain. */
function expectSessionWrite(line: string | undefined, name: string): string {
  expect(line).toMatch(
    new RegExp(
      `^${name.replaceAll('.', '\\.')}=(base64-[A-Za-z0-9_-]+); Path=/; Expires=[^;]+; Max-Age=${SESSION_MAX_AGE}; SameSite=lax$`,
    ),
  )
  return line!.slice(name.length + 1, line!.indexOf(';'))
}

function cacheHeaders(response: Response) {
  return {
    'cache-control': response.headers.get('cache-control'),
    expires: response.headers.get('expires'),
    pragma: response.headers.get('pragma'),
  }
}

const NO_CACHE_HEADERS = { 'cache-control': null, expires: null, pragma: null }

/** La cabecera `cookie` con la que Next hara el render de la pagina. */
function forwardedCookies(response: Response): Map<string, string> {
  const header = response.headers.get('x-middleware-request-cookie') ?? ''
  return new Map(
    header
      .split(/;\s*/)
      .filter(Boolean)
      .map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]),
  )
}

function expectPassesWithCsp(response: Response) {
  expect(response.headers.get('x-middleware-next')).toBe('1')
  expect(response.headers.get('content-security-policy')).toBe(CSP.policy)
  // Next lee el nonce del REQUEST para firmar sus propios scripts (D-061).
  expect(response.headers.get('x-middleware-request-x-nonce')).toBe(CSP.nonce)
  expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(CSP.policy)
}

function expectLoginRedirect(response: Response, next: string) {
  expect(response.status).toBe(307)
  const location = new URL(response.headers.get('location')!)
  expect(location.origin).toBe(APP)
  expect(location.pathname).toBe('/login')
  expect(location.searchParams.get('next')).toBe(next)
  expect(response.headers.get('content-security-policy')).toBe(CSP.policy)
  expect(response.headers.get('x-middleware-next')).toBeNull()
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  calls = []
  unexpected = []
  // supabase-js exige un `WebSocket` al crear el cliente, aunque el proxy no
  // abra ninguno. Node 20 no lo trae y el servidor de Next lo define al
  // arrancar (`next/dist/server/node-environment-baseline`); aqui se replica.
  if (typeof globalThis.WebSocket !== 'function') vi.stubGlobal('WebSocket', WebSocket)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'clave-publica-ficticia')
})

afterEach(async () => {
  // auth-js emite la sesion inicial en segundo plano; se deja terminar antes
  // de retirar los simulacros para que no se cuele en la prueba siguiente.
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(unexpected).toEqual([])
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sesion invalida: el refresh token ya no existe en Auth', () => {
  const revoked = session({ access_token: 'acceso-caducado', refresh_token: 'refresco-revocado' })

  it('ruta protegida: la redireccion a /login borra la cookie de sesion y no se cachea', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAuth({ token: REFRESH_TOKEN_NOT_FOUND })

    const response = await updateSession(request('/seller/tickets', sessionCookies(revoked)), CSP)

    expectLoginRedirect(response, '/seller/tickets')
    expect([...setCookies(response).values()]).toEqual([deletion(SESSION_COOKIE)])
    expect(cacheHeaders(response)).toEqual(NO_CACHE)
    // Una sola renovacion, y ninguna consulta de usuario sin sesion.
    expect(calls.map((call) => call.path)).toEqual(['/auth/v1/token'])
    expect(calls[0]?.refreshToken).toBe('refresco-revocado')
    // El error se sigue registrando: lo emite la propia biblioteca y la
    // correccion no lo oculta. Es el mensaje de la agrupacion de produccion.
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid Refresh Token: Refresh Token Not Found' }),
      ),
    )
  })

  it('siguiendo la redireccion como un navegador, /login ya no repite la renovacion fallida', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAuth({ token: REFRESH_TOKEN_NOT_FOUND })
    const jar = new Map(sessionCookies(revoked))

    const first = await updateSession(request('/seller/tickets', [...jar]), CSP)
    for (const line of first.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0] ?? ''
      const name = pair.slice(0, pair.indexOf('='))
      if (/;\s*Max-Age=0(;|$)/.test(line)) jar.delete(name)
      else jar.set(name, pair.slice(name.length + 1))
    }
    const location = new URL(first.headers.get('location')!)
    const login = await updateSession(
      request(`${location.pathname}${location.search}`, [...jar]),
      CSP,
    )

    // Antes de I-174, el navegador llegaba a /login con la misma cookie y la
    // renovacion fallaba DOS veces: dos llamadas a Auth y dos errores.
    expect(calls.filter((call) => call.path === '/auth/v1/token')).toHaveLength(1)
    expect(jar.size).toBe(0)
    expectPassesWithCsp(login)
    expect(login.headers.getSetCookie()).toEqual([])
  })

  it('/login: tambien borra la cookie, y ahora con las cabeceras que impiden cachearlo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAuth({ token: REFRESH_TOKEN_NOT_FOUND })

    const response = await updateSession(request('/login', sessionCookies(revoked)), CSP)

    expectPassesWithCsp(response)
    expect([...setCookies(response).values()]).toEqual([deletion(SESSION_COOKIE)])
    expect(cacheHeaders(response)).toEqual(NO_CACHE)
    // La pagina de /login se pinta ya sin la sesion invalida.
    expect(forwardedCookies(response).get(SESSION_COOKIE)).toBe('')
  })

  it('sesion en fragmentos: la redireccion borra CADA fragmento', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAuth({ token: REFRESH_TOKEN_NOT_FOUND })
    const chunked = sessionCookies({ ...revoked, user: fakeUser('x'.repeat(4000)) })
    expect(chunked.map(([name]) => name)).toEqual([`${SESSION_COOKIE}.0`, `${SESSION_COOKIE}.1`])

    const response = await updateSession(request('/owner/reports', chunked), CSP)

    expectLoginRedirect(response, '/owner/reports')
    expect(setCookies(response)).toEqual(
      new Map([
        [`${SESSION_COOKIE}.0`, deletion(`${SESSION_COOKIE}.0`)],
        [`${SESSION_COOKIE}.1`, deletion(`${SESSION_COOKIE}.1`)],
      ]),
    )
    expect(cacheHeaders(response)).toEqual(NO_CACHE)
  })
})

describe('sesion valida', () => {
  it('renovacion correcta: la respuesta lleva la sesion nueva, sus cabeceras y el request actualizado', async () => {
    mockAuth({ token: renewed(), user: userFor('acceso-renovado') })
    const expired = session({ access_token: 'acceso-caducado', refresh_token: 'refresco-vigente' })

    const response = await updateSession(request('/seller/dashboard', sessionCookies(expired)), CSP)

    expectPassesWithCsp(response)
    const cookies = setCookies(response)
    expect([...cookies.keys()]).toEqual([SESSION_COOKIE])
    const written = decodeSession(expectSessionWrite(cookies.get(SESSION_COOKIE), SESSION_COOKIE))
    expect(written.access_token).toBe('acceso-renovado')
    expect(written.refresh_token).toBe('refresco-renovado')
    expect(cacheHeaders(response)).toEqual(NO_CACHE)
    // La pagina se pinta con la sesion NUEVA, no con la caducada.
    expect(decodeSession(forwardedCookies(response).get(SESSION_COOKIE)!).access_token).toBe(
      'acceso-renovado',
    )
    // `getUser()` sigue validando contra Auth, y con el token renovado.
    expect(calls.map((call) => call.path)).toEqual(['/auth/v1/token', '/auth/v1/user'])
    expect(calls[1]?.authorization).toBe('Bearer acceso-renovado')
  })

  it('renovacion de una sesion en fragmentos a una que cabe entera: escribe la nueva y borra los fragmentos', async () => {
    mockAuth({ token: renewed(), user: userFor('acceso-renovado') })
    const chunked = sessionCookies({
      ...session({ access_token: 'acceso-caducado', refresh_token: 'refresco-vigente' }),
      user: fakeUser('x'.repeat(4000)),
    })

    const response = await updateSession(request('/seller/clients', chunked), CSP)

    expectPassesWithCsp(response)
    const cookies = setCookies(response)
    expect(cookies.get(`${SESSION_COOKIE}.0`)).toBe(deletion(`${SESSION_COOKIE}.0`))
    expect(cookies.get(`${SESSION_COOKIE}.1`)).toBe(deletion(`${SESSION_COOKIE}.1`))
    expect(
      decodeSession(expectSessionWrite(cookies.get(SESSION_COOKIE), SESSION_COOKIE)).access_token,
    ).toBe('acceso-renovado')
    expect(cookies.size).toBe(3)
    expect(cacheHeaders(response)).toEqual(NO_CACHE)
  })

  it('renovacion correcta pero Auth no confirma al usuario (503): la redireccion conserva la sesion renovada', async () => {
    // El refresh token viejo ya se consumio al renovar. Si la redireccion no
    // llevara el nuevo, el navegador volveria con uno que Auth ya no acepta.
    mockAuth({ token: renewed(), user: () => new Response('no disponible', { status: 503 }) })
    const expired = session({ access_token: 'acceso-caducado', refresh_token: 'refresco-vigente' })

    const response = await updateSession(request('/seller/payments', sessionCookies(expired)), CSP)

    expectLoginRedirect(response, '/seller/payments')
    const cookies = setCookies(response)
    expect([...cookies.keys()]).toEqual([SESSION_COOKIE])
    expect(
      decodeSession(expectSessionWrite(cookies.get(SESSION_COOKIE), SESSION_COOKIE)).refresh_token,
    ).toBe('refresco-renovado')
    expect(cacheHeaders(response)).toEqual(NO_CACHE)
  })

  it('renovada y enseguida terminada en Auth: gana el ultimo cambio y la redireccion la borra', async () => {
    mockAuth({
      token: renewed(),
      user: () => json(403, { code: 'session_not_found', message: 'Session not found' }),
    })
    const expired = session({ access_token: 'acceso-caducado', refresh_token: 'refresco-vigente' })

    const response = await updateSession(request('/owner/users', sessionCookies(expired)), CSP)

    expectLoginRedirect(response, '/owner/users')
    expect([...setCookies(response).values()]).toEqual([deletion(SESSION_COOKIE)])
    expect(cacheHeaders(response)).toEqual(NO_CACHE)
  })

  it('sesion vigente: no se renueva, no escribe cookies ni cabeceras de cache', async () => {
    mockAuth({ user: userFor('acceso-vigente') })
    const current = session({
      access_token: 'acceso-vigente',
      refresh_token: 'refresco-vigente',
      expires_at: now() + 3600,
    })

    const response = await updateSession(request('/seller/dashboard', sessionCookies(current)), CSP)

    expectPassesWithCsp(response)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(cacheHeaders(response)).toEqual(NO_CACHE_HEADERS)
    expect(calls.map((call) => call.path)).toEqual(['/auth/v1/user'])
  })

  it('una cookie que Auth no reconoce no basta: se redirige sin confiar en su contenido', async () => {
    mockAuth({ user: userFor('otro-token') })
    const forged = session({
      access_token: 'acceso-inventado',
      refresh_token: 'refresco-inventado',
      expires_at: now() + 3600,
    })

    const response = await updateSession(request('/owner/dashboard', sessionCookies(forged)), CSP)

    expectLoginRedirect(response, '/owner/dashboard')
    expect(calls.map((call) => call.path)).toEqual(['/auth/v1/user'])
  })
})

describe('sin sesion', () => {
  it('ruta publica: pasa con su CSP y su nonce, sin cookies ni cabeceras de cache', async () => {
    mockAuth({})

    const response = await updateSession(request('/catalogo/vendedor-ficticio'), CSP)

    expectPassesWithCsp(response)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(cacheHeaders(response)).toEqual(NO_CACHE_HEADERS)
    expect(calls).toEqual([])
  })

  it('ruta protegida: redirige a /login con la ruta de vuelta y la CSP, sin tocar cookies', async () => {
    mockAuth({})

    const response = await updateSession(request('/owner/reports?report=sellers'), CSP)

    expectLoginRedirect(response, '/owner/reports')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(cacheHeaders(response)).toEqual(NO_CACHE_HEADERS)
    expect(calls).toEqual([])
  })
})
