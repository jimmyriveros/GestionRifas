import type { NextRequest } from 'next/server'

import { buildContentSecurityPolicy, generateNonce } from '@/lib/security-headers'
import { updateSession } from '@/lib/supabase/proxy'

// Next.js 16 renombro `middleware` a `proxy` (ver docs/DECISIONS.md D-027).
export async function proxy(request: NextRequest) {
  // Un nonce NUEVO por request: reutilizarlo anularia su proposito, porque
  // bastaria con leer una respuesta anterior para poder firmar un script.
  const nonce = generateNonce()
  const policy = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    isDevelopment: process.env.NODE_ENV === 'development',
  })

  return updateSession(request, { nonce, policy })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
