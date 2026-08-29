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
 * El mismo flujo de D-133, en el viewport del telefono (Pixel 7).
 *
 * Escritorio vive en `payments.spec.ts`. Aqui se comprueba que la barra
 * inferior, el boton de 44 px y el gesto de atras no cambian el destino ni
 * dejan un ciclo formulario ↔ detalle.
 */

let PRICE: number
let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

test.describe('Abono desde una boleta en el telefono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('al guardar vuelve a la misma boleta con el saldo al dia', async ({ page }) => {
    const client = await createClientFor(refs, unique('Movil desde boleta'))
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: client.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: `Registrar un abono de ${client.name}` }).click()
    await page.waitForURL(new RegExp(`/seller/payments/new\\?.*ticketId=${ticket.id}`))

    await page.getByLabel('Valor del abono').fill('40000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /Abono de \$40\.000 registrado/)

    await page.waitForURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
    await expect(page.getByText('Abonada').first()).toBeVisible()
    await expect(page.getByText('$40.000').first()).toBeVisible()
    await expect(page.getByText(formatCOP(PRICE - 40_000), { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Abonos de esta boleta')).toBeVisible()

    expect((await ticketBalance(ticket.id)).paidAmount).toBe(40_000)

    await page.goBack()
    await expect(page).not.toHaveURL(/\/seller\/payments\/new/)
    await expect(page.getByRole('heading', { name: 'Registrar abono' })).toHaveCount(0)
  })

  test('editar el abono desde el historial actualiza el saldo', async ({ page }) => {
    const client = await createClientFor(refs, unique('Movil editar abono'))
    const numbers = randomTicketNumbers()
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: client.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: `Registrar un abono de ${client.name}` }).click()
    await page.getByLabel('Valor del abono').fill('40000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)
    await page.waitForURL(new RegExp(`/seller/tickets/${ticket.id}$`))

    await page.getByRole('button', { name: /Editar el abono de/ }).click()
    const dialogo = page.getByRole('dialog', { name: 'Editar abono' })
    await expect(dialogo).toBeVisible()
    await dialogo.getByLabel('Nuevo valor').fill('70000')
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, /Abono actualizado a \$70\.000/)

    await expect(page.getByText('$70.000').first()).toBeVisible()
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(70_000)
  })
})
