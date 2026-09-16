import { expect, test, type Page } from '@playwright/test'

import { loadSeedRefs, type SeedRefs } from './db-setup'
import { ACCOUNTS, addPrize, createRaffleWithPrize, expectToast, loginAs, unique } from './fixtures'

/**
 * El panel de premios configurables (Entrega 2, D-202).
 *
 * TODO EL RECORRIDO ES POR LA INTERFAZ, con la sesión real del Dueño o del
 * Administrador. Las rifas se crean con el proceso de tres pasos, que es la
 * única forma de crear una rifa desde la Entrega 2.
 *
 * Las rifas de esta suite son suyas: llevan nombre propio y se quedan en
 * borrador salvo donde la prueba las activa a propósito.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/**
 * La TABLA de premios. El listado tiene dos caras —tabla desde `md`, tarjetas
 * debajo— y las dos están en el DOM: en el proyecto de escritorio la tarjeta
 * existe pero está oculta, así que una aserción por texto suelto resolvería a
 * un elemento invisible. Aquí se mira siempre la que se ve.
 */
function prizesTable(page: Page) {
  return page.getByRole('table').first()
}

/** Abre el formulario de un premio y devuelve su diálogo. */
function prizeDialog(page: Page) {
  return page.getByRole('dialog')
}

async function openNewPrize(page: Page) {
  await page.getByRole('button', { name: 'Agregar premio' }).first().click()
  return prizeDialog(page)
}

test.describe('Premios configurables', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('crea una rifa configurable que queda en borrador con su primer premio', async ({
    page,
  }) => {
    const name = unique('Rifa premios')

    await page.goto('/owner/raffles/new')
    await expect(page.getByText('1.')).toBeVisible()
    await page.getByLabel('Nombre de la rifa').fill(name)
    await page.getByLabel('Fecha de inicio').fill('2026-01-01')
    await page.getByLabel('Fecha de fin').fill('2026-12-31')
    await page.getByRole('button', { name: 'Crear rifa' }).click()

    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+\/prizes$/)
    await expect(page.getByText('Todavía no hay premios')).toBeVisible()

    await addPrize(page, { title: 'Premio diario', amount: '500000', date: '2026-01-01' })

    await expect(prizesTable(page)).toContainText('Premio diario')
    await expect(prizesTable(page)).toContainText('$500.000')
    await expect(prizesTable(page)).toContainText('Vigente')

    // Sigue en borrador: guardar un premio no activa nada.
    const raffleId = page.url().split('/owner/raffles/')[1]?.split('/')[0]
    await page.goto(`/owner/raffles/${raffleId}`)
    await expect(page.getByText('Borrador').first()).toBeVisible()
  })

  test('crea un premio en especie, uno mixto y el premio mayor con cuatro alternativas', async ({
    page,
  }) => {
    const name = unique('Rifa alternativas')
    const raffleId = await createRaffleWithPrize(page, { name, prizeTitle: 'Premio base' })

    // En especie: sin dinero.
    let dialog = await openNewPrize(page)
    await dialog.getByLabel('Nombre del premio').fill('Premio en especie')
    await dialog.getByLabel('Qué se entrega').fill('Camioneta KIA')
    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-02')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()
    await expect(prizesTable(page)).toContainText('Camioneta KIA')

    // Mixto: una cosa Y dinero, en la MISMA alternativa.
    dialog = await openNewPrize(page)
    await dialog.getByLabel('Nombre del premio').fill('Premio mixto')
    await dialog.getByLabel('Qué se entrega').fill('Renault Alaskan 2023')
    await dialog.getByLabel('Dinero').fill('20000000')
    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-05')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()
    await expect(prizesTable(page)).toContainText('Renault Alaskan 2023 y $20.000.000')

    // El premio mayor: CUATRO alternativas excluyentes.
    dialog = await openNewPrize(page)
    await dialog.getByLabel('Nombre del premio').fill('Premio mayor')
    await dialog.getByLabel('Forma del premio').click()
    await page.getByRole('option', { name: 'Alternativas a elegir' }).click()

    await dialog.getByRole('button', { name: 'Agregar alternativa' }).click()
    await dialog.getByRole('button', { name: 'Agregar alternativa' }).click()

    const descriptions = dialog.getByLabel('Qué se entrega')
    const amounts = dialog.getByLabel('Dinero')
    await expect(descriptions).toHaveCount(4)

    await descriptions.nth(0).fill('Camioneta KIA')
    await descriptions.nth(1).fill('Renault Alaskan 2023')
    await amounts.nth(1).fill('20000000')
    await amounts.nth(2).fill('120000000')
    await descriptions.nth(3).fill('Renault Logan Zen público 2023')
    await amounts.nth(3).fill('70000000')

    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-06')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()

    await expect(prizesTable(page)).toContainText(
      'una de estas alternativas: Camioneta KIA, Renault Alaskan 2023 y $20.000.000, $120.000.000 o Renault Logan Zen público 2023 y $70.000.000',
    )

    expect(raffleId).toMatch(/[0-9a-f-]+/)
  })

  test('editar un premio publica una versión nueva y el historial la muestra', async ({ page }) => {
    const name = unique('Rifa historial')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio con historia' })

    await page.getByRole('button', { name: 'Editar' }).first().click()
    const dialog = prizeDialog(page)
    await dialog.getByLabel('Dinero').fill('900000')
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(dialog).toBeHidden()
    await expectToast(page, /cambios quedaron guardados/i)
    await expect(prizesTable(page)).toContainText('$900.000')

    await page.getByRole('button', { name: 'Historial' }).first().click()
    const history = prizeDialog(page)
    await expect(history.getByText('Versión 2')).toBeVisible()
    await expect(history.getByText('Versión 1')).toBeVisible()
    await expect(history.getByText('Versión vigente')).toBeVisible()
    await expect(history.getByText('Condiciones cambiadas')).toBeVisible()
  })

  test('archiva y restaura un premio sin perder su historial', async ({ page }) => {
    const name = unique('Rifa archivo')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio que se archiva' })

    // Hace falta un segundo premio: una rifa activa conserva al menos uno, y
    // aquí además se comprueba que archivar no borra nada.
    await addPrize(page, { title: 'Premio que se queda', amount: '300000', date: '2026-01-02' })

    await page.getByRole('button', { name: 'Archivar' }).first().click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar premio' }).click()
    await expectToast(page, /ya no aplica para los próximos sorteos/i)

    await expect(page.getByText('Premios archivados')).toBeVisible()
    await expect(page.getByText('Archivado').first()).toBeVisible()

    await page.getByRole('button', { name: 'Restaurar' }).first().click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restaurar premio' }).click()
    await expectToast(page, /vuelve a aplicar/i)
    await expect(page.getByText('Premios archivados')).toHaveCount(0)
  })

  test('cambia el orden de los premios con «Subir» y «Bajar»', async ({ page }) => {
    const name = unique('Rifa orden')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio A' })
    await addPrize(page, { title: 'Premio B', amount: '300000', date: '2026-01-02' })

    const rows = page.getByRole('row')
    await expect(rows.nth(1)).toContainText('Premio A')

    await page.getByRole('button', { name: /^Subir: Premio B/ }).click()
    await expectToast(page, /orden quedó guardado/i)
    await expect(page.getByRole('row').nth(1)).toContainText('Premio B')
  })

  test('dos premios que juegan el mismo día con la misma regla se rechazan', async ({ page }) => {
    const name = unique('Rifa conflicto')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio del lunes' })

    // El mismo día, el mismo número y las mismas cifras: es un conflicto.
    const dialog = await openNewPrize(page)
    await dialog.getByLabel('Nombre del premio').fill('Premio que choca')
    await dialog.getByLabel('Dinero').fill('700000')
    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-01')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()

    await expect(dialog.getByRole('alert')).toContainText('Premio del lunes')
    await expect(dialog.getByRole('alert')).toContainText('01/01/2026')

    // Con las últimas tres cifras, el mismo día SÍ se puede (BR-J07).
    await dialog.getByLabel('Cifras').click()
    await page.getByRole('option', { name: 'Últimas tres cifras' }).click()
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()
    await expect(prizesTable(page)).toContainText('Premio que choca')
  })

  test('la revisión impide activar sin premios y activa cuando la configuración es válida', async ({
    page,
  }) => {
    const name = unique('Rifa revision')

    await page.goto('/owner/raffles/new')
    await page.getByLabel('Nombre de la rifa').fill(name)
    await page.getByLabel('Fecha de inicio').fill('2026-01-01')
    await page.getByLabel('Fecha de fin').fill('2026-12-31')
    await page.getByRole('button', { name: 'Crear rifa' }).click()
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+\/prizes$/)

    // Sin premios: la revisión lo dice y no ofrece activar.
    await page.getByRole('link', { name: 'Continuar a revisar' }).click()
    await page.waitForURL(/\/review$/)
    await expect(page.getByText('Todavía no se puede activar')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Activar rifa' })).toBeDisabled()

    await page.getByRole('link', { name: 'Volver a los premios' }).click()
    await addPrize(page, { title: 'Premio de revisión', amount: '500000', date: '2026-01-01' })

    await page.getByRole('link', { name: 'Continuar a revisar' }).click()
    await page.waitForURL(/\/review$/)
    await expect(page.getByText('Todavía no se puede activar')).toHaveCount(0)

    await page.getByRole('button', { name: 'Activar rifa' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Activar rifa' }).click()
    await expectToast(page, /activa/i)
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)
    await expect(page.getByText('Activa').first()).toBeVisible()
  })

  test('una rifa cerrada deja sus premios en solo lectura', async ({ page }) => {
    const name = unique('Rifa cerrada premios')
    const raffleId = await createRaffleWithPrize(page, { name, activate: true })

    await page.getByRole('button', { name: 'Cerrar rifa' }).click()
    await page.getByRole('button', { name: 'Cerrar rifa' }).last().click()
    await expectToast(page, /cerrada/i)

    await page.goto(`/owner/raffles/${raffleId}/prizes`)
    await expect(page.getByText('La rifa está cerrada o anulada')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar premio' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Editar' })).toBeDisabled()
  })

  test('una rifa heredada no ofrece configuración de premios', async ({ page }) => {
    // Las rifas del seed siguen en `legacy` (BR-J13).
    await page.goto(`/owner/raffles/${refs.raffleId}`)
    await expect(page.getByRole('link', { name: 'Configurar premios' })).toHaveCount(0)

    await page.goto(`/owner/raffles/${refs.raffleId}/prizes`)
    await expect(page.getByText('Esta rifa usa el sistema de premios de siempre')).toBeVisible()
  })
})

test.describe('Premios: control de acceso', () => {
  test('un Administrador también configura premios (por capacidad, no por rol)', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.admin)
    const name = unique('Rifa admin premios')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio del administrador' })
    await expect(prizesTable(page)).toContainText('Premio del administrador')
  })

  test('un vendedor no llega al panel de premios', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/owner/raffles')
    await expect(page).toHaveURL(/\/denied|\/seller/)
  })
})
