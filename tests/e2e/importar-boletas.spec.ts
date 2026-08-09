import { expect, test, type Page } from '@playwright/test'

import { createTicket, loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers } from './fixtures'

/**
 * Importacion de boletas desde un archivo, por la interfaz (BR-N12, D-081).
 *
 * Lo que se comprueba aqui es el RECORRIDO, que es lo que ninguna prueba
 * unitaria ve: que elegir un archivo no guarde nada, que la vista previa diga
 * la verdad antes de confirmar, que se pueda importar solo lo que sirve, y que
 * un doble clic no cree las boletas dos veces.
 *
 * Los archivos se suben desde memoria con `setInputFiles`: no hace falta dejar
 * ficheros de prueba en el repositorio.
 */

let refs: SeedRefs

/** Boletas creadas por esta suite, para no dejarlas acumuladas (I-035). */
const creadas: string[] = []
const clientesCreados: string[] = []

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  if (creadas.length > 0) {
    await serviceClient().from('tickets').delete().in('id', creadas)
  }
  if (clientesCreados.length > 0) {
    await serviceClient().from('clients').delete().in('id', clientesCreados)
  }
})

/** Apunta para borrar despues las boletas de una rifa con estos numeros. */
async function recordar(dailyNumbers: string[]) {
  const { data } = await serviceClient()
    .from('tickets')
    .select('id')
    .eq('raffle_id', refs.raffleId)
    .in('daily_number', dailyNumbers)
  for (const fila of data ?? []) creadas.push(fila.id)
}

async function subir(page: Page, nombre: string, contenido: string, tipo = 'text/csv') {
  await page.getByRole('button', { name: 'Importar archivo' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page
    .getByLabel('Archivo de boletas en CSV o JSON')
    .setInputFiles({ name: nombre, mimeType: tipo, buffer: Buffer.from(contenido, 'utf8') })
}

test.describe('Importar boletas — portal administrativo', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets/bulk')
  })

  test('CASO 19 y 23 — el recorrido completo: archivo, vista previa, confirmar', async ({
    page,
  }) => {
    const a = randomTicketNumbers()
    const b = randomTicketNumbers()

    await subir(
      page,
      'boletas.csv',
      `Premio semanal,Premio diario\n${a.weekly},${a.daily}\n${b.weekly},${b.daily}\n`,
    )

    // Nada se ha guardado todavia: primero hay que ver la vista previa.
    await expect(page.getByText('2 boletas encontradas')).toBeVisible()
    await expect(page.getByText('2 se pueden importar')).toBeVisible()
    expect(await contarEnRifa([a.daily, b.daily])).toBe(0)

    const confirmar = page.getByRole('button', { name: /Importar 2 boleta/ })
    await expect(confirmar).toBeEnabled()
    await confirmar.click()

    await expect(page.getByText('Se crearon 2 boletas.')).toBeVisible()
    expect(await contarEnRifa([a.daily, b.daily])).toBe(2)
    await recordar([a.daily, b.daily])
  })

  test('mezcla boletas con y sin cliente, exige celular y crea una sola identidad', async ({
    page,
  }) => {
    const a = randomTicketNumbers()
    const b = randomTicketNumbers()
    const sinCliente = randomTicketNumbers()
    const incompleta = randomTicketNumbers()
    const phone = `31${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`
    const name = `Cliente CSV ${phone}`

    await subir(
      page,
      'boletas-con-clientes.csv',
      [
        'Premio semanal,Premio diario,Cliente,Celular',
        `${a.weekly},${a.daily},${name},${phone}`,
        `${b.weekly},${b.daily},${name.toUpperCase()},+57 ${phone}`,
        `${sinCliente.weekly},${sinCliente.daily},,`,
        `${incompleta.weekly},${incompleta.daily},Cliente sin celular,`,
      ].join('\n'),
    )

    await expect(page.getByText('4 boletas encontradas')).toBeVisible()
    await expect(page.getByText('3 se pueden importar')).toBeVisible()
    await expect(page.getByText(/2 con cliente/)).toBeVisible()
    await expect(page.getByText(/1 sin cliente/)).toBeVisible()
    await expect(page.getByText('1 con datos incompletos o mal escritos')).toBeVisible()
    await expect(page.getByText('1 cliente único detectado')).toBeVisible()
    await expect(page.getByText(/2 boletas · Cliente nuevo/)).toBeVisible()

    await page.getByRole('button', { name: /Importar solo las 3 que sirven/ }).click()
    await expect(page.getByText('Se crearon 3 boletas.')).toBeVisible()
    await expect(page.getByText('2 boletas quedaron asignadas a sus clientes.')).toBeVisible()
    await expect(page.getByText('1 cliente nuevo · 0 existentes reutilizados')).toBeVisible()

    const { data } = await serviceClient()
      .from('tickets')
      .select('id, daily_number, client_id, inventory_status')
      .eq('raffle_id', refs.raffleId)
      .in('daily_number', [a.daily, b.daily, sinCliente.daily, incompleta.daily])

    expect(data).toHaveLength(3)
    for (const ticket of data ?? []) creadas.push(ticket.id)
    const assigned = data?.filter((ticket) => ticket.inventory_status === 'assigned') ?? []
    const available = data?.find((ticket) => ticket.daily_number === sinCliente.daily)
    expect(assigned).toHaveLength(2)
    expect(new Set(assigned.map((ticket) => ticket.client_id)).size).toBe(1)
    expect(available).toMatchObject({ inventory_status: 'available', client_id: null })
    clientesCreados.push(assigned[0]!.client_id!)

    const { count } = await serviceClient()
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('name', 'Cliente sin celular')
    expect(count).toBe(0)
  })

  test('la columna «#» se ignora y los ceros de delante se conservan', async ({ page }) => {
    const daily = '0042'
    const weekly = '0007'
    // Se limpia antes por si una corrida anterior la dejo.
    await serviceClient()
      .from('tickets')
      .delete()
      .eq('raffle_id', refs.raffleId)
      .eq('daily_number', daily)
      .eq('weekly_number', weekly)

    await subir(page, 'excel.csv', `#;Premio semanal;Premio diario\n1;${weekly};${daily}\n`)

    await expect(page.getByText('1 boleta encontrada')).toBeVisible()
    await page.getByRole('button', { name: /Importar 1 boleta/ }).click()
    await expect(page.getByText('Se creó 1 boleta.')).toBeVisible()

    const { data } = await serviceClient()
      .from('tickets')
      .select('id, daily_number, weekly_number')
      .eq('raffle_id', refs.raffleId)
      .eq('daily_number', daily)
      .eq('weekly_number', weekly)

    expect(data).toHaveLength(1)
    // «0042», no 42: el numero es texto de principio a fin (BR-N03).
    expect(data![0]!.daily_number).toBe('0042')
    expect(data![0]!.weekly_number).toBe('0007')
    creadas.push(data![0]!.id)
  })

  test('un archivo con problemas deja importar solo lo que sirve, y lo dice', async ({ page }) => {
    const buena = randomTicketNumbers()
    const repetida = randomTicketNumbers()

    await subir(
      page,
      'con-errores.csv',
      [
        'Premio semanal,Premio diario',
        `${buena.weekly},${buena.daily}`,
        `${repetida.weekly},${repetida.daily}`,
        `${repetida.weekly},${repetida.daily}`, // repetida dentro del archivo
        '9999,12345', // mas de 4 digitos
        ',7777', // incompleta
      ].join('\n'),
    )

    await expect(page.getByText('5 boletas encontradas')).toBeVisible()
    await expect(page.getByText('2 se pueden importar')).toBeVisible()
    await expect(page.getByText('1 repetidas dentro del archivo')).toBeVisible()
    await expect(page.getByText('2 con datos incompletos o mal escritos')).toBeVisible()

    // Se avisa de lo que quedara fuera ANTES de confirmar: nada silencioso.
    await expect(page.getByText(/Las otras 3 quedarán fuera/)).toBeVisible()

    await page.getByRole('button', { name: /Importar solo las 2 que sirven/ }).click()
    await expect(page.getByText('Se crearon 2 boletas.')).toBeVisible()

    await recordar([buena.daily, repetida.daily])
  })

  test('una combinación que ya existe en la rifa se marca antes de confirmar', async ({ page }) => {
    const existente = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: existente.daily,
      weeklyNumber: existente.weekly,
      inventoryStatus: 'available',
    })
    creadas.push(ticket.id)

    await subir(
      page,
      'repetida.csv',
      `Premio semanal,Premio diario\n${existente.weekly},${existente.daily}\n`,
    )

    await expect(page.getByText('1 ya existen en la rifa')).toBeVisible()
    await expect(page.getByText('Ninguna boleta de este archivo se puede importar')).toBeVisible()
  })

  test('CASO 7 y 8 — con encabezados desconocidos pide el mapeo en vez de rechazar', async ({
    page,
  }) => {
    const n = randomTicketNumbers()
    await subir(page, 'raro.csv', `Columna A,Columna B\n${n.weekly},${n.daily}\n`)

    await expect(page.getByText('No reconocimos los nombres de las columnas.')).toBeVisible()

    await page.getByLabel('¿Cuál columna es el premio diario?').click()
    await page.getByRole('option', { name: new RegExp(`Columna B`) }).click()
    await page.getByLabel('¿Cuál columna es el premio semanal?').click()
    await page.getByRole('option', { name: new RegExp(`Columna A`) }).click()
    await page.getByRole('button', { name: 'Continuar' }).click()

    await expect(page.getByText('1 boleta encontrada')).toBeVisible()
    await expect(page.getByText('1 se pueden importar')).toBeVisible()
  })

  test('un archivo que no se puede leer se explica y no rompe nada', async ({ page }) => {
    await subir(page, 'roto.json', '{esto no es json', 'application/json')

    await expect(page.getByText(/mal escrito/)).toBeVisible()
    // Sigue en el primer paso: se puede elegir otro archivo.
    await expect(page.getByRole('button', { name: 'Elegir archivo' })).toBeVisible()
  })

  test('CASO 21 — el doble clic no importa dos veces', async ({ page }) => {
    const n = randomTicketNumbers()
    await subir(page, 'doble.csv', `Premio semanal,Premio diario\n${n.weekly},${n.daily}\n`)
    await expect(page.getByText('1 se pueden importar')).toBeVisible()

    const boton = page.getByRole('button', { name: /Importar 1 boleta/ })
    // Dos clics tan seguidos como puede darlos una persona con el ratón.
    await boton.click()
    await boton.click({ force: true, timeout: 2000 }).catch(() => {})

    await expect(page.getByText('Se creó 1 boleta.')).toBeVisible()
    expect(await contarEnRifa([n.daily])).toBe(1)
    await recordar([n.daily])
  })
})

test.describe('Importar boletas — portal del vendedor', () => {
  test('el vendedor importa sus boletas y quedan pendientes de aprobación', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets/new')

    const n = randomTicketNumbers()
    await subir(
      page,
      'mias.json',
      JSON.stringify([{ weekly_number: n.weekly, daily_number: n.daily }]),
      'application/json',
    )

    await expect(page.getByText('1 se pueden importar')).toBeVisible()
    await page.getByRole('button', { name: /Importar 1 boleta/ }).click()
    await expect(page.getByText('Se creó 1 boleta.')).toBeVisible()

    const { data } = await serviceClient()
      .from('tickets')
      .select('id, inventory_status, seller_id')
      .eq('raffle_id', refs.raffleId)
      .eq('daily_number', n.daily)

    expect(data).toHaveLength(1)
    // BR-I03: nace pendiente de aprobacion y a nombre de quien la subio.
    expect(data![0]!.inventory_status).toBe('pending_approval')
    expect(data![0]!.seller_id).toBe(refs.sellerId)
    creadas.push(data![0]!.id)
  })
})

async function contarEnRifa(dailyNumbers: string[]): Promise<number> {
  const { count } = await serviceClient()
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('raffle_id', refs.raffleId)
    .in('daily_number', dailyNumbers)
  return count ?? 0
}
