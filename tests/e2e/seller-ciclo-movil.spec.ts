import { expect, test } from '@playwright/test'

import {
  createTicket,
  loadSeedRefs,
  raffleTicketPrice,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Criterio de finalizacion de la Fase 4 y prueba 14 (responsive movil):
 * «un vendedor completa el ciclo desde un telefono: buscar boleta → crear
 * cliente → asignar».
 *
 * Se ejecuta solo en el proyecto `movil` (Pixel 7) de playwright.config.ts.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test('ciclo completo del vendedor desde el teléfono', async ({ page }) => {
  const numbers = randomTicketNumbers()
  const ticket = await createTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    inventoryStatus: 'available',
  })
  const price = await raffleTicketPrice(refs)
  const clientName = unique('Vecina')

  await loginAs(page, ACCOUNTS.seller)

  // 1. Desde el panel, la accion principal esta al alcance del pulgar.
  await page.getByRole('link', { name: /Vender una boleta/ }).click()
  await page.waitForURL(/\/seller\/tickets/)

  // 2. Buscar la boleta por su numero.
  await page.getByPlaceholder('Número diario o semanal').fill(numbers.daily)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page
    .getByRole('link', { name: `Ver la boleta ${numbers.daily} / ${numbers.weekly}` })
    .click()
  await page.waitForURL(/\/seller\/tickets\/[0-9a-f-]+$/)

  // 3. Crear el cliente y asignar, sin salir del flujo.
  await page.getByRole('button', { name: 'Asignar a un cliente' }).click()
  await page.getByRole('tab', { name: 'Cliente nuevo' }).click()
  await page.getByLabel('Nombre').fill(clientName)
  await page.getByLabel('Teléfono').fill('3001112222')
  await page.getByRole('button', { name: 'Crear cliente y asignar' }).click()

  await expectToast(page, new RegExp(`${clientName} registrado y boleta asignada`))
  await expect(page.getByText('Asignada').first()).toBeVisible()

  // 4. El precio quedo congelado y la venta aparece en el panel.
  const { data: stored } = await serviceClient()
    .from('tickets')
    .select('sale_price, inventory_status')
    .eq('id', ticket.id)
    .single()
  expect(stored!.sale_price).toBe(price)
  expect(stored!.inventory_status).toBe('assigned')

  await page.goto('/seller/dashboard')
  await expect(page.getByRole('heading', { name: 'Ventas recientes' })).toBeVisible()
  await expect(page.getByText(clientName).first()).toBeVisible()
})

test.describe('Portal del vendedor en movil (prueba 14)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('la navegacion se abre desde el drawer', async ({ page }) => {
    await page.goto('/seller/dashboard')

    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Mis boletas' }),
    ).toBeHidden()

    await page
      .getByRole('button', { name: /menu|abrir/i })
      .first()
      .click()

    const drawerLink = page.getByRole('link', { name: 'Mis clientes' })
    await expect(drawerLink).toBeVisible()
    await drawerLink.click()

    await page.waitForURL(/\/seller\/clients/)
    await expect(page.getByRole('heading', { name: 'Mis clientes' })).toBeVisible()
  })

  test('ninguna pantalla desborda horizontalmente', async ({ page }) => {
    for (const path of [
      '/seller/dashboard',
      '/seller/tickets',
      '/seller/tickets/new',
      '/seller/clients',
      '/seller/clients/new',
    ]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `desbordamiento horizontal en ${path}`).toBeLessThanOrEqual(2)
    }
  })

  test('el dialogo de asignación cabe en la pantalla y es usable', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const box = await dialog.boundingBox()
    const viewport = page.viewportSize()
    expect(box!.width).toBeLessThanOrEqual(viewport!.width)

    // Las dos formas de elegir cliente estan disponibles sin hacer zoom.
    await expect(page.getByRole('tab', { name: 'Cliente existente' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Cliente nuevo' })).toBeVisible()
  })

  test('los campos numericos abren el teclado numerico', async ({ page }) => {
    await page.goto('/seller/tickets/new')
    await page.getByLabel(/Cuantas/).fill('1')
    await page.getByRole('button', { name: 'Generar' }).click()

    await expect(page.getByLabel('Número diario de la fila 1', { exact: true })).toHaveAttribute(
      'inputmode',
      'numeric',
    )
    await page.goto('/seller/clients/new')
    await expect(page.getByLabel('Teléfono')).toHaveAttribute('inputmode', 'tel')
  })
})
