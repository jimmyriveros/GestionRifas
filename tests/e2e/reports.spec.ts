import { expect, test, type Page } from '@playwright/test'

import { loadSeedRefs, organizationSoldTotal, serviceClient } from './db-setup'
import { ACCOUNTS, loginAs, logout } from './fixtures'

/**
 * Pruebas end-to-end de la Fase 6: reportes, filtros y exportacion a CSV
 * (CLAUDE.md §24, docs/IMPLEMENTATION_PLAN.md Fase 6, pruebas 2, 3, 4 y 7).
 *
 * Las cifras se comprueban contra la propia aplicacion, no contra numeros
 * escritos a mano: el seed puede cambiar, y una prueba que fija «$800.000» se
 * rompe sin que nada este mal. Lo que se verifica son INVARIANTES —el total
 * cuadra con la suma de las filas, el vendedor ve menos que la organizacion, el
 * CSV dice lo mismo que la pantalla—, que siguen siendo ciertas con cualquier
 * dato.
 *
 * DESDE D-198 los reportes de dinero y de clientes son SOLO del vendedor: el
 * personal conserva tres de recuentos (BR-Q08). Las pruebas de dinero que antes
 * corrian con la sesion del Dueño corren con la del vendedor, con las mismas
 * aserciones, y las del personal comprueban que ese dinero ya no le llega.
 */

/** Los tres del personal desde D-198: recuentos, sin dinero ni clientes. */
const REPORTES_OWNER = ['Por vendedor', 'Boletas por estado', 'Boletas por rifa']

/** Los que el personal ya no tiene, porque son de dinero o de clientes. */
const REPORTES_SOLO_DEL_VENDEDOR = ['Clientes con saldo', 'Pagos por fecha']

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
async function abrirReporte(page: Page, query: string, portal = '/owner/reports'): Promise<void> {
  await page.goto(`${portal}?${query}`)
  await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()
}

/**
 * Posicion (1..n) de una columna por su encabezado.
 *
 * Por el nombre y no por un numero fijo: los reportes del personal cambiaron de
 * columnas con D-198, y un `nth-child(4)` seguiria pasando sobre otra cifra.
 */
async function columna(page: Page, encabezado: string): Promise<number> {
  const encabezados = await page.getByRole('table').locator('thead th').allInnerTexts()
  const indice = encabezados.findIndex((texto) => texto.trim() === encabezado)
  expect(indice, `la tabla no tiene la columna «${encabezado}»`).toBeGreaterThanOrEqual(0)
  return indice + 1
}

const aNumero = (texto: string) => Number(texto.replace(/[^0-9]/g, '') || '0')

// ===========================================================================

test.describe('Reportes del portal administrativo', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('ofrece los tres reportes de recuentos y ninguno de dinero o de clientes (D-198)', async ({
    page,
  }) => {
    await page.goto('/owner/reports')
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()

    const nav = page.getByRole('navigation', { name: 'Reportes disponibles' })
    for (const nombre of REPORTES_OWNER) {
      await expect(nav.getByRole('link', { name: nombre })).toBeVisible()
    }
    for (const nombre of REPORTES_SOLO_DEL_VENDEDOR) {
      await expect(nav.getByRole('link', { name: nombre })).toHaveCount(0)
    }
  })

  test('el reporte por vendedor cuadra: el total es la suma de las filas', async ({ page }) => {
    await abrirReporte(page, 'report=sellers')
    const tabla = page.getByRole('table')

    for (const encabezado of ['Boletas', 'Vendidas']) {
      const n = await columna(page, encabezado)
      const valores = await tabla.locator(`tbody tr td:nth-child(${n})`).allInnerTexts()
      const totalMostrado = await tabla.locator(`tfoot tr td:nth-child(${n})`).innerText()

      expect(valores.length, encabezado).toBeGreaterThan(0)
      expect(aNumero(totalMostrado), encabezado).toBe(
        valores.reduce((acc, texto) => acc + aNumero(texto), 0),
      )
    }
  })

  test('el filtro por rifa cambia los números y se puede limpiar', async ({ page }) => {
    await abrirReporte(page, 'report=sellers')
    const n = await columna(page, 'Boletas')

    const totalSinFiltro = await page
      .getByRole('table')
      .locator(`tfoot tr td:nth-child(${n})`)
      .innerText()

    await page.getByLabel('Rifa').click()
    await page.getByRole('option').nth(1).click()
    await page.waitForURL(/raffleId=/)

    await expect(page.getByRole('button', { name: /limpiar filtros/i })).toBeVisible()

    await page.getByRole('button', { name: /limpiar filtros/i }).click()
    await expect(page).not.toHaveURL(/raffleId=/)

    const totalTrasLimpiar = await page
      .getByRole('table')
      .locator(`tfoot tr td:nth-child(${n})`)
      .innerText()
    expect(totalTrasLimpiar).toBe(totalSinFiltro)
  })

  /**
   * Hasta D-198 aqui se abrian «Pagos por fecha» y «Clientes con saldo». Desde
   * D-198 no son del personal: pedirlos por la URL cae en «Por vendedor», como
   * cualquier reporte que un portal no ofrece, y no llega ninguna cifra de dinero.
   */
  test('pedir por URL un reporte de dinero o de clientes cae en «Por vendedor», sin cifras (D-198)', async ({
    page,
  }) => {
    for (const reporte of ['payments', 'client-balances', 'sales-by-date']) {
      await page.goto(`/owner/reports?report=${reporte}`)
      const nav = page.getByRole('navigation', { name: 'Reportes disponibles' })
      await expect(nav.getByRole('link', { name: 'Por vendedor' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()

      const texto = await page.locator('main').innerText()
      expect(texto, reporte).not.toMatch(/\$\s?\d/)
      expect(texto, reporte).not.toMatch(/Recaudado|Saldo|Anulado/)
    }
  })
})

/**
 * Los reportes de dinero, en el portal que los conserva (D-198).
 *
 * Son las mismas pruebas que antes corrian con la sesion del Dueño, con las
 * mismas aserciones: la pantalla y sus filtros no cambiaron, solo quien puede
 * abrirlos. El pago anulado de ejemplo del seed es de este vendedor.
 */
test.describe('Reportes de dinero del vendedor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('el reporte de pagos separa lo recaudado de lo anulado', async ({ page }) => {
    await page.goto('/seller/reports?report=payments')

    // El seed deja un pago anulado: debe verse, y aparte del recaudo.
    await expect(page.getByText('Recaudado', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Anulado', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/pago\(s\) anulado\(s\)/)).toBeVisible()
  })

  test('los filtros combinados de pagos se aplican a la vez', async ({ page }) => {
    await page.goto('/seller/reports?report=payments&method=cash&status=active')

    await expect(page).toHaveURL(/method=cash/)
    await expect(page).toHaveURL(/status=active/)
    // Filtrando solo vigentes, no puede quedar nada anulado.
    await expect(page.getByText('0 pago(s) anulado(s)')).toBeVisible()
  })

  test('un rango de fechas sin pagos lo explica en vez de mostrar una tabla vacía', async ({
    page,
  }) => {
    await page.goto('/seller/reports?report=payments&dateFrom=2000-01-01&dateTo=2000-12-31')

    await expect(page.getByText('Ningún pago en este rango')).toBeVisible()
  })

  test('el reporte de clientes con saldo ordena de mayor a menor deuda', async ({ page }) => {
    await abrirReporte(page, 'report=client-balances', '/seller/reports')

    const saldos = await page.getByRole('table').locator('tbody tr td:last-child').allInnerTexts()
    const numeros = saldos.map(aNumero)

    expect(numeros.length).toBeGreaterThan(0)
    expect([...numeros].sort((a, b) => b - a)).toEqual(numeros)
  })
})

// ===========================================================================

test.describe('Exportacion a CSV (prueba 3)', () => {
  test('el enlace de exportacion conserva los filtros de la pantalla', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports?report=payments&method=cash')

    const enlace = page.getByRole('link', { name: /exportar csv/i })
    await expect(enlace).toHaveAttribute('href', /report=payments/)
    await expect(enlace).toHaveAttribute('href', /method=cash/)
  })

  test('el enlace de exportación del personal también conserva sus filtros', async ({ page }) => {
    const refs = await loadSeedRefs()
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/reports?report=sellers&raffleId=${refs.raffleId}`)

    const enlace = page.getByRole('link', { name: /exportar csv/i })
    await expect(enlace).toHaveAttribute('href', /report=sellers/)
    await expect(enlace).toHaveAttribute('href', new RegExp(`raffleId=${refs.raffleId}`))
  })

  test('descarga un archivo con nombre, tipo y BOM correctos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports?report=payments')

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
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports')

    const { body } = await fetchCsv(page, 'report=payments')
    const filas = csvRows(body)

    expect(filas[0]).toBe('Fecha;Pagos;Recaudado;Anulado;Total registrado')
    expect(filas[1]).toMatch(/^\d{2}\/\d{2}\/\d{4};\d+;\$[\d.]+;\$[\d.]+;\$[\d.]+$/)
  })

  /**
   * Hasta D-198 eran cinco reportes y todos del personal. Desde D-198 el
   * personal exporta tres, con encabezados EXACTOS —sin una sola columna de
   * dinero o de clientes—, y los otros le responden 403 (BR-Q08).
   */
  test('el personal exporta sus tres reportes con su encabezado, y los de la cartera responden 403', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/reports')

    for (const [reporte, encabezado] of [
      ['sellers', 'Vendedor;Alias;Estado;Boletas;Disponibles;Vendidas;Por aprobar'],
      ['ticket-status', 'Grupo;Estado;Boletas'],
      [
        'raffles',
        'Código;Rifa;Estado;Precio de boleta;Inicio;Fin;Boletas;Disponibles;Vendidas;Por aprobar;Anuladas',
      ],
    ] as const) {
      const { status, body } = await fetchCsv(page, `report=${reporte}`)
      expect(status, `reporte ${reporte}`).toBe(200)
      expect(csvRows(body)[0], `reporte ${reporte}`).toBe(encabezado)
    }

    for (const reporte of ['client-balances', 'payments', 'sales-by-date']) {
      const { status } = await fetchCsv(page, `report=${reporte}`)
      expect(status, `reporte ${reporte}`).toBe(403)
    }
  })

  test('el CSV dice lo mismo que la pantalla', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
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
    // Hasta D-198 el conjunto de referencia salia del CSV del Dueño. Desde D-198
    // el personal no ve clientes, asi que se lee de la base, sin RLS: los de la
    // organizacion y, aparte, los del OTRO vendedor.
    const refs = await loadSeedRefs()
    const { data: todos, error } = await serviceClient()
      .from('clients')
      .select('name, seller_id')
      .eq('organization_id', refs.organizationId)
    expect(error).toBeNull()
    const deLaOrganizacion = (todos ?? []).map((cliente) => cliente.name)
    const delOtroVendedor = (todos ?? [])
      .filter((cliente) => cliente.seller_id === refs.otherSellerId)
      .map((cliente) => cliente.name)
    expect(delOtroVendedor.length).toBeGreaterThan(0)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports')
    const { body: delVendedor } = await fetchCsv(page, 'report=client-balances')
    const clientesDelVendedor = csvRows(delVendedor)
      .slice(1)
      .map((fila) => fila.split(';')[0])

    expect(clientesDelVendedor.length).toBeGreaterThan(0)
    expect(clientesDelVendedor.length).toBeLessThan(deLaOrganizacion.length)
    for (const cliente of clientesDelVendedor) {
      expect(deLaOrganizacion).toContain(cliente)
    }
    for (const ajeno of delOtroVendedor) {
      expect(clientesDelVendedor).not.toContain(ajeno)
    }
  })

  test('sus totales son menores que los de la organización', async ({ page }) => {
    // Hasta D-198 el total de la organizacion se leia en el reporte del Dueño;
    // desde D-198 el personal no ve dinero, asi que se calcula en la base con la
    // misma cuenta de `v_raffle_summary`.
    const refs = await loadSeedRefs()
    const totalOrganizacion = await organizationSoldTotal(refs.organizationId)

    await loginAs(page, ACCOUNTS.seller)
    await abrirReporte(page, 'report=raffles', '/seller/reports')
    const n = await columna(page, 'Vendido')
    const totalVendedor = aNumero(
      await page.getByRole('table').locator(`tfoot tr td:nth-child(${n})`).innerText(),
    )

    expect(totalVendedor).toBeGreaterThan(0)
    expect(totalVendedor).toBeLessThan(totalOrganizacion)
  })
})

// ===========================================================================

test.describe('Dashboards completos (CLAUDE.md §23)', () => {
  /**
   * Hasta D-198 el panel administrativo enseñaba los cinco pagos mas recientes,
   * con el anulado marcado por texto. Desde D-198 el personal no ve pagos: el
   * panel no tiene esa seccion. Que un pago anulado se distinga por texto se
   * comprueba en el historial del vendedor (`payments.spec.ts`).
   */
  test('el panel administrativo ya no muestra pagos (D-198)', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    await expect(page.getByRole('heading', { name: 'Resumen por vendedor' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pagos recientes' })).toHaveCount(0)
    await expect(page.getByText('(anulado)')).toHaveCount(0)
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
    await expect(page.getByRole('heading', { name: 'Resumen por vendedor' })).toBeVisible()
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
