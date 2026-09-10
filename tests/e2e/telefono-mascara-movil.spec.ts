import { expect, test, type Locator, type Page } from '@playwright/test'

import { createClientFor, loadSeedRefs, purgeTestData, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, unique } from './fixtures'

/**
 * La mascara del telefono en el telefono (D-184).
 *
 * QUE SE MIRA AQUI, y por que no vale con la suite de escritorio. Este campo se
 * rellena casi siempre desde un movil, y la mascara le ANADE caracteres: doce en
 * vez de diez, dieciseis con indicativo. Lo que hay que comprobar es que eso no
 * rompe nada de lo que ya se habia ganado a 320 px —el suelo tactil de 44 px y
 * que la pagina no se arrastre de lado (D-108, I-076)— y que escribir y borrar
 * se comportan igual con el teclado del telefono.
 *
 * Fija su propio ancho: el proyecto `movil` corre a los 412 px del Pixel 7, y el
 * caso limite es 320.
 */

const ANCHO_MINIMO = { width: 320, height: 800 }

let refs: SeedRefs
const clientesCreados: string[] = []

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  await purgeTestData({ clientIds: clientesCreados })
})

function campoTelefono(page: Page): Locator {
  return page.getByLabel('Teléfono')
}

test.describe('El campo de telefono a 320 px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(ANCHO_MINIMO)
    await loginAs(page, ACCOUNTS.seller)
  })

  test('con el numero mas largo, la pagina no se arrastra de lado', async ({ page }) => {
    await page.goto('/seller/clients/new')
    const campo = campoTelefono(page)

    // El valor mas largo que produce la mascara: dieciseis caracteres.
    await campo.fill('+57 (300) 123-4567')
    await expect(campo).toHaveValue('+57 300 123 4567')

    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desbordamiento, 'desbordamiento horizontal a 320 px').toBeLessThanOrEqual(2)

    // Y el texto cabe dentro del campo, sin recortarse ni desplazarlo.
    const cabe = await campo.evaluate((el) => {
      const input = el as HTMLInputElement
      return input.scrollWidth <= input.clientWidth + 1
    })
    expect(cabe, 'el numero formateado tiene que caber dentro del campo').toBe(true)
  })

  test('conserva el suelo tactil de 44 px', async ({ page }) => {
    await page.goto('/seller/clients/new')
    const alto = await campoTelefono(page).evaluate(
      (el) => Number.parseFloat(getComputedStyle(el).height),
      // `getComputedStyle` y no `boundingBox()`: la caja de maquetacion miente
      // mientras una transicion escala el contenido (D-177).
    )
    expect(alto).toBe(44)
  })

  test('escribir, borrar y volver a escribir se comporta igual con el teclado del telefono', async ({
    page,
  }) => {
    await page.goto('/seller/clients/new')
    const campo = campoTelefono(page)

    await campo.click()
    await campo.pressSequentially('3001234567')
    await expect(campo).toHaveValue('300 123 4567')

    // El cursor esta al final: dos pulsaciones quitan dos digitos, no un espacio
    // y un digito.
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await expect(campo).toHaveValue('300 123 45')

    await campo.pressSequentially('67')
    await expect(campo).toHaveValue('300 123 4567')
  })

  test('un telefono historico se ve legible y se guarda como estaba', async ({ page }) => {
    const HISTORICO = '+57 (301) 555-7788'
    const cliente = await createClientFor(
      refs,
      unique('Movil historico'),
      refs.sellerId,
      HISTORICO,
    )
    clientesCreados.push(cliente.id)

    await page.goto(`/seller/clients/${cliente.id}/edit`)
    await expect(campoTelefono(page)).toHaveValue('+57 301 555 7788')

    const alias = unique('Alias')
    await page.getByLabel('Alias (opcional)').fill(alias)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)

    // La ficha sigue enseñando el dato guardado, sin reescribirlo.
    await expect(page.getByText(HISTORICO)).toBeVisible()
  })
})
