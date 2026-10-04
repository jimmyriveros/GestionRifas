import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'
import {
  esNavegacionRsc,
  esperarHidratado,
  registrarNavegaciones,
  retrasarNavegacion,
} from './navegacion-helpers'

/**
 * I-200 (D-252) en el teléfono: el control «Ordenar las boletas» elegido con la búsqueda ya en camino conserva la
 * búsqueda. Es el `setSort` de `useListSort`, la misma función que las cabeceras de escritorio
 * (`busqueda-en-camino.spec.ts`), con el dedo y desde el desplegable.
 *
 * Usa el seed y solo navega: no escribe nada.
 */

const DEMORA = 1500

// En un build de producción el service worker podría servir peticiones sin pasar por `page.route`: sin él, la
// búsqueda retenida está retenida de verdad, en desarrollo y en producción.
test.use({ serviceWorkers: 'block' })

test('mis boletas: «Cliente, de la A a la Z» con la búsqueda en camino se queda con la búsqueda', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/tickets')
  const campo = page.getByLabel('Buscar por número de boleta o por cliente')
  const control = page.getByRole('combobox', { name: 'Ordenar las boletas' })
  await esperarHidratado(campo)
  await esperarHidratado(control)

  const navegaciones = registrarNavegaciones(page)
  await retrasarNavegacion(
    page,
    '/seller/tickets',
    DEMORA,
    (url) => url.searchParams.get('q') === '03' && !url.searchParams.has('sort'),
  )
  const salio = page.waitForRequest(
    (req) =>
      esNavegacionRsc(req, '/seller/tickets') && new URL(req.url()).searchParams.get('q') === '03',
  )

  await campo.fill('03')
  await salio
  await control.tap()
  await page.getByRole('option', { name: 'Cliente, de la A a la Z' }).tap()

  const ambas = /(?=.*[?&]sort=clientName)(?=.*[?&]q=03)/
  await expect(page).toHaveURL(ambas, { timeout: 10_000 })
  await page.waitForTimeout(DEMORA + 500)
  await expect(page).toHaveURL(ambas)
  await expect(campo).toHaveValue('03')
  await expect(control).toHaveText(/Cliente, de la A a la Z/)

  const deLaLista = navegaciones.filter((url) => url.pathname === '/seller/tickets')
  expect(
    deLaLista.filter((url) => url.searchParams.has('sort') && !url.searchParams.has('q')),
  ).toHaveLength(0)
  expect(deLaLista).toHaveLength(2)
})
