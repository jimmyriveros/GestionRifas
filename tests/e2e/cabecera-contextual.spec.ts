import { expect, test } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  createTicket,
  loadSeedRefs,
  raffleTicketPrice,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'
import {
  appHeader,
  compactAction,
  compactState,
  compactTitle,
  activate,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  hideNextDevUi,
  scrollPageHeaderIn,
  scrollPageHeaderOut,
} from './cabecera-helpers'

/**
 * Cabecera contextual en escritorio (D-150).
 *
 * El titulo y el CTA de cada pantalla suben a la cabecera fija solo cuando el
 * PageHeader original ya no se ve. No se comprueba el color: se comprueba el
 * cruce, el contrato semantico del CTA y que no queden dos copias al alcance.
 */

let refs: SeedRefs
const creadas: string[] = []

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.beforeEach(async ({ page }) => {
  await hideNextDevUi(page)
})

test.describe('Cabecera contextual en escritorio', () => {
  test('arriba no hay titulo compacto; al bajar aparece el de la pantalla', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')

    await expect(page.getByRole('heading', { level: 1, name: 'Mis boletas' })).toBeVisible()
    await expect(compactState(page)).toHaveAttribute('data-compact-header', 'idle')
    await expect(appHeader(page).getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

    await scrollPageHeaderOut(page)

    await expect(compactTitle(page)).toHaveText('Mis boletas')
    await expect(compactAction(page).getByRole('link', { name: 'Crear boletas' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.locator('[data-tour="page-header"]')).toHaveCount(1)
    await expect(page.locator('[data-tour="page-actions"]')).toHaveCount(1)

    await scrollPageHeaderIn(page)
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toBeVisible()
    await expect(appHeader(page).getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)
  })

  test('en Boletas del dueño solo sube Nueva boleta, no Crear en lote', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')

    await expect(page.getByRole('link', { name: 'Crear en lote' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nueva boleta' })).toBeVisible()

    await scrollPageHeaderOut(page)

    await expect(compactTitle(page)).toHaveText('Boletas')
    await expect(compactAction(page).getByRole('link', { name: 'Nueva boleta' })).toBeVisible()
    await expect(appHeader(page).getByRole('link', { name: 'Crear en lote' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Nueva boleta' })).toHaveCount(1)
  })

  test('la flecha compacta usa el historial y no sale de la aplicacion', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await page.getByRole('link', { name: 'Crear boletas' }).click()
    await page.waitForURL('**/seller/tickets/new')

    await expect(page.getByRole('heading', { level: 1, name: 'Crear boletas' })).toBeVisible()
    await scrollPageHeaderOut(page)

    const volver = appHeader(page).getByRole('button', { name: 'Volver' })
    await expect(volver).toBeVisible()
    await expect(page.getByRole('button', { name: 'Volver' })).toHaveCount(1)
    await activate(volver)
    await page.waitForURL(/\/seller\/tickets$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Mis boletas' })).toBeVisible()
  })

  test('al navegar se limpia el titulo de la pantalla anterior', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await scrollPageHeaderOut(page)
    await expect(compactTitle(page)).toHaveText('Mis boletas')

    await page
      .locator('[data-tour="nav-sidebar"]')
      .getByRole('link', { name: 'Mis clientes' })
      .click()
    await page.waitForURL('**/seller/clients')

    await expect(compactState(page)).toHaveAttribute('data-compact-header', 'idle')
    await expect(compactTitle(page)).not.toHaveText('Mis boletas')
    await expect(page.getByRole('heading', { level: 1, name: 'Mis clientes' })).toBeVisible()
  })

  test('un titulo largo se trunca y no empuja el grupo derecho', async ({ page }) => {
    const nombre = unique(
      'Cliente con un nombre extraordinariamente largo para comprobar el recorte',
    )
    const cliente = await createClientFor(refs, nombre)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${cliente.id}`)
    await scrollPageHeaderOut(page)

    await expect(compactState(page)).toHaveAttribute('data-compact-header', 'active')
    const titleBox = await compactTitle(page).boundingBox()
    const menu = appHeader(page).getByRole('button', { name: /menú de usuario/i })
    const menuBox = await menu.boundingBox()
    expect(titleBox).not.toBeNull()
    expect(menuBox).not.toBeNull()
    expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(menuBox!.x + 1)
    await expectNoHorizontalOverflow(page)
    await expect(compactTitle(page)).toHaveAttribute('title', nombre)
  })

  test('sin permiso de crear no aparece un CTA compacto inventado', async ({ page }) => {
    await loginAs(page, ACCOUNTS.controlSeller)
    await page.goto('/seller/tickets')

    await expect(page.getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)
    await scrollPageHeaderOut(page)
    await expect(compactTitle(page)).toHaveText('Mis boletas')
    await expect(compactAction(page)).toHaveCount(0)
    await expect(appHeader(page).getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)
  })

  test('un cliente archivado no ofrece Registrar abono compacto', async ({ page }) => {
    const cliente = await createClientFor(refs, unique('Archivada compacta'))
    await serviceClient()
      .from('clients')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', cliente.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${cliente.id}`)

    await expect(page.getByRole('link', { name: /Registrar abono/ })).toHaveCount(0)
    await scrollPageHeaderOut(page)
    await expect(compactAction(page)).toHaveCount(0)
  })

  test('una boleta pendiente de aprobacion sube Aprobar y no Anular', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'pending_approval',
    })
    creadas.push(ticket.id)

    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets/${ticket.id}`)
    await scrollPageHeaderOut(page)

    await expect(compactAction(page).getByRole('button', { name: 'Aprobar boleta' })).toBeVisible()
    await expect(appHeader(page).getByRole('button', { name: 'Anular boleta' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Aprobar boleta' })).toHaveCount(1)
  })

  test('el teclado llega a la flecha y al CTA compactos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await page.getByRole('link', { name: 'Crear boletas' }).click()
    await page.waitForURL('**/seller/tickets/new')
    await scrollPageHeaderOut(page)

    const volver = appHeader(page).getByRole('button', { name: 'Volver' })
    await expect(volver).toBeVisible()
    await volver.focus()
    await expect(appHeader(page).getByRole('button', { name: 'Volver' })).toBeFocused()
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/seller\/tickets$/)

    await scrollPageHeaderOut(page)
    const cta = compactAction(page).getByRole('link', { name: 'Crear boletas' })
    await cta.focus()
    await expect(cta).toBeFocused()
    await page.keyboard.press('Enter')
    await page.waitForURL('**/seller/tickets/new')
  })

  test('prefers-reduced-motion anula la transicion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await scrollPageHeaderOut(page)

    await expectReducedMotion(page)
  })

  test('sin overflow ni salto de alto en 768, 1280, 1360 y 1600 px', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')

    for (const width of [768, 1280, 1360, 1600]) {
      await page.setViewportSize({ width, height: 900 })
      await scrollPageHeaderIn(page)
      await expectNoHorizontalOverflow(page)
      await expect(compactState(page)).toHaveAttribute('data-compact-header', 'idle')

      await scrollPageHeaderOut(page)
      await expectNoHorizontalOverflow(page)
      const headerBox = await appHeader(page).boundingBox()
      expect(headerBox?.height).toBeGreaterThanOrEqual(54)
      expect(headerBox?.height).toBeLessThanOrEqual(58)
    }
  })

  test('una boleta asignada con saldo sube Registrar abono', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const cliente = await createClientFor(refs, unique('Abono compacto'))
    const precio = await raffleTicketPrice(refs)
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: precio,
    })
    creadas.push(ticket.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${ticket.id}`)
    await scrollPageHeaderOut(page)

    await expect(
      compactAction(page).getByRole('link', { name: /Registrar un abono/ }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /Registrar un abono/ })).toHaveCount(1)
  })
})

test.afterAll(async () => {
  if (creadas.length === 0) return
  await serviceClient().from('tickets').delete().in('id', creadas)
})
