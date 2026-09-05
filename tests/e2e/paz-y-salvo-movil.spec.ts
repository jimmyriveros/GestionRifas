import { expect, test } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  purgeTestData,
  raffleTicketPrice,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * El paz y salvo en el viewport del telefono (Pixel 7).
 *
 * Escritorio vive en `paz-y-salvo.spec.ts`. Aqui se comprueba lo que solo se
 * puede comprobar con un ancho de verdad: que el interruptor tiene 44 px de
 * diana, que a 320 px no se desborda nada, que el indicador de la tarjeta NO
 * anade una linea a la lista, y que navegar, seleccionar y la pulsacion larga
 * siguen funcionando igual que antes.
 */

let refs: SeedRefs
let PRICE: number

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

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

test.afterAll(async () => {
  await purgeTestData({ clientIds: clientesCreados, ticketIds: ticketsCreados })
})

/**
 * Toca el interruptor y espera al dato AUTORITATIVO.
 *
 * «Entregado el …» solo se pinta con la fecha que devolvio el servidor —la
 * suposicion optimista no tiene hora—, asi que esperar a esa linea es lo unico
 * que garantiza que la escritura ya ocurrio. Sin esto, una lectura de la base
 * inmediatamente despues corre contra la peticion y sale `null`.
 */
async function entregar(page: import('@playwright/test').Page) {
  await page.getByRole('switch', { name: 'Entrega del paz y salvo' }).tap()
  await expect(page.getByText(/^Entregado el /)).toBeVisible()
}

/** Mantiene pulsada la tarjeta el tiempo suficiente para el atajo (D-085). */
async function pulsacionLarga(
  page: import('@playwright/test').Page,
  tarjeta: import('@playwright/test').Locator,
) {
  await tarjeta.scrollIntoViewIfNeeded()
  const box = await tarjeta.boundingBox()
  if (!box) throw new Error('La tarjeta no está visible')
  const init = {
    pointerType: 'touch',
    isPrimary: true,
    clientX: box.x + box.width * 0.62,
    clientY: box.y + box.height / 2,
  }
  await tarjeta.dispatchEvent('pointerdown', init)
  await page.waitForTimeout(700)
  await tarjeta.dispatchEvent('pointerup', init)
}

test.describe('Paz y salvo en el telefono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('el interruptor mide 44 px de diana y se toca con el dedo', async ({ page }) => {
    const cliente = await clienteDe('Movil paz y salvo')
    const ticket = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${ticket.id}`)

    // La DIANA es la etiqueta que lo envuelve, no el dibujo del interruptor:
    // el dibujo mide unos 20 px a proposito, y quien apunta con el dedo tiene
    // que poder fallar por 12 px sin consecuencias. Se localiza por su
    // `data-slot` y no por su texto: la etiqueta NO repite el titulo —el nombre
    // accesible sale del titulo visible, por `aria-labelledby`—, justo para no
    // tener la misma frase dos veces en la pantalla.
    const diana = page.locator('[data-slot="clearance-switch-target"]')
    const caja = await diana.boundingBox()
    expect(caja).not.toBeNull()
    expect(caja!.width).toBeGreaterThanOrEqual(44)
    expect(caja!.height).toBeGreaterThanOrEqual(44)

    await diana.tap()
    await expect(page.getByText('Paz y salvo entregado')).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Entrega del paz y salvo' })).toBeChecked()
    await expect(page.getByText(/^Entregado el /)).toBeVisible()

    const { data } = await serviceClient()
      .from('tickets')
      .select('clearance_receipt_delivered_at, clearance_receipt_assumed_delivered, paid_amount')
      .eq('id', ticket.id)
      .single()
    expect(data!.clearance_receipt_delivered_at).not.toBeNull()
    expect(data!.clearance_receipt_assumed_delivered).toBe(false)
    expect(data!.paid_amount).toBe(0)
  })

  test('a 320 px no se desborda nada, ni en el detalle ni en la lista', async ({ page }) => {
    const cliente = await clienteDe('Movil paz y salvo estrecho')
    const ticket = await ticketOf(cliente.id)

    await page.setViewportSize({ width: 320, height: 720 })

    await page.goto(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText('Entrega del paz y salvo')).toBeVisible()
    const detalle = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(detalle, 'el detalle no se desplaza de lado a 320 px').toBeLessThanOrEqual(0)

    await entregar(page)
    const conFecha = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(conFecha, 'la fecha entera cabe a 320 px').toBeLessThanOrEqual(0)

    await page.goto(`/seller/tickets?q=${ticket.daily}`)
    await expect(page.getByText('Entregado').first()).toBeVisible()
    const lista = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(lista, 'la lista no se desplaza de lado a 320 px').toBeLessThanOrEqual(0)
  })

  test('el indicador NO hace mas alta la tarjeta de la lista', async ({ page }) => {
    const cliente = await clienteDe('Movil paz y salvo altura')
    const entregada = await ticketOf(cliente.id)
    const pendiente = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${entregada.id}`)
    await entregar(page)

    await page.goto(`/seller/tickets?q=${encodeURIComponent(cliente.name)}`)
    const tarjetas = page.getByRole('list', { name: 'Boletas' }).getByRole('listitem')
    await expect(tarjetas).toHaveCount(2)

    // Las dos boletas son idénticas salvo por el paz y salvo: si el indicador
    // añadiera una línea, una mediría al menos 16 px más que la otra. Se tolera
    // 1 px de redondeo del navegador; lo que se afirma es que NO hay línea nueva.
    const alturas = await tarjetas.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().height),
    )
    expect(Math.abs(alturas[0]! - alturas[1]!)).toBeLessThan(2)

    // Y las dos palabras se leen, cada una en su tarjeta.
    await expect(tarjetas.getByText('Entregado', { exact: true })).toHaveCount(1)
    await expect(tarjetas.getByText('Por entregar', { exact: true })).toHaveCount(1)
    // El término completo sigue anunciándose, aunque no se pinte entero.
    await expect(tarjetas.getByText('Paz y salvo entregado')).toHaveCount(1)
    await expect(tarjetas.getByText('Paz y salvo por entregar')).toHaveCount(1)

    // La otra sigue pendiente: mirar la lista no cambia nada.
    const { data } = await serviceClient()
      .from('tickets')
      .select('clearance_receipt_delivered_at')
      .eq('id', pendiente.id)
      .single()
    expect(data!.clearance_receipt_delivered_at).toBeNull()
  })

  test('navegar, seleccionar y la pulsacion larga siguen intactas', async ({ page }) => {
    const cliente = await clienteDe('Movil paz y salvo gestos')
    const ticket = await ticketOf(cliente.id)

    await page.goto(`/seller/tickets/${ticket.id}`)
    await entregar(page)

    await page.goto(`/seller/tickets?q=${ticket.daily}`)
    const tarjeta = page.getByRole('list', { name: 'Boletas' }).getByRole('listitem').first()
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta.getByText('Entregado', { exact: true })).toBeVisible()

    // 1. PULSACION LARGA: entra en modo seleccion con esta boleta marcada. Es el
    //    mismo gesto que ya prueba `seleccion-movil.spec.ts`: `touchscreen.tap`
    //    no sirve —no mantiene el dedo— y con raton el atajo no se dispara, a
    //    proposito (D-085).
    await pulsacionLarga(page, tarjeta)
    const casilla = tarjeta.getByRole('checkbox').first()
    await expect(casilla).toBeVisible()
    await expect(casilla).toBeChecked()
    // Y el indicador se sigue leyendo dentro del modo seleccion.
    await expect(tarjeta.getByText('Entregado', { exact: true })).toBeVisible()

    // 2. Salir del modo seleccion devuelve la lista a como estaba, con el
    //    indicador puesto.
    await page.getByRole('button', { name: 'Cancelar' }).tap()
    await expect(tarjeta.getByRole('checkbox')).toHaveCount(0)
    await expect(tarjeta.getByText('Entregado', { exact: true })).toBeVisible()

    // 3. Y tocar la tarjeta sigue abriendo el detalle.
    //
    //    Se recarga primero, y no es un parche: la pulsacion larga de arriba se
    //    simula con `dispatchEvent`, que NO produce el `click` que el navegador
    //    emite de verdad despues de un dedo. Ese `click` es el que consume la
    //    marca de «este clic ya lo gasto la pulsacion larga» (`useLongPress`),
    //    asi que sin el la marca se queda puesta y se comeria el toque
    //    siguiente. Con un dedo real no pasa; es artefacto del gesto sintetico.
    await page.reload()
    await expect(tarjeta).toBeVisible()
    await tarjeta.tap()
    await expect(page).toHaveURL(new RegExp(`/seller/tickets/${ticket.id}$`))
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
  })
})
