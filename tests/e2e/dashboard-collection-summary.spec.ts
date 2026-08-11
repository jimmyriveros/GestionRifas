import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Resumen de cobranza del panel: reemplaza la tarjeta "Rifa activa" (D-090).
 *
 * La aritmetica (vendido/recaudado/pendiente/estados de pago) ya la prueban a
 * fondo las vistas SQL en tests/db. Lo que esta prueba verifica es lo que solo
 * se puede ver end-to-end: que la tarjeta nueva pinte EXACTAMENTE los mismos
 * numeros que ya muestran las tarjetas de /owner/payments y /seller/payments
 * -ambas alimentadas por el mismo `dashboard.totals`-, que la tarjeta vieja
 * desaparecio, y que el estado vacio se vea limpio cuando no hay ventas
 * (seccion 11 del encargo).
 */

function parseCOP(text: string): number {
  return Number.parseInt(text.replace(/[^0-9]/g, ''), 10)
}

function summaryCard(page: Page) {
  return page.locator('[data-tour="financial-summary"]')
}

async function moneyValues(page: Page): Promise<{ collected: number; pending: number }> {
  const amounts = summaryCard(page).locator('p').filter({ hasText: /^\$[\d.]+$/ })
  const texts = await amounts.allTextContents()
  expect(texts).toHaveLength(2)
  return { collected: parseCOP(texts[0]!), pending: parseCOP(texts[1]!) }
}

async function metricCardValue(page: Page, label: string): Promise<number> {
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByText(label, { exact: true }) })
  const text = await card.locator('[data-slot="card-content"] p').first().textContent()
  return parseCOP(text ?? '')
}

test.describe('Resumen de cobranza del panel (D-090)', () => {
  test('el panel del dueño coincide con las tarjetas de Pagos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    await expect(page.getByText('Rifa activa')).toHaveCount(0)
    await expect(summaryCard(page).getByText('Resumen de cobranza')).toBeVisible()

    const bar = summaryCard(page).getByRole('progressbar')
    await expect(bar).toHaveAttribute('aria-valuemin', '0')
    await expect(bar).toHaveAttribute('aria-valuemax', '100')
    const shown = await moneyValues(page)
    const percentage = Number(await bar.getAttribute('aria-valuenow'))
    expect(percentage).toBeGreaterThanOrEqual(0)
    expect(percentage).toBeLessThanOrEqual(100)

    await page.goto('/owner/payments')
    expect(shown.collected).toBe(await metricCardValue(page, 'Total recaudado'))
    expect(shown.pending).toBe(await metricCardValue(page, 'Saldo pendiente'))
  })

  test('el panel del vendedor coincide con sus propias tarjetas de Pagos, sin botón duplicado', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    await expect(page.getByText('Rifa activa')).toHaveCount(0)
    // Ya esta en /seller/tickets (encabezado + estado vacio); en el panel seria redundante.
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)

    const shown = await moneyValues(page)

    await page.goto('/seller/payments')
    expect(shown.collected).toBe(await metricCardValue(page, 'Total recaudado'))
    expect(shown.pending).toBe(await metricCardValue(page, 'Saldo pendiente'))
  })

  test('sin ventas, el panel muestra un estado vacío limpio', async ({ page }) => {
    // «Rifas Control» solo tiene boletas disponibles, ninguna vendida (scripts/seed.ts).
    await loginAs(page, ACCOUNTS.controlSeller)
    await page.goto('/seller/dashboard')

    await expect(page.getByText('Rifa activa')).toHaveCount(0)
    await expect(summaryCard(page).getByText('Aún no tienes ventas registradas.')).toBeVisible()
    await expect(summaryCard(page).getByRole('progressbar')).toHaveCount(0)
  })
})
