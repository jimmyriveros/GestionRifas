import { expect, test, type Page } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  raffleTicketPrice,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * «Mis boletas» en un teléfono (D-107).
 *
 * Corre solo en el proyecto `movil` (Pixel 7). Comprueba las tres promesas del
 * rediseño, que son justo las que la tabla encogida incumplía:
 *
 *   1. No se pierde ningún dato. En la tabla, cliente, estado de pago y precio
 *      se ocultaban bajo `md`; en la tarjeta están los seis.
 *   2. Caben varias boletas por pantalla. Una tarjeta mide entre 90 y 120 px,
 *      así que se ve más de una sin desplazarse.
 *   3. Los filtros no se comen la pantalla antes del primer resultado: están
 *      detrás de un botón que dice cuántos hay puestos.
 *
 * Lo que NO se comprueba aquí porque ya tiene su sitio: la selección múltiple
 * con el dedo vive en `seleccion-movil.spec.ts`, y que la barra inferior no
 * tape el final de la lista, en `navegacion-movil.spec.ts`.
 */

let refs: SeedRefs

/** Boletas creadas por esta suite. Se borran al terminar (I-035). */
const creadas: string[] = []

function lista(page: Page) {
  return page.getByRole('list', { name: 'Boletas' })
}

function tarjetaDe(page: Page, ticketId: string) {
  return lista(page)
    .getByRole('listitem')
    .filter({ has: page.locator(`a[href$="${ticketId}"]`) })
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  if (creadas.length > 0) {
    await serviceClient().from('tickets').delete().in('id', creadas)
  }
})

test.describe('La lista de boletas en el teléfono', () => {
  test('una boleta vendida enseña sus seis datos en la tarjeta', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const cliente = await createClientFor(refs, unique('Compradora de la tarjeta'))
    const precio = await raffleTicketPrice(refs)
    // Se prepara ya vendida: lo que se prueba aquí es cómo se ve, no cómo se
    // asigna —eso vive en `seller-tickets.spec.ts`— (docs/TESTING.md §2.1).
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: precio,
    })
    creadas.push(ticket.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${numbers.daily}`)

    const tarjeta = tarjetaDe(page, ticket.id)
    await expect(tarjeta).toBeVisible()

    // Los dos números, con la leyenda que dice cuál es cuál.
    await expect(
      tarjeta.getByRole('link', { name: `Ver la boleta ${numbers.daily} / ${numbers.weekly}` }),
    ).toBeVisible()
    await expect(tarjeta).toContainText('Diario · Semanal')
    // El cliente, el precio y los dos estados: lo que la tabla escondía.
    await expect(tarjeta).toContainText(cliente.name)
    await expect(tarjeta).toContainText('$120.000')
    await expect(tarjeta).toContainText('Asignada')
    await expect(tarjeta).toContainText('Sin pagar')
  })

  test('caben varias boletas por pantalla y ninguna se sale a lo ancho', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await expect(lista(page)).toBeVisible()

    const tarjetas = lista(page).getByRole('listitem')
    expect(await tarjetas.count()).toBeGreaterThan(3)

    const ancho = page.viewportSize()!.width
    for (const indice of [0, 1, 2]) {
      const caja = (await tarjetas.nth(indice).boundingBox())!
      expect(caja.height, `alto de la tarjeta ${indice + 1}`).toBeGreaterThanOrEqual(80)
      expect(caja.height, `alto de la tarjeta ${indice + 1}`).toBeLessThanOrEqual(130)
      expect(caja.x + caja.width, `ancho de la tarjeta ${indice + 1}`).toBeLessThanOrEqual(
        ancho + 1,
      )
    }

    // Tres tarjetas seguidas caben en la mitad alta de un teléfono.
    const primera = (await tarjetas.first().boundingBox())!
    const tercera = (await tarjetas.nth(2).boundingBox())!
    expect(tercera.y + tercera.height - primera.y).toBeLessThanOrEqual(400)

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(2)
  })

  test('un nombre largo se recorta sin deformar la tarjeta', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const cliente = await createClientFor(
      refs,
      unique('María Fernanda del Socorro Restrepo Villalobos de la Hoz'),
    )
    const ticket = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: await raffleTicketPrice(refs),
    })
    creadas.push(ticket.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${numbers.daily}`)

    const tarjeta = tarjetaDe(page, ticket.id)
    await expect(tarjeta).toBeVisible()

    const caja = (await tarjeta.boundingBox())!
    expect(caja.height, 'un nombre largo no puede estirar la tarjeta').toBeLessThanOrEqual(130)
    expect(caja.x + caja.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(2)
  })
})

test.describe('Los filtros en el teléfono', () => {
  test('están detrás de un botón, y el botón dice cuántos hay puestos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')

    // El buscador siempre a la vista: es la forma normal de llegar a una boleta.
    await expect(page.getByPlaceholder('Número de boleta o cliente')).toBeVisible()
    // Los desplegables, no: existen en el DOM para escritorio, pero ocultos.
    await expect(page.getByRole('combobox', { name: 'Estado de la boleta' })).toHaveCount(0)

    await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toBeVisible()

    // Con dos filtros puestos, el botón lo dice sin tener que abrirlo.
    await page.goto('/seller/tickets?inventoryStatus=assigned&paymentStatus=partial')
    await expect(page.getByRole('button', { name: 'Filtros (2)' })).toBeVisible()
  })

  test('la hoja trae los mismos filtros y una salida para limpiarlos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets?inventoryStatus=assigned')
    await expect(lista(page)).toBeVisible()

    await page.getByRole('button', { name: 'Filtros (1)' }).tap()

    const hoja = page.getByRole('dialog')
    await expect(hoja).toBeVisible()
    await expect(hoja.getByRole('combobox', { name: 'Cliente' })).toBeVisible()
    await expect(hoja.getByRole('combobox', { name: 'Estado de la boleta' })).toBeVisible()
    await expect(hoja.getByRole('combobox', { name: 'Estado de pago' })).toBeVisible()

    // Cabe en la pantalla y deja ver parte de la lista detrás.
    const caja = (await hoja.boundingBox())!
    expect(caja.height).toBeLessThanOrEqual(page.viewportSize()!.height * 0.9)

    await hoja.getByRole('button', { name: 'Limpiar filtros' }).tap()
    await page.waitForURL('/seller/tickets')
    await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toBeVisible()
  })
})

/**
 * La paginación, tal como se ve en un teléfono (D-111).
 *
 * Vive aquí, con «Mis boletas», porque es la lista más larga de la aplicación y
 * la única donde pasar de página es rutina. El componente es compartido, así
 * que lo que se comprueba aquí vale para clientes, pagos y reportes.
 */
test.describe('La paginación en el teléfono', () => {
  test('dice qué cuenta y deja los dos botones al alcance del pulgar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await expect(lista(page)).toBeVisible()

    const ancho = page.viewportSize()!.width

    // 1. El recuento dice QUÉ se está contando, con el nombre del glosario.
    await expect(page.getByText(/^\d+–\d+ de \d+ boletas$/)).toBeVisible()

    // 2. «Página» se oye aunque no se vea: en la pantalla solo cabe «1 de 5»,
    //    pero un lector de pantalla sigue anunciando la palabra.
    const indicador = page.getByText(/^Página \d+ de \d+$/)
    await expect(indicador).toBeVisible()
    const palabra = (await indicador.locator('span').first().boundingBox())!
    expect(palabra.width).toBeLessThanOrEqual(1)

    // 3. Los dos botones, de 44 px, uno en cada margen y en la misma fila.
    const anterior = page.getByRole('button', { name: 'Anterior' })
    const siguiente = page.getByRole('button', { name: 'Siguiente' })
    const cajaAnterior = (await anterior.boundingBox())!
    const cajaSiguiente = (await siguiente.boundingBox())!
    expect(cajaAnterior.height).toBeGreaterThanOrEqual(44)
    expect(cajaSiguiente.height).toBeGreaterThanOrEqual(44)
    expect(Math.abs(cajaAnterior.y - cajaSiguiente.y)).toBeLessThan(1)
    expect(cajaAnterior.x).toBeLessThan(24)
    expect(cajaSiguiente.x + cajaSiguiente.width).toBeGreaterThan(ancho - 24)

    // Y el indicador, centrado en lo que queda entre los dos.
    const cajaIndicador = (await indicador.boundingBox())!
    const centroIndicador = cajaIndicador.x + cajaIndicador.width / 2
    const centroHueco = (cajaAnterior.x + cajaAnterior.width + cajaSiguiente.x) / 2
    expect(Math.abs(centroIndicador - centroHueco)).toBeLessThan(2)

    // 4. En la primera página «Anterior» NO se esconde: se deshabilita. Si
    //    desapareciera, «Siguiente» cambiaría de sitio bajo el dedo.
    await expect(anterior).toBeVisible()
    await expect(anterior).toBeDisabled()

    // 5. Y nada de esto se sale a lo ancho.
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBe(0)
  })
})
