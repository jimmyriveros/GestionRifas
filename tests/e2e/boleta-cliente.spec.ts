import { expect, test, type Page } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Boletas y clientes, conectados en los dos sentidos (D-100 y D-101):
 *
 *   * desde «Boletas», UN solo buscador que encuentra tambien por el nombre del
 *     cliente y sigue devolviendo BOLETAS (BR-N13);
 *   * desde el detalle de una boleta, el cliente es una fila pulsable entera
 *     que lleva a la MISMA ficha de «Clientes».
 *
 * Lo que se comprueba aqui es el recorrido completo por la interfaz. El orden,
 * las coincidencias y el aislamiento a nivel de consulta viven en
 * `tests/db/ticket-search-client.test.ts`.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/**
 * Prefijo comun de todo lo que crea esta suite.
 *
 * Clientes y boletas se acumulan y hacen fallar a otras pruebas que no lo
 * aguantan (I-035, I-038): con un prefijo unico se borran todos de una vez al
 * terminar el archivo. Empieza por «Z» para no colarse en las primeras
 * posiciones de ninguna lista ordenada por nombre.
 */
const PREFIJO = 'Zbolcli'

const boletasCreadas: string[] = []

test.afterAll(async () => {
  const svc = serviceClient()
  if (boletasCreadas.length > 0) await svc.from('tickets').delete().in('id', boletasCreadas)
  await svc.from('clients').delete().like('name', `${PREFIJO}%`)
})

/** Cliente del vendedor 1 con una boleta ya vendida, lista para buscarse. */
async function clienteConBoletas(
  nombre: string,
  cuantas: number,
  options: { sellerId?: string } = {},
): Promise<{ clientId: string; nombre: string; numeros: { daily: string; weekly: string }[] }> {
  const svc = serviceClient()
  const sellerId = options.sellerId ?? refs.sellerId

  const cliente =
    sellerId === refs.sellerId
      ? await createClientFor(refs, nombre)
      : await (async () => {
          const { data, error } = await svc
            .from('clients')
            .insert({
              organization_id: refs.organizationId,
              seller_id: sellerId,
              name: nombre,
              phone: '3005550001',
            })
            .select('id, name')
            .single()
          if (error) throw error
          return data
        })()

  const numeros: { daily: string; weekly: string }[] = []
  for (let i = 0; i < cuantas; i += 1) {
    const n = randomTicketNumbers()
    if (sellerId === refs.sellerId) {
      const boleta = await createAssignedTicket(refs, {
        dailyNumber: n.daily,
        weeklyNumber: n.weekly,
        clientId: cliente.id,
        salePrice: 120_000,
      })
      boletasCreadas.push(boleta.id)
    } else {
      const { data, error } = await svc
        .from('tickets')
        .insert({
          organization_id: refs.organizationId,
          raffle_id: refs.raffleId,
          seller_id: sellerId,
          client_id: cliente.id,
          daily_number: n.daily,
          weekly_number: n.weekly,
          inventory_status: 'assigned',
          sale_price: 120_000,
          sale_date: new Date().toISOString().slice(0, 10),
          assigned_at: new Date().toISOString(),
          created_by: refs.ownerId,
        })
        .select('id')
        .single()
      if (error) throw error
      boletasCreadas.push(data.id)
    }
    numeros.push(n)
  }

  return { clientId: cliente.id, nombre: cliente.name, numeros }
}

/** Escribe en el buscador de boletas y espera a que la busqueda ocurra. */
async function buscar(page: Page, termino: string): Promise<void> {
  await page.getByPlaceholder('Número de boleta o cliente').fill(termino)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.waitForURL(/[?&]q=/)
}

/**
 * La fila del cliente dentro del detalle de una boleta.
 *
 * Se ancla en «Cliente» —el rotulo de la propia fila— porque en la misma
 * pantalla hay otro enlace que tambien lleva el nombre del cliente («Registrar
 * un abono de …») y buscar solo por el nombre encontraria los dos.
 */
function filaDelCliente(page: Page, nombre: string) {
  return page.getByRole('link', { name: new RegExp(`^Cliente\\s+${nombre}`) })
}

test.describe('Buscar boletas por el nombre del cliente (BR-N13)', () => {
  test('el nombre del cliente devuelve SUS boletas, no una ficha suya', async ({ page }) => {
    const nombre = unique(`${PREFIJO} Riveros`)
    const { numeros } = await clienteConBoletas(nombre, 3)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, nombre)

    // Las TRES boletas, cada una como boleta: sus dos numeros y su cliente.
    for (const n of numeros) {
      await expect(
        page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }),
      ).toBeVisible()
    }
    // Seguimos en «Boletas»: la columna de la tabla lo demuestra.
    await expect(page.getByRole('columnheader', { name: 'Número diario' })).toBeVisible()
  })

  test('basta el apellido, en minúsculas y sin tildes', async ({ page }) => {
    const apellido = `Peña${Date.now().toString(36)}`
    const { numeros } = await clienteConBoletas(`${PREFIJO} Jesús ${apellido}`, 1)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, apellido.replace('Peña', 'pena'))

    const n = numeros[0]!
    await expect(
      page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }),
    ).toBeVisible()
  })

  test('al elegir un resultado se abre ESA boleta, no un resumen del cliente', async ({ page }) => {
    const nombre = unique(`${PREFIJO} Elegible`)
    const { numeros } = await clienteConBoletas(nombre, 2)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, nombre)

    const elegida = numeros[0]!
    await page
      .getByRole('link', { name: `Ver la boleta ${elegida.daily} / ${elegida.weekly}` })
      .click()
    await page.waitForURL(/\/seller\/tickets\/[0-9a-f-]+$/)

    // El encabezado dice donde estas, no que boleta es (D-126): los numeros se
    // comprueban donde ahora viven, en las dos cajas grandes de la tarjeta.
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
    await expect(page.getByText(elegida.daily, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(elegida.weekly, { exact: true }).first()).toBeVisible()
  })

  test('dos clientes con el mismo nombre: salen las boletas de los dos', async ({ page }) => {
    const nombre = unique(`${PREFIJO} Carlos Martinez`)
    const primero = await clienteConBoletas(nombre, 1)
    const segundo = await clienteConBoletas(nombre, 1)
    expect(primero.clientId).not.toBe(segundo.clientId)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, nombre)

    for (const { numeros } of [primero, segundo]) {
      const n = numeros[0]!
      await expect(
        page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }),
      ).toBeVisible()
    }
  })

  test('un vendedor NO encuentra por nombre las boletas de otro vendedor', async ({ page }) => {
    const nombre = unique(`${PREFIJO} Ajeno`)
    const { numeros } = await clienteConBoletas(nombre, 1, { sellerId: refs.otherSellerId })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, nombre)

    const n = numeros[0]!
    await expect(
      page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }),
    ).toHaveCount(0)
    await expect(page.getByText('Ninguna boleta coincide con los filtros')).toBeVisible()
  })

  test('el personal encuentra por nombre las boletas de cualquiera de sus vendedores', async ({
    page,
  }) => {
    const nombre = unique(`${PREFIJO} DelOtro`)
    const { numeros } = await clienteConBoletas(nombre, 1, { sellerId: refs.otherSellerId })

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')
    await buscar(page, nombre)

    const n = numeros[0]!
    await expect(
      page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }),
    ).toBeVisible()
  })

  test('un nombre sin resultados explica qué se puede buscar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, 'Zzyzx Nadie')

    await expect(page.getByText('Ninguna boleta coincide con los filtros')).toBeVisible()
    await expect(
      page.getByText(/Revisa el número de la boleta o el nombre del cliente/),
    ).toBeVisible()
  })

  test('buscar por número sigue funcionando igual, con sus ceros de delante', async ({ page }) => {
    const nombre = unique(`${PREFIJO} Numerico`)
    const { numeros } = await clienteConBoletas(nombre, 1)
    const n = numeros[0]!

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, n.daily)

    await expect(
      page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }),
    ).toBeVisible()
  })

  test('escribir y borrar rápido deja la lista en el último término, no en uno viejo', async ({
    page,
  }) => {
    const nombre = unique(`${PREFIJO} Carrera`)
    const { numeros } = await clienteConBoletas(nombre, 1)
    const n = numeros[0]!

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')

    const input = page.getByPlaceholder('Número de boleta o cliente')
    // Se escribe un termino, se borra entero y se escribe otro sin pausas: si
    // una respuesta vieja pisara a la nueva, la lista mostraria lo que ya no
    // esta escrito.
    await input.pressSequentially('Zbolcli', { delay: 20 })
    await input.fill('')
    await input.pressSequentially(nombre, { delay: 20 })
    await page.waitForTimeout(1500)

    await expect(input).toHaveValue(nombre)
    await expect(
      page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }),
    ).toBeVisible()
  })
})

test.describe('Del detalle de una boleta a la ficha del cliente (D-101)', () => {
  test('toda la fila del cliente es pulsable y lleva a su ficha', async ({ page }) => {
    const nombre = unique(`${PREFIJO} Navegable`)
    const { clientId, numeros } = await clienteConBoletas(nombre, 1)
    const n = numeros[0]!

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, nombre)
    await page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }).click()
    await page.waitForURL(/\/seller\/tickets\/[0-9a-f-]+$/)

    const fila = filaDelCliente(page, nombre)
    await expect(fila).toBeVisible()
    // El telefono viaja con el nombre: es el dato que se busca al abrir la
    // ficha, y verlo aqui ahorra el viaje.
    await expect(fila).toContainText('3005550000')

    // Se pulsa lejos del texto —en el borde derecho, donde esta la flecha—
    // para comprobar que la diana es la fila entera, no solo el nombre.
    const caja = (await fila.boundingBox())!
    await page.mouse.click(caja.x + caja.width - 16, caja.y + caja.height / 2)

    await page.waitForURL(`**/seller/clients/${clientId}`)
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible()
    // Es la ficha de siempre, con sus mismas tarjetas.
    await expect(page.getByText('Boletas compradas')).toBeVisible()
    await expect(page.getByText('Saldo pendiente')).toBeVisible()
  })

  test('volver desde la ficha regresa a la boleta, y de ahí a la búsqueda', async ({ page }) => {
    const nombre = unique(`${PREFIJO} Vuelta`)
    const { numeros } = await clienteConBoletas(nombre, 1)
    const n = numeros[0]!

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, nombre)
    const listUrl = page.url()

    await page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }).click()
    await page.waitForURL(/\/seller\/tickets\/[0-9a-f-]+$/)
    const ticketUrl = page.url()

    await filaDelCliente(page, nombre).click()
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)

    // Un solo patron de vuelta: la flecha del encabezado, sin botones grandes.
    await expect(page.getByRole('link', { name: /Volver a/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL(ticketUrl)

    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL(listUrl)
    // El termino buscado sigue ahi: no hay que volver a escribirlo.
    await expect(page.getByPlaceholder('Número de boleta o cliente')).toHaveValue(nombre)
  })

  test('una boleta sin cliente no ofrece ninguna navegación', async ({ page }) => {
    const numeros = randomTicketNumbers()
    const svc = serviceClient()
    const { data, error } = await svc
      .from('tickets')
      .insert({
        organization_id: refs.organizationId,
        raffle_id: refs.raffleId,
        seller_id: refs.sellerId,
        daily_number: numeros.daily,
        weekly_number: numeros.weekly,
        inventory_status: 'available',
        created_by: refs.ownerId,
      })
      .select('id')
      .single()
    if (error) throw error
    boletasCreadas.push(data.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${data.id}`)

    await expect(page.getByText('Todavía no la has vendido.')).toBeVisible()
    // Sin cliente no hay ficha a la que ir: el hueco existe y no es pulsable.
    await expect(page.locator('a[href*="/seller/clients/"]')).toHaveCount(0)
  })

  test('el mismo camino existe en el portal administrativo, hacia SU ficha', async ({ page }) => {
    const nombre = unique(`${PREFIJO} Admin`)
    const { clientId, numeros } = await clienteConBoletas(nombre, 1)
    const n = numeros[0]!

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')
    await buscar(page, nombre)
    await page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }).click()
    await page.waitForURL(/\/owner\/tickets\/[0-9a-f-]+$/)

    await filaDelCliente(page, nombre).click()
    await page.waitForURL(`**/owner/clients/${clientId}`)
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible()
  })

  test('en el teléfono la fila del cliente es una diana cómoda', async ({ page }) => {
    const nombre = unique(`${PREFIJO} Movil`)
    const { numeros } = await clienteConBoletas(nombre, 1)
    const n = numeros[0]!

    await page.setViewportSize({ width: 360, height: 740 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, nombre)
    await page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }).click()
    await page.waitForURL(/\/seller\/tickets\/[0-9a-f-]+$/)

    const fila = filaDelCliente(page, nombre)
    const caja = (await fila.boundingBox())!
    // El minimo recomendado para tocar con el dedo son 44 px de alto.
    expect(caja.height).toBeGreaterThanOrEqual(44)
    // Y ocupa el ancho de la tarjeta, no solo lo que mide el nombre.
    expect(caja.width).toBeGreaterThan(200)
  })

  test('con el teclado, la fila del cliente recibe el foco y se abre con Enter', async ({
    page,
  }) => {
    const nombre = unique(`${PREFIJO} Teclado`)
    const { clientId, numeros } = await clienteConBoletas(nombre, 1)
    const n = numeros[0]!

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await buscar(page, nombre)
    await page.getByRole('link', { name: `Ver la boleta ${n.daily} / ${n.weekly}` }).click()
    await page.waitForURL(/\/seller\/tickets\/[0-9a-f-]+$/)

    const fila = filaDelCliente(page, nombre)
    await fila.focus()
    await expect(fila).toBeFocused()
    await page.keyboard.press('Enter')
    await page.waitForURL(`**/seller/clients/${clientId}`)
  })
})
