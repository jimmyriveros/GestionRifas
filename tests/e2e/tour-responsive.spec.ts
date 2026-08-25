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
 * Caja del globo YA QUIETO.
 *
 * Dos esperas, por dos motivos distintos:
 *
 * 1. `boundingBox()` **no auto-espera** (docs/TESTING.md §3.1) y la tarjeta del
 *    recorrido se reemplaza al cambiar de paso: entre el `toBeVisible()` y la
 *    medida cabe un instante en el que el elemento anterior ya no esta y el
 *    nuevo todavia no, y ahi devuelve `null`. Era la causa de I-032.
 *
 * 2. Al cambiar de paso, el recorrido lleva el elemento a la vista con un
 *    scroll SUAVE y el globo lo persigue cuadro a cuadro. Durante esa animacion
 *    el globo pasa por fuera de la pantalla —es lo que tiene seguir a algo que
 *    viene de 1.000 px mas abajo— y medir ahi no dice nada sobre si cabe. Lo
 *    que se quiere comprobar es su posicion **en reposo**, asi que se espera a
 *    que dos lecturas seguidas coincidan.
 */
async function dialogBox(page: import('@playwright/test').Page) {
  type Box = Awaited<ReturnType<ReturnType<typeof dialog>['boundingBox']>>
  let previous: Box = null
  let stable: Box = null

  await expect
    .poll(async () => {
      const current = await dialog(page).boundingBox()
      const quieto =
        current !== null &&
        previous !== null &&
        Math.abs(current.x - previous.x) < 1 &&
        Math.abs(current.y - previous.y) < 1
      previous = current
      if (quieto) stable = current
      return quieto
    })
    .toBe(true)

  return stable!
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
