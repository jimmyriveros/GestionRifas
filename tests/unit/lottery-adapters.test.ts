import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import {
  extractCnjsaDiscovery,
  extractCnjsaSchedule,
  extractLotteryResult,
  pickCnjsaWorkbook,
} from '@/features/lottery/adapters'
import { readZipEntries, writeZip } from '@/features/lottery/parse/zip'
import { CNJSA_DISCOVERY_URL } from '@/features/lottery/sources'
import {
  buildCnjsaOrdinariosXlsx,
  EXCEL_TIME,
  isoToExcelSerial,
} from '../fixtures/lottery/build-xlsx'

const CNJSA_HTML = `
<a href="https://www.coljuegos.gov.co/loader.php?lServicio=Tools2&amp;lTipo=descargas&amp;lFuncion=descargar&amp;idFile=309186&amp;id_comunidad=cnjsa">Cronograma de sorteos ordinarios y extraordinarios para la vigencia 2026</a>
<a href="https://www.coljuegos.gov.co/loader.php?lServicio=Tools2&amp;lTipo=descargas&amp;lFuncion=descargar&amp;idFile=301905&amp;id_comunidad=cnjsa">Acuerdo 887 - CRONOGRAMA DE SORTEOS ORDINARIOS LOTERIA 2026</a>
<a href="https://www.coljuegos.gov.co/loader.php?lServicio=Tools2&amp;lTipo=descargas&amp;lFuncion=descargar&amp;idFile=301906&amp;id_comunidad=cnjsa">Acuerdo 889 de 2025 - LINEAMIENTOS PARA EXPEDIR CRONOGRAMA DE SORTEOS EXTRAORDINARIOS</a>
<a href="https://www.coljuegos.gov.co/loader.php?lServicio=Tools2&amp;lTipo=descargas&amp;lFuncion=descargar&amp;idFile=301907&amp;id_comunidad=cnjsa">Acuerdo 888 - CRONOGRAMA DE SORTEOS EXTRAORDINARIOS PRIMER CUATRIMESTRE 2026</a>
`

function scheduleFixture() {
  return buildCnjsaOrdinariosXlsx([
    ['Lotería de Bogotá', '2840', 'martes', isoToExcelSerial('2026-03-31'), EXCEL_TIME.h2315, 'Acuerdo 887/25', 'Acuerdo 893/26'],
    ['Lotería Nacional de la Cruz Roja Colombiana', '3183', 'Jueves', isoToExcelSerial('2026-12-10'), EXCEL_TIME.h2255, 'Acuerdo 887/25', ''],
    ['Lotería del Meta', '3311', 'Viernes', isoToExcelSerial('2026-08-14'), EXCEL_TIME.h2230, 'Acuerdo 887/25', 'oficio 20260321901'],
    ['Lotería de Medellín', '4829', 'Sábado', isoToExcelSerial('2026-04-04'), EXCEL_TIME.h2300, 'Acuerdo 887/25', ''],
    ['Lotería de Medellín', '4833', 'Sábado', isoToExcelSerial('2026-05-02'), EXCEL_TIME.h2300, 'Acuerdo 887/25', ''],
    ['Lotería de Medellín', '4847', 'Sábado', isoToExcelSerial('2026-08-08'), EXCEL_TIME.h2300, 'Acuerdo 887/25', ''],
    ['Lotería de Medellín', '4867', 'Sábado', isoToExcelSerial('2026-12-26'), EXCEL_TIME.h2300, 'Acuerdo 887/25', ''],
    ['Lotería de Boyacá', '4618', 'Sábado', isoToExcelSerial('2026-04-04'), EXCEL_TIME.h2230, 'Acuerdo 887/25', ''],
    ['Empresa Comercial de Lotería de Cundinamarca', '4815', 'Viernes', isoToExcelSerial('2026-08-14'), EXCEL_TIME.h2000, 'Acuerdo 887/25', 'Acuerdo 969 de 2026'],
    ['Lotería de Bogotá', '2861', 'Jueves', isoToExcelSerial('2026-08-27'), EXCEL_TIME.h2315, 'Acuerdo 887/25', ''],
  ])
}

describe('CNJSA descubrimiento', () => {
  it('descubre documentos y no mezcla extraordinarios con el consolidado', () => {
    const docs = extractCnjsaDiscovery(CNJSA_HTML, CNJSA_DISCOVERY_URL)
    expect(docs.some((d) => d.kind === 'extraordinary' && /889/.test(d.title))).toBe(true)
    expect(docs.some((d) => d.kind === 'ordinary_acuerdo' && /887/.test(d.title))).toBe(true)
    const chosen = pickCnjsaWorkbook(CNJSA_HTML, CNJSA_DISCOVERY_URL, 2026)
    expect('href' in chosen).toBe(true)
    if ('href' in chosen) {
      expect(chosen.kind).toBe('consolidated')
      expect(chosen.href).toContain('idFile=309186')
    }
  })
})

describe('CNJSA ordinarios (casos 2026 revalidados contra el xlsx oficial)', () => {
  const parsed = extractCnjsaSchedule(scheduleFixture(), {
    documentTitle: 'Cronograma 2026',
    documentUrl: 'https://cnjsa.coljuegos.gov.co/cronograma.xlsx',
  })

  it('lee el xlsx y descarta la hoja de extraordinarios', () => {
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.skippedExtraordinary).toBe(1)
    expect(parsed.value.draws.every((d) => d.lotteryCode !== undefined)).toBe(true)
  })

  it('Bogota del jueves 2 de abril se jugo el martes 31 de marzo a las 23:15', () => {
    if (!parsed.ok) throw new Error('xlsx')
    const draw = parsed.value.draws.find(
      (d) => d.lotteryCode === 'bogota' && d.drawNumber === '2840',
    )
    expect(draw?.referenceDate).toBe('2026-04-02')
    expect(draw?.officialScheduledAt.startsWith('2026-03-31T23:15:00')).toBe(true)
    expect(draw?.scheduleStatus).toBe('rescheduled_earlier')
  })

  it('Cruz Roja del martes 8 de diciembre se jugo el jueves 10', () => {
    if (!parsed.ok) throw new Error('xlsx')
    const draw = parsed.value.draws.find(
      (d) => d.lotteryCode === 'cruz_roja' && d.drawNumber === '3183',
    )
    expect(draw?.referenceDate).toBe('2026-12-08')
    expect(draw?.officialScheduledAt.startsWith('2026-12-10T22:55:00')).toBe(true)
    expect(draw?.scheduleStatus).toBe('rescheduled_later')
  })

  it('Meta del miercoles 12 de agosto se jugo el viernes 14', () => {
    if (!parsed.ok) throw new Error('xlsx')
    const draw = parsed.value.draws.find(
      (d) => d.lotteryCode === 'meta' && d.drawNumber === '3311',
    )
    expect(draw?.referenceDate).toBe('2026-08-12')
    expect(draw?.officialScheduledAt.startsWith('2026-08-14T22:30:00')).toBe(true)
    expect(draw?.changeReason).toBe('force_majeure')
  })

  it('Medellin de viernes festivo se jugo el sabado; Boyaca no se mueve', () => {
    if (!parsed.ok) throw new Error('xlsx')
    const medellin = parsed.value.draws.find(
      (d) => d.lotteryCode === 'medellin' && d.drawNumber === '4829',
    )
    const boyaca = parsed.value.draws.find(
      (d) => d.lotteryCode === 'boyaca' && d.drawNumber === '4618',
    )
    expect(medellin?.referenceDate).toBe('2026-04-03')
    expect(medellin?.scheduleStatus).toBe('rescheduled_later')
    expect(boyaca?.referenceDate).toBe('2026-04-04')
    expect(boyaca?.scheduleStatus).toBe('scheduled')
  })

  it('Medellin de 1 de mayo, 7 de agosto y 25 de diciembre se jugo el sabado siguiente', () => {
    if (!parsed.ok) throw new Error('xlsx')
    const may = parsed.value.draws.find(
      (d) => d.lotteryCode === 'medellin' && d.drawNumber === '4833',
    )
    const august = parsed.value.draws.find(
      (d) => d.lotteryCode === 'medellin' && d.drawNumber === '4847',
    )
    const christmas = parsed.value.draws.find(
      (d) => d.lotteryCode === 'medellin' && d.drawNumber === '4867',
    )
    expect(may?.referenceDate).toBe('2026-05-01')
    expect(may?.officialScheduledAt.startsWith('2026-05-02')).toBe(true)
    expect(august?.referenceDate).toBe('2026-08-07')
    expect(christmas?.referenceDate).toBe('2026-12-25')
    expect(christmas?.officialScheduledAt.startsWith('2026-12-26')).toBe(true)
  })

  it('Cundinamarca 4815 del lunes 10 de agosto se jugo el viernes 14', () => {
    if (!parsed.ok) throw new Error('xlsx')
    const draw = parsed.value.draws.find(
      (d) => d.lotteryCode === 'cundinamarca' && d.drawNumber === '4815',
    )
    expect(draw?.referenceDate).toBe('2026-08-10')
    expect(draw?.officialScheduledAt.startsWith('2026-08-14T20:00:00')).toBe(true)
    expect(draw?.scheduleStatus).toBe('rescheduled_later')
    expect(draw?.changeReason).toBe('official_change')
  })

  it('un acuerdo PDF no se usa como cronograma', () => {
    const out = extractCnjsaSchedule(new TextEncoder().encode('%PDF-1.4 acuerdo'), {
      documentTitle: 'Acuerdo 887',
      documentUrl: 'https://cnjsa.coljuegos.gov.co/acuerdo.pdf',
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('unsupported_type')
  })

  it('un xlsx sin hoja de ordinarios falla sin inventar sorteos', () => {
    const bytes = writeZip({
      '[Content_Types].xml':
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Extraordinarios" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
      'xl/worksheets/sheet1.xml':
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData></sheetData></worksheet>',
    })
    const out = extractCnjsaSchedule(bytes, {
      documentTitle: 'solo extra',
      documentUrl: 'https://cnjsa.coljuegos.gov.co/cronograma.xlsx',
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('parse_error')
  })
})

describe('ZIP de xlsx', () => {
  it('infla una entrada deflate como el cronograma oficial de CNJSA', () => {
    const payload = Buffer.from('<worksheet>ok</worksheet>', 'utf8')
    const compressed = deflateRawSync(payload)
    const name = Buffer.from('xl/worksheets/sheet1.xml', 'utf8')
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(payload.length, 22)
    local.writeUInt16LE(name.length, 26)
    name.copy(local, 30)
    const cen = Buffer.alloc(46 + name.length)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(8, 10)
    cen.writeUInt16LE(name.length, 28)
    cen.writeUInt32LE(compressed.length, 20)
    cen.writeUInt32LE(payload.length, 24)
    name.copy(cen, 46)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(1, 8)
    end.writeUInt16LE(1, 10)
    end.writeUInt32LE(cen.length, 12)
    end.writeUInt32LE(local.length + compressed.length, 16)
    const zip = Buffer.concat([local, compressed, cen, end])
    const entries = readZipEntries(zip)
    expect(Buffer.from(entries.get('xl/worksheets/sheet1.xml') ?? []).toString()).toBe(
      '<worksheet>ok</worksheet>',
    )
  })
})

describe('resultados oficiales', () => {
  it('Meta: sorteo, fecha, numero mayor 8134 y serie informativa', () => {
    const html = `
      <h1>Lotería del Meta</h1>
      <p>Sorteo 3313</p>
      <p>26/08/2026</p>
      <p>Número</p><p>8134</p>
      <p>Serie</p><p>096</p>
      <p>Número</p><p>0760</p>
    `
    const out = extractLotteryResult('meta', html, 'https://loteriadelmeta.gov.co/resultados/')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.winningNumber).toBe('8134')
    expect(out.value.drawNumber).toBe('3313')
    expect(out.value.officialDate).toBe('2026-08-26')
    expect(out.value.series).toBe('096')
  })

  it('conserva ceros iniciales: 0046 no se convierte en 46', () => {
    const html = `
      <h1>Lotería del Meta</h1>
      <p>Sorteo 3300</p>
      <p>2026-08-05</p>
      <p>Número 0046</p>
      <p>Serie 007</p>
    `
    const out = extractLotteryResult('meta', html, 'https://loteriadelmeta.gov.co/resultados/')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.winningNumber).toBe('0046')
  })

  it('Cruz Roja toma el premio mayor, no el seco', () => {
    const html = `
      RESULTADOS Lotería Cruz Roja
      SORTEO 3168
      FECHA 25/08/2026
      GANADOR PREMIO MAYOR 4 9 3 9
      SERIE 112
      GANADOR SECO 200 MILLONES 2 9 1 3
    `
    const out = extractLotteryResult('cruz_roja', html, 'https://lotecruz.org.co/')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.winningNumber).toBe('4939')
    expect(out.value.drawNumber).toBe('3168')
  })

  it('Medellin ignora el sorteo extra de la misma pagina', () => {
    const html = `
      Lotería de Medellín Extra de la Medellín
      Sorteo número 0018 del 20 de Junio de 2026 Número 2323 Serie 554
      Sorteo número 4850 del 28 de Agosto de 2026 Número 2608 Serie 301
    `
    const out = extractLotteryResult('medellin', html, 'https://loteriademedellin.com.co/resultados/')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.drawNumber).toBe('4850')
    expect(out.value.winningNumber).toBe('2608')
    expect(out.value.officialDate).toBe('2026-08-28')
  })

  it('Medellin rechaza una pagina que solo trae el extra', () => {
    const html = `
      Lotería de Medellín Extra de la Medellín
      Sorteo número 0018 del 20 de Junio de 2026 Número 2323 Serie 554
    `
    const out = extractLotteryResult('medellin', html, 'https://loteriademedellin.com.co/resultados/')
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('not_ordinary')
  })

  it('Cruz Roja con Imunify no se elude', () => {
    const out = extractLotteryResult(
      'cruz_roja',
      '<html><div id="imunify-bot-check">Please wait</div></html>',
      'https://lotecruz.org.co/',
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('source_blocked')
  })

  it('Boyaca concatena los cuatro digitos del numero ganador, no un seco 0072', () => {
    const html = `
      <h2>Resultado sorteo #4639</h2>
      <p>Sábado 29 de agosto de 2026</p>
      <h4>Número Ganador</h4><p>7</p><p>6</p><p>6</p><p>0</p>
      <h4>Serie</h4><p>3</p><p>9</p><p>3</p>
      <td>Seco de $10 Millones</td><td>0072</td>
    `
    const out = extractLotteryResult('boyaca', html, 'https://loteriadeboyaca.gov.co/resultados/')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.winningNumber).toBe('7660')
    expect(out.value.drawNumber).toBe('4639')
  })

  it('Cundinamarca lee el JSON oficial con premio mayor', () => {
    const json = JSON.stringify({
      data: {
        draw: { number: '4817', date: '2026-08-24' },
        prizes: [
          { name: 'seco_100', number: '1339', serie: '208' },
          { name: 'premio_mayor', number: '7700', serie: '102' },
        ],
      },
    })
    const out = extractLotteryResult(
      'cundinamarca',
      json,
      'https://plataforma.loteriadecundinamarca.com.co/api/v1/result/public',
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.winningNumber).toBe('7700')
    expect(out.value.series).toBe('102')
  })

  it('Cundinamarca SPA vacia no inventa un numero', () => {
    const out = extractLotteryResult(
      'cundinamarca',
      '<html><body><app-root></app-root></body></html>',
      'https://www.loteriadecundinamarca.com.co/resultados',
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('ambiguous')
  })

  it('Bogota con desafio Cloudflare no se elude', () => {
    const out = extractLotteryResult(
      'bogota',
      '<html><title>Just a moment...</title><div id="cf-wrapper">cdn-cgi/challenge</div></html>',
      'https://loteriadebogota.com/',
    )
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe('source_blocked')
  })

  it('Bogota extrae un HTML oficial etiquetado', () => {
    const html = `
      <h1>Lotería de Bogotá</h1>
      <p>Sorteo 2861</p>
      <p>27 de agosto de 2026</p>
      <p>Premio mayor 7280</p>
      <p>Serie 388</p>
    `
    const out = extractLotteryResult('bogota', html, 'https://loteriadebogota.com/')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.winningNumber).toBe('7280')
  })

  it('rechaza un numero mayor de tres cifras', () => {
    const html = `
      <h1>Lotería del Meta</h1>
      <p>Sorteo 3313</p>
      <p>26/08/2026</p>
      <p>Número 813</p>
    `
    const out = extractLotteryResult('meta', html, 'https://loteriadelmeta.gov.co/resultados/')
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(['invalid_number', 'ambiguous']).toContain(out.code)
  })

  it('una pagina sin etiquetas no toma cuatro digitos sueltos', () => {
    const html = `<p>Lotería del Meta promocion 2026 visita 8134 billetes</p>`
    const out = extractLotteryResult('meta', html, 'https://loteriadelmeta.gov.co/resultados/')
    expect(out.ok).toBe(false)
  })
})
