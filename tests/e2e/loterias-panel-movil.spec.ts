import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs, logout } from './fixtures'

/**
 * El recuadro de resultados oficiales en el telefono (Etapa 4, D-147).
 * La logica vive en loterias-panel.spec.ts; aqui se mira que quepa.
 */

test.describe('Resultados oficiales en el telefono', () => {
  test('el recuadro cabe a 320 px en los dos portales', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })

    await loginAs(page, ACCOUNTS.seller)
    await expect(page.locator('[data-slot="lottery-results"]')).toBeVisible()
    let overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'desbordamiento en el panel del vendedor').toBeLessThanOrEqual(2)

    await logout(page)
    await loginAs(page, ACCOUNTS.owner)
    await expect(page.locator('[data-slot="lottery-results"]')).toBeVisible()
    overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'desbordamiento en el panel administrativo').toBeLessThanOrEqual(2)
  })
})
