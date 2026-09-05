import { expect, test } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  purgeTestData,
  raffleTicketPrice,
  serviceClient,
  signedInClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Entrega del paz y salvo (BR-I15, D-170).
 *
 * Lo que se prueba aqui es el RECORRIDO: el interruptor en el detalle de la
 * boleta del vendedor, el indicador en el listado —tambien al buscar—, y que el
 * portal administrativo lo ensena SIN interruptor. Las reglas viven en SQL y las
 * prueba `tests/db/ticket-clearance.test.ts`.
 *
 * El movil vive en `paz-y-salvo-movil.spec.ts`.
 */

let refs: SeedRefs
let PRICE: number

/**
 * Todo lo que crea esta suite, para borrarlo al terminar (I-035).
 *
 * No es higiene opcional: «Mis clientes» ensena los 25 primeros por nombre sin
 * buscar nada y «Ventas por fecha» cuenta las ventas de HOY, asi que unos
 * cuantos clientes y boletas de mas tumban pruebas de otras suites que no tienen
 * nada roto.
 */
const clientesCreados: string[] = []
const ticketsCreados: string[] = []

async function clienteDe(nombre: string) {
  const client = await createClientFor(refs, unique(nombre))
  clientesCreados.push(client.id)
  return client
}

async function ticketOf(clientId: string) {
  const numbers = randomTicketNumbers()
  const ticket = await createAssignedTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    clientId,
    salePrice: PRICE,
  })
  ticketsCreados.push(ticket.id)
  return { ...ticket, ...numbers }
}

/** Las dos columnas del paz y salvo, tal como estan HOY en la base. */
async function clearanceRow(ticketId: string) {
  const { data, error } = await serviceClient()
    .from('tickets')
    .select(
      'clearance_receipt_delivered_at, clearance_receipt_assumed_delivered, inventory_status, client_id, sale_price, paid_amount, payment_status',
    )
    .eq('id', ticketId)
    .single()
  if (error) throw error
  return data
}

/** Deja la boleta como la habria dejado la carga inicial de `0049`. */
async function marcarComoHeredada(ticketId: string) {
  const { error } = await serviceClient()
    .from('tickets')
    .update({
      clearance_receipt_delivered_at: '2026-01-15T10:00:00.000000+00:00',
      clearance_receipt_assumed_delivered: true,
    })
    .eq('id', ticketId)
  if (error) throw error
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

test.afterAll(async () => {
  await purgeTestData({ clientIds: clientesCreados, ticketIds: ticketsCreados })
})

test.describe('Paz y salvo — portal del vendedor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('se activa, aparece la fecha en Bogota, y se vuelve a desactivar', async ({ page }) => {
    const cliente = await clienteDe('Paz y salvo activar')
    const ticket = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${ticket.id}`)

    await expect(page.getByText('Entrega del paz y salvo')).toBeVisible()
    await expect(page.getByText('Paz y salvo por entregar')).toBeVisible()
    await expect(
      page.getByText('Solo registra la entrega física. No cambia abonos, saldo ni estado de pago.'),
    ).toBeVisible()

    const interruptor = page.getByRole('switch', { name: 'Entrega del paz y salvo' })
    await expect(interruptor).not.toBeChecked()
    await interruptor.click()

    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()
    await expect(interruptor).toBeChecked()

    // «Entregado el …» solo se pinta con la fecha que DEVOLVIO el servidor: la
    // suposicion optimista no tiene hora. Esperar a esa linea es lo que
    // garantiza que la escritura ya ocurrio antes de mirar la base.
    await expect(page.getByText(/^Entregado el /)).toBeVisible()

    // Y la fecha que se ensena es la del SERVIDOR, ya formateada en Bogota: se
    // compara contra la FILA, no contra el reloj del navegador. Las opciones son
    // las mismas de `formatDateTimeEs` (src/lib/dates.ts): si alguien pintara la
    // hora en UTC —cinco horas de mas—, esta comparacion falla.
    const fila = await clearanceRow(ticket.id)
    expect(fila.clearance_receipt_delivered_at).not.toBeNull()
    expect(fila.clearance_receipt_assumed_delivered).toBe(false)
    const enBogota = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(fila.clearance_receipt_delivered_at!))
    // El espacio fino que mete `Intl` antes de «a. m.» no sobrevive a la
    // normalizacion de espacios de Playwright: se comparan los dos ya normalizados.
    const normaliza = (texto: string) => texto.replace(/\s+/g, ' ').trim()
    const linea = await page.getByText(/^Entregado el /).textContent()
    expect(normaliza(linea ?? '')).toBe(normaliza(`Entregado el ${enBogota}`))

    // Y el dinero no se movio ni un peso.
    expect(fila.paid_amount).toBe(0)
    expect(fila.payment_status).toBe('unpaid')
    expect(fila.sale_price).toBe(PRICE)

    // Se apaga otra vez.
    await interruptor.click()
    await expect(page.getByText('Paz y salvo por entregar')).toBeVisible()
    await expect(page.getByText(/^Entregado el /)).toHaveCount(0)
    await expect(interruptor).not.toBeChecked()
    await expect
      .poll(async () => (await clearanceRow(ticket.id)).clearance_receipt_delivered_at)
      .toBeNull()
  })

  test('un registro de la carga inicial dice que esta entregado SIN inventar una fecha', async ({
    page,
  }) => {
    const cliente = await clienteDe('Paz y salvo heredado')
    const ticket = await ticketOf(cliente.id)
    await marcarComoHeredada(ticket.id)

    await page.goto(`/seller/tickets/${ticket.id}`)

    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()
    await expect(
      page.getByText(
        'Marcado como entregado al activar esta función. La fecha real de entrega no estaba registrada.',
      ),
    ).toBeVisible()
    // Ni «Entregado el …», ni la fecha tecnica de la migracion por ningun lado.
    await expect(page.getByText(/^Entregado el /)).toHaveCount(0)
    await expect(page.getByText(/15 ene 2026/)).toHaveCount(0)

    // Al desmarcar y volver a marcar deja de ser heredado y pasa a tener fecha.
    const interruptor = page.getByRole('switch', { name: 'Entrega del paz y salvo' })
    await interruptor.click()
    await expect(page.getByText('Paz y salvo por entregar')).toBeVisible()
    await interruptor.click()
    await expect(page.getByText(/^Entregado el /)).toBeVisible()

    const fila = await clearanceRow(ticket.id)
    expect(fila.clearance_receipt_assumed_delivered).toBe(false)
    expect(new Date(fila.clearance_receipt_delivered_at!).getFullYear()).toBeGreaterThanOrEqual(
      2026,
    )
    expect(fila.clearance_receipt_delivered_at).not.toBe('2026-01-15T10:00:00+00:00')
  })

  test('el indicador aparece en el listado, y tambien al buscar por numero y por cliente', async ({
    page,
  }) => {
    const cliente = await clienteDe('Paz y salvo listado')
    const entregada = await ticketOf(cliente.id)
    const pendiente = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${entregada.id}`)
    await page.getByRole('switch', { name: 'Entrega del paz y salvo' }).click()
    await expect(page.getByText(/^Entregado el /)).toBeVisible()

    // 1. Buscando por el numero de la boleta entregada. La fila se localiza por
    //    los DOS numeros —el enlace los lleva en su nombre accesible—, nunca por
    //    el cliente ni por el numero diario suelto: este cliente tiene DOS
    //    boletas y un diario puede repetirse en otra combinacion (I-055, BR-N04).
    await page.goto(`/seller/tickets?q=${entregada.daily}`)
    const tablaPorNumero = page.getByRole('table')
    await expect(tablaPorNumero).toBeVisible()
    const filaEntregada = tablaPorNumero.getByRole('row').filter({
      has: page.getByRole('link', {
        name: `Ver la boleta ${entregada.daily} / ${entregada.weekly}`,
      }),
    })
    await expect(filaEntregada).toHaveCount(1)
    await expect(filaEntregada.getByText('Paz y salvo entregado')).toBeAttached()

    // 2. Buscando por el nombre del cliente: salen las dos, cada una con lo suyo.
    await page.goto(`/seller/tickets?q=${encodeURIComponent(cliente.name)}`)
    const tabla = page.getByRole('table')
    await expect(tabla).toBeVisible()
    await expect(tabla.getByText('Paz y salvo entregado')).toHaveCount(1)
    await expect(tabla.getByText('Paz y salvo por entregar')).toHaveCount(1)
    // El nombre entero se sigue leyendo: el indicador no lo desplazo fuera.
    await expect(tabla.getByText(cliente.name).first()).toBeVisible()

    // 3. Y filtrando por estado de inventario, que es otro camino de lectura.
    await page.goto(
      `/seller/tickets?q=${encodeURIComponent(cliente.name)}&inventoryStatus=assigned`,
    )
    await expect(page.getByRole('table').getByText('Paz y salvo entregado')).toHaveCount(1)

    // Y la boleta pendiente sigue pendiente en la base: mirar no cambia nada.
    expect((await clearanceRow(pendiente.id)).clearance_receipt_delivered_at).toBeNull()
  })

  test('una boleta sin cliente no ensena ni interruptor ni indicador', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const { data, error } = await serviceClient()
      .from('tickets')
      .insert({
        organization_id: refs.organizationId,
        raffle_id: refs.raffleId,
        seller_id: refs.sellerId,
        daily_number: numbers.daily,
        weekly_number: numbers.weekly,
        inventory_status: 'available',
        created_by: refs.ownerId,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    ticketsCreados.push(data!.id)

    await page.goto(`/seller/tickets/${data!.id}`)
    await expect(page.getByText('Todavía no la has vendido.')).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Entrega del paz y salvo' })).toHaveCount(0)
    await expect(page.getByText(/Paz y salvo/)).toHaveCount(0)

    await page.goto(`/seller/tickets?q=${numbers.daily}`)
    const fila = page.getByRole('row').filter({ hasText: 'Sin cliente' })
    await expect(fila.first()).toBeVisible()
    await expect(fila.first().getByText(/Paz y salvo/)).toHaveCount(0)
  })

  test('con abonos el interruptor sigue funcionando: son cosas distintas', async ({ page }) => {
    const cliente = await clienteDe('Paz y salvo con abono')
    const ticket = await ticketOf(cliente.id)

    const seller = await signedInClient(ACCOUNTS.seller)
    const { error } = await seller.rpc('create_payment', {
      p_client_id: cliente.id,
      p_total_amount: 40_000,
      p_allocations: [{ ticket_id: ticket.id, amount: 40_000 }],
    })
    expect(error).toBeNull()

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('switch', { name: 'Entrega del paz y salvo' }).click()
    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()

    // La boleta sigue Abonada, con lo mismo abonado y el mismo saldo.
    const fila = await clearanceRow(ticket.id)
    expect(fila.payment_status).toBe('partial')
    expect(fila.paid_amount).toBe(40_000)
    await expect(page.getByText('Abonada').first()).toBeVisible()
  })

  test('cambiar de cliente devuelve el paz y salvo a pendiente, y se ve', async ({ page }) => {
    const cliente = await clienteDe('Paz y salvo origen')
    const otro = await clienteDe('Paz y salvo destino')
    const ticket = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('switch', { name: 'Entrega del paz y salvo' }).click()
    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()

    await page.getByRole('button', { name: 'Cambiar cliente' }).click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Buscar').fill(otro.name)
    await dialogo.getByRole('option', { name: otro.name }).click()
    await dialogo.getByLabel('Motivo de la corrección').fill('Era del otro cliente')
    await dialogo.getByRole('button', { name: 'Cambiar cliente' }).click()
    await expectToast(page, new RegExp(`quedó a nombre de ${otro.name}`))

    await expect(page.getByText('Paz y salvo por entregar')).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Entrega del paz y salvo' })).not.toBeChecked()
    expect((await clearanceRow(ticket.id)).clearance_receipt_delivered_at).toBeNull()
  })

  test('otro vendedor no llega a la boleta ni por la URL', async ({ page }) => {
    const cliente = await clienteDe('Paz y salvo aislamiento')
    const ticket = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('switch', { name: 'Entrega del paz y salvo' }).click()
    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()

    // `vendedor2` escribe la URL de una boleta de `vendedor1`: RLS no la
    // devuelve, asi que la pantalla es un 404 (BR-U07).
    await page.context().clearCookies()
    await loginAs(page, ACCOUNTS.otherSeller)
    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByRole('switch', { name: 'Entrega del paz y salvo' })).toHaveCount(0)
    await expect(page.getByText(cliente.name)).toHaveCount(0)

    // Y la boleta se queda como estaba.
    expect((await clearanceRow(ticket.id)).clearance_receipt_delivered_at).not.toBeNull()
  })

  test('la consola queda limpia en las tres superficies', async ({ page }) => {
    // Lo que un agente NO puede comprobar a mano —entrar con una contraseña
    // queda fuera de lo que puede hacer— sí lo comprueba la suite, que ya opera
    // con sesiones reales. Se recogen los errores de consola y los fallos de red
    // de las tres pantallas que toca esta funcionalidad.
    const errores: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errores.push(msg.text())
    })
    page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`))

    const cliente = await clienteDe('Paz y salvo consola')
    const ticket = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText('Entrega del paz y salvo')).toBeVisible()
    await page.getByRole('switch', { name: 'Entrega del paz y salvo' }).click()
    await expect(page.getByText(/^Entregado el /)).toBeVisible()

    await page.goto(`/seller/tickets?q=${ticket.daily}`)
    await expect(page.getByRole('table')).toBeVisible()

    await page.context().clearCookies()
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets/${ticket.id}`)
    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()

    // El aviso de React sobre extensiones del navegador no aparece en este
    // arnés; si algún día llega otro ruido conocido, se filtra aquí con su
    // motivo escrito, nunca vaciando la lista.
    expect(errores, `errores de consola:\n${errores.join('\n')}`).toEqual([])
  })
})

test.describe('Paz y salvo — portal administrativo', () => {
  test('el Dueno lo ve, con su tipo de registro, y NO puede cambiarlo', async ({ page }) => {
    const cliente = await clienteDe('Paz y salvo admin')
    const manual = await ticketOf(cliente.id)
    const heredada = await ticketOf(cliente.id)
    await marcarComoHeredada(heredada.id)

    // El vendedor lo entrega; el personal solo mira.
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${manual.id}`)
    await page.getByRole('switch', { name: 'Entrega del paz y salvo' }).click()
    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()

    await page.context().clearCookies()
    await loginAs(page, ACCOUNTS.owner)

    // 1. Registro manual: estado + fecha, sin interruptor.
    await page.goto(`/owner/tickets/${manual.id}`)
    await expect(page.getByText('Paz y salvo', { exact: true })).toBeVisible()
    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()
    await expect(page.getByText(/^Entregado el /)).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Entrega del paz y salvo' })).toHaveCount(0)
    await expect(page.getByRole('switch')).toHaveCount(0)

    // 2. Carga inicial: estado + explicacion, y NINGUNA fecha.
    await page.goto(`/owner/tickets/${heredada.id}`)
    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()
    await expect(
      page.getByText(
        'Marcado como entregado al activar esta función. La fecha real de entrega no estaba registrada.',
      ),
    ).toBeVisible()
    await expect(page.getByText(/^Entregado el /)).toHaveCount(0)
    await expect(page.getByRole('switch')).toHaveCount(0)
  })

  test('la tabla administrativa no gana ninguna columna', async ({ page }) => {
    const cliente = await clienteDe('Paz y salvo tabla admin')
    const ticket = await ticketOf(cliente.id)

    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets?q=${ticket.daily}`)

    const encabezados = await page.getByRole('columnheader').allInnerTexts()
    expect(encabezados.join('|')).not.toMatch(/paz y salvo/i)
    // Y las de siempre siguen ahi.
    expect(encabezados.join('|')).toMatch(/Boleta/)
    expect(encabezados.join('|')).toMatch(/Cliente/)
    expect(encabezados.join('|')).toMatch(/Falta/)
  })
})
