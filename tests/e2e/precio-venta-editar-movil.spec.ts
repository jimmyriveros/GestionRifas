import { expect, test } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  raffleTicketPrice,
  ticketBalance,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'
import { formatCOP } from '../../src/lib/money'

/**
 * El mismo flujo de D-137, en el viewport del telefono (Pixel 7).
 *
 * Escritorio vive en `precio-venta-editar.spec.ts`. Aqui se comprueba que el
 * icono mide 44 px y que el dialogo cabe sin recargar la aplicacion.
 */

let PRICE: number
let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

test.describe('Editar precio de venta en el telefono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('el icono mide 44 px y al guardar actualiza el detalle', async ({ page }) => {
    const client = await createClientFor(refs, unique('Movil editar precio'))
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: client.id,
      salePrice: PRICE,
    })
    const rebajado = PRICE - 20_000

    await page.goto(`/seller/tickets/${ticket.id}`)
    const icono = page.getByRole('button', { name: 'Editar precio de venta' })
    const box = await icono.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)

    await icono.click()
    const dialogo = page.getByRole('dialog', { name: 'Editar precio de venta' })
    await dialogo.getByLabel('Nuevo precio').fill(String(rebajado))
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()

    await expectToast(page, `Precio de venta actualizado a ${formatCOP(rebajado)}.`)
    await expect(page).toHaveURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
    await expect(page.getByText(formatCOP(rebajado)).first()).toBeVisible()

    expect((await ticketBalance(ticket.id)).pendingAmount).toBe(rebajado)
  })
})
