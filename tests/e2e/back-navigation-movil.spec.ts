import { expect, test } from '@playwright/test'

import { createClientFor, loadSeedRefs, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Flecha de volver en el telefono (D-089, Caso G del encargo): diana comoda,
 * titulo largo sin desbordar y sin perder la flecha.
 *
 * Corre solo en el proyecto `movil` (Pixel 7) de playwright.config.ts.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test('la flecha mide al menos 44x44 y se toca con el dedo', async ({ page }) => {
  // El encabezado con la flecha esta en las dos variantes de esta pantalla
  // (con y sin rifas que permitan crear), asi que basta con abrirla.
  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/tickets/new')

  const back = page.getByRole('button', { name: 'Volver' })
  await expect(back).toBeVisible()

  const box = await back.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)

  await back.tap()
  await expect(page).toHaveURL('/seller/tickets')
})

test('un título largo no desborda ni empuja la flecha fuera de la pantalla', async ({ page }) => {
  const longName = 'María Fernanda Restrepo Ochoa de las Mercedes del Rosario'
  const client = await createClientFor(refs, longName)

  await loginAs(page, ACCOUNTS.owner)
  await page.goto(`/owner/clients/${client.id}`)

  const back = page.getByRole('button', { name: 'Volver' })
  await expect(back).toBeVisible()
  await expect(page.getByRole('heading', { name: longName })).toBeVisible()

  // Sin scroll horizontal: el ancho de scroll del documento no supera el
  // ancho visible del viewport (seccion 8 del encargo).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)

  await back.tap()
  await expect(page).toHaveURL('/owner/clients')
})
