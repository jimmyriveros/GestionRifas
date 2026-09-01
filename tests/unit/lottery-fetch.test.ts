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

describe('descarga del acta oficial en PDF (D-153, BR-L23)', () => {
  const ACTA = 'https://plataformaweb.blob.core.windows.net/files/results-records/2026/4817.pdf'
  const pdf = () => new Uint8Array(Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n', 'latin1'))

  it('acepta el host de Azure SOLO en la ruta de las actas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(pdf(), { status: 200, headers: { 'content-type': 'application/pdf' } }),
      ),
    )

    const permitida = await fetchOfficialDocument(ACTA, { expect: 'pdf' })
    expect(permitida.ok).toBe(true)

    const otraRuta = await fetchOfficialDocument(
      'https://plataformaweb.blob.core.windows.net/otra-cuenta/cualquiera.pdf',
      { expect: 'pdf' },
    )
    expect(otraRuta.ok).toBe(false)
    if (otraRuta.ok) return
    expect(otraRuta.code).toBe('blocked_path')
  })

  it('otro host de blob.core.windows.net sigue fuera de la lista', async () => {
    const out = await fetchOfficialDocument(
      'https://cualquiera.blob.core.windows.net/files/results-records/2026/4817.pdf',
      { expect: 'pdf' },
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('blocked_host')
  })

  it('una redireccion dentro del host que sale de la ruta se bloquea', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: {
              location: 'https://plataformaweb.blob.core.windows.net/files/otra/cosa.pdf',
            },
          }),
      ),
    )
    const out = await fetchOfficialDocument(ACTA, { expect: 'pdf' })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('blocked_redirect')
  })

  it('un 404 significa «aun no publicada», no «no existe el resultado»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<?xml version="1.0"?><Error><Code>BlobNotFound</Code></Error>', {
            status: 404,
            headers: { 'content-type': 'application/xml' },
          }),
      ),
    )
    const out = await fetchOfficialDocument(ACTA, { expect: 'pdf' })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('not_published')
    expect(out.code).not.toBe('source_blocked')
  })

  it('un HTML servido como PDF se rechaza por la firma del archivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new TextEncoder().encode('<!doctype html><html>PREMIO MAYOR 4593</html>'), {
            status: 200,
            headers: { 'content-type': 'application/pdf' },
          }),
      ),
    )
    const out = await fetchOfficialDocument(ACTA, { expect: 'pdf' })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('unsupported_type')
    expect(out.message).toMatch(/firma/i)
  })

  it('un tipo de contenido que no es PDF se rechaza antes de descargar el cuerpo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(pdf(), { status: 200, headers: { 'content-type': 'text/html' } }),
      ),
    )
    const out = await fetchOfficialDocument(ACTA, { expect: 'pdf' })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('unsupported_type')
  })

  it('un acta demasiado grande no se carga en memoria entera', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(64), {
            status: 200,
            headers: {
              'content-type': 'application/pdf',
              'content-length': String(9_000_000),
            },
          }),
      ),
    )
    const out = await fetchOfficialDocument(ACTA, { expect: 'pdf', maxBytes: 6_000_000 })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('too_large')
  })

  it('corta por timeout tambien pidiendo un acta', async () => {
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
    const out = await fetchOfficialDocument(ACTA, { expect: 'pdf', timeoutMs: 10 })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('timeout')
  })
})
