import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs, logout } from './fixtures'

/**
 * Pruebas end-to-end de la Fase 6: reportes, filtros y exportacion a CSV
 * (CLAUDE.md §24, docs/IMPLEMENTATION_PLAN.md Fase 6, pruebas 2, 3, 4 y 7).
 *
 * Las cifras se comprueban contra la propia aplicacion, no contra numeros
 * escritos a mano: el seed puede cambiar, y una prueba que fija «$800.000» se
 * rompe sin que nada este mal. Lo que se verifica son INVARIANTES —el total
 * cuadra con la suma de las filas, el vendedor ve menos que el owner, el CSV
 * dice lo mismo que la pantalla—, que siguen siendo ciertas con cualquier dato.
 */

const REPORTES_OWNER = [
  'Por vendedor',
  'Boletas por estado',
  'Boletas por rifa',
  'Clientes con saldo',
  'Pagos por fecha',
]

/** Descarga el CSV del reporte visible reutilizando la sesion del navegador. */
async function fetchCsv(page: Page, query: string): Promise<{ status: number; body: string }> {
  return page.evaluate(async (q) => {
    const response = await fetch(`/api/reports/export?${q}`)
    return { status: response.status, body: await response.text() }
  }, query)
}

function csvRows(body: string): string[] {
  return body.replace(/^﻿/, '').trim().split('\r\n')
}

/**
 * Abre un reporte y espera a que su tabla tenga contenido.
 *
 * Sin esta espera, cualquier lectura que NO auto-espere (`count()`,
 * `allInnerTexts()`) se ejecuta contra el `loading.tsx` que Next envia mientras
 * el Server Component sigue consultando, y devuelve cero filas.
 */
async function abrirReporte(page: Page, query: string): Promise<void> {
  await page.goto(`/owner/reports?${query}`)
  await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()
}

// ===========================================================================

test.describe('Reportes del portal administrativo', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('ofrece los siete reportes de CLAUDE.md §24 en cinco tablas', async ({ page }) => {
    await page.goto('/owner/reports')
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()

    const nav = page.getByRole('navigation', { name: 'Reportes disponibles' })
    for (const nombre of REPORTES_OWNER) {
      await expect(nav.getByRole('link', { name: nombre })).toBeVisible()
    }
  })

  test('el reporte por vendedor cuadra: el total es la suma de las filas', async ({ page }) => {
    await abrirReporte(page, 'report=sellers')

    const tabla = page.getByRole('table')

    // Columna «Vendido» de cada fila del cuerpo, y la celda de la fila de total.
    const importes = await tabla.locator('tbody tr td:nth-child(4)').allInnerTexts()
    const totalMostrado = await tabla.locator('tfoot tr td:nth-child(4)').innerText()

    const aNumero = (texto: string) => Number(texto.replace(/[^0-9]/g, '') || '0')
    const suma = importes.reduce((acc, texto) => acc + aNumero(texto), 0)

    expect(importes.length).toBeGreaterThan(0)
    expect(aNumero(totalMostrado)).toBe(suma)
  })

  test('el filtro por rifa cambia los números y se puede limpiar', async ({ page }) => {
    await abrirReporte(page, 'report=sellers')

    const totalSinFiltro = await page
      .getByRole('table')
      .locator('tfoot tr td:nth-child(4)')
      .innerText()

    await page.getByLabel('Rifa').click()
    await page.getByRole('option').nth(1).click()
    await page.waitForURL(/raffleId=/)

    await expect(page.getByRole('button', { name: /limpiar filtros/i })).toBeVisible()

    await page.getByRole('button', { name: /limpiar filtros/i }).click()
    await expect(page).not.toHaveURL(/raffleId=/)

    const totalTrasLimpiar = await page
      .getByRole('table')
      .locator('tfoot tr td:nth-child(4)')
      .innerText()
    expect(totalTrasLimpiar).toBe(totalSinFiltro)
  })

  test('el reporte de pagos separa lo recaudado de lo anulado', async ({ page }) => {
    await page.goto('/owner/reports?report=payments')

    // El seed deja un pago anulado: debe verse, y aparte del recaudo.
    await expect(page.getByText('Recaudado', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Anulado', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/pago\(s\) anulado\(s\)/)).toBeVisible()
  })

  test('los filtros combinados de pagos se aplican a la vez', async ({ page }) => {
    await page.goto('/owner/reports?report=payments&method=cash&status=active')

    await expect(page).toHaveURL(/method=cash/)
    await expect(page).toHaveURL(/status=active/)
    // Filtrando solo vigentes, no puede quedar nada anulado.
    await expect(page.getByText('0 pago(s) anulado(s)')).toBeVisible()
  })

  test('un rango de fechas sin pagos lo explica en vez de mostrar una tabla vacía', async ({
    page,
  }) => {
    await page.goto('/owner/reports?report=payments&dateFrom=2000-01-01&dateTo=2000-12-31')

    await expect(page.getByText('Ningún pago en este rango')).toBeVisible()
  })

  test('el reporte de clientes con saldo ordena de mayor a menor deuda', async ({ page }) => {
    await abrirReporte(page, 'report=client-balances')

    const saldos = await page.getByRole('table').locator('tbody tr td:last-child').allInnerTexts()
    const numeros = saldos.map((texto) => Number(texto.replace(/[^0-9]/g, '') || '0'))

    expect(numeros.length).toBeGreaterThan(0)
    expect([...numeros].sort((a, b) => b - a)).toEqual(numeros)
  })
})

// ===========================================================================

test.describe('Exportacion a CSV (prueba 3)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('el enlace de exportacion conserva los filtros de la pantalla', async ({ page }) => {
    await page.goto('/owner/reports?report=payments&method=cash')

    const enlace = page.getByRole('link', { name: /exportar csv/i })
    await expect(enlace).toHaveAttribute('href', /report=payments/)
    await expect(enlace).toHaveAttribute('href', /method=cash/)
  })

  test('descarga un archivo con nombre, tipo y BOM correctos', async ({ page }) => {
    await page.goto('/owner/reports?report=payments')

    const respuesta = await page.evaluate(async () => {
      const r = await fetch('/api/reports/export?report=payments')
      const bytes = new Uint8Array(await r.arrayBuffer())
      return {
        status: r.status,
        contentType: r.headers.get('content-type'),
        disposition: r.headers.get('content-disposition'),
        cacheControl: r.headers.get('cache-control'),
        primerosBytes: [...bytes.slice(0, 3)],
      }
    })

    expect(respuesta.status).toBe(200)
    expect(respuesta.contentType).toBe('text/csv; charset=utf-8')
    expect(respuesta.disposition).toMatch(
      /attachment; filename="reporte-pagos-por-fecha-\d{4}-\d{2}-\d{2}\.csv"/,
    )
    expect(respuesta.cacheControl).toBe('no-store')
    // BOM UTF-8: sin el, Excel corrompe los acentos.
    expect(respuesta.primerosBytes).toEqual([0xef, 0xbb, 0xbf])
  })

  test('el CSV usa punto y coma, moneda colombiana y fecha DD/MM/AAAA', async ({ page }) => {
    await page.goto('/owner/reports')

    const { body } = await fetchCsv(page, 'report=payments')
    const filas = csvRows(body)

    expect(filas[0]).toBe('Fecha;Pagos;Recaudado;Anulado;Total registrado')
    expect(filas[1]).toMatch(/^\d{2}\/\d{2}\/\d{4};\d+;\$[\d.]+;\$[\d.]+;\$[\d.]+$/)
  })

  test('los cinco reportes se exportan y traen su encabezado', async ({ page }) => {
    await page.goto('/owner/reports')

    for (const [reporte, encabezado] of [
      ['sellers', 'Vendedor;Alias;Estado'],
      ['ticket-status', 'Grupo;Estado;Boletas'],
      ['raffles', 'Código;Rifa;Estado'],
      ['client-balances', 'Cliente;Alias;Teléfono'],
      ['payments', 'Fecha;Pagos;Recaudado'],
    ] as const) {
      const { status, body } = await fetchCsv(page, `report=${reporte}`)
      expect(status, `reporte ${reporte}`).toBe(200)
      expect(csvRows(body)[0], `reporte ${reporte}`).toContain(encabezado)
    }
  })

  test('el CSV dice lo mismo que la pantalla', async ({ page }) => {
    await abrirReporte(page, 'report=sellers')

    const filasEnPantalla = await page.getByRole('table').locator('tbody tr').count()
    const { body } = await fetchCsv(page, 'report=sellers')

    // Una linea de encabezado mas una por vendedor. La pantalla del reporte por
    // vendedor no pagina, asi que ambos numeros deben coincidir exactamente.
    expect(csvRows(body).length).toBe(filasEnPantalla + 1)
  })
})

// ===========================================================================

test.describe('Reportes del vendedor: sin datos ajenos (prueba 2)', () => {
  test('no ofrece el reporte que compara vendedores', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports')

    const nav = page.getByRole('navigation', { name: 'Reportes disponibles' })
    await expect(nav.getByRole('link', { name: 'Boletas por estado' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Por vendedor' })).toHaveCount(0)
  })

  test('pedir por URL el reporte de vendedores no lo muestra', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports?report=sellers')

    // Cae al primer reporte disponible en vez de romperse o de exponer datos.
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Reportes disponibles' }).getByRole('link', {
        name: 'Por vendedor',
      }),
    ).toHaveCount(0)
  })

  test('exportar el reporte de vendedores devuelve 403', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports')

    const { status } = await fetchCsv(page, 'report=sellers')
    expect(status).toBe(403)
  })

  test('su CSV de clientes NO contiene clientes de otro vendedor', async ({ page }) => {
    // Se toman los clientes que ve el owner y los que ve el vendedor: el
    // segundo conjunto debe ser un subconjunto ESTRICTO del primero.
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/reports')
    const { body: delOwner } = await fetchCsv(page, 'report=client-balances')
    const clientesDelOwner = csvRows(delOwner)
      .slice(1)
      .map((fila) => fila.split(';')[0])

    // Hay que cerrar sesion de verdad: ir a /login con sesion abierta redirige
    // al panel y el formulario ni siquiera aparece.
    await logout(page)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports')
    const { body: delVendedor } = await fetchCsv(page, 'report=client-balances')
    const clientesDelVendedor = csvRows(delVendedor)
      .slice(1)
      .map((fila) => fila.split(';')[0])

    expect(clientesDelVendedor.length).toBeGreaterThan(0)
    expect(clientesDelVendedor.length).toBeLessThan(clientesDelOwner.length)
    for (const cliente of clientesDelVendedor) {
      expect(clientesDelOwner).toContain(cliente)
    }
  })

  test('sus totales son menores que los de la organización', async ({ page }) => {
    const totalDe = async (texto: string) => Number(texto.replace(/[^0-9]/g, '') || '0')

    await loginAs(page, ACCOUNTS.owner)
    await abrirReporte(page, 'report=raffles')
    const totalOrganizacion = await totalDe(
      await page.getByRole('table').locator('tfoot tr td:nth-child(6)').innerText(),
    )

    await logout(page)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports?report=raffles')
    await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()
    const totalVendedor = await totalDe(
      await page.getByRole('table').locator('tfoot tr td:nth-child(6)').innerText(),
    )

    expect(totalVendedor).toBeGreaterThan(0)
    expect(totalVendedor).toBeLessThan(totalOrganizacion)
  })
})

// ===========================================================================

test.describe('Dashboards completos (CLAUDE.md §23)', () => {
  test('el panel administrativo muestra pagos recientes', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    await expect(page.getByRole('heading', { name: 'Pagos recientes' })).toBeVisible()
    // Un pago anulado se distingue POR TEXTO, no solo por el tachado
    // (CLAUDE.md §27: no depender unicamente del color ni del estilo).
    await expect(page.getByText('(anulado)').first()).toBeVisible()
  })

  test('el panel del vendedor muestra sus pagos recientes', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    // Desde D-112 la seccion se llama «Actividad reciente» y su subtitulo dice
    // que son: los ultimos pagos recibidos.
    await expect(page.getByRole('heading', { name: 'Actividad reciente' })).toBeVisible()
    await expect(page.getByText('Últimos pagos recibidos')).toBeVisible()
  })

  test('ningún panel anuncia ya funciones de fases futuras', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')
    await expect(page.getByRole('heading', { name: 'Pagos recientes' })).toBeVisible()
    await expect(page.getByText(/llegan? en (la|las) fase/i)).toHaveCount(0)

    await logout(page)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')
    await expect(page.getByRole('heading', { name: 'Actividad reciente' })).toBeVisible()
    await expect(page.getByText(/llegan? en (la|las) fase/i)).toHaveCount(0)
  })

  test('las fechas de pago no se muestran un día antes (I-017)', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    // La fecha que la aplicacion muestra en el historial debe coincidir con la
    // que devuelve la base de datos, no con la del dia anterior.
    await page.goto('/seller/payments')
    const filaFecha = await page
      .getByRole('table')
      .locator('tbody tr td:first-child')
      .first()
      .innerText()

    const esperada = await page.evaluate(async () => {
      const response = await fetch('/api/reports/export?report=payments')
      const texto = (await response.text()).replace(/^﻿/, '')
      return texto.trim().split('\r\n')[1]?.split(';')[0] ?? ''
    })

    // El CSV da DD/MM/AAAA y la pantalla «04 de ago de 2026»: se compara el dia.
    expect(filaFecha).toContain(String(Number(esperada.slice(0, 2))))
  })
})
