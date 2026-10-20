import { expect, test } from '@playwright/test'

import { generationRunIds, purgeCommonInventory, serviceClient } from './db-setup'
import { ACCOUNTS, loginAs, unique } from './fixtures'

/**
 * Una rifa de UN solo número, de tres cifras (D-261), por la interfaz del Dueño:
 * se define al crearla —con su resumen y su confirmación—, después solo se lee,
 * y sus boletas llevan ese número y ningún otro, con sus tres cifras exactas, en
 * la creación manual, en el generador y en la lista.
 *
 * Las reglas —inmutabilidad por cualquier vía, unicidad, formato en todas las
 * entradas, premios y prioridad— viven en SQL y las prueban
 * `tests/db/raffle-number-groups.test.ts` y las unitarias. Aquí, el RECORRIDO.
 *
 * EN SERIE: cada prueba usa la rifa que creó la primera.
 */
test.describe.configure({ mode: 'serial' })

const nombreRifa = unique('Rifa un numero')
let raffleId = ''
let since = ''
// El rango del generador: se escribe sin ceros y la rifa los pone.
const RANGO = { dailyFrom: '8', dailyTo: '9' }

test.beforeAll(() => {
  since = new Date().toISOString()
})

test.afterAll(async () => {
  if (!raffleId) return
  await purgeCommonInventory({
    runIds: await generationRunIds({
      raffleId,
      since,
      dailyFrom: '008',
      dailyTo: '009',
      weeklyFrom: null,
      weeklyTo: null,
    }),
    since,
  })
})

test.beforeEach(async ({ page }) => {
  await loginAs(page, ACCOUNTS.owner)
})

test('el Dueño define un solo número de tres cifras, lo revisa y lo confirma', async ({ page }) => {
  await page.goto('/owner/raffles/new')
  await page.getByLabel('Nombre de la rifa').fill(nombreRifa)
  await page.getByLabel('Fecha de inicio').fill('2026-01-01')
  await page.getByLabel('Fecha de fin').fill('2026-12-31')

  const numeros = page.getByRole('group', { name: 'Números de cada boleta' })
  await numeros.getByLabel('¿Cuántos números tiene cada boleta?').click()
  await page.getByRole('option', { name: 'Uno' }).click()
  // Con un número no hay «Segundo número».
  await expect(numeros.getByRole('group', { name: 'Segundo número' })).toHaveCount(0)
  const primero = numeros.getByRole('group', { name: 'Primer número' })
  await primero.getByLabel('Nombre').fill('Número')
  await primero.getByLabel('Cifras').click()
  await page.getByRole('option', { name: '3 cifras (000 a 999)' }).click()

  await page.getByRole('button', { name: 'Crear rifa' }).click()
  const resumen = page.getByRole('alertdialog', { name: 'Revisa los números de la boleta' })
  await expect(resumen.getByText('Cada boleta tendrá un número:')).toBeVisible()
  await expect(resumen.getByText('Número, de 3 cifras (000 a 999)')).toBeVisible()
  await expect(
    resumen.getByText(
      'Después de crear la rifa no podrás cambiar cuántos números tiene cada boleta, sus nombres ni sus cifras.',
    ),
  ).toBeVisible()
  await resumen.getByRole('button', { name: 'Crear rifa' }).click()

  await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+\/prizes$/)
  raffleId = page.url().split('/owner/raffles/')[1]?.split('/')[0] ?? ''

  const { data, error } = await serviceClient()
    .from('raffles')
    .select('number_group_count, first_group_name, first_group_digits, second_group_name, second_group_digits')
    .eq('id', raffleId)
    .single()
  expect(error).toBeNull()
  expect(data).toEqual({
    number_group_count: 1,
    first_group_name: 'Número',
    first_group_digits: 3,
    second_group_name: null,
    second_group_digits: null,
  })
})

test('al editar la rifa, sus números solo se leen', async ({ page }) => {
  await page.goto(`/owner/raffles/${raffleId}/edit`)
  const seccion = page.getByRole('region', { name: 'Números de cada boleta' })
  await expect(seccion.getByText('Número, de 3 cifras (000 a 999)')).toBeVisible()
  await expect(
    seccion.getByText('Los números de una rifa no se cambian después de crearla.'),
  ).toBeVisible()
  await expect(page.getByLabel('¿Cuántos números tiene cada boleta?')).toHaveCount(0)
})

test('una boleta lleva ese número solo, con sus tres cifras', async ({ page }) => {
  await page.goto('/owner/tickets/new')
  await page.getByLabel('Rifa').click()
  await page.getByRole('option', { name: new RegExp(nombreRifa) }).click()

  // Un solo campo: no hay segundo número que escribir.
  await expect(page.getByLabel('Número semanal')).toHaveCount(0)
  const campo = page.getByLabel('Número', { exact: true })
  await campo.fill('7')
  await page.getByRole('button', { name: 'Crear boleta' }).click()
  await expect(page.getByText('El número «Número» lleva exactamente 3 cifras: escribe 007.')).toBeVisible()
  await expect(page).toHaveURL(/\/owner\/tickets\/new/)

  await campo.fill('007')
  await page.getByRole('button', { name: 'Crear boleta' }).click()
  await page.waitForURL(/\/owner\/tickets\/[0-9a-f-]+$/)

  // El detalle enseña UNA caja, con el nombre del número.
  const detalle = page.getByRole('main')
  await expect(detalle.getByRole('heading', { name: 'Números de la boleta' })).toBeVisible()
  await expect(detalle.getByText('007', { exact: true })).toBeVisible()
  await expect(detalle.getByText('Número semanal')).toHaveCount(0)

  const { data } = await serviceClient()
    .from('tickets')
    .select('daily_number, weekly_number, number_group_count')
    .eq('raffle_id', raffleId)
    .eq('daily_number', '007')
    .single()
  expect(data).toEqual({ daily_number: '007', weekly_number: null, number_group_count: 1 })
})

test('el generador pone las tres cifras y la lista nombra la boleta por su número', async ({
  page,
}) => {
  await page.goto(`/owner/tickets/generate?raffleId=${raffleId}`)
  await expect(page.getByRole('heading', { name: 'Generar boletas por rangos' })).toBeVisible()
  // Un solo rango: el del número de la rifa.
  await expect(page.getByRole('group', { name: 'Número semanal' })).toHaveCount(0)
  const rango = page.getByRole('group', { name: 'Número', exact: true })
  await rango.getByLabel('Desde').fill(RANGO.dailyFrom)
  await rango.getByLabel('Hasta').fill(RANGO.dailyTo)
  await page.getByRole('button', { name: 'Calcular' }).click()

  await expect(page.getByText('Se crearán 2 boletas')).toBeVisible()
  await expect(page.getByText('Número: del 008 al 009')).toBeVisible()
  await page.getByRole('button', { name: 'Generar 2 boletas' }).click()
  await expect(page.getByText('Se crearon 2 boletas en el inventario común.')).toBeVisible()

  await page.goto(`/owner/tickets?raffleId=${raffleId}&q=008`)
  await expect(page.getByRole('link', { name: 'Ver la boleta 008' }).first()).toBeVisible()
  // Sin «/» ni un segundo número vacío.
  await expect(page.getByRole('link', { name: /Ver la boleta 008 \// })).toHaveCount(0)
})

test('un premio solo puede jugar con ese número y con tres cifras o menos', async ({ page }) => {
  await page.goto(`/owner/raffles/${raffleId}/prizes`)
  await page.getByRole('button', { name: 'Agregar premio' }).first().click()
  const dialogo = page.getByRole('dialog')
  await expect(
    dialogo.getByText('El número «Número» tiene 3 cifras: el premio puede comparar 3 o menos.'),
  ).toBeVisible()
  await dialogo.getByLabel('Cifras').click()
  await expect(page.getByRole('option', { name: 'Cuatro cifras' })).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'Últimas tres cifras' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Últimas dos cifras' })).toBeVisible()
  await page.keyboard.press('Escape')
})
