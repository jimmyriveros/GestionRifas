import { expect, test } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  raffleTicketPrice,
  signedInClient,
  ticketBalance,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'
import { formatCOP } from '../../src/lib/money'

/**
 * Editar el precio de venta de una boleta ya asignada (BR-P13, D-137).
 *
 * Lo que se comprueba aqui es el RECORRIDO: el icono junto al precio, el
 * dialogo, que un valor invalido no cierra el formulario y que al guardar
 * cambian precio, saldo y estado sin salir del detalle. Las reglas de dinero
 * viven en SQL y las prueba `tests/db/sale-price-update.test.ts`.
 */

let refs: SeedRefs
let PRICE: number

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

test.describe('Editar precio de venta', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('rebaja el precio de una boleta asignada sin abonos', async ({ page }) => {
    const client = await createClientFor(refs, unique('Editar precio libre'))
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: client.id,
      salePrice: PRICE,
    })
    const rebajado = PRICE - 20_000

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Editar precio de venta' }).click()

    const dialogo = page.getByRole('dialog', { name: 'Editar precio de venta' })
    await expect(dialogo.getByText(formatCOP(PRICE), { exact: true }).first()).toBeVisible()

    await dialogo.getByLabel('Nuevo precio').fill(String(rebajado))
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()

    await expectToast(page, `Precio de venta actualizado a ${formatCOP(rebajado)}.`)
    await expect(page).toHaveURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    await expect(page.getByText(formatCOP(rebajado)).first()).toBeVisible()
    await expect(page.getByText(/rebaja de/)).toBeVisible()

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(0)
    expect(balance.pendingAmount).toBe(rebajado)
    expect(balance.paymentStatus).toBe('unpaid')
  })

  test('al cancelar no cambia el precio', async ({ page }) => {
    const client = await createClientFor(refs, unique('Editar precio cancelar'))
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: client.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Editar precio de venta' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Editar precio de venta' })
    await dialogo.getByLabel('Nuevo precio').fill(String(PRICE - 20_000))
    await dialogo.getByRole('button', { name: 'Cancelar' }).click()

    await expect(dialogo).toHaveCount(0)
    await expect(page.getByText(formatCOP(PRICE)).first()).toBeVisible()
    expect((await ticketBalance(ticket.id)).pendingAmount).toBe(PRICE)
  })

  test('un precio menor que lo abonado no cierra el dialogo y no escribe', async ({ page }) => {
    const client = await createClientFor(refs, unique('Editar precio abonado'))
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: client.id,
      salePrice: PRICE,
    })

    const seller = await signedInClient(ACCOUNTS.seller)
    const { error: payError } = await seller.rpc('create_payment', {
      p_client_id: client.id,
      p_total_amount: 100_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 100_000 }],
    })
    expect(payError).toBeNull()

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Editar precio de venta' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Editar precio de venta' })
    await dialogo.getByLabel('Nuevo precio').fill('80000')
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(dialogo.getByText(/menor que el total abonado/)).toBeVisible()
    await expect(dialogo.getByLabel('Nuevo precio')).toHaveValue(formatCOP(80_000))

    const balance = await ticketBalance(ticket.id)
    expect(balance.pendingAmount).toBe(PRICE - 100_000)
    expect(balance.paidAmount).toBe(100_000)
  })

  test('bajar el precio hasta lo abonado deja la boleta Pagada', async ({ page }) => {
    const client = await createClientFor(refs, unique('Editar precio pagada'))
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: client.id,
      salePrice: PRICE,
    })
    const abono = PRICE - 20_000

    const seller = await signedInClient(ACCOUNTS.seller)
    const { error: payError } = await seller.rpc('create_payment', {
      p_client_id: client.id,
      p_total_amount: abono,
      p_allocations: [{ ticket_id: ticket.id, amount: abono }],
    })
    expect(payError).toBeNull()

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Editar precio de venta' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Editar precio de venta' })
    await dialogo.getByLabel('Nuevo precio').fill(String(abono))
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()

    await expectToast(page, `Precio de venta actualizado a ${formatCOP(abono)}.`)
    await expect(page.getByText('Pagada').first()).toBeVisible()

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(abono)
    expect(balance.pendingAmount).toBe(0)
    expect(balance.paymentStatus).toBe('paid')
  })
})
