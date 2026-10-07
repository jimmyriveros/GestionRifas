// @vitest-environment node
/**
 * I-049, D-254: `NEXT_PUBLIC_SITE_URL` se lee en un solo sitio y `check:env` la valida.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { passwordLinkRedirectTo, siteUrl, siteUrlProblem } from '@/lib/site-url'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('siteUrl y passwordLinkRedirectTo', () => {
  it.each([
    ['https://gestion-rifas.test', 'https://gestion-rifas.test'],
    ['https://gestion-rifas.test/', 'https://gestion-rifas.test'],
    ['  https://gestion-rifas.test//  ', 'https://gestion-rifas.test'],
    ['', ''],
  ])('«%s» → «%s»', (value, expected) => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', value)
    expect(siteUrl()).toBe(expected)
  })

  it('el destino que se pide a Auth no lleva dos barras', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://gestion-rifas.test/')
    expect(passwordLinkRedirectTo()).toBe(
      'https://gestion-rifas.test/auth/callback?next=/reset-password',
    )
  })
})

describe('siteUrlProblem', () => {
  it.each([
    ['https://gestion-rifas.vercel.app', true],
    ['https://gestion-rifas.vercel.app/', true],
    ['http://localhost:3000', false],
    ['http://127.0.0.1:3000', false],
  ])('acepta «%s» (producción: %s)', (value, production) => {
    expect(siteUrlProblem(value, { production })).toBeNull()
  })

  it.each([
    ['falta', undefined, false, /falta/],
    ['vacía', '   ', false, /falta/],
    ['sin esquema', 'gestion-rifas.vercel.app', false, /no es una dirección válida/],
    ['otro esquema', 'ftp://gestion-rifas.vercel.app', false, /https/],
    ['con ruta', 'https://gestion-rifas.vercel.app/login', false, /solo el origen/],
    ['con búsqueda', 'https://gestion-rifas.vercel.app/?a=1', false, /solo el origen/],
    ['http fuera de localhost', 'http://gestion-rifas.vercel.app', false, /https/],
    ['http en producción, aun en localhost', 'http://localhost:3000', true, /https/],
  ])('rechaza %s', (_, value, production, message) => {
    expect(siteUrlProblem(value, { production })).toMatch(message)
  })
})
