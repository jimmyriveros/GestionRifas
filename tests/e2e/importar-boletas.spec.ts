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

/** Una boleta se identifica por su combinacion COMPLETA, nunca por un numero. */
type Par = { daily: string; weekly: string }

/** Boletas creadas por esta suite, para no dejarlas acumuladas (I-035). */
const creadas: string[] = []
const clientesCreados: string[] = []

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  const svc = serviceClient()

  // Orden obligatorio por las FK: asignaciones -> pagos -> boletas -> clientes.
  // Desde BR-N14 una boleta importada puede traer abono, y por tanto pagos.
  if (creadas.length > 0) {
    const { data: allocations } = await svc
      .from('payment_allocations')
      .select('payment_id')
      .in('ticket_id', creadas)
    const pagos = [...new Set((allocations ?? []).map((row) => row.payment_id))]

    if (pagos.length > 0) {
      await svc.from('payment_allocations').delete().in('payment_id', pagos)
      await svc.from('payments').delete().in('id', pagos)
    }
    await svc.from('commission_ledger').delete().in('ticket_id', creadas)
    await svc.from('tickets').delete().in('id', creadas)
  }
  if (clientesCreados.length > 0) {
    await svc.from('clients').delete().in('id', clientesCreados)
  }
})

/**
 * Boletas de la rifa que coinciden con estas combinaciones COMPLETAS.
 *
 * Por el par, nunca por el numero diario suelto: ese se repite en otras
 * combinaciones (BR-N07), asi que buscar solo por el acaba encontrando boletas
 * de otras pruebas —contandolas de mas, o peor, apuntandolas para borrar—. Es
 * I-055, y aqui se manifesto como un fallo intermitente de CASO 19.
 */
async function buscarPares(pares: Par[]) {
  const { data } = await serviceClient()
    .from('tickets')
    .select('id, daily_number, weekly_number')
    .eq('raffle_id', refs.raffleId)
    .in(
      'daily_number',
      pares.map((par) => par.daily),
    )

  return (data ?? []).filter((fila) =>
    pares.some((par) => par.daily === fila.daily_number && par.weekly === fila.weekly_number),
  )
}

/** Apunta para borrar despues las boletas con estas combinaciones. */
async function recordar(pares: Par[]) {
  for (const fila of await buscarPares(pares)) creadas.push(fila.id)
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
    expect(await contarEnRifa([a, b])).toBe(0)

    const confirmar = page.getByRole('button', { name: /Importar 2 boleta/ })
    await expect(confirmar).toBeEnabled()
    await confirmar.click()

    await expect(page.getByText('Se crearon 2 boletas.')).toBeVisible()
    expect(await contarEnRifa([a, b])).toBe(2)
    await recordar([a, b])
  })

  /**
   * Hasta D-198 esta prueba importaba boletas CON cliente y creaba una sola
   * identidad. Desde D-198 ningún portal importa ventas (BR-Q07): las filas que
   * traen cliente —completo o a medias— se apartan en la vista previa con su
   * frase, y solo se guardan las que no lo traen.
   */
  test('las filas con cliente se apartan con su frase y solo se importan las que no lo traen (D-198)', async ({
    page,
  }) => {
    const a = randomTicketNumbers()
    const b = randomTicketNumbers()
    const sinCliente = randomTicketNumbers()
    const otraSinCliente = randomTicketNumbers()
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
        `${otraSinCliente.weekly},${otraSinCliente.daily},,`,
        `${incompleta.weekly},${incompleta.daily},Cliente sin celular,`,
      ].join('\n'),
    )

    await expect(page.getByText('5 boletas encontradas')).toBeVisible()
    await expect(page.getByText('2 se pueden importar')).toBeVisible()
    await expect(page.getByText('3 traen datos de cliente')).toBeVisible()
    // La vista previa pinta la tabla y, para el teléfono, las mismas filas en
    // tarjetas ocultas: se busca la que se ve.
    await expect(page.getByText('Trae cliente').filter({ visible: true }).first()).toBeVisible()
    await expect(
      page
        .getByText(
          'Las boletas se importan sin cliente. Deja vacías las columnas «Cliente» y «Celular»: cada boleta se asigna a su cliente cuando se vende.',
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible()
    // Nada del resumen de clientes de antes.
    await expect(page.getByText(/cliente único detectado|Cliente nuevo/)).toHaveCount(0)

    await page.getByRole('button', { name: /Importar solo las 2 que sirven/ }).click()
    await expect(page.getByText('Se crearon 2 boletas.')).toBeVisible()

    // Por el par completo, no por el numero diario suelto (I-055).
    const data = await buscarPares([a, b, sinCliente, otraSinCliente, incompleta])
    expect(data).toHaveLength(2)
    for (const fila of data) creadas.push(fila.id)

    const { data: filas } = await serviceClient()
      .from('tickets')
      .select('daily_number, weekly_number, client_id, inventory_status')
      .in(
        'id',
        data.map((fila) => fila.id),
      )
    for (const fila of filas ?? []) {
      expect(fila).toMatchObject({ client_id: null, inventory_status: 'available' })
    }
    expect(new Set((filas ?? []).map((f) => `${f.daily_number}/${f.weekly_number}`))).toEqual(
      new Set([
        `${sinCliente.daily}/${sinCliente.weekly}`,
        `${otraSinCliente.daily}/${otraSinCliente.weekly}`,
      ]),
    )

    const { count } = await serviceClient()
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .in('name', [name, name.toUpperCase(), 'Cliente sin celular'])
    expect(count).toBe(0)
  })

  /**
   * Hasta D-198 la columna «Abono» dejaba las boletas cobradas y con su
   * movimiento. Desde D-198 ningún portal importa abonos (BR-Q07): la fila que
   * lo trae se aparta con su frase —aunque no traiga cliente— y ninguna boleta
   * nace con pagos.
   */
  test('la columna «Abono» se aparta: las boletas se importan sin abonos (D-198)', async ({
    page,
  }) => {
    const parcial = randomTicketNumbers()
    const cancelada = randomTicketNumbers()
    const sinAbono = randomTicketNumbers()
    const otraSinAbono = randomTicketNumbers()

    await subir(
      page,
      'boletas-abono.csv',
      [
        'Premio semanal,Premio diario,Abono',
        `${parcial.weekly},${parcial.daily},20`,
        `${cancelada.weekly},${cancelada.daily},Cancelado`,
        `${sinAbono.weekly},${sinAbono.daily},`,
        `${otraSinAbono.weekly},${otraSinAbono.daily},`,
        '',
      ].join('\n'),
    )

    await expect(page.getByText('4 boletas encontradas')).toBeVisible()
    await expect(page.getByText('2 se pueden importar')).toBeVisible()
    await expect(
      page
        .getByText(
          'Las boletas se importan sin abonos. Deja vacía la columna «Abono»: los abonos se registran cuando la boleta ya se vendió.',
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible()
    // Y sin columnas de cliente no se para a preguntar por ellas: desde D-198 el
    // mapeo solo pregunta por los números.
    await expect(page.getByText('No reconocimos los nombres de las columnas.')).toHaveCount(0)
    await expect(page.getByText(/abonos? por \$/)).toHaveCount(0)
    expect(await contarEnRifa([parcial, cancelada, sinAbono, otraSinAbono])).toBe(0)

    await page.getByRole('button', { name: /Importar solo las 2 que sirven/ }).click()
    await expect(page.getByText('Se crearon 2 boletas.')).toBeVisible()
    await expect(page.getByText(/Se registraron/)).toHaveCount(0)

    const data = await buscarPares([parcial, cancelada, sinAbono, otraSinAbono])
    expect(data).toHaveLength(2)
    for (const fila of data) creadas.push(fila.id)
    const ids = data.map((fila) => fila.id)

    const { data: filas } = await serviceClient()
      .from('tickets')
      .select('daily_number, weekly_number, client_id, paid_amount, payment_status')
      .in('id', ids)
    for (const fila of filas ?? []) {
      expect(fila).toMatchObject({ client_id: null, paid_amount: 0, payment_status: 'unpaid' })
    }
    expect(new Set((filas ?? []).map((f) => `${f.daily_number}/${f.weekly_number}`))).toEqual(
      new Set([
        `${sinAbono.daily}/${sinAbono.weekly}`,
        `${otraSinAbono.daily}/${otraSinAbono.weekly}`,
      ]),
    )

    const { count } = await serviceClient()
      .from('payment_allocations')
      .select('id', { count: 'exact', head: true })
      .in('ticket_id', ids)
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

    await recordar([buena, repetida])
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
    expect(await contarEnRifa([n])).toBe(1)
    await recordar([n])
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

async function contarEnRifa(pares: Par[]): Promise<number> {
  return (await buscarPares(pares)).length
}
