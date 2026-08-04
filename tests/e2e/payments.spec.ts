import { expect, test } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  ticketBalance,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Pruebas 1 a 13 de la Fase 5: registro de abonos, cuadre exacto, bloqueo de
 * sobrepago, anulacion administrativa y proteccion por rol
 * (BR-F02..BR-F13, BR-I11).
 */

const PRICE = 100_000

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/** Cliente nuevo con una boleta vendida sin abonos. */
async function clientWithDebt(label: string, salePrice = PRICE) {
  const client = await createClientFor(refs, unique(label))
  const numbers = randomTicketNumbers()
  const ticket = await createAssignedTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    clientId: client.id,
    salePrice,
  })
  return { client, ticket }
}

test.describe('Registro de abonos por el vendedor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('abono parcial: la boleta queda Abonada (prueba 1)', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Abonador')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('40000')

    // El reparto se sugiere solo y cuadra.
    await expect(page.getByText('El reparto cuadra con el valor del abono.')).toBeVisible()
    await page.getByRole('button', { name: 'Registrar abono' }).click()

    await expectToast(page, /Abono de \$40\.000 registrado/)
    await page.waitForURL(/\/seller\/payments/)

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(40_000)
    expect(balance.paymentStatus).toBe('partial')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText('Abonada').first()).toBeVisible()
  })

  test('completar el saldo: la boleta queda Pagada (prueba 2)', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Pagador')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill(String(PRICE))
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(PRICE)
    expect(balance.paymentStatus).toBe('paid')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText('Pagada').first()).toBeVisible()

    // Y ya no aparece entre los clientes con saldo pendiente.
    await page.goto('/seller/payments/new')
    await expect(page.getByRole('option', { name: new RegExp(client.name) })).toHaveCount(0)
  })

  test('el sobrepago se bloquea antes de enviar (prueba 3, BR-F12)', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Sobrepagador')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page
      .getByLabel(`Valor abonado a la boleta ${ticket.internalCode}`)
      .fill(String(PRICE + 50_000))

    await expect(page.getByText(/Supera el saldo pendiente/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar abono' })).toBeDisabled()

    expect((await ticketBalance(ticket.id)).paidAmount).toBe(0)
  })

  test('reparte un abono entre varias boletas (prueba 4)', async ({ page }) => {
    const client = await createClientFor(refs, unique('Cliente con dos boletas'))
    const first = randomTicketNumbers()
    const second = randomTicketNumbers()
    const ticketA = await createAssignedTicket(refs, {
      dailyNumber: first.daily,
      weeklyNumber: first.weekly,
      clientId: client.id,
      salePrice: PRICE,
    })
    const ticketB = await createAssignedTicket(refs, {
      dailyNumber: second.daily,
      weeklyNumber: second.weekly,
      clientId: client.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('150000')

    // El reparto automatico llena la primera y pasa el resto a la segunda.
    await expect(page.getByText('El reparto cuadra con el valor del abono.')).toBeVisible()
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    expect((await ticketBalance(ticketA.id)).paidAmount).toBe(100_000)
    expect((await ticketBalance(ticketB.id)).paidAmount).toBe(50_000)
  })

  test('una suma distinta al total no deja guardar (prueba 5, BR-F05)', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Descuadrado')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('50000')
    // Se rebaja lo repartido a mano: ahora falta dinero por asignar.
    await page.getByLabel(`Valor abonado a la boleta ${ticket.internalCode}`).fill('30000')

    await expect(page.getByText(/Faltan por repartir/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar abono' })).toBeDisabled()

    // Y al revés: repartir de mas tampoco pasa.
    await page.getByLabel(`Valor abonado a la boleta ${ticket.internalCode}`).fill('60000')
    await expect(page.getByText(/de mas/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar abono' })).toBeDisabled()

    expect((await ticketBalance(ticket.id)).paidAmount).toBe(0)
  })

  test('el formulario previsualiza como quedara cada boleta', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Previsualizador')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    const row = page.getByRole('row').filter({ hasText: ticket.internalCode })

    await expect(row.getByText('Sin pagar')).toBeVisible()

    await page.getByLabel('Valor del abono').fill('40000')
    await expect(row.getByText('Abonada')).toBeVisible()

    await page.getByLabel('Valor del abono').fill(String(PRICE))
    await expect(row.getByText('Pagada')).toBeVisible()

    // Nada se ha guardado todavia: es solo la vista previa.
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(0)
  })

  test('el abono aparece en el historial del cliente y de la boleta (BR-F13)', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Historico')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('25000')
    await page.getByLabel('Notas (opcional)').fill('Pago en efectivo en la tienda')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.goto(`/seller/clients/${client.id}`)
    await expect(page.getByRole('heading', { name: 'Historial de abonos' })).toBeVisible()
    await expect(page.getByText('$25.000').first()).toBeVisible()

    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText('Abonos de esta boleta')).toBeVisible()
    await expect(page.getByText('$25.000').first()).toBeVisible()
  })

  test('un vendedor no ve la accion de anular (prueba 9, BR-F10)', async ({ page }) => {
    const { client } = await clientWithDebt('Sin anulacion')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('10000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.goto('/seller/payments')
    await page
      .getByRole('button', { name: /Ver el pago de/ })
      .first()
      .click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Anular pago' })).toHaveCount(0)
  })

  test('un cliente sin deuda no admite abonos', async ({ page }) => {
    const client = await createClientFor(refs, unique('Sin deuda'))

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await expect(page.getByText(`${client.name} no tiene saldo pendiente`)).toBeVisible()
  })
})

test.describe('Anulacion de pagos por el personal', () => {
  test('el Admin anula con motivo y el saldo se recalcula (prueba 8)', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Anulable')

    // El abono lo registra el vendedor, por la interfaz.
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('60000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(60_000)

    // Y lo anula el administrador.
    await page.context().clearCookies()
    await loginAs(page, ACCOUNTS.admin)
    await page.goto(`/owner/payments?clientId=${client.id}`)
    await page
      .getByRole('button', { name: /Ver el pago de/ })
      .first()
      .click()

    await page.getByRole('button', { name: 'Anular pago' }).click()

    // Motivo demasiado corto: no avanza.
    await page.getByLabel('Motivo de la anulacion (obligatorio)').fill('ups')
    await page.getByRole('button', { name: 'Confirmar anulacion' }).click()
    await expect(page.getByText('Explica el motivo con al menos 5 caracteres.')).toBeVisible()

    await page
      .getByLabel('Motivo de la anulacion (obligatorio)')
      .fill('El cheque fue devuelto por el banco')
    await page.getByRole('button', { name: 'Confirmar anulacion' }).click()

    await expectToast(page, /Pago anulado/)

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(0)
    expect(balance.paymentStatus).toBe('unpaid')
  })

  test('el pago anulado sigue en el historial, marcado y con su motivo (BR-F09)', async ({
    page,
  }) => {
    const { client, ticket } = await clientWithDebt('Anulado visible')

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('30000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.context().clearCookies()
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/payments?clientId=${client.id}`)
    await page
      .getByRole('button', { name: /Ver el pago de/ })
      .first()
      .click()
    await page.getByRole('button', { name: 'Anular pago' }).click()
    await page
      .getByLabel('Motivo de la anulacion (obligatorio)')
      .fill('Se registro dos veces por error')
    await page.getByRole('button', { name: 'Confirmar anulacion' }).click()
    await expectToast(page, /Pago anulado/)

    // Sigue listado, marcado como anulado.
    await page.goto(`/owner/payments?clientId=${client.id}&status=voided`)
    await expect(page.getByText('Anulado').first()).toBeVisible()

    await page
      .getByRole('button', { name: /Ver el pago de/ })
      .first()
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Motivo: Se registro dos veces por error')).toBeVisible()
    // Quien anulo, dentro del dialogo: el nombre tambien sale en el menu de usuario.
    await expect(dialog.getByText(/Camila Restrepo/)).toBeVisible()

    // Y el vendedor tambien lo ve anulado en su historial.
    await page.context().clearCookies()
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText('Anulado').first()).toBeVisible()
  })

  test('una boleta con pagos activos no se puede anular (prueba 10, BR-I11)', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Boleta con pagos')

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('20000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.context().clearCookies()
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Anular boleta' }).click()
    await page.getByLabel('Motivo (obligatorio)').fill('Intento con pagos activos')
    await page.getByRole('button', { name: 'Anular', exact: true }).click()

    await expect(page.getByText(/La boleta tiene pagos activos/)).toBeVisible()
  })
})

test.describe('Consulta global de pagos', () => {
  test('el personal filtra por estado y limpia los filtros', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)

    await page.goto('/owner/payments?status=voided')
    await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toBeVisible()

    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(page).toHaveURL('/owner/payments')
  })

  test('muestra los totales de cobranza de la organizacion', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/payments')

    await expect(page.getByText('Total recaudado')).toBeVisible()
    await expect(page.getByText('Saldo pendiente')).toBeVisible()
  })

  // La visibilidad del pago registrado por un administrador (I-015) se prueba
  // en base de datos (`payments-phase5.test.ts`, F5-04): requiere una sesion de
  // owner llamando a `create_payment`, y el portal administrativo no tiene —por
  // alcance de esta fase— una pantalla para registrar abonos.
})

test.describe('Proteccion de rutas de pagos (prueba 13)', () => {
  test('un vendedor no entra a la consulta global', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/owner/payments')
    await expect(page).toHaveURL(/\/denied/)
  })

  test('un administrador no entra al portal de pagos del vendedor', async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin)
    for (const path of ['/seller/payments', '/seller/payments/new']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/denied/)
    }
  })

  test('sin sesion, los pagos redirigen al login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/owner/payments')
    await expect(page).toHaveURL(/\/login/)
  })
})
