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
  expectTouchTarget,
  hideNextDevUi,
  orgNameInHeader,
  scrollPageHeaderIn,
  scrollPageHeaderOut,
} from './cabecera-helpers'

/**
 * Cabecera contextual en el telefono (D-150).
 *
 * El nombre de la organizacion cede el sitio al titulo de la pantalla. La
 * accion principal pasa junto al avatar, en 44 px, y a 320 px no puede haber
 * scroll horizontal.
 */

let refs: SeedRefs
const creadas: string[] = []

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.beforeEach(async ({ page }) => {
  await hideNextDevUi(page)
})

test.afterAll(async () => {
  if (creadas.length === 0) return
  await serviceClient().from('tickets').delete().in('id', creadas)
})

test.describe('Cabecera contextual en el teléfono', () => {
  test('el nombre de la organización se reemplaza por el título al bajar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')

    await expect(orgNameInHeader(page)).toHaveCSS('opacity', '1')
    await expect(orgNameInHeader(page)).toHaveText('Rifas Demo')
    await expect(compactState(page)).toHaveAttribute('data-compact-header', 'idle')
    await expect(page.getByRole('heading', { level: 1, name: 'Mis boletas' })).toBeVisible()
    await expect(appHeader(page).getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)

    await scrollPageHeaderOut(page)

    await expect(orgNameInHeader(page)).toHaveCSS('opacity', '0')
    await expect(compactTitle(page)).toHaveText('Mis boletas')
    await expect(compactAction(page).getByRole('link', { name: 'Crear boletas' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

    await scrollPageHeaderIn(page)
    await expect(orgNameInHeader(page)).toHaveCSS('opacity', '1')
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toBeVisible()
  })

  test('la acción compacta mide 44 px y no esconde avisos ni el menú', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients')
    await scrollPageHeaderOut(page)

    const cta = compactAction(page).getByRole('link', { name: 'Nuevo cliente' })
    await expect(cta).toBeVisible()
    await expectTouchTarget(cta)
    await expect(appHeader(page).getByRole('button', { name: /menú de usuario/i })).toBeVisible()
  })

  test('la flecha compacta mide 44 px y vuelve', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await page.getByRole('link', { name: 'Crear boletas' }).tap()
    await page.waitForURL('**/seller/tickets/new')
    await scrollPageHeaderOut(page)

    const volver = appHeader(page).getByRole('button', { name: 'Volver' })
    await expect(volver).toBeVisible()
    await expectTouchTarget(volver)
    await expect(page.getByRole('button', { name: 'Volver' })).toHaveCount(1)
    await activate(volver)
    await page.waitForURL(/\/seller\/tickets$/)
  })

  test('a 320 px no hay scroll horizontal ni salto de línea en la cabecera', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await expectNoHorizontalOverflow(page)

    const idleBox = await appHeader(page).boundingBox()
    expect(idleBox?.height).toBeGreaterThanOrEqual(54)
    expect(idleBox?.height).toBeLessThanOrEqual(58)

    await scrollPageHeaderOut(page)
    await expectNoHorizontalOverflow(page)
    const compactBox = await appHeader(page).boundingBox()
    expect(compactBox?.height).toBeGreaterThanOrEqual(54)
    expect(compactBox?.height).toBeLessThanOrEqual(58)
    await expect(compactTitle(page)).toHaveText('Mis boletas')
  })

  test('a 390 px el cruce funciona en las dos direcciones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/payments')

    await expect(compactState(page)).toHaveAttribute('data-compact-header', 'idle')
    await scrollPageHeaderOut(page)
    await expect(compactTitle(page)).toHaveText('Mis pagos')
    await expect(compactAction(page).getByRole('link', { name: 'Registrar abono' })).toBeVisible()
    await scrollPageHeaderIn(page)
    await expect(compactState(page)).toHaveAttribute('data-compact-header', 'idle')
    await expect(orgNameInHeader(page)).toHaveCSS('opacity', '1')
  })

  test('un título largo se recorta y conserva el nombre completo', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    const nombre = unique('María de los Ángeles Fernández de la Torre y Compañía')
    const cliente = await createClientFor(refs, nombre)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${cliente.id}`)
    await scrollPageHeaderOut(page)

    await expect(compactState(page)).toHaveAttribute('data-compact-header', 'active')
    await expect(compactTitle(page)).toHaveAttribute('title', nombre)
    await expectNoHorizontalOverflow(page)
  })

  test('al navegar se limpia el título anterior', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await scrollPageHeaderOut(page)
    await expect(compactTitle(page)).toHaveText('Mis boletas')

    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Clientes' })
      .tap()
    await page.waitForURL('**/seller/clients')

    await expect(compactState(page)).toHaveAttribute('data-compact-header', 'idle')
    await expect(compactTitle(page)).not.toHaveText('Mis boletas')
    await expect(orgNameInHeader(page)).toHaveCSS('opacity', '1')
  })

  test('sin permiso de crear no aparece Crear boletas', async ({ page }) => {
    await loginAs(page, ACCOUNTS.controlSeller)
    await page.goto('/seller/tickets')
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)
    await scrollPageHeaderOut(page)
    await expect(compactAction(page)).toHaveCount(0)
  })

  test('una boleta sin saldo no ofrece Registrar abono', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })
    creadas.push(ticket.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByRole('link', { name: /Registrar abono/ })).toHaveCount(0)
    await scrollPageHeaderOut(page)
    await expect(compactAction(page)).toHaveCount(0)
    await expect(compactTitle(page)).toHaveText('Detalle boleta')
    await expect(appHeader(page).getByRole('button', { name: 'Volver' })).toBeVisible()
  })

  test('prefers-reduced-motion anula la transicion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await scrollPageHeaderOut(page)

    await expectReducedMotion(page)
  })

  test('una boleta con saldo sube Registrar abono junto al avatar', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const cliente = await createClientFor(refs, unique('Abono movil compacto'))
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

    const cta = compactAction(page).getByRole('link', { name: /Registrar un abono/ })
    await expect(cta).toBeVisible()
    await expectTouchTarget(cta)
    const menu = appHeader(page).getByRole('button', { name: /menú de usuario/i })
    const ctaBox = await cta.boundingBox()
    const menuBox = await menu.boundingBox()
    expect(ctaBox).not.toBeNull()
    expect(menuBox).not.toBeNull()
    expect(ctaBox!.x).toBeLessThan(menuBox!.x)
  })
})
