import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * El dinero del panel, en los DOS portales.
 *
 * El administrativo conserva la tarjeta «Resumen de cobranza» (D-090). El del
 * vendedor la sustituyo por «Resumen financiero», que reparte el mismo total en
 * tres partes (D-112).
 *
 * La aritmetica (vendido/recaudado/pendiente/estados de pago) ya la prueban a
 * fondo las vistas SQL en tests/db. Lo que se verifica aqui es lo que solo se
 * puede ver end-to-end: que el panel pinte EXACTAMENTE los mismos numeros que
 * las tarjetas de /owner/payments y /seller/payments —alimentadas por el mismo
 * `dashboard.totals`—, que las partes del grafico sumen su total, y que sin
 * ventas se vea un estado vacio limpio en vez de un grafico de ceros.
 */

function parseCOP(text: string): number {
  return Number.parseInt(text.replace(/[^0-9]/g, ''), 10)
}

function summaryCard(page: Page) {
  return page.locator('[data-tour="financial-summary"]')
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

test.describe('Resumen financiero del panel del vendedor (D-112)', () => {
  test('el total del anillo es lo vendido, y sus tres partes lo suman', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    await expect(summaryCard(page).getByText('Resumen financiero')).toBeVisible()
    // La tarjeta anterior no puede quedar tambien: seria el mismo dinero
    // contado dos veces en la misma pantalla.
    await expect(page.getByText('Resumen de cobranza')).toHaveCount(0)
    await expect(page.getByText('Tu ganancia')).toHaveCount(0)
    // Ya esta en /seller/tickets (encabezado + estado vacio); en el panel seria redundante.
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)

    const total = parseCOP(
      (await summaryCard(page)
        .getByText(/^\$[\d.]+$/)
        .first()
        .textContent())!,
    )

    const partes = await Promise.all(
      ['Pagadas', 'Abonadas', 'Por cobrar'].map(async (label) => {
        const fila = summaryCard(page).locator('li').filter({ hasText: label })
        return parseCOP((await fila.textContent())!.replace(/\(\d+%\)/, ''))
      }),
    )

    // La propiedad que sostiene el grafico: pagado + abonado + pendiente = total.
    expect(partes.reduce((suma, parte) => suma + parte, 0)).toBe(total)

    await page.goto('/seller/payments')
    expect(total).toBe(await metricCardValue(page, 'Total vendido'))
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
    await expect(summaryCard(page).getByText(/Aún no tienes ventas registradas/)).toBeVisible()
    // Sin ventas no se dibuja el anillo: un grafico de ceros no informa de nada.
    await expect(summaryCard(page).locator('svg')).toHaveCount(0)
    await expect(
      page.getByText('Todavía no has vendido ninguna boleta, así que no hay nada por cobrar.'),
    ).toBeVisible()

    // Y ninguna cifra rota por dividir entre cero.
    await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0)
    expect(await kpiValue(page, 'Por cobrar')).toBe(0)
  })
})
