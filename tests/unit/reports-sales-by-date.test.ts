import { describe, expect, it } from 'vitest'

import { reportFilePrefix } from '@/features/reports/export'
import {
  OWNER_REPORT_KEYS,
  parseReportFilters,
  reportKeysForRole,
  REPORT_FILTER_FIELDS,
  REPORT_LABELS,
  resolveReport,
  resolveSalesDateRange,
  SELLER_REPORT_KEYS,
} from '@/features/reports/schemas'

/**
 * «Ventas por fecha»: el reporte y sus fechas, antes de tocar la base de datos
 * (D-151).
 *
 * Lo que se prueba aqui es lo que decide QUE CONJUNTO se consulta: el reporte
 * efectivo de cada portal y las fechas efectivas cuando la URL no las trae. Son
 * dos reglas que, si se desincronizan entre la pantalla y el CSV, producen un
 * archivo que no cuadra con lo que se estaba viendo, sin ningun error visible.
 */

// ===========================================================================
// El reporte que se muestra en cada portal
// ===========================================================================

describe('resolveReport — predeterminado por portal, no global', () => {
  it('el vendedor entra sin parametros y abre «Ventas por fecha»', () => {
    // Sin `report` en la URL, el esquema cae en 'sellers' —que es el
    // predeterminado del PORTAL ADMINISTRATIVO— y la lista del vendedor lo
    // convierte en el suyo. Es exactamente lo que pasa en /seller/reports.
    const filters = parseReportFilters({})
    expect(resolveReport(filters.report, SELLER_REPORT_KEYS)).toBe('sales-by-date')
  })

  it('el personal entra sin parametros y conserva «Por vendedor»', () => {
    const filters = parseReportFilters({})
    expect(resolveReport(filters.report, OWNER_REPORT_KEYS)).toBe('sellers')
  })

  it('pedir «Por vendedor» desde el portal del vendedor no lo habilita', () => {
    const filters = parseReportFilters({ report: 'sellers' })
    expect(resolveReport(filters.report, SELLER_REPORT_KEYS)).toBe('sales-by-date')
  })

  it('un `report` inventado cae en «Ventas por fecha» para el vendedor', () => {
    const filters = parseReportFilters({ report: 'lo-que-sea' })
    expect(resolveReport(filters.report, SELLER_REPORT_KEYS)).toBe('sales-by-date')
  })

  it('los demas reportes del vendedor siguen abriendose por su enlace', () => {
    for (const report of ['ticket-status', 'raffles', 'client-balances', 'payments'] as const) {
      const filters = parseReportFilters({ report })
      expect(resolveReport(filters.report, SELLER_REPORT_KEYS)).toBe(report)
    }
  })

  it('«Pagos por fecha» sigue siendo alcanzable desde el vendedor', () => {
    const filters = parseReportFilters({ report: 'payments' })
    expect(resolveReport(filters.report, SELLER_REPORT_KEYS)).toBe('payments')
  })

  it('«Ventas por fecha» NO se anadio al portal administrativo', () => {
    expect(OWNER_REPORT_KEYS).not.toContain('sales-by-date')
    expect(resolveReport('sales-by-date', OWNER_REPORT_KEYS)).toBe('sellers')
  })

  it('los reportes visibles para el personal no cambiaron', () => {
    expect(OWNER_REPORT_KEYS).toEqual([
      'sellers',
      'ticket-status',
      'raffles',
      'client-balances',
      'payments',
    ])
  })

  it('cada rol recibe la lista de su portal', () => {
    expect(reportKeysForRole('seller')).toBe(SELLER_REPORT_KEYS)
    expect(reportKeysForRole('owner')).toBe(OWNER_REPORT_KEYS)
    expect(reportKeysForRole('admin')).toBe(OWNER_REPORT_KEYS)
  })

  it('el reporte tiene nombre, filtros de fecha y prefijo de archivo propios', () => {
    expect(REPORT_LABELS['sales-by-date']).toBe('Ventas por fecha')
    expect(REPORT_FILTER_FIELDS['sales-by-date']).toEqual(['dates'])
    expect(reportFilePrefix('sales-by-date')).toBe('reporte-ventas-por-fecha')
  })
})

// ===========================================================================
// Las fechas efectivas
// ===========================================================================

describe('resolveSalesDateRange — hoy sin escribirlo en la URL', () => {
  const HOY = '2026-08-31'

  it('sin fechas en la URL, el rango es el dia de hoy en Bogota', () => {
    expect(resolveSalesDateRange({ dateFrom: undefined, dateTo: undefined }, HOY)).toEqual({
      from: HOY,
      to: HOY,
      invalid: false,
    })
  })

  it('un solo dia elegido se consulta como rango de un dia', () => {
    expect(resolveSalesDateRange({ dateFrom: '2026-08-11', dateTo: '2026-08-11' }, HOY)).toEqual({
      from: '2026-08-11',
      to: '2026-08-11',
      invalid: false,
    })
  })

  it('un rango de varios dias se respeta tal cual', () => {
    expect(resolveSalesDateRange({ dateFrom: '2026-08-01', dateTo: '2026-08-15' }, HOY)).toEqual({
      from: '2026-08-01',
      to: '2026-08-15',
      invalid: false,
    })
  })

  it('solo «Desde» significa «desde ese dia hasta hoy»', () => {
    expect(resolveSalesDateRange({ dateFrom: '2026-08-01', dateTo: undefined }, HOY)).toEqual({
      from: '2026-08-01',
      to: HOY,
      invalid: false,
    })
  })

  it('solo «Hasta» deja «Desde» en hoy, que es lo que muestra el campo', () => {
    expect(resolveSalesDateRange({ dateFrom: undefined, dateTo: '2026-09-30' }, HOY)).toEqual({
      from: HOY,
      to: '2026-09-30',
      invalid: false,
    })
  })

  it('«Desde» posterior a «Hasta» se marca invalido en vez de consultarse', () => {
    const range = resolveSalesDateRange({ dateFrom: '2026-08-20', dateTo: '2026-08-10' }, HOY)
    expect(range.invalid).toBe(true)
    // No se corrige solo: las dos fechas se devuelven como se escribieron, para
    // que la pantalla siga mostrando lo que la persona puso y pueda cambiarlo.
    expect(range.from).toBe('2026-08-20')
    expect(range.to).toBe('2026-08-10')
  })

  it('un rango de un solo dia NO es invalido', () => {
    expect(
      resolveSalesDateRange({ dateFrom: '2026-08-10', dateTo: '2026-08-10' }, HOY).invalid,
    ).toBe(false)
  })

  it('el cambio de año se compara por fecha, no por numero', () => {
    // Comparar '2026-01-05' con '2025-12-31' como texto tiene que dar el mismo
    // resultado que compararlas como fechas: por eso el formato es ISO.
    expect(
      resolveSalesDateRange({ dateFrom: '2025-12-31', dateTo: '2026-01-05' }, HOY).invalid,
    ).toBe(false)
    expect(
      resolveSalesDateRange({ dateFrom: '2026-01-05', dateTo: '2025-12-31' }, HOY).invalid,
    ).toBe(true)
  })

  it('una fecha corrupta en la URL se descarta y el rango vuelve a hoy', () => {
    // `parseReportFilters` la tira con `.catch(undefined)`; aqui se comprueba
    // que el reporte no acaba consultando un rango a medias.
    const filters = parseReportFilters({ report: 'sales-by-date', dateFrom: '31-08-2026' })
    expect(filters.dateFrom).toBeUndefined()
    expect(resolveSalesDateRange(filters, HOY)).toEqual({ from: HOY, to: HOY, invalid: false })
  })
})

// ===========================================================================
// La pantalla y el CSV consultan lo mismo
// ===========================================================================

describe('los parametros del CSV son los de la pantalla', () => {
  /**
   * Reproduce lo que hace `ReportsView`: resolver el reporte y las fechas una
   * sola vez y pasarselas a `ExportCsvButton`. Lo que se comprueba es que el
   * enlace de descarga lleva las fechas EFECTIVAS, no las crudas: con la
   * pantalla abierta desde ayer, el archivo tiene que traer el dia que se esta
   * viendo, no el de hoy.
   */
  function csvParams(
    url: Record<string, string>,
    today: string,
  ): { report: string; dateFrom?: string; dateTo?: string } {
    const filters = parseReportFilters(url)
    const report = resolveReport(filters.report, SELLER_REPORT_KEYS)
    const range = report === 'sales-by-date' ? resolveSalesDateRange(filters, today) : null
    return {
      report,
      dateFrom: range?.from ?? filters.dateFrom,
      dateTo: range?.to ?? filters.dateTo,
    }
  }

  it('sin fechas en la URL, el archivo pide el mismo dia que se esta viendo', () => {
    expect(csvParams({}, '2026-08-31')).toEqual({
      report: 'sales-by-date',
      dateFrom: '2026-08-31',
      dateTo: '2026-08-31',
    })
  })

  it('con un rango elegido, el archivo pide exactamente ese rango', () => {
    expect(csvParams({ dateFrom: '2026-08-01', dateTo: '2026-08-15' }, '2026-08-31')).toEqual({
      report: 'sales-by-date',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-15',
    })
  })

  it('la pagina no viaja al archivo: el CSV trae todas las filas del rango', () => {
    const filters = parseReportFilters({ report: 'sales-by-date', page: '3' })
    expect(filters.page).toBe(3)
    // `ExportCsvButton` no copia `page` (ver su comentario); el CSV recorre
    // todas las filas con `fetchAllRows`.
    expect(
      Object.keys(csvParams({ report: 'sales-by-date', page: '3' }, '2026-08-31')),
    ).not.toContain('page')
  })
})
