import { expect, test, type Page } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  raffleTicketPrice,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * El detalle de una boleta en el telefono MAS ESTRECHO, con un cliente de
 * nombre largo. Regresion de **I-076**.
 *
 * POR QUE HACE FALTA OTRA PRUEBA SI YA HAY UNA DE DESBORDAMIENTO. La de
 * `seller-ciclo-movil.spec.ts` recorre cinco pantallas y ninguna desborda —y es
 * cierto—, pero le faltan las tres condiciones que hacen aparecer el fallo a la
 * vez:
 *
 *   1. una pantalla de DETALLE, no un listado;
 *   2. 320 px, no los 412 del Pixel 7 con el que corre el proyecto `movil`;
 *   3. un cliente con el NOMBRE LARGO.
 *
 * Con las tres, la unica columna de la rejilla —que era `auto`— se estiraba
 * hasta el minimo de su contenido. El nombre del cliente lleva `truncate`, o
 * sea `white-space: nowrap`, asi que su minimo es la frase entera: 341 px
 * dentro de una tarjeta de 286, arrastrando a los dos bloques hermanos y
 * dejando la pagina desplazable de lado.
 *
 * La prueba mira las dos cosas, y las dos importan: que la pagina no desborde,
 * y que el nombre este RECORTADO de verdad. Sin la segunda, un dia en que el
 * nombre cupiera de sobra la prueba pasaria sin comprobar nada.
 *
 * Se ejecuta en el proyecto `movil`, pero fija su propio ancho: 320 px es el
 * caso limite, no el habitual.
 */

const ANCHO_MINIMO = { width: 320, height: 800 }

/** Un nombre real, largo, y con un trozo que el navegador NO puede partir. */
const NOMBRE_LARGO = unique('María Fernanda Restrepo Villamizar de la Espriella')

let refs: SeedRefs
let ticketId: string

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  const cliente = await createClientFor(refs, NOMBRE_LARGO)
  const numeros = randomTicketNumbers()
  const ticket = await createAssignedTicket(refs, {
    dailyNumber: numeros.daily,
    weeklyNumber: numeros.weekly,
    clientId: cliente.id,
    salePrice: await raffleTicketPrice(refs),
  })
  ticketId = ticket.id
})

async function medir(page: Page, url: string) {
  await page.setViewportSize(ANCHO_MINIMO)
  await page.goto(url)

  // La tarjeta del cliente, no cualquier sitio donde aparezca su nombre: el
  // detalle del vendedor lo repite abajo, en «Asignada … a <cliente>».
  const tarjeta = page.locator('a[href*="/clients/"]').filter({ hasText: NOMBRE_LARGO })
  await expect(tarjeta).toBeVisible()

  return tarjeta.evaluate((enlace: HTMLElement, nombre: string) => {
    const raiz = document.documentElement
    const parrafo = [...enlace.querySelectorAll('p')].find((p) => p.textContent === nombre)!
    return {
      desbordamiento: raiz.scrollWidth - raiz.clientWidth,
      // `scrollWidth > clientWidth` en un `truncate` significa que sobra texto
      // y el navegador lo esta cortando con puntos suspensivos.
      recortado: parrafo.scrollWidth > parrafo.clientWidth,
    }
  }, NOMBRE_LARGO)
}

test.describe('El detalle de una boleta a 320 px (I-076)', () => {
  test('el portal del vendedor no desborda, y el nombre largo se recorta', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    const medida = await medir(page, `/seller/tickets/${ticketId}`)

    expect(medida.desbordamiento, 'desbordamiento horizontal a 320 px').toBeLessThanOrEqual(2)
    expect(medida.recortado, 'el nombre largo debe quedar recortado, no ensanchar la tarjeta').toBe(
      true,
    )
  })

  test('el portal administrativo tampoco, y tiene la misma rejilla', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    const medida = await medir(page, `/owner/tickets/${ticketId}`)

    expect(medida.desbordamiento, 'desbordamiento horizontal a 320 px').toBeLessThanOrEqual(2)
    expect(medida.recortado, 'el nombre largo debe quedar recortado, no ensanchar la tarjeta').toBe(
      true,
    )
  })
})
