import { expect, test, type Page } from '@playwright/test'

import {
  createClientFor,
  generationRunIds,
  loadSeedRefs,
  purgeCommonInventory,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, unique } from './fixtures'

/**
 * El inventario común (D-257) en el teléfono: el Dueño genera por rangos y el
 * vendedor llega desde «Mis boletas», aparta y vende, sin que nada se salga de
 * la pantalla a lo ancho.
 *
 * El escritorio —entregar y recuperar lotes, pedir 30 minutos más, devolver,
 * lo que ve otro vendedor y la configuración del Dueño— vive en
 * `inventario-comun.spec.ts`; las reglas, en `tests/db/common-inventory.test.ts`.
 *
 * Como allí: en la rifa del seed, de dos números de cuatro cifras (D-261), con el
 * semanal distinto del de escritorio —se escribe 5 y 6 y se guarda 0005 y
 * 0006— para que las dos nunca compartan combinación. En serie: el vendedor usa
 * lo que generó el Dueño.
 */
test.describe.configure({ mode: 'serial' })

const inicio = 1000 + Math.floor(Math.random() * 8000)
const RANGOS = {
  dailyFrom: String(inicio),
  dailyTo: String(inicio + 1),
  weeklyFrom: '5',
  weeklyTo: '6',
}
/** Lo que guarda la rifa, con los ceros de sus cuatro cifras. */
const GUARDADOS = { ...RANGOS, weeklyFrom: '0005', weeklyTo: '0006' }
const D1 = RANGOS.dailyFrom

let refs: SeedRefs
let since: string
const clientesCreados: string[] = []

async function desborde(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  since = new Date().toISOString()
})

test.afterAll(async () => {
  await purgeCommonInventory({
    runIds: await generationRunIds({ raffleId: refs.raffleId, since, ...GUARDADOS }),
    clientIds: clientesCreados,
    since,
  })
})

test('el Dueño genera por rangos desde el teléfono', async ({ page }) => {
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(`/owner/tickets/generate?raffleId=${refs.raffleId}`)

  const diarios = page.getByRole('group', { name: 'Número diario' })
  const semanales = page.getByRole('group', { name: 'Número semanal' })
  await diarios.getByLabel('Desde').fill(RANGOS.dailyFrom)
  await diarios.getByLabel('Hasta').fill(RANGOS.dailyTo)
  await semanales.getByLabel('Desde').fill(RANGOS.weeklyFrom)
  await semanales.getByLabel('Hasta').fill(RANGOS.weeklyTo)
  await page.getByRole('button', { name: 'Calcular' }).tap()

  await expect(page.getByText('Se crearán 4 boletas')).toBeVisible()
  expect(await desborde(page)).toBeLessThanOrEqual(0)

  await page.getByRole('button', { name: 'Generar 4 boletas' }).tap()
  await expect(page.getByText('Se crearon 4 boletas en el inventario común.')).toBeVisible()
  expect(await desborde(page)).toBeLessThanOrEqual(0)
})

test('el vendedor llega desde «Mis boletas», aparta y vende desde el teléfono', async ({
  page,
}) => {
  const cliente = await createClientFor(refs, unique('Cliente inventario movil'))
  clientesCreados.push(cliente.id)
  const objetivo = `${D1} / 0005`

  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/tickets')
  // «Mis boletas» avisa de que hay boletas libres y lleva a buscarlas.
  await expect(page.getByText(/libres? en el inventario común\./)).toBeVisible()
  await page.getByRole('link', { name: 'Buscar y apartar' }).tap()
  await expect(page).toHaveURL(/\/seller\/inventory/)

  await page.getByLabel('Número diario').fill(D1)
  await page.getByLabel('Número semanal').fill('0005')
  await page.getByRole('button', { name: 'Buscar', exact: true }).tap()
  await expect(page).toHaveURL(new RegExp(`daily=${D1}`))

  await page.getByRole('button', { name: `Apartar la boleta ${objetivo}` }).tap()
  await page
    .getByRole('alertdialog', { name: `Apartar la boleta ${objetivo}` })
    .getByRole('button', { name: 'Apartar boleta' })
    .tap()
  await expectToast(page, new RegExp(`Apartaste la boleta ${objetivo} hasta las`))

  // La tarjeta del apartado cabe entera, con sus tres acciones.
  const mios = page.getByRole('region', { name: 'Tus apartados' })
  await expect(mios.getByText(objetivo, { exact: true })).toBeVisible()
  const ancho = page.viewportSize()!.width
  for (const nombre of [
    `Vender la boleta ${objetivo}`,
    `Pedir 30 minutos más para la boleta ${objetivo}`,
    `Devolver la boleta ${objetivo}`,
  ]) {
    const caja = (await mios.getByRole('button', { name: nombre }).boundingBox())!
    expect(caja.x + caja.width, nombre).toBeLessThanOrEqual(ancho + 1)
    expect(caja.height, nombre).toBeGreaterThanOrEqual(44)
  }
  expect(await desborde(page)).toBeLessThanOrEqual(0)

  await mios.getByRole('button', { name: `Vender la boleta ${objetivo}` }).tap()
  const vender = page.getByRole('dialog', { name: `Vender la boleta ${objetivo}` })
  await vender.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(cliente.name)
  await vender.getByRole('option', { name: new RegExp(cliente.name) }).tap()
  await vender.getByRole('button', { name: 'Asignar boleta' }).tap()
  await expectToast(page, 'Boleta asignada.')

  const { data, error } = await serviceClient()
    .from('tickets')
    .select('seller_id, client_id, inventory_status')
    .eq('raffle_id', refs.raffleId)
    .eq('daily_number', D1)
    .eq('weekly_number', '0005')
    .single()
  if (error) throw error
  expect(data.seller_id).toBe(refs.sellerId)
  expect(data.client_id).toBe(cliente.id)
  expect(data.inventory_status).toBe('assigned')
})
