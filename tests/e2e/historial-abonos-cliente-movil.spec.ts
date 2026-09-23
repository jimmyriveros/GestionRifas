import { expect, test, type Page } from '@playwright/test'

import {
  createClientFor,
  createPaymentsInBulk,
  loadSeedRefs,
  purgeTestRaffles,
  serviceClient,
} from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * EL HISTORIAL DE ABONOS PAGINADO, EN EL TELEFONO Y CON EL TECLADO (I-156, D-219).
 *
 * Dos defectos medidos al inspeccionarlo, y que estas pruebas fijan:
 *
 *   * cambiar de pagina devolvia la vista arriba del todo —de 2.231 px a 0 en
 *     un telefono—, con el historial al pie de la ficha;
 *   * el boton pulsado se deshabilitaba mientras navegaba y soltaba el foco:
 *     con el teclado no se podia pulsar «Siguiente» dos veces seguidas.
 */

const TOTAL = 60

test.describe('Historial de abonos en el telefono', () => {
  const STAMP = Date.now().toString(36).slice(-5)
  let raffleId = ''
  let clientId = ''

  test.beforeAll(async () => {
    const svc = serviceClient()
    const refs = await loadSeedRefs()
    clientId = (await createClientFor(refs, `Historial Movil ${STAMP}`)).id
    const { data: raffle, error } = await svc
      .from('raffles')
      .insert({
        organization_id: refs.organizationId,
        name: `Rifa historial movil ${STAMP}`,
        ticket_price: 200_000,
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: refs.ownerId,
      })
      .select('id')
      .single()
    if (error) throw error
    raffleId = raffle.id
    const { data: ticket, error: ticketError } = await svc
      .from('tickets')
      .insert({
        organization_id: refs.organizationId,
        raffle_id: raffleId,
        seller_id: refs.sellerId,
        created_by: refs.ownerId,
        client_id: clientId,
        daily_number: '6621',
        weekly_number: '6622',
        inventory_status: 'assigned',
        sale_price: 200_000,
        sale_date: '2026-09-01',
        assigned_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (ticketError) throw ticketError
    const amounts = Array.from({ length: TOTAL }, (_, i) => 1_000 + i)
    await createPaymentsInBulk(refs, {
      clientId,
      ticketId: ticket.id,
      amounts,
      dates: amounts.map((_, i) => `2026-09-0${(i % 9) + 1}`),
    })
  })

  test.afterAll(async () => {
    await purgeTestRaffles({ raffleIds: [raffleId], clientIds: [clientId] })
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  const titulo = (page: Page) => page.getByRole('heading', { name: 'Historial de abonos' })

  test('pasar de pagina no devuelve arriba: el titulo del historial queda a la vista', async ({
    page,
  }) => {
    await page.goto(`/seller/clients/${clientId}`)
    const siguiente = page.getByRole('button', { name: 'Siguiente' })
    await siguiente.scrollIntoViewIfNeeded()
    await siguiente.click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText(`26–50 de ${TOTAL} abonos`)).toBeVisible()

    // Ni arriba del todo —donde no se ve el historial— ni con el titulo tapado
    // por el encabezado fijo.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await expect(titulo(page)).toBeInViewport()
    const caja = await titulo(page).boundingBox()
    expect(caja!.y).toBeGreaterThanOrEqual(56)
  })

  test('con el teclado se recorren todas las paginas y el foco no se pierde', async ({ page }) => {
    await page.goto(`/seller/clients/${clientId}`)
    const siguiente = page.getByRole('button', { name: 'Siguiente' })
    const anterior = page.getByRole('button', { name: 'Anterior' })

    await siguiente.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/page=2/)
    await expect(siguiente).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/page=3/)
    // En la ultima «Siguiente» se deshabilita, y el foco pasa a «Anterior» en
    // vez de caer en `body`.
    await expect(siguiente).toBeDisabled()
    await expect(anterior).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/page=2/)
    await expect(anterior).toBeFocused()
  })

  test('a 320 px la barra cabe, mide 44 px y la pagina no se desborda', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(`/seller/clients/${clientId}?page=2`)

    for (const nombre of ['Anterior', 'Siguiente']) {
      const boton = page.getByRole('button', { name: nombre })
      await boton.scrollIntoViewIfNeeded()
      const caja = await boton.boundingBox()
      expect(caja!.height).toBeGreaterThanOrEqual(44)
      expect(caja!.x).toBeGreaterThanOrEqual(0)
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(320)
    }
    await expect(page.getByText(`26–50 de ${TOTAL} abonos`)).toBeVisible()

    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desbordamiento).toBeLessThanOrEqual(0)
  })

  test('fuera de rango, el boton de volver mide 44 px y lleva a la pagina 1', async ({ page }) => {
    await page.goto(`/seller/clients/${clientId}?page=9`)
    const volver = page.getByRole('link', { name: 'Ir a la primera página' })
    const caja = await volver.boundingBox()
    expect(caja!.height).toBeGreaterThanOrEqual(44)
    await volver.click()
    await expect(page).not.toHaveURL(/page=/)
    await expect(page.getByText(`1–25 de ${TOTAL} abonos`)).toBeVisible()
  })
})
