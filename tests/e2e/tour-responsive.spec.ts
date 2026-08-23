import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Recorrido guiado en telefono (F10-02).
 *
 * En movil no hay barra lateral, asi que el paso que la explica debe
 * descartarse solo y ceder el turno al de la barra inferior (D-106). Es la
 * prueba de que un paso cuyo elemento no esta visible no rompe el recorrido ni
 * deja un hueco.
 */

const dialog = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog').filter({ hasText: /Paso \d+ de \d+/ })

/**
 * Caja del globo, reintentando hasta obtenerla.
 *
 * `boundingBox()` **no auto-espera** (docs/TESTING.md §3.1) y la tarjeta del
 * recorrido se reemplaza al cambiar de paso: entre el `toBeVisible()` y la
 * medida cabe un instante en el que el elemento anterior ya no esta y el nuevo
 * todavia no, y ahi devuelve `null`. Era la causa de I-032, que fallaba una de
 * cada varias corridas sin que nada estuviera roto.
 */
async function dialogBox(page: import('@playwright/test').Page) {
  let box: Awaited<ReturnType<ReturnType<typeof dialog>['boundingBox']>> = null
  await expect
    .poll(async () => {
      box = await dialog(page).boundingBox()
      return box
    })
    .not.toBeNull()
  return box!
}

test.describe('Recorrido guiado en móvil', () => {
  test('explica la barra inferior, no la barra lateral', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller, { withTour: true })
    await expect(dialog(page)).toBeVisible()

    // La barra lateral existe en el HTML pero esta oculta bajo `md`.
    await expect(page.locator('[data-tour="nav-sidebar"]')).toBeHidden()
    await expect(page.locator('[data-tour="nav-mobile"]')).toBeVisible()

    await expect(dialog(page).getByRole('heading')).toHaveText('Tu menú está abajo')
    await expect(dialog(page).getByText(/^Paso 1 de \d+$/)).toBeVisible()
  })

  test('el globo cabe en la pantalla en todos los pasos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller, { withTour: true })
    await expect(dialog(page)).toBeVisible()

    const viewport = page.viewportSize()!
    for (;;) {
      await expect(dialog(page)).toBeVisible()
      const box = await dialogBox(page)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)

      const next = dialog(page).getByRole('button', { name: 'Siguiente' })
      if (!(await next.isVisible())) break
      await next.click()
    }

    await expect(dialog(page).getByRole('heading', { name: 'Ya puedes empezar' })).toBeVisible()
  })
})
