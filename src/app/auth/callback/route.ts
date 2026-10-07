import { NextResponse } from 'next/server'

import { safeNextPath } from '@/features/auth/safe-next-path'
import { createClient } from '@/lib/supabase/server'

/** Intercambia el codigo de Supabase Auth (recuperacion, invitacion, confirmacion) por una sesion. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Una ruta de Rifas o la portada (D-253): nunca `//evil.test/path` ni nada parecido.
  const next = safeNextPath(searchParams.get('next')) ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`)
}
