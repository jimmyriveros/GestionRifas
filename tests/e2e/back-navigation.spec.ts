import { expect, test } from '@playwright/test'

import { createTicket, loadSeedRefs, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers } from './fixtures'

/**
 * Patron global de navegacion hacia atras en las pantallas de detalle
 * (D-089): una flecha junto al titulo, que prefiere el historial real de la
 * sesion (busqueda, filtros, pagina y scroll ya viven en la URL, asi que se
 * conservan solos) y usa un destino de repuesto cuando no hay pantalla
 * anterior real. Casos A-H del encargo.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.describe('Flecha de volver: historial real (Casos A, B, C)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('boletas: conserva búsqueda y filtro al volver (Caso C, BR-N11)', async ({ page }) => {
    const numbers = randomTicketNumbers()
    await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })

    const listUrl = `/owner/tickets?inventoryStatus=available&q=${numbers.daily}`
    await page.goto(listUrl)
    await expect(page.getByRole('columnheader', { name: 'Boleta', exact: true })).toBeVisible()

    await page.getByRole('link', { name: new RegExp(`Ver la boleta ${numbers.daily}`) }).click()
    await page.waitForURL(/\/owner\/tickets\/[0-9a-f-]+$/)

    // No queda ningun boton textual "Volver a..."; la navegacion es la flecha.
    await expect(page.getByRole('link', { name: /Volver a/ })).toHaveCount(0)

    const back = page.getByRole('button', { name: 'Volver' })
    await expect(back).toBeVisible()
    await back.click()

    await expect(page).toHaveURL(listUrl)
    await expect(page.getByPlaceholder('Número de boleta o cliente')).toHaveValue(numbers.daily)
  })

  test('clientes: vuelve al listado de clientes (Caso B)', async ({ page }) => {
    await page.goto('/owner/clients')
    await expect(page.getByRole('columnheader', { name: 'Cliente' })).toBeVisible()

    const firstRow = page.getByRole('row').nth(1)
    const clientName = (await firstRow.getByRole('link').first().textContent())?.trim()
    await firstRow.getByRole('link').first().click()
    await page.waitForURL(/\/owner\/clients\/[0-9a-f-]+$/)

    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL('/owner/clients')
    // La tarjeta del telefono (D-136) esta en el DOM y oculta: `.first()` la
    // pisa. En escritorio el nombre visible es el enlace de la tabla.
    if (clientName) {
      await expect(
        page.getByRole('table').getByRole('link', { name: clientName, exact: true }),
      ).toBeVisible()
    }
  })

  test('rifas: vuelve al listado de rifas (BR-R)', async ({ page }) => {
    await page.goto('/owner/raffles')
    await expect(page.getByRole('columnheader', { name: 'Rifa' })).toBeVisible()

    await page.getByRole('row').nth(1).getByRole('link').first().click()
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)

    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL('/owner/raffles')
  })

  test('editar rifa: vuelve al detalle de la rifa, no al listado', async ({ page }) => {
    await page.goto('/owner/raffles')
    await page.getByRole('row').nth(1).getByRole('link').first().click()
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)
    const detailUrl = page.url()

    await page.getByRole('link', { name: 'Editar' }).click()
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+\/edit$/)

    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL(detailUrl)
  })
})

test.describe('Flecha de volver: boletas del vendedor (Caso A)', () => {
  test('vuelve a Mis boletas conservando el filtro', async ({ page }) => {
    const numbers = randomTicketNumbers()
    await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })

    await loginAs(page, ACCOUNTS.seller)
    const listUrl = `/seller/tickets?q=${numbers.daily}`
    await page.goto(listUrl)
    await expect(page.getByRole('columnheader', { name: 'Boleta', exact: true })).toBeVisible()

    await page.getByRole('link', { name: new RegExp(`Ver la boleta ${numbers.daily}`) }).click()
    await page.waitForURL(/\/seller\/tickets\/[0-9a-f-]+$/)
    await expect(page.getByRole('link', { name: /Volver a/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL(listUrl)
  })
})

test.describe('Flecha de volver: sin historial real (Caso E)', () => {
  test('una boleta abierta por URL directa usa el destino de repuesto', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })

    // Sesion real (BR-A03), pero SIN pasar por la lista: exactamente el caso
    // de un enlace guardado o escrito a mano.
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets/${ticket.id}`)

    await page.getByRole('button', { name: 'Volver' }).click()

    // No debe quedarse pegado en el detalle ni salir de la aplicacion: cae en
    // el listado de boletas de la propia rifa (el destino de repuesto).
    await expect(page).toHaveURL(/\/owner\/tickets\?raffleId=/)
    await expect(page.getByRole('columnheader', { name: 'Boleta', exact: true })).toBeVisible()
  })

  test('un cliente abierto por URL directa usa el listado de clientes', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/clients')
    const clientHref = await page
      .getByRole('row')
      .nth(1)
      .getByRole('link')
      .first()
      .getAttribute('href')
    if (!clientHref) throw new Error('El seed no tiene clientes para esta prueba')

    // Nueva pestana de la MISMA sesion: sin historial propio de esta pestana.
    const directPage = await page.context().newPage()
    await directPage.goto(clientHref)

    await directPage.getByRole('button', { name: 'Volver' }).click()
    await expect(directPage).toHaveURL('/owner/clients')
    await directPage.close()
  })
})

test.describe('Flecha de volver: teclado (Caso F)', () => {
  test('se activa con el teclado, sin depender del mouse', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/sellers')
    await page.getByRole('row').nth(1).getByRole('link').first().click()
    await page.waitForURL(/\/owner\/sellers\/[0-9a-f-]+$/)

    const back = page.getByRole('button', { name: 'Volver' })
    await back.focus()
    await expect(back).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL('/owner/sellers')
  })
})

test.describe('Flecha de volver: cambiar contraseña', () => {
  test('usa el mismo patron que el resto de la aplicación', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/account/password')

    await expect(page.getByRole('heading', { name: 'Cambiar contraseña' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Volver al panel/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Volver al panel' }).click()
    await expect(page).toHaveURL('/owner/dashboard')
  })
})
