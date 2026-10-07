// @vitest-environment node
/**
 * I-206, D-254: el enlace de los correos de Auth —invitación y elegir contraseña— abre la sesión
 * en el servidor con el `token_hash`, y las plantillas y la configuración local apuntan a él.
 *
 * Sin base ni navegador. Con los dos: `tests/e2e/invitaciones.spec.ts`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { GET as authConfirm } from '@/app/auth/confirm/route'
import * as supabaseServer from '@/lib/supabase/server'

const ORIGIN = 'http://localhost:3000'
const ROOT = path.resolve(import.meta.dirname, '../..')

function supabaseVerifying(error: unknown = null) {
  const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error })
  vi.mocked(supabaseServer.createClient).mockResolvedValue({ auth: { verifyOtp } } as never)
  return verifyOtp
}

async function confirmLocation(params: Record<string, string>): Promise<string> {
  const url = new URL(`${ORIGIN}/auth/confirm`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await authConfirm(new Request(url))
  expect(response.status).toBe(307)
  return response.headers.get('location')!
}

afterEach(() => {
  vi.mocked(supabaseServer.createClient).mockReset()
})

describe('D-254: /auth/confirm', () => {
  it.each(['invite', 'recovery'])(
    '«%s» con un token válido abre «Nueva contraseña»',
    async (type) => {
      const verifyOtp = supabaseVerifying()
      await expect(confirmLocation({ token_hash: 'hash-ficticio', type })).resolves.toBe(
        `${ORIGIN}/reset-password`,
      )
      expect(verifyOtp).toHaveBeenCalledWith({ type, token_hash: 'hash-ficticio' })
    },
  )

  it('un token que Auth rechaza (usado o vencido) lleva al aviso de enlace vencido', async () => {
    supabaseVerifying({ message: 'Email link is invalid or has expired', code: 'otp_expired' })
    await expect(confirmLocation({ token_hash: 'usado', type: 'invite' })).resolves.toBe(
      `${ORIGIN}/login?error=auth_callback`,
    )
  })

  it.each([
    ['sin token', { type: 'invite' }],
    ['sin tipo', { token_hash: 'hash' }],
    ['alta pública', { token_hash: 'hash', type: 'signup' }],
    ['enlace mágico', { token_hash: 'hash', type: 'magiclink' }],
    ['cambio de correo', { token_hash: 'hash', type: 'email_change' }],
    ['tipo inventado', { token_hash: 'hash', type: 'owner' }],
  ])('%s: ni siquiera pregunta a Auth', async (_, params) => {
    const verifyOtp = supabaseVerifying()
    await expect(confirmLocation(params)).resolves.toBe(`${ORIGIN}/login?error=auth_callback`)
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('un `next` en el enlace no cambia el destino (D-253)', async () => {
    supabaseVerifying()
    await expect(
      confirmLocation({ token_hash: 'hash', type: 'invite', next: '/\\evil.test' }),
    ).resolves.toBe(`${ORIGIN}/reset-password`)
  })
})

describe('D-254: las plantillas y la configuración local', () => {
  const config = readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')

  /** El valor de `key` dentro de la sección `[section]` de config.toml. */
  function setting(section: string, key: string): string | undefined {
    // Al principio de una línea: un comentario puede nombrar la sección.
    const header = new RegExp(`^\\[${section.replaceAll('.', '\\.')}\\]\\s*$`, 'm').exec(config)
    if (!header) return undefined
    const rest = config.slice(header.index + header[0].length)
    const body = rest.slice(0, rest.search(/^\[/m) >= 0 ? rest.search(/^\[/m) : undefined)
    return new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm').exec(body)?.[1]?.trim()
  }

  it('el registro público está cerrado y el proveedor de correo sigue activado', () => {
    expect(setting('auth', 'enable_signup')).toBe('false')
    expect(setting('auth.email', 'enable_signup')).toBe('true')
  })

  it.each([
    ['invite', 'Tu invitación a Rifas', 'Crear mi contraseña'],
    ['recovery', 'Elige tu contraseña de Rifas', 'Elegir mi contraseña'],
  ])('«%s»: asunto en español y el enlace a /auth/confirm con su tipo', (type, subject, button) => {
    expect(setting(`auth.email.template.${type}`, 'subject')).toBe(`"${subject}"`)
    const contentPath = setting(`auth.email.template.${type}`, 'content_path')
    expect(contentPath).toBe(`"./supabase/templates/${type}.html"`)

    const html = readFileSync(path.join(ROOT, `supabase/templates/${type}.html`), 'utf8')
    const link = `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}`
    expect(html).toContain(`href="${link}"`)
    // El mismo enlace, escrito, por si el botón no funciona.
    expect(html.split(link)).toHaveLength(3)
    expect(html).toContain(`>${button}</a`)
    // Ni la plantilla por defecto ni comentarios: el motor también evaluaría lo que hay dentro.
    expect(html).not.toContain('ConfirmationURL')
    expect(html).not.toContain('<!--')
    expect(html).not.toMatch(/\b(ticket|usuario|admin|owner|link)\b/i)
  })
})
