import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * La configuracion de ganancias en el TELEFONO (D-237): el editor de tramos y
 * el alta con tramos propios caben sin desplazarse de lado, a 412 px y a 320 px,
 * y sus botones son dianas tactiles.
 *
 * No guarda nada: abre, escribe y mira. Lo que se guarda y como lo prueba
 * `ganancias.spec.ts`.
 */

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth, 'la pagina se desplaza de lado').toBeLessThanOrEqual(innerWidth)
}

for (const width of [412, 320]) {
  test(`la lista general se edita sin desplazarse de lado (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 })
    await loginAs(page, ACCOUNTS.controlOwner)
    await page.goto('/owner/settings/earnings')

    await expect(page.getByRole('heading', { name: 'Ganancias de vendedores', level: 1 })).toBeVisible()
    await expectNoHorizontalScroll(page)

    await page.getByRole('button', { name: 'Agregar tramo' }).click()
    const n = await page.getByLabel(/^Tramo \d+: ganancia por boleta$/).count()
    const cifra = page.getByLabel(`Tramo ${n}: ganancia por boleta`)
    await cifra.fill('90000')

    // Los dos campos de la fila nueva, enteros dentro de la pantalla.
    for (const campo of [page.getByLabel(`Tramo ${n}: desde cuántas boletas cobradas`), cifra]) {
      const box = await campo.boundingBox()
      expect(box, 'el campo no se ve').not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    }

    // Quitar un tramo es una diana tactil (44 px) en el telefono.
    const quitar = page.getByRole('button', { name: `Quitar el tramo ${n}` })
    const box = await quitar.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)

    await expectNoHorizontalScroll(page)
  })
}

test('el alta de un vendedor con tramos propios cabe en el telefono', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 860 })
  await loginAs(page, ACCOUNTS.controlOwner)
  await page.goto('/owner/sellers')
  await page.getByRole('button', { name: /Nuevo vendedor|Invitar vendedor/ }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('radio', { name: 'Ganancia por tramos' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Personalizar tramos' }).click()
  await expect(dialog.getByLabel('Tramo 2: ganancia por boleta')).toBeVisible()

  // El dialogo no se desplaza de lado: la fila se parte en dos lineas.
  const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow, 'el dialogo se desplaza de lado').toBeLessThanOrEqual(0)
  await expectNoHorizontalScroll(page)

  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toHaveCount(0)
})
