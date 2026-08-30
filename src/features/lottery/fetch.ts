import 'server-only'

import {
  ALLOWED_SOURCE_HOSTS,
  FETCH_MAX_BYTES,
  FETCH_MAX_REDIRECTS,
  FETCH_TIMEOUT_MS,
} from './sources'
import type { AdapterFail } from './types'

export type FetchedDocument = {
  url: string
  status: number
  contentType: string
  body: Uint8Array
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return ALLOWED_SOURCE_HOSTS.some((allowed) => host === allowed)
}

function fail(code: AdapterFail['code'], message: string, sourceUrl?: string): AdapterFail {
  return { ok: false, code, message, sourceUrl }
}

/**
 * Descarga HTTPS acotada: allowlist de hosts, tope de tamano, timeout y
 * redirecciones que no pueden abandonar la lista (D-144).
 */
export async function fetchOfficialDocument(
  url: string,
  init?: { timeoutMs?: number; maxBytes?: number },
): Promise<{ ok: true; value: FetchedDocument } | AdapterFail> {
  let current: URL
  try {
    current = new URL(url)
  } catch {
    return fail('parse_error', 'La URL de la fuente no es valida.', url)
  }

  if (current.protocol !== 'https:') {
    return fail('blocked_host', 'Solo se aceptan fuentes HTTPS.', url)
  }
  if (!hostAllowed(current.hostname)) {
    return fail('blocked_host', 'La fuente no esta en la lista de dominios oficiales.', url)
  }

  const timeoutMs = init?.timeoutMs ?? FETCH_TIMEOUT_MS
  const maxBytes = init?.maxBytes ?? FETCH_MAX_BYTES
  let hops = 0

  while (hops <= FETCH_MAX_REDIRECTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept:
            'text/html,application/xhtml+xml,application/json,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream;q=0.8,*/*;q=0.1',
        },
      })
    } catch (error) {
      clearTimeout(timer)
      if (error instanceof Error && error.name === 'AbortError') {
        return fail('timeout', 'La fuente oficial no respondio a tiempo.', current.href)
      }
      return fail('parse_error', 'No se pudo consultar la fuente oficial.', current.href)
    }
    clearTimeout(timer)

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        return fail('blocked_redirect', 'La redireccion no trae destino.', current.href)
      }
      const next = new URL(location, current)
      if (next.protocol === 'http:') next.protocol = 'https:'
      if (next.protocol !== 'https:' || !hostAllowed(next.hostname)) {
        return fail(
          'blocked_redirect',
          'La redireccion abandona los dominios oficiales.',
          next.href,
        )
      }
      current = next
      hops += 1
      continue
    }

    if (response.status === 403 || response.status === 429 || response.status === 503) {
      const peek = (await response.text()).slice(0, 400).toLowerCase()
      if (peek.includes('just a moment') || peek.includes('cf-') || peek.includes('captcha')) {
        return fail(
          'source_blocked',
          'La fuente oficial exige una verificacion que no se elude.',
          current.href,
        )
      }
      return fail('source_blocked', 'La fuente oficial rechazo la consulta.', current.href)
    }

    if (!response.ok) {
      return fail('source_blocked', 'La fuente oficial no entrego el documento.', current.href)
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    const lengthHeader = response.headers.get('content-length')
    if (lengthHeader && Number(lengthHeader) > maxBytes) {
      return fail('too_large', 'El documento oficial supera el tamano permitido.', current.href)
    }

    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) {
      return fail('too_large', 'El documento oficial supera el tamano permitido.', current.href)
    }

    return {
      ok: true,
      value: {
        url: current.href,
        status: response.status,
        contentType,
        body: buffer,
      },
    }
  }

  return fail('blocked_redirect', 'Demasiadas redirecciones.', url)
}
