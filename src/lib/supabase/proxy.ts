import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import type { Database } from '@/types/database.types'

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/auth/callback', '/denied']

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/**
 * Refresca la sesion de Supabase en cada request y bloquea el acceso a rutas
 * protegidas cuando no hay usuario autenticado.
 *
 * Deliberadamente NO resuelve el rol aqui (evita una consulta a `memberships`
 * en cada request de cada asset). La redireccion por rol ocurre en `/` y en
 * los layouts de servidor de cada portal (docs/SECURITY.md §1, capa 2 y 3).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
          supabaseResponse = NextResponse.next({ request })
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
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
