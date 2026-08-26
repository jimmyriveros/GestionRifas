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

/**
 * Rutas que NO pasan por el proxy.
 *
 * Ojo con lo que se anade aqui: lo que entra en esta lista se queda sin refresco
 * de sesion y sin la comprobacion que manda a `/login` a quien no la tiene. Solo
 * pueden entrar archivos ESTATICOS Y PUBLICOS, que es justo lo que ya eran las
 * exclusiones originales (`_next/static`, imagenes, favicon).
 *
 * Las dos anadidas el 2026-08-26 (D-115) cumplen lo mismo:
 *
 *   * `sw.js` — El service worker. Tiene que poder descargarse SIN sesion: el
 *     navegador lo pide tambien en `/login`, y si el proxy respondiera con la
 *     redireccion a `/login` el registro fallaria con un error de tipo MIME.
 *   * `manifest.webmanifest` — El manifiesto. Lo pide el navegador antes de
 *     ofrecer la instalacion y no lleva ni un dato de nadie.
 *
 * `/offline` NO esta aqui a proposito: es HTML y debe seguir recibiendo la
 * politica de seguridad con su nonce, asi que pasa por el proxy y se declara
 * publica en `PUBLIC_PATHS` (`src/lib/supabase/proxy.ts`), como `/denied`.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
