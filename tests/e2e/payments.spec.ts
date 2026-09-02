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
 * Pruebas 1 a 13 de la Fase 5: registro de abonos, cuadre exacto, bloqueo de
 * sobrepago, anulacion administrativa y proteccion por rol
 * (BR-F02..BR-F13, BR-I11).
 */

/**
 * Precio VIGENTE de la rifa del seed, leido de la base (D-098).
 *
 * Las boletas que crea esta suite viven en esa rifa y tienen que costar lo que
 * esa rifa cuesta hoy. Escribirlo a mano dejaba boletas de $100.000 dentro de
 * una rifa de $120.000 y volvia mentirosos los totales que se comprueban en
 * pantalla.
 */
let PRICE: number

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
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
  return { client, ticket, numbers }
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

  /**
   * El caso que motivó la corrección de precio (D-098), visto por el vendedor.
   *
   * Con el precio anterior, $100.000 dejaba la boleta Pagada. Con el precio
   * corregido es un abono al que le faltan $20.000, y la pantalla tiene que
   * decirlo: si alguna vez vuelve a aparecer «Pagada» aquí, es que alguien
   * comparó contra una cifra escrita en el código en vez de contra `sale_price`.
   */
  test('CASO CRITICO: $100.000 sobre una boleta de $120.000 se ve Abonada', async ({ page }) => {
    test.skip(PRICE <= 100_000, 'Solo tiene sentido con el precio corregido de $120.000.')

    const { client, ticket } = await clientWithDebt('Abonador de cien mil')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('100000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(100_000)
    expect(balance.paymentStatus).toBe('partial')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText('Abonada').first()).toBeVisible()
    await expect(page.getByText('Pagada')).toHaveCount(0)
    // El precio de la boleta y lo abonado, tal como los muestra el detalle.
    await expect(page.getByText(formatCOP(PRICE), { exact: true }).first()).toBeVisible()
    await expect(page.getByText('$100.000', { exact: true }).first()).toBeVisible()
    // Y sigue ofreciendo cobrar lo que falta.
    await expect(page.getByRole('link', { name: /Registrar un abono/ })).toBeVisible()
  })

  test('el sobrepago se bloquea antes de enviar (prueba 3, BR-F12)', async ({ page }) => {
    const { client, ticket, numbers } = await clientWithDebt('Sobrepagador')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page
      .getByLabel(`Valor abonado a la boleta ${numbers.daily} / ${numbers.weekly}`)
      .filter({ visible: true })
      .fill(String(PRICE + 50_000))

    await expect(
      page.getByText(/Supera el saldo pendiente/).filter({ visible: true }),
    ).toBeVisible()
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

    /*
      «La primera» es la primera de la TABLA, y la tabla se ordena por numero
      diario y semanal (BR-N11): antes se ordenaba por codigo interno, que era
      el orden de creacion, y por eso bastaba con dar por hecho que ticketA iba
      delante. Con numeros aleatorios ya no. Se calcula aqui el mismo orden que
      aplica la consulta, en vez de fijar numeros —que chocarian entre corridas,
      porque esta suite no borra sus boletas—.
    */
    const [primera, segunda] =
      `${first.daily}${first.weekly}` <= `${second.daily}${second.weekly}`
        ? [ticketA, ticketB]
        : [ticketB, ticketA]

    // El reparto llena la primera hasta su precio y pasa el resto a la segunda.
    expect((await ticketBalance(primera.id)).paidAmount).toBe(PRICE)
    expect((await ticketBalance(segunda.id)).paidAmount).toBe(150_000 - PRICE)
  })

  test('una suma distinta al total no deja guardar (prueba 5, BR-F05)', async ({ page }) => {
    const { client, ticket, numbers } = await clientWithDebt('Descuadrado')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('50000')
    // Se rebaja lo repartido a mano: ahora falta dinero por asignar.
    await page
      .getByLabel(`Valor abonado a la boleta ${numbers.daily} / ${numbers.weekly}`)
      .filter({ visible: true })
      .fill('30000')

    await expect(page.getByText(/Faltan por repartir/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar abono' })).toBeDisabled()

    // Y al revés: repartir de mas tampoco pasa.
    await page
      .getByLabel(`Valor abonado a la boleta ${numbers.daily} / ${numbers.weekly}`)
      .filter({ visible: true })
      .fill('60000')
    await expect(page.getByText(/de más/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar abono' })).toBeDisabled()

    expect((await ticketBalance(ticket.id)).paidAmount).toBe(0)
  })

  test('el formulario previsualiza como quedará cada boleta', async ({ page }) => {
    const { client, ticket, numbers } = await clientWithDebt('Previsualizador')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    const row = page.getByRole('row').filter({ hasText: numbers.daily })

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

  test('un vendedor no ve la acción de anular (prueba 9, BR-F10)', async ({ page }) => {
    const { client } = await clientWithDebt('Sin anulación')

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

/**
 * Abono abierto desde el detalle de UNA boleta (D-133, D-135).
 *
 * El formulario es el mismo; lo que cambia es el destino despues de guardar y
 * que el dinero se sugiere primero en esa boleta. Un error no saca de la
 * pantalla.
 */
test.describe('Abono abierto desde el detalle de una boleta', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('al guardar vuelve a ESA boleta con las cifras y el historial al dia', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Desde boleta')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: `Registrar un abono de ${client.name}` }).click()
    await page.waitForURL(new RegExp(`/seller/payments/new\\?.*ticketId=${ticket.id}`))

    await page.getByLabel('Valor del abono').fill('40000')
    await expect(page.getByText('El reparto cuadra con el valor del abono.')).toBeVisible()
    await page.getByRole('button', { name: 'Registrar abono' }).click()

    await expectToast(page, /Abono de \$40\.000 registrado/)
    await page.waitForURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()

    const detalle = page.locator('main')
    await expect(detalle.getByText('Abonada').first()).toBeVisible()
    await expect(detalle.getByText('$40.000').first()).toBeVisible()
    await expect(
      detalle.getByText(formatCOP(PRICE - 40_000), { exact: true }).first(),
    ).toBeVisible()
    await expect(detalle.getByText('Abonos de esta boleta')).toBeVisible()
    await expect(detalle.getByText('$40.000').nth(1)).toBeVisible()

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(40_000)
    expect(balance.pendingAmount).toBe(PRICE - 40_000)
    expect(balance.paymentStatus).toBe('partial')
  })

  test('el valor restante deja la boleta Pagada y vuelve a ella', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Saldo cero desde boleta')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: `Registrar un abono de ${client.name}` }).click()
    await page.getByLabel('Valor del abono').fill(String(PRICE))
    await page.getByRole('button', { name: 'Registrar abono' }).click()

    await expectToast(page, /registrado/)
    await page.waitForURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    await expect(page.getByText('Pagada').first()).toBeVisible()
    await expect(page.getByText('$0', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Registrar un abono/ })).toHaveCount(0)

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(PRICE)
    expect(balance.pendingAmount).toBe(0)
    expect(balance.paymentStatus).toBe('paid')
  })

  test('un error del servidor no saca del formulario', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Error desde boleta')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: `Registrar un abono de ${client.name}` }).click()
    await page.getByLabel('Valor del abono').fill('25000')
    await page.getByLabel('Notas (opcional)').fill('x'.repeat(501))
    await page.getByRole('button', { name: 'Registrar abono' }).click()

    await expect(page.getByText('Las notas no pueden superar 500 caracteres.')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/seller/payments/new\\?.*ticketId=${ticket.id}`))
    await expect(page.getByLabel('Valor del abono')).toHaveValue('$25.000')
    await expect(page.getByRole('button', { name: 'Registrar abono' })).toBeEnabled()

    expect((await ticketBalance(ticket.id)).paidAmount).toBe(0)

    await page.getByLabel('Notas (opcional)').fill('Corregido')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)
    await page.waitForURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(25_000)
  })

  test('al cancelar sin guardar vuelve a ESA boleta', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Cancelar desde boleta')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: `Registrar un abono de ${client.name}` }).click()
    await page.waitForURL(new RegExp(`/seller/payments/new\\?.*ticketId=${ticket.id}`))
    await page.getByLabel('Valor del abono').fill('10000')

    await page.getByRole('button', { name: 'Cancelar' }).click()
    await page.waitForURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(0)
  })

  test('tras recargar, la flecha de volver usa el origen y no Mis pagos', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Recarga desde boleta')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: `Registrar un abono de ${client.name}` }).click()
    await page.waitForURL(new RegExp(`/seller/payments/new\\?.*from=ticket`))

    await page.reload()
    await expect(page.getByRole('heading', { name: /Registrar abono/ })).toBeVisible()
    await page.getByRole('button', { name: 'Volver' }).click()

    await page.waitForURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Registrar abono' })).toHaveCount(0)
  })

  test('con varias boletas del mismo cliente, vuelve a la elegida y el abono cae ahi', async ({
    page,
  }) => {
    const client = await createClientFor(refs, unique('Varias boletas origen'))
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

    const [otra, origen] =
      `${first.daily}${first.weekly}` <= `${second.daily}${second.weekly}`
        ? [ticketA, ticketB]
        : [ticketB, ticketA]

    await page.goto(`/seller/tickets/${origen.id}`)
    await page.getByRole('link', { name: `Registrar un abono de ${client.name}` }).click()
    await page.waitForURL(new RegExp(`/seller/payments/new\\?.*ticketId=${origen.id}`))
    await expect(page.getByText('La que estabas viendo').filter({ visible: true })).toBeVisible()

    await page.getByLabel('Valor del abono').fill('40000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.waitForURL(new RegExp(`/seller/tickets/${origen.id}$`))
    await expect(page).not.toHaveURL(new RegExp(`/seller/tickets/${otra.id}`))
    await expect(page.getByText('$40.000').first()).toBeVisible()
    await expect(page.getByText('Abonada').first()).toBeVisible()

    expect((await ticketBalance(origen.id)).paidAmount).toBe(40_000)
    expect((await ticketBalance(otra.id)).paidAmount).toBe(0)
  })

  test('atras despues de guardar no regresa al formulario', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Sin ciclo atras')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: `Registrar un abono de ${client.name}` }).click()
    await page.getByLabel('Valor del abono').fill('10000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)
    await page.waitForURL(new RegExp(`/seller/tickets/${ticket.id}$`))

    await page.goBack()
    await expect(page).not.toHaveURL(/\/seller\/payments\/new/)
    await expect(page.getByRole('heading', { name: 'Registrar abono' })).toHaveCount(0)
  })
})

/**
 * El mismo formulario, con el origen informado (D-135): cliente, «Mis pagos»
 * o una URL sin contexto valido. La logica de dinero no cambia.
 */
test.describe('Abono abierto desde un cliente, pagos o sin origen', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('desde la ficha del cliente vuelve a ESE cliente con las cifras al dia', async ({
    page,
  }) => {
    const { client, ticket } = await clientWithDebt('Desde cliente')

    await page.goto(`/seller/clients/${client.id}`)
    await page
      .getByRole('link', { name: `Registrar abono de ${client.name}` })
      .first()
      .click()
    await page.waitForURL(new RegExp(`/seller/payments/new\\?from=client&clientId=${client.id}$`))
    await expect(page).not.toHaveURL(/ticketId=/)

    await page.getByLabel('Valor del abono').fill('15000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.waitForURL(new RegExp(`/seller/clients/${client.id}$`))
    await expect(page.getByRole('heading', { name: client.name })).toBeVisible()
    await expect(page.getByText('$15.000').first()).toBeVisible()
    await expect(page.getByText(formatCOP(PRICE - 15_000), { exact: true }).first()).toBeVisible()
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(15_000)

    await page.goBack()
    await expect(page).not.toHaveURL(/\/seller\/payments\/new/)
    await expect(page.getByRole('heading', { name: 'Registrar abono' })).toHaveCount(0)
  })

  test('al cancelar desde un cliente vuelve a ESE cliente', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Cancelar desde cliente')

    await page.goto(`/seller/clients/${client.id}`)
    await page
      .getByRole('link', { name: `Registrar abono de ${client.name}` })
      .first()
      .click()
    await page.getByLabel('Valor del abono').fill('8000')
    await page.getByRole('button', { name: 'Cancelar' }).click()

    await page.waitForURL(new RegExp(`/seller/clients/${client.id}$`))
    await expect(page.getByRole('heading', { name: client.name })).toBeVisible()
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(0)
  })

  test('desde Mis pagos vuelve a Mis pagos y el listado muestra el abono', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Desde pagos')

    await page.goto('/seller/payments')
    await page.getByRole('link', { name: 'Registrar abono' }).first().click()
    await page.waitForURL(/\/seller\/payments\/new\?from=payments/)

    const buscar = page.getByLabel('Buscar cliente')
    await buscar.fill(client.name)
    await buscar.press('Enter')
    const opcion = page.getByRole('option', { name: new RegExp(client.name) })
    await expect(opcion).toBeVisible()
    await opcion.click()
    await page.waitForURL(new RegExp(`/seller/payments/new\\?from=payments&clientId=${client.id}`))

    await page.getByLabel('Valor del abono').fill('12000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.waitForURL(/\/seller\/payments$/)
    await expect(page.getByRole('heading', { name: 'Mis pagos' })).toBeVisible()
    await expect(page.getByText('$12.000').first()).toBeVisible()
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(12_000)

    await page.goBack()
    await expect(page).not.toHaveURL(/\/seller\/payments\/new/)
  })

  test('al cancelar desde Mis pagos vuelve a Mis pagos', async ({ page }) => {
    const { client } = await clientWithDebt('Cancelar desde pagos')

    await page.goto('/seller/payments')
    await page.getByRole('link', { name: 'Registrar abono' }).first().click()
    const buscar = page.getByLabel('Buscar cliente')
    await buscar.fill(client.name)
    await buscar.press('Enter')
    const opcion = page.getByRole('option', { name: new RegExp(client.name) })
    await expect(opcion).toBeVisible()
    await opcion.click()
    await page.getByRole('button', { name: 'Cancelar' }).click()

    await page.waitForURL(/\/seller\/payments$/)
    await expect(page.getByRole('heading', { name: 'Mis pagos' })).toBeVisible()
  })

  test('sin origen valido el destino seguro es Mis pagos', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Sin origen')

    await page.goto(`/seller/payments/new?clientId=${client.id}&from=https://evil.example`)
    await page.getByLabel('Valor del abono').fill('9000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.waitForURL(/\/seller\/payments$/)
    await expect(page).not.toHaveURL(/evil/)
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(9_000)
  })

  test('un segundo clic no duplica el abono', async ({ page }) => {
    const { client, ticket } = await clientWithDebt('Doble clic')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('11000')
    const save = page.getByRole('button', { name: 'Registrar abono' })
    await save.click()
    // El boton se deshabilita al instante y, si el guardado es rapido, la
    // pagina ya no esta: un segundo clic no debe crear otro abono.
    await save.click({ timeout: 500 }).catch(() => undefined)
    await expectToast(page, /registrado/)
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(11_000)
  })
})

test.describe('Anulación de pagos por el personal', () => {
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
    await page.getByLabel('Motivo de la anulación (obligatorio)').fill('ups')
    await page.getByRole('button', { name: 'Confirmar anulación' }).click()
    await expect(page.getByText('Explica el motivo con al menos 5 caracteres.')).toBeVisible()

    await page
      .getByLabel('Motivo de la anulación (obligatorio)')
      .fill('El cheque fue devuelto por el banco')
    await page.getByRole('button', { name: 'Confirmar anulación' }).click()

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
      .getByLabel('Motivo de la anulación (obligatorio)')
      .fill('Se registro dos veces por error')
    await page.getByRole('button', { name: 'Confirmar anulación' }).click()
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

test.describe('Edición de un abono (BR-F16, D-134)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('aumentar el abono desde la boleta actualiza saldo y estado sin recargar a mano', async ({
    page,
  }) => {
    const { client, ticket } = await clientWithDebt('Editar al alza')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('40000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: /Editar el abono de/ }).click()

    const dialogo = page.getByRole('dialog', { name: 'Editar abono' })
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByText('$40.000')).toBeVisible()

    await dialogo.getByLabel('Nuevo valor').fill('80000')
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, /Abono actualizado a \$80\.000/)
    await expect(dialogo).toHaveCount(0)

    await expect(page.getByText('Abonada').first()).toBeVisible()
    await expect(page.getByText('$80.000').first()).toBeVisible()
    await expect(page.getByText(formatCOP(PRICE - 80_000), { exact: true }).first()).toBeVisible()

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(80_000)
    expect(balance.paymentStatus).toBe('partial')
  })

  test('completar el precio deja la boleta Pagada; bajarlo la deja Abonada otra vez', async ({
    page,
  }) => {
    const { ticket } = await clientWithDebt('Editar a pagada')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: /Registrar un abono de/ }).click()
    await page.getByLabel('Valor del abono').fill('50000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.getByRole('button', { name: /Editar el abono de/ }).click()
    const dialogo = page.getByRole('dialog', { name: 'Editar abono' })
    await dialogo.getByLabel('Nuevo valor').fill(String(PRICE))
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, /actualizado/)

    await expect(page.getByText('Pagada').first()).toBeVisible()
    await expect(page.getByText('$0', { exact: true }).first()).toBeVisible()
    expect((await ticketBalance(ticket.id)).paymentStatus).toBe('paid')

    await page.getByRole('button', { name: /Editar el abono de/ }).click()
    await page.getByRole('dialog', { name: 'Editar abono' }).getByLabel('Nuevo valor').fill('10000')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, /actualizado/)

    await expect(page.getByText('Abonada').first()).toBeVisible()
    expect((await ticketBalance(ticket.id)).paidAmount).toBe(10_000)
    expect((await ticketBalance(ticket.id)).paymentStatus).toBe('partial')
  })

  test('un valor que supera el precio se rechaza y el formulario se queda abierto', async ({
    page,
  }) => {
    const { ticket } = await clientWithDebt('Editar sobrepago')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: /Registrar un abono de/ }).click()
    await page.getByLabel('Valor del abono').fill('30000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.getByRole('button', { name: /Editar el abono de/ }).click()
    const dialogo = page.getByRole('dialog', { name: 'Editar abono' })
    await dialogo.getByLabel('Nuevo valor').fill(String(PRICE + 1))
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(dialogo.getByText(/supera el saldo pendiente/)).toBeVisible()
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByLabel('Nuevo valor')).toHaveValue(formatCOP(PRICE + 1))
    await expect(dialogo.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()

    expect((await ticketBalance(ticket.id)).paidAmount).toBe(30_000)
  })

  test('corregir a $0 deja la boleta Sin pagar y el abono sigue en el historial (D-158)', async ({
    page,
  }) => {
    const { client, ticket } = await clientWithDebt('Editar a cero')

    await page.goto(`/seller/payments/new?clientId=${client.id}`)
    await page.getByLabel('Valor del abono').fill('40000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText('Abonada').first()).toBeVisible()

    await page.getByRole('button', { name: /Editar el abono de/ }).click()
    const dialogo = page.getByRole('dialog', { name: 'Editar abono' })
    await expect(dialogo.getByText(/Con \$0 el abono deja de contar/)).toBeVisible()

    await dialogo.getByLabel('Nuevo valor').fill('0')
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, /Abono actualizado a \$0/)
    await expect(dialogo).toHaveCount(0)

    // La boleta vuelve a deber el precio entero...
    await expect(page.getByText('Sin pagar').first()).toBeVisible()
    await expect(page.getByText(formatCOP(PRICE), { exact: true }).first()).toBeVisible()

    // ...y el abono sigue ahi, en $0, listo para volver a subirlo.
    await expect(page.getByRole('button', { name: /Editar el abono de \$0/ })).toBeVisible()

    const balance = await ticketBalance(ticket.id)
    expect(balance.paidAmount).toBe(0)
    expect(balance.paymentStatus).toBe('unpaid')
  })

  test('Cancelar no cambia el abono', async ({ page }) => {
    const { ticket } = await clientWithDebt('Cancelar edicion')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('link', { name: /Registrar un abono de/ }).click()
    await page.getByLabel('Valor del abono').fill('20000')
    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    await page.getByRole('button', { name: /Editar el abono de/ }).click()
    const dialogo = page.getByRole('dialog', { name: 'Editar abono' })
    await dialogo.getByLabel('Nuevo valor').fill('90000')
    await dialogo.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialogo).toHaveCount(0)

    expect((await ticketBalance(ticket.id)).paidAmount).toBe(20_000)
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

  test('muestra los totales de cobranza de la organización', async ({ page }) => {
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

  test('sin sesión, los pagos redirigen al login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/owner/payments')
    await expect(page).toHaveURL(/\/login/)
  })
})
