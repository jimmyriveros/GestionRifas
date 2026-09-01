import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  downloadCundinamarcaActa,
  fetchLotteryResultForDraw,
} from '@/features/lottery/adapters'
import { extractCundinamarcaActa } from '@/features/lottery/parse/acta-cundinamarca'
import { extractPdfText, isPdfSignature } from '@/features/lottery/parse/pdf'
import {
  ALLOWED_SOURCE_PATHS,
  CUNDINAMARCA_ACTA_HOST,
  CUNDINAMARCA_ACTA_PATH,
  cundinamarcaActaUrl,
  FETCH_MAX_PDF_BYTES,
} from '@/features/lottery/sources'

import {
  buildActaPdf,
  buildEncryptedPdf,
  buildScannedPdf,
  buildTextPdf,
} from '../fixtures/lottery/build-pdf'

const EXPECTED = { drawNumber: '4817' }

describe('URL del acta oficial (D-153, BR-L23)', () => {
  it('arma la ruta exacta que publica el sitio oficial', () => {
    expect(cundinamarcaActaUrl(2026, '4817')).toBe(
      'https://plataformaweb.blob.core.windows.net/files/results-records/2026/4817.pdf',
    )
  })

  it('no arma nada con un ano o un sorteo que no lo sean', () => {
    expect(cundinamarcaActaUrl(2026, '48a7')).toBeNull()
    expect(cundinamarcaActaUrl(2026, '../../secreto')).toBeNull()
    expect(cundinamarcaActaUrl(1999, '4817')).toBeNull()
    expect(cundinamarcaActaUrl(2026.5, '4817')).toBeNull()
  })

  it('el host de Azure NO queda autorizado entero: solo esa ruta', () => {
    const rule = ALLOWED_SOURCE_PATHS[CUNDINAMARCA_ACTA_HOST]
    expect(rule).toBe(CUNDINAMARCA_ACTA_PATH)
    expect(rule?.test('/files/results-records/2026/4817.pdf')).toBe(true)
    expect(rule?.test('/otra-cuenta/cualquier-cosa.pdf')).toBe(false)
    expect(rule?.test('/files/results-records/2026/4817.pdf.exe')).toBe(false)
    expect(rule?.test('/files/results-records/2026/../../etc/passwd')).toBe(false)
  })

  it('el tope del PDF deja sitio a un acta escaneada real (1,5 MB) y sigue acotado', () => {
    expect(FETCH_MAX_PDF_BYTES).toBeGreaterThan(2_000_000)
    expect(FETCH_MAX_PDF_BYTES).toBeLessThanOrEqual(10_000_000)
  })
})

describe('firma del archivo', () => {
  it('un PDF empieza por %PDF- y un HTML disfrazado no', () => {
    expect(isPdfSignature(buildActaPdf())).toBe(true)
    expect(isPdfSignature(new TextEncoder().encode('<!doctype html><html>...'))).toBe(false)
    expect(isPdfSignature(new Uint8Array([0x25, 0x50]))).toBe(false)
  })
})

describe('acta valida', () => {
  it('lee sorteo, fecha, premio mayor y serie', () => {
    const acta = extractCundinamarcaActa(buildActaPdf(), EXPECTED)
    expect('ok' in acta).toBe(false)
    if ('ok' in acta) return
    expect(acta.lotteryCode).toBe('cundinamarca')
    expect(acta.drawNumber).toBe('4817')
    expect(acta.officialDate).toBe('2026-08-31')
    expect(acta.winningNumber).toBe('4593')
    expect(acta.series).toBe('132')
    expect(acta.sourceKind).toBe('official_act')
  })

  it('conserva los ceros iniciales: 0046 no se convierte en 46', () => {
    const acta = extractCundinamarcaActa(buildActaPdf({ premioMayor: '0046' }), EXPECTED)
    if ('ok' in acta) throw new Error('deberia leerse')
    expect(acta.winningNumber).toBe('0046')
    expect(typeof acta.winningNumber).toBe('string')
  })

  it('la serie es opcional: sin ella el acta sigue siendo valida', () => {
    const acta = extractCundinamarcaActa(buildActaPdf({ serie: null }), EXPECTED)
    if ('ok' in acta) throw new Error('deberia leerse')
    expect(acta.winningNumber).toBe('4593')
    expect(acta.series).toBeNull()
  })

  it('no toma el numero de un seco aunque este mas arriba', () => {
    const acta = extractCundinamarcaActa(buildActaPdf({ premioMayor: '7788' }), EXPECTED)
    if ('ok' in acta) throw new Error('deberia leerse')
    expect(acta.winningNumber).toBe('7788')
  })

  it('la evidencia es estructurada y no lleva el texto del acta', () => {
    const acta = extractCundinamarcaActa(buildActaPdf(), EXPECTED)
    if ('ok' in acta) throw new Error('deberia leerse')
    expect(acta.evidence).toEqual({
      prize_label: 'PREMIO MAYOR',
      acta_pages: 1,
      acta_text_operators: expect.any(Number),
      acta_premio_mayor_rows: 1,
    })
    const serialized = JSON.stringify(acta.evidence)
    expect(serialized).not.toContain('SECO')
    expect(serialized).not.toContain('LOTERIA')
  })
})

describe('el generador puede partir el texto, y aun asi se lee', () => {
  it('«PREMIO MAYOR» repartido en varios Tj de la misma linea', () => {
    const pdf = buildTextPdf([
      'LOTERIA DE CUNDINAMARCA',
      'SORTEO No. 4817',
      '31 de agosto de 2026',
      { fragments: ['PRE', 'MIO MA', 'YOR 4593 SERIE 132'] },
    ])
    const acta = extractCundinamarcaActa(pdf, EXPECTED)
    if ('ok' in acta) throw new Error(`deberia leerse: ${acta.message}`)
    expect(acta.winningNumber).toBe('4593')
    expect(acta.series).toBe('132')
  })

  it('un arreglo TJ con ajustes de espaciado', () => {
    const pdf = buildTextPdf([
      'SORTEO No. 4817',
      '31 de agosto de 2026',
      { tj: ['PREMIO MAYOR', '0046', 'SERIE', '132'] },
    ])
    const acta = extractCundinamarcaActa(pdf, EXPECTED)
    if ('ok' in acta) throw new Error(`deberia leerse: ${acta.message}`)
    expect(acta.winningNumber).toBe('0046')
  })

  it('una cadena hexadecimal', () => {
    const pdf = buildTextPdf([
      'SORTEO No. 4817',
      '31 de agosto de 2026',
      { hex: 'PREMIO MAYOR 4593' },
    ])
    const acta = extractCundinamarcaActa(pdf, EXPECTED)
    if ('ok' in acta) throw new Error(`deberia leerse: ${acta.message}`)
    expect(acta.winningNumber).toBe('4593')
  })

  it('un flujo comprimido con FlateDecode', () => {
    const acta = extractCundinamarcaActa(buildActaPdf({ compress: true }), EXPECTED)
    if ('ok' in acta) throw new Error('deberia leerse')
    expect(acta.winningNumber).toBe('4593')
  })
})

describe('ante la duda no se publica', () => {
  it('dos filas de PREMIO MAYOR con numeros distintos', () => {
    const pdf = buildActaPdf({ extraRows: ['PREMIO MAYOR 9999 SERIE 001'] })
    const acta = extractCundinamarcaActa(pdf, EXPECTED)
    if (!('ok' in acta)) throw new Error('no deberia publicarse')
    expect(acta.code).toBe('ambiguous')
    expect(acta.message).toMatch(/mas de un PREMIO MAYOR/i)
  })

  it('dos filas repetidas con el MISMO numero no son ambiguas', () => {
    const pdf = buildActaPdf({ extraRows: ['PREMIO MAYOR 4593 SERIE 132'] })
    const acta = extractCundinamarcaActa(pdf, EXPECTED)
    if ('ok' in acta) throw new Error('deberia leerse')
    expect(acta.winningNumber).toBe('4593')
  })

  it('el acta es de otro sorteo', () => {
    const acta = extractCundinamarcaActa(buildActaPdf({ drawNumber: '4816' }), EXPECTED)
    if (!('ok' in acta)) throw new Error('no deberia publicarse')
    expect(acta.code).toBe('ambiguous')
    expect(acta.message).toMatch(/4816.*4817/)
  })

  it('el acta no trae fecha', () => {
    const pdf = buildTextPdf(['SORTEO No. 4817', 'PREMIO MAYOR 4593 SERIE 132'])
    const acta = extractCundinamarcaActa(pdf, EXPECTED)
    if (!('ok' in acta)) throw new Error('no deberia publicarse')
    expect(acta.code).toBe('ambiguous')
    expect(acta.message).toMatch(/fecha/i)
  })

  it('el acta no trae una fila de premio mayor', () => {
    const pdf = buildTextPdf([
      'LOTERIA DE CUNDINAMARCA',
      'SORTEO No. 4817',
      '31 de agosto de 2026',
      'SECO DE 100 MILLONES 1234 SERIE 045',
    ])
    const acta = extractCundinamarcaActa(pdf, EXPECTED)
    if (!('ok' in acta)) throw new Error('no deberia publicarse')
    expect(acta.code).toBe('ambiguous')
  })

  it('el premio mayor no son cuatro cifras', () => {
    const pdf = buildTextPdf([
      'SORTEO No. 4817',
      '31 de agosto de 2026',
      'PREMIO MAYOR 459 SERIE 132',
    ])
    const acta = extractCundinamarcaActa(pdf, EXPECTED)
    if (!('ok' in acta)) throw new Error('no deberia publicarse')
    expect(acta.code).toBe('ambiguous')
  })
})

describe('documentos que no son un acta legible', () => {
  it('un PDF escaneado se distingue de un PDF sin premio mayor', () => {
    const scanned = buildScannedPdf()
    const extraction = extractPdfText(scanned)
    expect(extraction.textOperators).toBe(0)

    const acta = extractCundinamarcaActa(scanned, EXPECTED)
    if (!('ok' in acta)) throw new Error('no deberia publicarse')
    expect(acta.code).toBe('scanned_document')
    expect(acta.message).toMatch(/escaneado/i)
  })

  it('un PDF cifrado no se intenta abrir', () => {
    const acta = extractCundinamarcaActa(buildEncryptedPdf(), EXPECTED)
    if (!('ok' in acta)) throw new Error('no deberia publicarse')
    expect(acta.code).toBe('unsupported_type')
  })

  it('un HTML disfrazado de PDF no produce un resultado', () => {
    const html = new TextEncoder().encode(
      '<html><body>PREMIO MAYOR 4593 SERIE 132 SORTEO No. 4817 31 de agosto de 2026</body></html>',
    )
    const acta = extractCundinamarcaActa(html, EXPECTED)
    if (!('ok' in acta)) throw new Error('no deberia publicarse')
    expect(['scanned_document', 'parse_error', 'ambiguous']).toContain(acta.code)
    expect(acta.code).not.toBe('ok')
  })
})

describe('el lector de PDF esta acotado', () => {
  it('no se lleva el texto de las imagenes ni infla lo que no toca', () => {
    const extraction = extractPdfText(buildActaPdf())
    expect(extraction.pages).toBe(1)
    expect(extraction.lines.length).toBeGreaterThan(3)
    expect(extraction.lines.every((line) => line.text.length < 200)).toBe(true)
  })
})

describe('adaptador completo, con la red simulada (D-153)', () => {
  const ACTA_URL =
    'https://plataformaweb.blob.core.windows.net/files/results-records/2026/4817.pdf'

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubPdf(bytes: Uint8Array, status = 200) {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input))
        const copy = new Uint8Array(bytes).buffer
        const body: BodyInit = status === 200 ? copy : '<Error/>'
        return new Response(body, {
          status,
          headers: { 'content-type': status === 200 ? 'application/pdf' : 'application/xml' },
        })
      }),
    )
    return calls
  }

  it('pide exactamente la URL del acta y devuelve el resultado', async () => {
    const calls = stubPdf(buildActaPdf())
    const out = await downloadCundinamarcaActa(2026, '4817')

    expect(calls).toEqual([ACTA_URL])
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.winningNumber).toBe('4593')
    expect(out.value.sourceKind).toBe('official_act')
    expect(out.sourceUrl).toBe(ACTA_URL)
    expect(out.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('NO conserva el documento ni su texto: solo URL, hash y campos', async () => {
    stubPdf(buildActaPdf())
    const out = await downloadCundinamarcaActa(2026, '4817')
    if (!out.ok) throw new Error('deberia leerse')

    const serialized = JSON.stringify(out)
    expect(serialized).not.toContain('%PDF')
    expect(serialized).not.toContain('SECO')
    expect(serialized).not.toContain('LOTERIA DE CUNDINAMARCA')
    expect(serialized).not.toContain('ACTA DE RESULTADOS')
    // Lo que si viaja: la URL final, el hash, y los campos extraidos.
    expect(Object.keys(out).sort()).toEqual(
      ['contentHash', 'contentType', 'fetchedAt', 'ok', 'sourceUrl', 'value'].sort(),
    )
  })

  it('un 404 se traduce a «aun no publicada» y se puede reintentar', async () => {
    stubPdf(new Uint8Array(), 404)
    const out = await downloadCundinamarcaActa(2026, '4818')
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('not_published')
  })

  it('un acta escaneada no publica nada y lo dice con su propio codigo', async () => {
    stubPdf(buildScannedPdf())
    const out = await downloadCundinamarcaActa(2026, '4817')
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('scanned_document')
  })

  it('el ano y el sorteo se validan antes de tocar la red', async () => {
    const calls = stubPdf(buildActaPdf())
    const out = await downloadCundinamarcaActa(2026, 'no-es-un-sorteo')
    expect(calls).toEqual([])
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('parse_error')
  })

  it('el tick de Cundinamarca va al acta, no a la SPA ni al verificador', async () => {
    const calls = stubPdf(buildActaPdf())
    const out = await fetchLotteryResultForDraw('cundinamarca', '4817', { year: 2026 })

    expect(calls).toEqual([ACTA_URL])
    expect(calls.some((url) => url.includes('result/public'))).toBe(false)
    expect(calls.some((url) => url.includes('/resultados'))).toBe(false)
    expect(out.ok).toBe(true)
  })
})
