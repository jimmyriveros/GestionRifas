import { expect, test, type Page } from '@playwright/test'

import {
  createClientFor,
  generationRunIds,
  loadSeedRefs,
  purgeCommonInventory,
  serviceClient,
  signedInClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, logout, toggleCheckbox, unique } from './fixtures'

/**
 * El inventario común (D-257), por la interfaz: el Dueño genera por rangos,
 * entrega un lote a un vendedor y lo recupera; el vendedor busca, aparta, pide
 * sus 30 minutos, devuelve y vende; si libera esa venta, la boleta vuelve al
 * inventario común (D-258); otro vendedor ve «No disponible»; y los apartados
 * de una rifa solo los cambia el Dueño.
 *
 * Las reglas —quién gana una carrera, el cupo con peticiones en paralelo, un
 * apartado vencido en una pantalla vieja— viven en SQL y las prueban
 * `tests/db/common-inventory.test.ts` y la suite de volumen. Aquí se prueba el
 * RECORRIDO. El teléfono vive en `inventario-comun-movil.spec.ts`.
 *
 * TODO EN LA RIFA DEL SEED, que tiene dos números de cuatro cifras (D-261). El
 * diario se sortea entre 1000 y 8999 por si una pasada anterior se quedó a
 * medias; el semanal se ESCRIBE «3» y «4» y la rifa lo guarda «0003» y «0004»,
 * que es justo lo que prueba el generador. Las demás suites escriben semanales
 * al azar: que una repita este par exacto es improbable.
 *
 * EN SERIE: cada prueba usa lo que dejó la anterior —las boletas generadas—, y
 * si una falla no tiene sentido seguir.
 */
test.describe.configure({ mode: 'serial' })

const inicio = 1000 + Math.floor(Math.random() * 8000)
/** Lo que se ESCRIBE en el generador. */
const RANGOS = {
  dailyFrom: String(inicio),
  dailyTo: String(inicio + 1),
  weeklyFrom: '3',
  weeklyTo: '4',
}
/** Lo que guarda la rifa: el semanal, con los ceros de sus cuatro cifras. */
const GUARDADOS = { ...RANGOS, weeklyFrom: '0003', weeklyTo: '0004' }
const D1 = RANGOS.dailyFrom
const D2 = RANGOS.dailyTo
const W1 = GUARDADOS.weeklyFrom
const W2 = GUARDADOS.weeklyTo
const numeros = (daily: string, weekly: string) => `${daily} / ${weekly}`

let refs: SeedRefs
let since: string
let nombreVendedor: string
const clientesCreados: string[] = []

/** La boleta generada con esos dos números. */
async function boleta(daily: string, weekly: string) {
  const { data, error } = await serviceClient()
    .from('tickets')
    .select(
      'id, seller_id, client_id, inventory_status, sale_price, generation_run_id, sold_from_hold',
    )
    .eq('raffle_id', refs.raffleId)
    .eq('daily_number', daily)
    .eq('weekly_number', weekly)
    .single()
  if (error) throw error
  return data
}

/** Los apartados de una boleta, del más nuevo al más viejo. */
async function apartados(ticketId: string) {
  const { data, error } = await serviceClient()
    .from('ticket_holds')
    .select('id, seller_id, started_at, expires_at, extended_at, ended_at, end_reason')
    .eq('ticket_id', ticketId)
    .order('started_at', { ascending: false })
  if (error) throw error
  return data
}

async function nombreDe(profileId: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .single()
  if (error) throw error
  return data.full_name
}

/** Un rango en el generador: cada número va en su grupo, «Desde» y «Hasta». */
async function escribirRangos(page: Page, rangos: typeof RANGOS) {
  const diarios = page.getByRole('group', { name: 'Número diario' })
  const semanales = page.getByRole('group', { name: 'Número semanal' })
  await diarios.getByLabel('Desde').fill(rangos.dailyFrom)
  await diarios.getByLabel('Hasta').fill(rangos.dailyTo)
  await semanales.getByLabel('Desde').fill(rangos.weeklyFrom)
  await semanales.getByLabel('Hasta').fill(rangos.weeklyTo)
}

/** Marca una boleta de la tabla del personal, reintentando si el clic llega antes de hidratar. */
async function marcar(page: Page, daily: string, weekly: string) {
  await toggleCheckbox(
    page.getByRole('checkbox', { name: `Seleccionar la boleta ${numeros(daily, weekly)}` }),
    true,
  )
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  since = new Date().toISOString()
  nombreVendedor = await nombreDe(refs.sellerId)
})

test.afterAll(async () => {
  await purgeCommonInventory({
    runIds: await generationRunIds({ raffleId: refs.raffleId, since, ...GUARDADOS }),
    clientIds: clientesCreados,
    holdSettingsRaffleIds: [refs.raffleId],
    since,
  })
})

test.describe('Inventario común — el Dueño', () => {
  test('genera por rangos desde «Crear en lote», con vista previa y sin repetir lo que ya existe', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets/bulk?raffleId=${refs.raffleId}`)
    await page
      .getByRole('navigation', { name: 'Cómo quieres crear las boletas' })
      .getByRole('link', { name: 'Generar por rangos' })
      .click()
    await expect(page).toHaveURL(/\/owner\/tickets\/generate\?raffleId=/)
    await expect(page.getByRole('heading', { name: 'Generar boletas por rangos' })).toBeVisible()

    // D-261: el ancho lo pone la rifa —la pantalla lo explica con su número— y
    // el campo no admite una cifra más que las del número. Pasarse por la API lo
    // rechaza la base (tests/db/raffle-number-groups.test.ts, G5-03).
    await expect(
      page.getByText(
        'Cada número sale con las cifras de la rifa: «Diario» tiene 4, así que del 0 al 5 crea 0000, 0001, … 0005.',
      ),
    ).toBeVisible()
    const hasta = page.getByRole('group', { name: 'Número diario' }).getByLabel('Hasta')
    await hasta.fill('10000')
    await expect(hasta).toHaveValue('1000')

    await escribirRangos(page, RANGOS)
    await page.getByRole('button', { name: 'Calcular' }).click()
    await expect(page.getByText('Se crearán 4 boletas')).toBeVisible()
    await expect(page.getByText(`Número diario: del ${D1} al ${D2}`)).toBeVisible()
    // El semanal se escribió «3» y «4»: la vista previa enseña el formato final.
    await expect(page.getByText('Número semanal: del 0003 al 0004')).toBeVisible()
    await expect(
      page.getByText(
        `${numeros(D1, W1)} · ${numeros(D1, W2)} · ${numeros(D2, W1)} · ${numeros(D2, W2)}`,
      ),
    ).toBeVisible()
    await expect(
      page.getByText('Quedan en el inventario común de Rifa Navidad 2026.', { exact: false }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Generar 4 boletas' }).click()
    await expect(page.getByText('Se crearon 4 boletas en el inventario común.')).toBeVisible()

    const fila = await boleta(D1, W1)
    expect(fila.seller_id).toBeNull()
    expect(fila.client_id).toBeNull()
    expect(fila.inventory_status).toBe('available')
    expect(fila.generation_run_id).not.toBeNull()

    // Los mismos rangos otra vez: nada nuevo, y lo dice.
    await page.getByRole('button', { name: 'Generar otras' }).click()
    await escribirRangos(page, RANGOS)
    await page.getByRole('button', { name: 'Calcular' }).click()
    await expect(page.getByText('No hay boletas nuevas que crear')).toBeVisible()
    await expect(
      page.getByText(
        'Las 4 combinaciones ya existen en la rifa. De ellas, 4 las creó una generación anterior.',
      ),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /^Generar \d/ })).toHaveCount(0)

    // Y la lista del inventario común las enseña sin vendedor.
    await page.goto(`/owner/tickets?custody=common&raffleId=${refs.raffleId}&q=${D1}`)
    const tabla = page.getByRole('table')
    await expect(
      tabla.getByRole('link', { name: `Ver la boleta ${numeros(D1, W1)}` }),
    ).toBeVisible()
    await expect(tabla.getByText('Inventario común').first()).toBeVisible()
  })

  test('entrega un lote a un vendedor y lo recupera sin tocar nada más', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets?custody=common&raffleId=${refs.raffleId}&q=${D2}`)
    await marcar(page, D2, W1)
    await marcar(page, D2, W2)

    await page.getByRole('button', { name: /^Asignar a un vendedor/ }).click()
    const asignar = page.getByRole('dialog', { name: 'Asignar a un vendedor' })
    await expect(asignar.getByText(/No vencen/)).toBeVisible()
    await asignar.getByRole('combobox', { name: 'Vendedor' }).click()
    await page.getByRole('option', { name: nombreVendedor }).click()
    await asignar.getByRole('button', { name: 'Asignar 2 boletas' }).click()
    await expectToast(page, 'Se asignaron 2 boletas al vendedor.')

    expect((await boleta(D2, W1)).seller_id).toBe(refs.sellerId)
    expect((await boleta(D2, W2)).seller_id).toBe(refs.sellerId)

    // Recuperar una: vuelve al inventario común, la otra se queda con él.
    await page.goto(`/owner/tickets?raffleId=${refs.raffleId}&q=${D2}`)
    await marcar(page, D2, W2)
    await page.getByRole('button', { name: /^Recuperar al inventario común/ }).click()
    const recuperar = page.getByRole('dialog', { name: 'Recuperar al inventario común' })
    await recuperar.getByRole('button', { name: 'Recuperar 1 boleta' }).click()
    await expectToast(page, 'La boleta volvió al inventario común.')

    const recuperada = await boleta(D2, W2)
    expect(recuperada.seller_id).toBeNull()
    expect(recuperada.inventory_status).toBe('available')
    expect((await boleta(D2, W1)).seller_id).toBe(refs.sellerId)
  })

  test('los apartados de la rifa los ve el personal y solo los cambia el Dueño', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.admin)
    await page.goto(`/owner/raffles/${refs.raffleId}`)
    await expect(page.getByRole('heading', { name: 'Apartados de los vendedores' })).toBeVisible()
    await expect(page.getByText('Solo el dueño cambia estos valores.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Cambiar los apartados/ })).toHaveCount(0)
    await logout(page)

    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${refs.raffleId}`)
    await page.getByRole('button', { name: 'Cambiar los apartados de esta rifa' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Apartados de los vendedores' })
    await dialogo.getByLabel('Cupo por vendedor').fill('1')
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, 'Los cambios fueron guardados.')
    await expect(
      page.getByText('Cada vendedor puede tener 1 boleta apartada a la vez en esta rifa.'),
    ).toBeVisible()
  })
})

test.describe('Inventario común — el vendedor', () => {
  test('aparta, pide sus 30 minutos, devuelve, vuelve a apartar y vende', async ({ page }) => {
    const cliente = await createClientFor(refs, unique('Cliente inventario'))
    clientesCreados.push(cliente.id)
    const objetivo = numeros(D1, W1)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/inventory?daily=${D1}`)
    await expect(page.getByRole('heading', { name: 'Inventario común' })).toBeVisible()

    // Antes de apartar se ven los dos números, cada uno con su nombre.
    await page.getByRole('button', { name: `Apartar la boleta ${objetivo}` }).click()
    const confirmar = page.getByRole('alertdialog', { name: `Apartar la boleta ${objetivo}` })
    await expect(confirmar.getByText('Número diario')).toBeVisible()
    await expect(confirmar.getByText(D1, { exact: true })).toBeVisible()
    await expect(confirmar.getByText('Número semanal')).toBeVisible()
    await expect(confirmar.getByText(W1, { exact: true })).toBeVisible()
    await confirmar.getByRole('button', { name: 'Apartar boleta' }).click()
    await expectToast(page, new RegExp(`Apartaste la boleta ${objetivo} hasta las`))

    const mios = page.getByRole('region', { name: 'Tus apartados' })
    await expect(mios.getByText(objetivo, { exact: true })).toBeVisible()
    await expect(mios.getByText(/^Vence a las/)).toBeVisible()
    // Cupo 1 (la prueba anterior): lleno, y lo dice.
    await expect(
      page.getByText('Ya tienes 1 boleta apartada, que es el máximo.', { exact: false }),
    ).toBeVisible()

    const ticket = await boleta(D1, W1)
    const [primero] = await apartados(ticket.id)
    expect(primero!.seller_id).toBe(refs.sellerId)
    expect(primero!.ended_at).toBeNull()

    // Una vez 30 minutos más, y no se ofrece otra.
    await mios
      .getByRole('button', { name: `Pedir 30 minutos más para la boleta ${objetivo}` })
      .click()
    await expectToast(page, /El apartado ahora vence a las/)
    await expect(mios.getByText('Ya pediste los 30 minutos más.')).toBeVisible()
    await expect(mios.getByRole('button', { name: /^Pedir 30 minutos más/ })).toHaveCount(0)
    const [extendido] = await apartados(ticket.id)
    expect(Date.parse(extendido!.expires_at) - Date.parse(primero!.expires_at)).toBe(30 * 60_000)

    // Devolver la deja libre, y se puede apartar otra vez en el acto.
    await mios.getByRole('button', { name: `Devolver la boleta ${objetivo}` }).click()
    const devolver = page.getByRole('alertdialog', { name: `Devolver la boleta ${objetivo}` })
    await devolver.getByRole('button', { name: 'Devolver boleta' }).click()
    await expectToast(page, 'La boleta volvió al inventario común.')
    await expect(mios.getByText('No tienes boletas apartadas en esta rifa.')).toBeVisible()
    expect((await apartados(ticket.id))[0]!.end_reason).toBe('returned')

    await page.getByRole('button', { name: `Apartar la boleta ${objetivo}` }).click()
    await page
      .getByRole('alertdialog', { name: `Apartar la boleta ${objetivo}` })
      .getByRole('button', { name: 'Apartar boleta' })
      .click()
    await expectToast(page, new RegExp(`Apartaste la boleta ${objetivo} hasta las`))

    // Vender es la venta de siempre: elegir el cliente y asignar.
    await mios.getByRole('button', { name: `Vender la boleta ${objetivo}` }).click()
    const vender = page.getByRole('dialog', { name: `Vender la boleta ${objetivo}` })
    await vender.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(cliente.name)
    await vender.getByRole('option', { name: new RegExp(cliente.name) }).click()
    await vender.getByRole('button', { name: 'Asignar boleta' }).click()
    await expectToast(page, 'Boleta asignada.')
    await expect(mios.getByText('No tienes boletas apartadas en esta rifa.')).toBeVisible()

    const vendida = await boleta(D1, W1)
    expect(vendida.seller_id).toBe(refs.sellerId)
    expect(vendida.client_id).toBe(cliente.id)
    expect(vendida.inventory_status).toBe('assigned')
    expect(vendida.sale_price).not.toBeNull()
    expect((await apartados(ticket.id))[0]!.end_reason).toBe('sold')

    // Y está en «Mis boletas», con su cliente.
    await page.goto(`/seller/tickets?q=${D1}`)
    await expect(page.getByRole('table').getByText(cliente.name)).toBeVisible()
  })

  test('liberar la que vendió desde un apartado la devuelve al inventario común (D-258)', async ({
    page,
  }) => {
    const objetivo = numeros(D1, W1)
    const vendida = await boleta(D1, W1)
    expect(vendida.inventory_status).toBe('assigned')
    expect(vendida.sold_from_hold).toBe(true)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${vendida.id}`)
    await page.getByRole('button', { name: 'Liberar boleta' }).click()

    // Antes de confirmar dice a dónde va, y que deja de ser suya.
    const dialogo = page.getByRole('alertdialog')
    await expect(
      dialogo.getByText(
        /volverá al inventario común, de donde la apartaste: saldrá de tus boletas/,
      ),
    ).toBeVisible()
    await expect(dialogo.getByText(/los números y la rifa no cambian/)).toBeVisible()
    await expect(dialogo.getByText(/el vendedor y la rifa no cambian/)).toHaveCount(0)
    await dialogo.getByLabel('Motivo de la liberación').fill('El cliente ya no la quiere')
    await dialogo.getByRole('button', { name: 'Confirmar liberación' }).click()

    await expectToast(page, `La boleta ${objetivo} volvió al inventario común.`)
    // Su detalle ya no se puede abrir: la pantalla sale a «Mis boletas».
    await expect(page).toHaveURL(/\/seller\/tickets$/)

    const liberada = await boleta(D1, W1)
    expect(liberada.seller_id).toBeNull()
    expect(liberada.client_id).toBeNull()
    expect(liberada.inventory_status).toBe('available')
    expect(liberada.sale_price).toBeNull()
    expect(liberada.sold_from_hold).toBe(false)

    // Libre otra vez, para cualquiera: también para quien la liberó.
    await page.goto(`/seller/inventory?daily=${D1}`)
    await expect(page.getByRole('button', { name: `Apartar la boleta ${objetivo}` })).toBeVisible()
  })

  test('otro vendedor ve la apartada como «No disponible», y el Dueño ve quién la tiene', async ({
    page,
  }) => {
    // Preparación por el camino real: el vendedor 1 aparta con su sesión.
    const ticket = await boleta(D1, W2)
    const vendedor = await signedInClient(ACCOUNTS.seller)
    const { data: tomado, error } = await vendedor.rpc('take_ticket_hold', {
      p_ticket_id: ticket.id,
      p_request_id: crypto.randomUUID(),
    })
    if (error) throw error
    const holdId = tomado![0]!.hold_id

    try {
      await loginAs(page, ACCOUNTS.otherSeller)
      await page.goto(`/seller/inventory?daily=${D1}&show=all`)
      const tarjeta = page.getByRole('listitem').filter({ hasText: numeros(D1, W2) })
      await expect(tarjeta.getByText('No disponible')).toBeVisible()
      await expect(tarjeta.getByRole('button', { name: /^Apartar/ })).toHaveCount(0)
      // Nada dice quién la tiene.
      await expect(page.getByText(nombreVendedor)).toHaveCount(0)
      await logout(page)

      await loginAs(page, ACCOUNTS.owner)
      await page.goto(`/owner/tickets?custody=held&raffleId=${refs.raffleId}&q=${D1}`)
      await expect(
        page.getByRole('table').getByText(`Apartada por ${nombreVendedor}`),
      ).toBeVisible()
    } finally {
      await vendedor.rpc('return_ticket_hold', { p_hold_id: holdId })
    }
  })
})
