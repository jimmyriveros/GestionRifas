import { describe, expect, it } from 'vitest'

import {
  buildContentSecurityPolicy,
  generateNonce,
  staticSecurityHeaders,
} from '@/lib/security-headers'

/**
 * Fase 7: cabeceras de seguridad (docs/SECURITY.md §9, D-061).
 *
 * Las directivas se comprueban una a una porque cada una tapa un agujero
 * distinto: aflojar cualquiera pasaria desapercibido en la interfaz y estas
 * pruebas son el unico sitio donde eso se nota.
 */

const PROD = { nonce: 'abc123', supabaseUrl: 'https://xyz.supabase.co', isDevelopment: false }

function directive(policy: string, name: string): string | undefined {
  return policy
    .split('; ')
    .find((part) => part === name || part.startsWith(`${name} `))
    ?.trim()
}

describe('buildContentSecurityPolicy', () => {
  it('parte de default-src self', () => {
    expect(directive(buildContentSecurityPolicy(PROD), 'default-src')).toBe("default-src 'self'")
  })

  it('incluye el nonce del request en script-src', () => {
    expect(directive(buildContentSecurityPolicy(PROD), 'script-src')).toContain("'nonce-abc123'")
  })

  it('NO permite scripts en linea sin nonce en produccion', () => {
    // `unsafe-inline` en script-src equivale a no tener CSP para lo que mas
    // importa: la inyeccion de scripts.
    expect(directive(buildContentSecurityPolicy(PROD), 'script-src')).not.toContain(
      "'unsafe-inline'",
    )
  })

  it('NO permite eval en produccion', () => {
    expect(buildContentSecurityPolicy(PROD)).not.toContain("'unsafe-eval'")
  })

  it('SI permite eval en desarrollo, porque Turbopack lo necesita', () => {
    const dev = buildContentSecurityPolicy({ ...PROD, isDevelopment: true })
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'")
  })

  it('autoriza el origen de Supabase en connect-src, en http y en websocket', () => {
    const connect = directive(buildContentSecurityPolicy(PROD), 'connect-src')
    expect(connect).toContain('https://xyz.supabase.co')
    expect(connect).toContain('wss://xyz.supabase.co')
  })

  it('usa ws:// cuando Supabase es local (http)', () => {
    const connect = directive(
      buildContentSecurityPolicy({ ...PROD, supabaseUrl: 'http://127.0.0.1:54321' }),
      'connect-src',
    )
    expect(connect).toContain('http://127.0.0.1:54321')
    expect(connect).toContain('ws://127.0.0.1:54321')
  })

  it('una URL de Supabase invalida deja la politica MAS estricta, no rota', () => {
    const policy = buildContentSecurityPolicy({ ...PROD, supabaseUrl: 'esto-no-es-una-url' })
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'")
  })

  it('sin URL de Supabase tampoco falla', () => {
    expect(() => buildContentSecurityPolicy({ ...PROD, supabaseUrl: undefined })).not.toThrow()
  })

  it('cierra las vias clasicas de inyeccion', () => {
    const policy = buildContentSecurityPolicy(PROD)
    expect(directive(policy, 'object-src')).toBe("object-src 'none'")
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'")
    // Una inyeccion no puede enviar el formulario —ni sus datos— a otro dominio.
    expect(directive(policy, 'form-action')).toBe("form-action 'self'")
  })

  it('prohibe que la aplicacion se muestre dentro de un iframe (clickjacking)', () => {
    expect(directive(buildContentSecurityPolicy(PROD), 'frame-ancestors')).toBe(
      "frame-ancestors 'none'",
    )
  })

  it('permite estilos en linea a proposito, pero no scripts', () => {
    const policy = buildContentSecurityPolicy(PROD)
    expect(directive(policy, 'style-src')).toContain("'unsafe-inline'")
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'")
  })
})

describe('generateNonce', () => {
  it('devuelve un valor distinto cada vez', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateNonce()))
    expect(nonces.size).toBe(50)
  })

  it('tiene entropia suficiente (16 bytes en base64)', () => {
    expect(generateNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/)
  })
})

describe('staticSecurityHeaders', () => {
  const byKey = (headers: { key: string; value: string }[], key: string) =>
    headers.find((header) => header.key === key)?.value

  it('incluye las cuatro cabeceras que exige el plan de la Fase 7', () => {
    const headers = staticSecurityHeaders(true)
    expect(byKey(headers, 'X-Frame-Options')).toBe('DENY')
    expect(byKey(headers, 'X-Content-Type-Options')).toBe('nosniff')
    expect(byKey(headers, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(byKey(headers, 'Strict-Transport-Security')).toContain('max-age=63072000')
  })

  it('apaga las capacidades del navegador que la aplicacion no usa', () => {
    const permissions = byKey(staticSecurityHeaders(true), 'Permissions-Policy')
    for (const capacidad of ['camera', 'microphone', 'geolocation', 'payment']) {
      expect(permissions).toContain(`${capacidad}=()`)
    }
  })

  it('NO envia HSTS en desarrollo', () => {
    // Anclar `localhost` a https deja el navegador de quien programa roto
    // durante meses: el navegador lo recuerda aunque se quite la cabecera.
    expect(byKey(staticSecurityHeaders(false), 'Strict-Transport-Security')).toBeUndefined()
  })

  it('la referencia a la ruta no filtra ids a terceros', () => {
    // `strict-origin-when-cross-origin` envia solo el origen al salir del sitio:
    // las URL llevan ids de boletas, clientes y pagos.
    expect(byKey(staticSecurityHeaders(true), 'Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    )
  })
})
