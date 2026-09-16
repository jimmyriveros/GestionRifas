import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, addPrize, createRaffleWithPrize, loginAs, unique } from './fixtures'

/**
 * El panel de premios en el viewport del teléfono (Entrega 2, D-202).
 *
 * Escritorio vive en `premios.spec.ts`. Aquí se comprueba lo que solo se puede
 * comprobar con un ancho de verdad: que la tabla NO se encoge —debajo de `md`
 * cada premio es una tarjeta—, que a 320, 375, 390 y 430 px no se desborda
 * nada, y que las acciones y el formulario se pueden tocar con el pulgar.
 */

const ANCHOS = [320, 375, 390, 430] as const

async function desbordamiento(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('Premios en el teléfono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('cada premio es una tarjeta, no una tabla encogida', async ({ page }) => {
    const name = unique('Rifa movil')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio del teléfono' })

    // La tabla existe en el DOM pero no se ve: debajo de `md` manda la tarjeta.
    await expect(page.getByRole('table')).toBeHidden()

    const tarjeta = page.getByRole('article').first()
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta).toContainText('Premio del teléfono')
    await expect(tarjeta).toContainText('$500.000')
    await expect(tarjeta).toContainText('Vigente')
    // La misma información y en el mismo orden semántico que la tabla.
    await expect(tarjeta).toContainText('Número')
    await expect(tarjeta).toContainText('Cifras')
    await expect(tarjeta).toContainText('Vigencia')
    await expect(tarjeta).toContainText('Lotería')
  })

  test('no hay desbordamiento horizontal en ninguno de los cuatro anchos', async ({ page }) => {
    const name = unique('Rifa anchos')
    await createRaffleWithPrize(page, {
      name,
      prizeTitle: 'Premio con un nombre bastante largo para probar el ancho',
    })
    await addPrize(page, { title: 'Premio dos', amount: '1200000', date: '2026-01-02' })

    for (const width of ANCHOS) {
      await page.setViewportSize({ width, height: 800 })
      await page.reload()
      await expect(page.getByRole('article').first()).toBeVisible()
      expect(await desbordamiento(page), `panel a ${width} px`).toBeLessThanOrEqual(0)
    }
  })

  test('el formulario del premio se puede usar y guardar con el pulgar', async ({ page }) => {
    const name = unique('Rifa formulario movil')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio base' })

    await page.setViewportSize({ width: 320, height: 800 })
    await page.reload()

    await page.getByRole('button', { name: 'Agregar premio' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Sin desbordamiento con el diálogo abierto: es lo que más contenido lleva.
    expect(await desbordamiento(page), 'diálogo a 320 px').toBeLessThanOrEqual(0)

    // Las dianas de verdad: el botón de guardar y el de agregar un período.
    for (const boton of [
      dialog.getByRole('button', { name: 'Guardar premio' }),
      dialog.getByRole('button', { name: 'Agregar otro período' }),
    ]) {
      const alto = await boton.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).height),
      )
      expect(alto).toBeGreaterThanOrEqual(44)
    }

    await dialog.getByLabel('Nombre del premio').fill('Premio del pulgar')
    await dialog.getByLabel('Dinero').fill('400000')
    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-02')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByRole('article').filter({ hasText: 'Premio del pulgar' })).toBeVisible()
  })

  test('la revisión previa a activar tampoco se desborda', async ({ page }) => {
    const name = unique('Rifa revision movil')
    const raffleId = await createRaffleWithPrize(page, { name, prizeTitle: 'Premio de revisión' })

    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(`/owner/raffles/${raffleId}/review`)

    await expect(page.getByRole('button', { name: 'Activar rifa' })).toBeVisible()
    expect(await desbordamiento(page), 'revisión a 320 px').toBeLessThanOrEqual(0)
  })
})
