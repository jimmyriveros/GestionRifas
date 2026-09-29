import { createServerClient, type SetAllCookies } from '@supabase/ssr'
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
  // La pantalla de la pausa de publicacion (D-239): texto fijo, sin consultas.
  // La ve quien tiene sesion —las guardas lo traen aqui— y quien no la tiene.
  '/mantenimiento',
  // El programador no trae sesion. El Route Handler valida un secreto
  // (D-148). Sin esta entrada el proxy redirigiria a /login con 307.
  '/api/lottery/sync',
  // Lo mismo para el despachador de avisos (BR-V08, D-191): lo llama el
  // `pg_cron` de la base por `pg_net`, sin sesion, con su propio secreto.
  '/api/push/dispatch',
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
 * Lo que Supabase pide escribir en la respuesta al llamar a `setAll` (I-174,
 * D-236): las cookies de la sesion —renovadas, o vaciadas con `Max-Age=0`
 * cuando la sesion ya no sirve, fragmento a fragmento— y las cabeceras que
 * impiden cachear esa respuesta (`Cache-Control`, `Expires`, `Pragma`).
 */
type SessionWrites = {
  cookies: Parameters<SetAllCookies>[0]
  headers: Parameters<SetAllCookies>[1]
}

/** Aplica esas escrituras tal cual: cada cookie con SUS atributos. */
function applySessionWrites(response: NextResponse, writes: SessionWrites) {
  for (const { name, value, options } of writes.cookies) {
    response.cookies.set(name, value, options)
  }
  for (const [name, value] of Object.entries(writes.headers)) {
    response.headers.set(name, value)
  }
}

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
  /**
   * Se guarda la ULTIMA llamada a `setAll`, igual que `supabaseResponse` se
   * reconstruye en cada una: `@supabase/ssr` acumula lo escrito y lo borrado,
   * asi que cada llamada ya trae el estado completo de la sesion.
   */
  let sessionWrites: SessionWrites = { cookies: [], headers: {} }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          sessionWrites = { cookies: cookiesToSet, headers }
          supabaseResponse = buildResponse()
          applySessionWrites(supabaseResponse, sessionWrites)
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
    // La redireccion es una respuesta NUEVA y no hereda nada de
    // `supabaseResponse` (I-174). Sin esto se perdia el borrado de una sesion
    // invalida —el navegador la volvia a enviar y `/login` repetia la
    // renovacion fallida— o la sesion recien renovada.
    applySessionWrites(redirectResponse, sessionWrites)
    if (csp) redirectResponse.headers.set('Content-Security-Policy', csp.policy)
    return redirectResponse
  }

  if (csp) supabaseResponse.headers.set('Content-Security-Policy', csp.policy)
  return supabaseResponse
}
