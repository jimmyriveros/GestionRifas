import { expect, test } from '@playwright/test'

import {
  createClientFor,
  createTicket,
  findOtherSellerResources,
  loadSeedRefs,
  raffleTicketPrice,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Pruebas 5 a 13 de la Fase 4: asignacion de boletas, creacion por el vendedor,
 * bloqueos y aislamiento (BR-I03, BR-I07, BR-I08, BR-P03, BR-R10, BR-U07).
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/** Deja una boleta disponible del vendedor 1 y devuelve su id y codigo. */
async function availableTicket() {
  const numbers = randomTicketNumbers()
  return createTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    inventoryStatus: 'available',
  })
}

test.describe('Asignación de boletas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('asigna una boleta a un cliente existente y copia el precio (pruebas 5 y 11)', async ({
    page,
  }) => {
    const ticket = await availableTicket()
    const client = await createClientFor(refs, unique('Comprador'))
    const price = await raffleTicketPrice(refs)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    await page.getByLabel('Buscar').fill(client.name)
    await page.getByRole('option', { name: new RegExp(client.name) }).click()
    await page.getByRole('button', { name: 'Asignar boleta' }).click()

    await expectToast(page, 'Boleta asignada.')
    await expect(page.getByText('Asignada').first()).toBeVisible()
    // Desde D-101 el cliente es una fila pulsable cuyo nombre accesible empieza
    // por su rotulo: «Cliente <nombre> <telefono>». El ancla en «Cliente» la
    // distingue del otro enlace que lleva el mismo nombre desde la Fase 5,
    // «Registrar un abono de <cliente>».
    await expect(
      page.getByRole('link', { name: new RegExp(`^Cliente\\s+${client.name}`) }),
    ).toBeVisible()

    // BR-P03: el precio de venta es el precio VIGENTE de la rifa.
    const { data: stored } = await serviceClient()
      .from('tickets')
      .select('sale_price, sale_date, client_id')
      .eq('id', ticket.id)
      .single()
    expect(stored!.sale_price).toBe(price)
    expect(stored!.sale_date).not.toBeNull()
    expect(stored!.client_id).toBe(client.id)
  })

  test('crea el cliente dentro del flujo de asignación (prueba 6)', async ({ page }) => {
    const ticket = await availableTicket()
    const name = unique('Cliente al vuelo')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    await page.getByRole('tab', { name: 'Cliente nuevo' }).click()
    await page.getByLabel('Nombre').fill(name)
    await page.getByLabel('Teléfono').fill('3007654321')
    await page.getByRole('button', { name: 'Crear cliente y asignar' }).click()

    await expectToast(page, new RegExp(`${name} registrado y boleta asignada`))
    await expect(page.getByText('Asignada').first()).toBeVisible()

    // Y el cliente queda en su cartera para reutilizarlo (BR-C04).
    await page.goto('/seller/clients')
    await page.getByPlaceholder('Nombre, alias, teléfono o correo').fill(name)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await expect(page.getByRole('link', { name })).toBeVisible()
  })

  test('una boleta ya asignada no vuelve a ofrecer la asignación (BR-I08)', async ({ page }) => {
    const ticket = await availableTicket()
    const client = await createClientFor(refs, unique('Comprador único'))

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()
    await page.getByRole('option', { name: new RegExp(client.name) }).click()
    await page.getByRole('button', { name: 'Asignar boleta' }).click()
    await expectToast(page, 'Boleta asignada.')

    await page.reload()
    await expect(page.getByRole('button', { name: 'Asignar a un cliente' })).toHaveCount(0)
  })

  test('una boleta pendiente de aprobación no se puede asignar y lo explica (prueba 10)', async ({
    page,
  }) => {
    const numbers = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'pending_approval',
    })

    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByRole('button', { name: 'Asignar a un cliente' })).toHaveCount(0)
    await expect(
      page.getByText('Tu administrador debe aprobar esta boleta antes de que puedas venderla.'),
    ).toBeVisible()
  })

  test('un cliente archivado no aparece en el selector de asignación (BR-C07)', async ({
    page,
  }) => {
    const ticket = await availableTicket()
    const client = await createClientFor(refs, unique('Cliente fuera de juego'))

    await serviceClient()
      .from('clients')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', client.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()
    await page.getByLabel('Buscar').fill(client.name)

    await expect(page.getByRole('option', { name: new RegExp(client.name) })).toHaveCount(0)
  })
})

test.describe('Boletas propias: búsqueda y filtros', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('busca por número conservando los ceros (BR-N03)', async ({ page }) => {
    const weekly = randomTicketNumbers().weekly
    await createTicket(refs, {
      dailyNumber: '0042',
      weeklyNumber: weekly,
      inventoryStatus: 'available',
    })

    await page.goto('/seller/tickets')
    await page.getByPlaceholder('Número de boleta o cliente').fill('0042')
    await page.getByRole('button', { name: 'Buscar' }).click()

    await page.waitForURL(/q=0042/)
    await expect(page.getByRole('link', { name: `Ver la boleta 0042 / ${weekly}` })).toBeVisible()
  })

  test('filtra por estado y limpia los filtros', async ({ page }) => {
    await page.goto('/seller/tickets?inventoryStatus=assigned')
    await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toBeVisible()

    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(page).toHaveURL('/seller/tickets')
  })

  test('la tabla no muestra la columna Vendedor ni acciones de administración', async ({
    page,
  }) => {
    await page.goto('/seller/tickets')

    await expect(page.getByRole('columnheader', { name: 'Número diario' })).toBeVisible()
    // El codigo interno dejo de ser columna: vive en el detalle (BR-N11).
    await expect(page.getByRole('columnheader', { name: 'Código' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Vendedor' })).toHaveCount(0)
    // El negocio opera una sola rifa: ni columna ni filtro de rifa (D-088).
    await expect(page.getByRole('columnheader', { name: 'Rifa' })).toHaveCount(0)
    await expect(page.getByLabel('Rifa')).toHaveCount(0)
    // El vendedor si tiene casillas —vende varias boletas de una vez— pero no
    // aprueba, ni anula, ni elimina (BR-B07).
    await expect(page.getByRole('button', { name: /^Aprobar boletas/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Anular boletas/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Eliminar boletas/ })).toHaveCount(0)
  })
})

test.describe('Creación de boletas por el vendedor', () => {
  test('crea boletas que quedan pendientes de aprobación (pruebas 7 y 9)', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    await page.goto('/seller/tickets/new')
    await page.getByLabel(/Cuantas/).fill('2')
    await page.getByRole('button', { name: 'Generar' }).click()

    const first = randomTicketNumbers()
    const second = randomTicketNumbers()
    await page.getByLabel('Número diario de la fila 1', { exact: true }).fill(first.daily)
    await page.getByLabel('Número semanal de la fila 1', { exact: true }).fill(first.weekly)
    await page.getByLabel('Número diario de la fila 2', { exact: true }).fill(second.daily)
    await page.getByLabel('Número semanal de la fila 2', { exact: true }).fill(second.weekly)

    await expect(page.getByText('Sin errores')).toBeVisible()
    await page.getByRole('button', { name: /Crear 2 boleta/ }).click()

    await expectToast(page, /2 boletas creadas/)
    await page.waitForURL(/inventoryStatus=pending_approval/)
    await expect(page.getByText('Pendiente de aprobación').first()).toBeVisible()
  })

  test('exige los dos números: no admite borradores (BR-N09)', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    await page.goto('/seller/tickets/new')
    await page.getByLabel(/Cuantas/).fill('1')
    await page.getByRole('button', { name: 'Generar' }).click()

    await expect(page.getByText('Escribe los dos números.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Crear 1 boleta/ })).toBeDisabled()

    await page.getByLabel('Número diario de la fila 1', { exact: true }).fill('1234')
    await expect(page.getByText('Escribe los dos números.')).toBeVisible()

    await page.getByLabel('Número semanal de la fila 1', { exact: true }).fill('5678')
    await expect(page.getByText('Sin errores')).toBeVisible()
  })

  test('detecta números repetidos dentro del formulario', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    await page.goto('/seller/tickets/new')
    await page.getByLabel(/Cuantas/).fill('2')
    await page.getByRole('button', { name: 'Generar' }).click()

    const numbers = randomTicketNumbers()
    for (const row of [1, 2]) {
      await page.getByLabel(`Número diario de la fila ${row}`, { exact: true }).fill(numbers.daily)
      await page
        .getByLabel(`Número semanal de la fila ${row}`, { exact: true })
        .fill(numbers.weekly)
    }

    await expect(page.getByText('Combinación repetida en la fila 1.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Crear 2 boleta/ })).toBeDisabled()
  })

  test('informa cuando la combinación ya esta tomada en la rifa', async ({ page }) => {
    // La toma OTRO vendedor: el vendedor no puede verla (BR-U07), asi que solo
    // la base de datos puede avisar del choque.
    const numbers = randomTicketNumbers()
    await serviceClient().from('tickets').insert({
      organization_id: refs.organizationId,
      raffle_id: refs.raffleId,
      seller_id: refs.otherSellerId,
      daily_number: numbers.daily,
      weekly_number: numbers.weekly,
      inventory_status: 'available',
      created_by: refs.ownerId,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets/new')
    await page.getByLabel(/Cuantas/).fill('1')
    await page.getByRole('button', { name: 'Generar' }).click()
    await page.getByLabel('Número diario de la fila 1', { exact: true }).fill(numbers.daily)
    await page.getByLabel('Número semanal de la fila 1', { exact: true }).fill(numbers.weekly)
    await page.getByRole('button', { name: /Crear 1 boleta/ }).click()

    await expectToast(page, /ya estaban tomadas/)
    await expect(page.getByText('Esa combinación ya existe en esta rifa.')).toBeVisible()
  })

  test('un vendedor cuya rifa no lo permite no ve la opción (prueba 8, BR-R10)', async ({
    page,
  }) => {
    // La rifa de «Rifas Control» tiene allow_seller_ticket_creation = false.
    await loginAs(page, ACCOUNTS.controlSeller)

    await page.goto('/seller/tickets')
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)

    // Y si escribe la URL a mano, se le explica por que no puede.
    await page.goto('/seller/tickets/new')
    await expect(page.getByText('Ninguna rifa activa te permite crear boletas')).toBeVisible()
    await expect(page.getByRole('button', { name: /Crear \d+ boleta/ })).toHaveCount(0)
  })
})

test.describe('Aislamiento y proteccion de rutas (pruebas 12 y 13)', () => {
  test('un vendedor no puede abrir la boleta de otro', async ({ page }) => {
    const { ticketId } = await findOtherSellerResources(refs)
    test.skip(ticketId === null, 'El seed no dejo boletas del otro vendedor')

    const { data: ajena } = await serviceClient()
      .from('tickets')
      .select('internal_code')
      .eq('id', ticketId!)
      .single()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${ticketId}`)

    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
    await expect(page.getByText(ajena!.internal_code)).toHaveCount(0)
  })

  test('un vendedor no entra al portal administrativo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    for (const path of ['/owner/dashboard', '/owner/clients', '/owner/tickets']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/denied/)
    }
  })

  test('un administrador no entra al portal del vendedor', async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin)

    for (const path of ['/seller/dashboard', '/seller/tickets', '/seller/clients']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/denied/)
    }
  })

  test('sin sesión, el portal del vendedor redirige al login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/seller/tickets')
    await expect(page).toHaveURL(/\/login/)
  })
})
