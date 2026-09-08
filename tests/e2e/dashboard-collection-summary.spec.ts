import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * El dinero del panel, en los DOS portales.
 *
 * El administrativo conserva la tarjeta «Resumen de cobranza» (D-090). El del
 * vendedor tiene «Estado de cobro», una sola seccion que reparte el mismo total
 * y ademas escribe a la vista de que se compone lo que falta por cobrar
 * (D-112, D-171).
 *
 * La aritmetica (vendido/recaudado/pendiente/estados de pago) ya la prueban a
 * fondo las vistas SQL en tests/db. Lo que se verifica aqui es lo que solo se
 * puede ver end-to-end: que el panel pinte EXACTAMENTE los mismos numeros que
 * las tarjetas de /owner/payments y /seller/payments —alimentadas por el mismo
 * `dashboard.totals`—, que las cifras de la seccion cuadren entre si, y que sin
 * ventas se vea un estado vacio limpio en vez de una pantalla de ceros.
 */

function parseCOP(text: string): number {
  return Number.parseInt(text.replace(/[^0-9]/g, ''), 10)
}

/** La tarjeta «Resumen de cobranza» del panel administrativo (D-090). */
function summaryCard(page: Page) {
  return page.locator('[data-tour="financial-summary"]')
}

/**
 * La sección «Estado de cobro» del panel del vendedor.
 *
 * Se busca por `data-section` y no por el anclaje del recorrido: desde D-171
 * ese anclaje marca **una mitad** de la tarjeta —las cuatro cifras—, porque una
 * tarjeta más alta que el teléfono deja el globo del recorrido fuera de la
 * pantalla. Las pruebas necesitan la tarjeta entera.
 */
function estadoDeCobro(page: Page) {
  return page.locator('[data-section="estado-de-cobro"]')
}

/** Una de las cuatro cifras del resumen del dinero, por su rotulo. */
async function figura(page: Page, label: string): Promise<number> {
  const fila = estadoDeCobro(page)
    .locator('dl > div')
    .filter({
      has: page.getByText(label, { exact: true }),
    })
  return parseCOP((await fila.locator('dd').textContent()) ?? '')
}

/** El bloque de un estado de pago, por su nombre. */
function bloque(page: Page, name: string) {
  return estadoDeCobro(page)
    .locator('a[href*="paymentStatus="]')
    .filter({ has: page.getByText(name, { exact: true }) })
}

/** Una de las cifras de dentro de un bloque, por su rotulo. */
async function importe(page: Page, name: string, label: string): Promise<number> {
  const fila = bloque(page, name)
    .locator('dl > div')
    .filter({ has: page.getByText(label, { exact: true }) })
  return parseCOP((await fila.locator('dd').textContent()) ?? '')
}

async function metricCardValue(page: Page, label: string): Promise<number> {
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(label, { exact: true }) })
  const text = await card.locator('[data-slot="card-content"] p').first().textContent()
  return parseCOP(text ?? '')
}

/**
 * El importe de un indicador de la fila superior del panel del vendedor.
 *
 * `.first()` no es casual: «Por cobrar» es a la vez el nombre de un indicador y
 * una línea de la leyenda del resumen financiero, así que el filtro encuentra
 * dos tarjetas. Los indicadores van primero en el HTML —en el teléfono se
 * recolocan con `order`, que no toca el orden del documento—, de modo que la
 * primera coincidencia es siempre el indicador.
 */
async function kpiValue(page: Page, label: string): Promise<number> {
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(label, { exact: true }) })
  const text = await card.locator('p.text-2xl').first().textContent()
  return parseCOP(text ?? '')
}

test.describe('Resumen de cobranza del panel administrativo (D-090)', () => {
  test('el panel del dueño coincide con las tarjetas de Pagos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    await expect(page.getByText('Rifa activa')).toHaveCount(0)
    await expect(summaryCard(page).getByText('Resumen de cobranza')).toBeVisible()

    const bar = summaryCard(page).getByRole('progressbar')
    await expect(bar).toHaveAttribute('aria-valuemin', '0')
    await expect(bar).toHaveAttribute('aria-valuemax', '100')

    const amounts = summaryCard(page)
      .locator('p')
      .filter({ hasText: /^\$[\d.]+$/ })
    const texts = await amounts.allTextContents()
    expect(texts).toHaveLength(2)
    const shown = { collected: parseCOP(texts[0]!), pending: parseCOP(texts[1]!) }

    const percentage = Number(await bar.getAttribute('aria-valuenow'))
    expect(percentage).toBeGreaterThanOrEqual(0)
    expect(percentage).toBeLessThanOrEqual(100)

    await page.goto('/owner/payments')
    expect(shown.collected).toBe(await metricCardValue(page, 'Total recaudado'))
    expect(shown.pending).toBe(await metricCardValue(page, 'Saldo pendiente'))
  })
})

test.describe('Estado de cobro del panel del vendedor (D-112, D-171)', () => {
  test('las cifras de la sección cuadran entre sí y con /seller/payments', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    await expect(estadoDeCobro(page).getByText('Estado de cobro')).toBeVisible()
    // Las tarjetas anteriores no pueden quedar tambien: seria el mismo dinero
    // contado dos veces en la misma pantalla.
    await expect(page.getByText('Resumen de cobranza')).toHaveCount(0)
    await expect(page.getByText('Resumen financiero')).toHaveCount(0)
    await expect(page.getByText('Tu ganancia')).toHaveCount(0)
    // Ya esta en /seller/tickets (encabezado + estado vacio); en el panel seria redundante.
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)

    const [totalVendido, yaCobraste, faltaCobrar] = await Promise.all([
      figura(page, 'Total vendido'),
      figura(page, 'Ya cobraste'),
      figura(page, 'Falta cobrar'),
    ])

    // La igualdad de arriba: lo cobrado mas lo que falta es lo vendido.
    expect(yaCobraste + faltaCobrar).toBe(totalVendido)

    const [deben, todaviaDeben, yaAbonaron, cobrado] = await Promise.all([
      importe(page, 'Sin pagos', 'Deben'),
      importe(page, 'Con abonos', 'Todavía deben'),
      importe(page, 'Con abonos', 'Ya abonaron'),
      importe(page, 'Pagadas', 'Cobrado'),
    ])

    // La igualdad que la seccion escribe a la vista, bajo las dos columnas.
    expect(deben + todaviaDeben).toBe(faltaCobrar)
    // Y la que se deduce leyendo el resumen de arriba.
    expect(cobrado + yaAbonaron).toBe(yaCobraste)

    // El valor de venta de las boletas con abonos NO se escribe en ningun
    // sitio: era la cifra que se leia como dinero abonado y no lo era (D-171).
    if (todaviaDeben > 0 && yaAbonaron > 0) {
      const cifras = (await bloque(page, 'Con abonos').locator('dd').allTextContents()).map(
        parseCOP,
      )
      expect(cifras).not.toContain(todaviaDeben + yaAbonaron)
    }

    await page.goto('/seller/payments')
    expect(totalVendido).toBe(await metricCardValue(page, 'Total vendido'))
    expect(faltaCobrar).toBe(await metricCardValue(page, 'Saldo pendiente'))
  })

  test('cada estado de pago lleva a su lista ya filtrada', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    for (const [nombre, estado] of [
      ['Sin pagos', 'unpaid'],
      ['Con abonos', 'partial'],
      ['Pagadas', 'paid'],
    ] as const) {
      await expect(bloque(page, nombre)).toHaveAttribute(
        'href',
        `/seller/tickets?inventoryStatus=assigned&paymentStatus=${estado}`,
      )
    }
  })

  test('los indicadores de arriba coinciden con las tarjetas de Pagos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const porCobrar = await kpiValue(page, 'Por cobrar')

    // «Cobranza» es un porcentaje acotado, no una cifra de dinero.
    const cobranza = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText('Cobranza', { exact: true }) })
    const barra = cobranza.getByRole('progressbar')
    const porcentaje = Number(await barra.getAttribute('aria-valuenow'))
    expect(porcentaje).toBeGreaterThanOrEqual(0)
    expect(porcentaje).toBeLessThanOrEqual(100)

    await page.goto('/seller/payments')
    expect(porCobrar).toBe(await metricCardValue(page, 'Saldo pendiente'))
  })

  test('sin ventas, el panel muestra un estado vacío limpio', async ({ page }) => {
    // «Rifas Control» solo tiene boletas disponibles, ninguna vendida (scripts/seed.ts).
    await loginAs(page, ACCOUNTS.controlSeller)
    await page.goto('/seller/dashboard')

    await expect(page.getByText('Rifa activa')).toHaveCount(0)
    await expect(estadoDeCobro(page).getByText(/Aún no tienes ventas registradas/)).toBeVisible()
    // Sin ventas no se dibuja ni el resumen ni los grupos: una pantalla de
    // ceros y una barra vacia no informan de nada.
    await expect(estadoDeCobro(page).getByRole('progressbar')).toHaveCount(0)
    await expect(estadoDeCobro(page).locator('a[href*="paymentStatus="]')).toHaveCount(0)
    // El inventario SI se dice: el vendedor tiene boletas, solo que sin vender.
    await expect(estadoDeCobro(page).getByText(/boletas? en total/)).toBeVisible()

    // Y ninguna cifra rota por dividir entre cero.
    await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0)
    expect(await kpiValue(page, 'Por cobrar')).toBe(0)
  })
})
