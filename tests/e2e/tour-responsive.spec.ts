import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Recorrido guiado en telefono (F10-02).
 *
 * En movil no hay barra lateral, asi que el paso que la explica debe
 * descartarse solo y ceder el turno al del boton de menu. Es la prueba de que
 * un paso cuyo elemento no esta visible no rompe el recorrido ni deja un hueco.
 */

const dialog = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog').filter({ hasText: /Paso \d+ de \d+/ })

test.describe('Recorrido guiado en móvil', () => {
  test('explica el menú del teléfono, no la barra lateral', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller, { withTour: true })
    await expect(dialog(page)).toBeVisible()

    // La barra lateral existe en el HTML pero esta oculta bajo `md`.
    await expect(page.locator('[data-tour="nav-sidebar"]')).toBeHidden()
    await expect(page.locator('[data-tour="nav-mobile"]')).toBeVisible()

    await expect(dialog(page).getByRole('heading')).toHaveText('Tu menú está aquí')
    await expect(dialog(page).getByText(/^Paso 1 de \d+$/)).toBeVisible()
  })

  test('el globo cabe en la pantalla en todos los pasos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller, { withTour: true })
    await expect(dialog(page)).toBeVisible()

    const viewport = page.viewportSize()!
    for (;;) {
      // `boundingBox()` no auto-espera: al pasar del ultimo paso con elemento al
      // cierre centrado, la tarjeta se reemplaza y mediria en el hueco
      // (docs/TESTING.md 3.1).
      await expect(dialog(page)).toBeVisible()
      const box = await dialog(page).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)

      const next = dialog(page).getByRole('button', { name: 'Siguiente' })
      if (!(await next.isVisible())) break
      await next.click()
    }

    await expect(dialog(page).getByRole('heading', { name: 'Ya puedes empezar' })).toBeVisible()
  })
})
