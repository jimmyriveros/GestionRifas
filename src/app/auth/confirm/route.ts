import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/**
 * Abre el enlace de los correos de Auth: la invitación y el de elegir contraseña (I-206, D-254).
 *
 * Las plantillas (`supabase/templates/`) apuntan aquí con el `token_hash` del correo, y la sesión
 * nace en el SERVIDOR con `verifyOtp`, en cookies. Así el enlace funciona:
 *   · aunque lo haya generado la clave de servicio —la invitación y su reenvío—, que no trae el
 *     `code` PKCE que espera `/auth/callback` y dejaba la sesión en el fragmento (`#access_token`);
 *   · y aunque se abra en otro navegador o en otro teléfono que el que pidió el correo.
 *
 * Solo dos tipos, y los dos llevan a elegir la contraseña. No hay `next`: el destino es fijo, así
 * que un enlace manipulado no puede llevar a ningún otro sitio (D-253). `/auth/callback` se queda
 * para los enlaces que salieron antes del cambio de plantillas.
 */
const LINK_TYPES: ReadonlySet<string> = new Set<EmailOtpType>(['invite', 'recovery'])
const DESTINATION = '/reset-password'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (tokenHash && type && LINK_TYPES.has(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })
    if (!error) {
      return NextResponse.redirect(`${origin}${DESTINATION}`)
    }
  }

  // El mismo aviso que el callback: «El enlace no es válido o ya expiró. Solicítalo nuevamente.»
  return NextResponse.redirect(`${origin}/login?error=auth_callback`)
}
