import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loadSeedRefs, serviceClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * «Cierre de cuentas» en el teléfono: la tarjeta de una cuenta dice que se
 * está abriendo (D-244).
 *
 * En el teléfono la tarjeta entera es el enlace y no hay un texto «Revisar
 * cuenta» que cambiar: en el mismo toque la tarjeta toma el fondo de la fila
 * pulsada y su flecha se convierte en el icono girando —el recurso del menú,
 * en el mismo hueco—, y quien escucha la pantalla oye «Abriendo la cuenta de…».
 * La petición RSC de la cuenta se retrasa con `page.route` para poder mirarlo.
 *
 * Usa la rifa y el vendedor del seed y solo navega: no escribe nada.
 */

let lista = ''
let vendedor = { id: '', nombre: '' }

test.beforeAll(async () => {
  const refs = await loadSeedRefs()
  const { data, error } = await serviceClient()
    .from('profiles')
    .select('full_name')
    .eq('id', refs.sellerId)
    .single()
  if (error || !data) throw error ?? new Error('Falta el vendedor del seed')
  vendedor = { id: refs.sellerId, nombre: data.full_name }
  lista = `/owner/settlements?raffleId=${refs.raffleId}`
})

function esLaCuenta(route: Route): boolean {
  const req = route.request()
  return (
    new URL(req.url()).pathname === `/owner/settlements/${vendedor.id}` &&
    req.headers()['rsc'] === '1' &&
    !req.headers()['next-router-prefetch']
  )
}

/** Mismo motivo que en la suite de escritorio (TESTING.md §5.3). */
async function esperarHidratado(link: Locator) {
  await expect
    .poll(() => link.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))))
    .toBe(true)
}

async function sinDesborde(page: Page) {
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(desborde, 'la pantalla no se desplaza de lado').toBeLessThanOrEqual(0)
}

test('la tarjeta cambia de fondo y gira su flecha en el mismo toque, sin moverse', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(lista)
  const tarjeta = page
    .getByRole('list', { name: 'Cuentas de los vendedores' })
    .getByRole('link', { name: `Revisar la cuenta de ${vendedor.nombre}` })
  await esperarHidratado(tarjeta)

  const pendiente = () => tarjeta.evaluate((el) => el.matches(':has([data-link-pending="true"])'))
  expect(await pendiente()).toBe(false)
  await expect(tarjeta.locator('svg.animate-spin')).toHaveCount(0)
  await expect(tarjeta.getByRole('status')).toHaveText('')
  const antes = (await tarjeta.boundingBox())!

  await page.route(`**/owner/settlements/${vendedor.id}**`, async (route) => {
    if (!esLaCuenta(route)) return route.continue()
    await new Promise((resuelve) => setTimeout(resuelve, 2500))
    await route.continue()
  })
  await tarjeta.tap()

  await expect.poll(pendiente, { timeout: 1000 }).toBe(true)
  await expect(tarjeta.locator('svg.animate-spin')).toBeVisible()
  await expect(tarjeta.getByRole('status')).toHaveText(`Abriendo la cuenta de ${vendedor.nombre}…`)
  await expect(page).toHaveURL(/\/owner\/settlements\?/)

  // El fondo que toma es el de una fila pulsada, el mismo de siempre.
  const fondo = await tarjeta.evaluate((el) => getComputedStyle(el).backgroundColor)
  const acento = await page.evaluate(() => {
    const muestra = document.createElement('div')
    muestra.style.backgroundColor = 'var(--ds-surface-accent)'
    document.body.append(muestra)
    const color = getComputedStyle(muestra).backgroundColor
    muestra.remove()
    return color
  })
  expect(fondo).toBe(acento)

  // El icono ocupa el hueco de la flecha: la tarjeta no crece ni se desplaza.
  const durante = (await tarjeta.boundingBox())!
  expect(Math.abs(durante.height - antes.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(durante.width - antes.width)).toBeLessThanOrEqual(1)
  await sinDesborde(page)

  await expect(
    page.getByRole('heading', { level: 1, name: `Cuenta de ${vendedor.nombre}` }),
  ).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/owner/settlements/${vendedor.id}\\?`))
})
