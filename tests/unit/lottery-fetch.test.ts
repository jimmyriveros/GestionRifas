import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchOfficialDocument } from '@/features/lottery/fetch'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('descarga oficial (D-144)', () => {
  it('rechaza un host que no esta en la allowlist', async () => {
    const out = await fetchOfficialDocument('https://resultadosloteriascol.com/cundinamarca')
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('blocked_host')
  })

  it('rechaza http y una redireccion fuera de la lista', async () => {
    const http = await fetchOfficialDocument('http://loteriadelmeta.gov.co/resultados/')
    expect(http.ok).toBe(false)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } })),
    )
    const redirect = await fetchOfficialDocument('https://loteriadelmeta.gov.co/resultados/')
    expect(redirect.ok).toBe(false)
    if (redirect.ok) return
    expect(redirect.code).toBe('blocked_redirect')
  })

  it('respeta el tope de tamano', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(80), {
            status: 200,
            headers: { 'content-type': 'text/html', 'content-length': '80' },
          }),
      ),
    )
    const out = await fetchOfficialDocument('https://loteriadelmeta.gov.co/resultados/', {
      maxBytes: 50,
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('too_large')
  })

  it('corta por timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
      }),
    )
    const out = await fetchOfficialDocument('https://loteriadelmeta.gov.co/resultados/', {
      timeoutMs: 20,
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('timeout')
  })

  it('descarga un HTML de un host permitido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (input: RequestInfo | URL) => {
          expect(String(input)).toContain('loteriadelmeta.gov.co')
          return new Response('<html>ok</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          })
        },
      ),
    )
    const out = await fetchOfficialDocument('https://loteriadelmeta.gov.co/resultados/')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(new TextDecoder().decode(out.value.body)).toContain('ok')
  })
})
