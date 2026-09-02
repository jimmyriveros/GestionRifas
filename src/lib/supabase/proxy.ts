import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import type { Database } from '@/types/database.types'

/**
 * Rutas que se sirven sin sesion.
 *
 * `/offline` se anadio el 2026-08-26 (D-116): es la pantalla que guarda el
 * service worker al instalarse y que muestra cuando una navegacion no llega al
 * servidor. Tiene que poder guardarse y verse sin sesion —el worker se instala
 * tambien desde `/login`— y no consulta absolutamente nada: es texto fijo.
 */
const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/denied',
  '/offline',
  // El programador no trae sesion. El Route Handler valida un secreto
  // (D-148). Sin esta entrada el proxy redirigiria a /login con 307.
  '/api/lottery/sync',
  /**
   * El catalogo publico de un vendedor (D-159). Quien lo abre llega desde un
   * enlace de WhatsApp y NO tiene sesion; sin esta entrada el proxy lo mandaria
   * a `/login`, que es justo lo contrario de publicar algo.
   *
   * Entra como PREFIJO —`isPublicPath` acepta `/catalogo/loquesea`— porque el
   * slug es parte de la ruta. Eso NO abre nada mas: `/catalogo` es un segmento
   * propio que no existe en ningun otro sitio de la aplicacion, y lo que se
   * pueda leer desde el lo decide `public_catalog_tickets` (0043), no el proxy.
   *
   * Sigue pasando POR el proxy, como `/offline` y `/denied`: es HTML y debe
   * recibir la Content-Security-Policy con su nonce.
   */
  '/catalogo',
]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export type CspContext = { nonce: string; policy: string }

/**
 * Refresca la sesion de Supabase en cada request y bloquea el acceso a rutas
 * protegidas cuando no hay usuario autenticado.
 *
 * Deliberadamente NO resuelve el rol aqui (evita una consulta a `memberships`
 * en cada request de cada asset). La redireccion por rol ocurre en `/` y en
 * los layouts de servidor de cada portal (docs/SECURITY.md §1, capa 2 y 3).
 */
export async function updateSession(request: NextRequest, csp?: CspContext) {
  /**
   * Construye la respuesta reenviando las cabeceras ACTUALES del request.
   *
   * Se leen en cada llamada y no una sola vez al principio porque
   * `request.cookies.set()` actualiza la cabecera `cookie`: capturarlas antes
   * dejaria fuera la sesion que Supabase acaba de refrescar, y el usuario
   * aparecería como no autenticado de forma intermitente.
   *
   * La CSP se inyecta tambien en el REQUEST, no solo en la respuesta: de ahi es
   * de donde Next lee el nonce para ponerselo a sus propios scripts de
   * hidratacion. Sin eso, la politica bloquearia la propia aplicacion.
   */
  const buildResponse = () => {
    const headers = new Headers(request.headers)
    if (csp) {
      headers.set('x-nonce', csp.nonce)
      headers.set('Content-Security-Policy', csp.policy)
    }
    return NextResponse.next({ request: { headers } })
  }

  let supabaseResponse = buildResponse()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          supabaseResponse = buildResponse()
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // No ejecutar logica entre createServerClient y getUser(): un error aqui
  // puede desloguear usuarios de forma intermitente y muy dificil de depurar.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', request.nextUrl.pathname)
    const redirectResponse = NextResponse.redirect(url)
    if (csp) redirectResponse.headers.set('Content-Security-Policy', csp.policy)
    return redirectResponse
  }

  if (csp) supabaseResponse.headers.set('Content-Security-Policy', csp.policy)
  return supabaseResponse
}
