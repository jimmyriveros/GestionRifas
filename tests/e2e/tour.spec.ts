import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Recorrido guiado (F10-01).
 *
 * Lo que se comprueba aqui es lo que el usuario percibe: que aparece solo la
 * primera vez, que se puede avanzar y volver, que se recuerda al cerrarlo y que
 * cada rol ve su propio recorrido. La posicion exacta del globo la resuelve
 * Radix y no se prueba pixel a pixel; lo que si se prueba es que el globo cabe
 * en la pantalla y que el elemento explicado queda a la vista.
 */

const dialog = (page: Page) => page.getByRole('dialog').filter({ hasText: /Paso \d+ de \d+/ })

async function stepTitle(page: Page): Promise<string> {
  return (await dialog(page).getByRole('heading').innerText()).trim()
}

test.describe('Recorrido guiado del portal administrativo', () => {
  test('aparece solo en la primera visita y muestra el progreso', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner, { withTour: true })

    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByText(/^Paso 1 de \d+$/)).toBeVisible()
  })

  test('avanza, retrocede y termina con un mensaje de cierre', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner, { withTour: true })
    await expect(dialog(page)).toBeVisible()

    const total = Number(
      /Paso \d+ de (\d+)/.exec(
        await dialog(page)
          .getByText(/Paso \d+ de \d+/)
          .innerText(),
      )![1],
    )
    expect(total).toBeGreaterThan(2)

    // En el primer paso no hay a donde volver.
    await expect(dialog(page).getByRole('button', { name: 'Atrás' })).toBeHidden()

    const firstTitle = await stepTitle(page)
    await dialog(page).getByRole('button', { name: 'Siguiente' }).click()
    await expect(dialog(page).getByText('Paso 2 de ' + total)).toBeVisible()
    const secondTitle = await stepTitle(page)
    expect(secondTitle).not.toBe(firstTitle)

    await dialog(page).getByRole('button', { name: 'Atrás' }).click()
    await expect(dialog(page).getByText('Paso 1 de ' + total)).toBeVisible()
    expect(await stepTitle(page)).toBe(firstTitle)

    // Hasta el final: el ultimo paso confirma que ya puede empezar.
    for (let step = 1; step < total; step++) {
      await dialog(page).getByRole('button', { name: 'Siguiente' }).click()
    }
    await expect(dialog(page).getByText(`Paso ${total} de ${total}`)).toBeVisible()
    await expect(dialog(page).getByRole('heading', { name: 'Ya puedes empezar' })).toBeVisible()

    await dialog(page).getByRole('button', { name: 'Empezar' }).click()
    await expect(dialog(page)).toBeHidden()
  })

  test('al omitirlo no vuelve a aparecer solo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner, { withTour: true })
    await dialog(page).getByRole('button', { name: 'Omitir recorrido' }).click()
    await expect(dialog(page)).toBeHidden()

    await page.reload()
    await expect(page.getByRole('heading', { name: /^Hola,/ })).toBeVisible()
    await expect(dialog(page)).toBeHidden()
  })

  test('se puede volver a ver desde el menú de usuario', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner, { withTour: true })
    await dialog(page).getByRole('button', { name: 'Omitir recorrido' }).click()
    await expect(dialog(page)).toBeHidden()

    await page.getByRole('button', { name: /menú de usuario/i }).click()
    await page.getByRole('menuitem', { name: 'Ver recorrido guiado' }).click()

    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByText(/^Paso 1 de \d+$/)).toBeVisible()
  })

  test('cada pantalla con recorrido tiene el suyo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner, { withTour: true })
    await dialog(page).getByRole('button', { name: 'Omitir recorrido' }).click()

    await page.goto('/owner/tickets')
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('heading')).toHaveText('Crea las boletas de la rifa')
  })

  test('el elemento explicado queda a la vista y el globo cabe en la pantalla', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner, { withTour: true })
    await expect(dialog(page)).toBeVisible()

    // Se avanza hasta un paso que obliga a bajar: la cobranza esta bajo el pliegue.
    for (let i = 0; i < 8; i++) {
      const title = await stepTitle(page)
      if (title === 'El dinero de la rifa') break
      await dialog(page).getByRole('button', { name: 'Siguiente' }).click()
    }
    expect(await stepTitle(page)).toBe('El dinero de la rifa')

    const viewport = page.viewportSize()!
    const target = page.locator('[data-tour="metrics-collection"]')
    await expect(target).toBeInViewport()

    await expect(dialog(page)).toBeVisible()
    const balloon = await dialog(page).boundingBox()
    expect(balloon).not.toBeNull()
    expect(balloon!.x).toBeGreaterThanOrEqual(0)
    expect(balloon!.y).toBeGreaterThanOrEqual(0)
    expect(balloon!.x + balloon!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(balloon!.y + balloon!.height).toBeLessThanOrEqual(viewport.height + 1)
  })
})

test.describe('Recorrido guiado del portal del vendedor', () => {
  test('el vendedor ve su propio recorrido, sin pasos del portal administrativo', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller, { withTour: true })
    await expect(dialog(page)).toBeVisible()

    const titles: string[] = []
    for (;;) {
      titles.push(await stepTitle(page))
      const next = dialog(page).getByRole('button', { name: 'Siguiente' })
      if (!(await next.isVisible())) break
      await next.click()
    }

    expect(titles).toContain('Lo que más vas a usar')
    expect(titles).toContain('Ya puedes empezar')
    // Nada de lo que solo puede hacer un dueno o un administrador.
    expect(titles).not.toContain('Cómo va cada vendedor')
    expect(titles).not.toContain('Crea las boletas de la rifa')
    expect(titles).not.toContain('Invita a un vendedor')
  })

  test('un recorrido no se mezcla con el del otro portal', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller, { withTour: true })
    await dialog(page).getByRole('button', { name: 'Omitir recorrido' }).click()

    await page.goto('/seller/clients')
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('heading')).toHaveText('Guarda a quien te compra')
  })
})
