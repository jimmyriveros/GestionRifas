import { expect, test, type Locator, type Page } from '@playwright/test'

import { createTicket, loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers } from './fixtures'

/**
 * Selección múltiple con el dedo (secciones 3 a 7, 14 y 46 del encargo).
 *
 * Corre con viewport de teléfono (proyecto `movil`, Pixel 7). Aquí se comprueba
 * justo lo que no se puede comprobar en escritorio:
 *
 *   * En modo normal, tocar una fila abre su detalle y no selecciona nada.
 *   * En modo selección, tocar CUALQUIER zona libre de la fila la marca, y la
 *     fila deja de abrir el detalle.
 *   * La casilla tiene una diana de 44 px aunque se vea de 20.
 *   * La barra de acciones se queda pegada abajo mientras se hace scroll.
 *   * Buscar no pierde la selección y «Cancelar» la limpia.
 */

let refs: SeedRefs

/** Boletas creadas por esta suite. Se borran al terminar (I-035). */
const creadas: string[] = []

async function nuevaBoleta(): Promise<{ id: string; daily: string; weekly: string }> {
  const numbers = randomTicketNumbers()
  const ticket = await createTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    inventoryStatus: 'available',
  })
  creadas.push(ticket.id)
  return { id: ticket.id, daily: numbers.daily, weekly: numbers.weekly }
}

function recuento(page: Page) {
  return page.getByRole('status')
}

function filaDe(page: Page, ticketId: string) {
  return page.getByRole('row').filter({ has: page.locator(`a[href$="${ticketId}"]`) })
}

/**
 * Toca la fila en una zona libre: ni la casilla ni el enlace del número.
 *
 * `locator.tap` con `position` y no `touchscreen.tap` con coordenadas de
 * pantalla: el primero desplaza la fila a la vista y espera a que sea
 * pulsable. Con el segundo, en cuanto la barra de selección empuja la tabla
 * hacia abajo, el toque cae fuera del viewport y se pierde en silencio.
 */
async function tocarFila(fila: Locator) {
  const box = await fila.boundingBox()
  if (!box) throw new Error('La fila no está visible')
  await fila.tap({ position: { x: box.width * 0.62, y: box.height / 2 } })
}

/**
 * Entra en modo selección, reintentando hasta que el toque surta efecto.
 *
 * Igual que `toggleCheckbox` en escritorio: entre que el HTML del servidor está
 * pintado y React lo hidrata hay un hueco en el que el toque no hace nada, y
 * sin reintentar la prueba culparía al producto de una carrera del arnés.
 */
async function activarModoSeleccion(page: Page) {
  const boton = page.getByRole('button', { name: 'Seleccionar', exact: true })
  await expect(async () => {
    await boton.tap()
    await expect(recuento(page)).toHaveText('Toca las boletas que quieras seleccionar.', {
      timeout: 1500,
    })
  }).toPass({ timeout: 20_000 })
}

/** Mantiene pulsada la fila el tiempo suficiente para el atajo (sección 5). */
async function pulsacionLarga(page: Page, fila: Locator) {
  await fila.scrollIntoViewIfNeeded()
  const box = await fila.boundingBox()
  if (!box) throw new Error('La fila no está visible')
  const init = {
    pointerType: 'touch',
    isPrimary: true,
    clientX: box.x + box.width * 0.62,
    clientY: box.y + box.height / 2,
  }

  await fila.dispatchEvent('pointerdown', init)
  await page.waitForTimeout(700)
  await fila.dispatchEvent('pointerup', init)
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  if (creadas.length > 0) {
    await serviceClient().from('tickets').delete().in('id', creadas)
  }
})

test.describe('Modo normal en el teléfono', () => {
  test('no hay casillas a la vista y tocar la fila abre el detalle', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    const fila = filaDe(page, boleta.id)
    await expect(fila).toBeVisible()

    // La columna de casillas existe en el DOM pero Tailwind la oculta bajo `md`.
    await expect(page.getByRole('checkbox')).toHaveCount(0)

    await tocarFila(fila)
    await page.waitForURL(`**/seller/tickets/${boleta.id}`)
  })
})

test.describe('Modo selección en el teléfono', () => {
  test('se entra con «Seleccionar» y la fila entera pasa a marcar', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    await expect(filaDe(page, boleta.id)).toBeVisible()

    await activarModoSeleccion(page)
    await expect(page.getByRole('checkbox').first()).toBeVisible()

    const fila = filaDe(page, boleta.id)
    await tocarFila(fila)
    await expect(recuento(page)).toHaveText('1 seleccionada')
    // No abrió el detalle.
    await expect(page).toHaveURL(new RegExp(`/seller/tickets\\?q=${boleta.daily}`))

    // Y volver a tocarla la desmarca.
    await tocarFila(fila)
    await expect(recuento(page)).toHaveText('Toca las boletas que quieras seleccionar.')
  })

  test('la casilla se ve de 20 px pero se toca en 44', async ({ page }) => {
    await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await expect(page.getByRole('columnheader', { name: 'Número diario' })).toBeVisible()
    await activarModoSeleccion(page)

    const casilla = page.getByRole('checkbox').nth(1)
    await expect(casilla).toBeVisible()

    const visual = await casilla.boundingBox()
    const diana = await casilla.evaluate((el) => {
      const box = el.parentElement!.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })

    expect(visual!.width).toBeGreaterThanOrEqual(20)
    expect(visual!.width).toBeLessThanOrEqual(24)
    expect(diana.width).toBeGreaterThanOrEqual(44)
    expect(diana.height).toBeGreaterThanOrEqual(44)
  })

  test('la pulsación larga entra en modo selección y marca esa boleta', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    const fila = filaDe(page, boleta.id)
    await expect(fila).toBeVisible()

    await pulsacionLarga(page, fila)

    await expect(recuento(page)).toHaveText('1 seleccionada')
    await expect(page).toHaveURL(new RegExp(`/seller/tickets\\?q=${boleta.daily}`))
  })

  test('la barra de acciones se queda abajo y sobrevive a la búsqueda', async ({ page }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${a.daily}`)
    await expect(filaDe(page, a.id)).toBeVisible()

    await activarModoSeleccion(page)
    await tocarFila(filaDe(page, a.id))
    await expect(recuento(page)).toHaveText('1 seleccionada')

    const barra = page.getByRole('button', { name: 'Asignar a un cliente' })
    await expect(barra).toBeVisible()

    // Buscar otra cosa: la anterior sigue contando (sección 11).
    await page.goto(`/seller/tickets?q=${b.daily}`)
    await expect(recuento(page)).toHaveText('1 seleccionada')
    await expect(page.getByRole('button', { name: 'Asignar a un cliente' })).toBeVisible()

    // Y la barra sigue pegada al borde inferior tras desplazarse.
    await page.mouse.wheel(0, 600)
    const caja = await page.getByRole('button', { name: 'Asignar a un cliente' }).boundingBox()
    const alto = page.viewportSize()!.height
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(alto)
    expect(caja!.y).toBeGreaterThan(alto / 2)
  })

  test('«Cancelar» sale del modo y limpia la selección', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    await expect(filaDe(page, boleta.id)).toBeVisible()

    await activarModoSeleccion(page)
    await tocarFila(filaDe(page, boleta.id))
    await expect(recuento(page)).toHaveText('1 seleccionada')

    await page.getByRole('button', { name: 'Cancelar' }).tap()
    await expect(recuento(page)).toHaveText('')
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    // Y la fila vuelve a abrir el detalle.
    await tocarFila(filaDe(page, boleta.id))
    await page.waitForURL(`**/seller/tickets/${boleta.id}`)
  })

  test('«Ver seleccionadas» deja solo las marcadas y conserva la búsqueda', async ({ page }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await expect(page.getByRole('columnheader', { name: 'Número diario' })).toBeVisible()

    await activarModoSeleccion(page)
    await tocarFila(filaDe(page, a.id))
    await tocarFila(filaDe(page, b.id))
    await expect(recuento(page)).toHaveText('2 seleccionadas')

    await page.getByRole('button', { name: 'Ver seleccionadas' }).tap()
    await expect(page.getByText('Estás viendo solo las boletas seleccionadas.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Ver la boleta/ })).toHaveCount(2)

    await page.getByRole('button', { name: 'Volver a los resultados' }).tap()
    await expect(recuento(page)).toHaveText('2 seleccionadas')
  })
})
