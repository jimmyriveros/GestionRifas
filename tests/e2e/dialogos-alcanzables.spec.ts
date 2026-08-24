import { expect, test, type Locator, type Page } from '@playwright/test'

import { createClientFor, createTicket, loadSeedRefs, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, toggleCheckbox, unique } from './fixtures'

/**
 * Los botones de un diálogo se pueden pulsar SIEMPRE (D-099).
 *
 * Esta suite existe por un defecto real: `DialogContent` no acotaba su alto, así
 * que un diálogo alto crecía más que la ventana y su pie —donde viven confirmar
 * y cancelar— quedaba fuera de la pantalla. Visible, habilitado y **imposible de
 * pulsar**, porque sin `overflow` tampoco había nada que desplazar.
 *
 * Lo que se comprueba NO es que el diálogo sea bajito: es que su última acción se
 * puede alcanzar, desplazando dentro del diálogo si hace falta. Ahí está la
 * diferencia entre el antes y el después, y por eso `scrollIntoViewIfNeeded()`
 * es el corazón de la comprobación: en el diseño roto no tenía a dónde
 * desplazar.
 *
 * SE EJECUTA EN DOS TAMAÑOS, y no por gusto: el fallo depende del **alto** de la
 * ventana, así que una pantalla corta lo destapa mucho antes que una grande. No
 * se usa el proyecto `movil` de Playwright porque solo recoge los archivos
 * `*-movil` y `*responsive`, y estos escenarios no son de emulación táctil sino
 * de geometría: basta con fijar el viewport.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/**
 * El diálogo cabe y su acción final es alcanzable.
 *
 * Dos afirmaciones distintas y las dos necesarias:
 *   1. La caja del diálogo no sobresale de la ventana.
 *   2. Su última acción entra en la ventana tras desplazar dentro del diálogo.
 */
async function esperarDialogoUsable(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible()

  const caja = await dialog.boundingBox()
  const ventana = page.viewportSize()!

  expect(caja, 'el diálogo debe tener caja').not.toBeNull()
  expect(caja!.y, 'el diálogo no puede empezar por encima de la ventana').toBeGreaterThanOrEqual(-1)
  expect(
    caja!.y + caja!.height,
    'el diálogo no puede terminar por debajo de la ventana',
  ).toBeLessThanOrEqual(ventana.height + 1)

  // El último botón del diálogo: en esta aplicación siempre es la acción
  // principal, porque el pie ordena «Cancelar» y luego la acción (Anexo C).
  const ultimo = dialog.getByRole('button').last()
  await ultimo.scrollIntoViewIfNeeded()
  await expect(ultimo, 'la acción final del diálogo debe poder pulsarse').toBeInViewport()
}

/** Los mismos cuatro escenarios, para el tamaño de ventana que se le pase. */
function escenarios() {
  test('vender una boleta: el diálogo de asignación es usable', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })
    await createClientFor(refs, unique('Comprador dialogo'))

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    await esperarDialogoUsable(page, page.getByRole('dialog'))
  })

  /**
   * El caso que se rompió de verdad: el modal más alto de la aplicación
   * —resumen, lista de números, precio, buscador y lista de clientes—.
   */
  test('vender VARIAS boletas: el modal más alto sigue siendo usable', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      const numbers = randomTicketNumbers()
      await createTicket(refs, {
        dailyNumber: numbers.daily,
        weeklyNumber: numbers.weekly,
        inventoryStatus: 'available',
      })
    }
    await createClientFor(refs, unique('Comprador multiple'))

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets?inventoryStatus=available')

    // Bajo 768 px las casillas están ocultas hasta entrar en modo selección
    // (D-082); por encima ya están a la vista. El reintento cubre el hueco
    // entre que el HTML está pintado y React lo hidrata (TESTING §5.3).
    const estrecha = (page.viewportSize()?.width ?? 0) < 768
    if (estrecha) {
      const entrar = page.getByRole('button', { name: 'Seleccionar varias', exact: true })
      await expect(async () => {
        await entrar.click()
        await expect(page.getByRole('checkbox').first()).toBeVisible({ timeout: 1500 })
      }).toPass({ timeout: 20_000 })
    }

    const casillas = page.getByRole('checkbox')
    await expect(casillas.first()).toBeVisible()
    for (let i = 0; i < 3; i++) await toggleCheckbox(casillas.nth(i), true)

    await page.getByRole('button', { name: /Asignar a un cliente/ }).click()

    await esperarDialogoUsable(page, page.getByRole('dialog'))
  })

  test('crear un vendedor: el formulario del diálogo es usable', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/users')
    await page
      .getByRole('button', { name: /Nuevo|Invitar|Crear/ })
      .first()
      .click()

    await esperarDialogoUsable(page, page.getByRole('dialog'))
  })

  test('importar boletas: el diálogo más ancho es usable', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    // El importador vive en la carga masiva, no en el listado.
    await page.goto('/owner/tickets/bulk')
    await page.getByRole('button', { name: 'Importar archivo' }).click()

    await esperarDialogoUsable(page, page.getByRole('dialog'))
  })
}

test.describe('Los diálogos son usables en una pantalla de escritorio', () => {
  test.use({ viewport: { width: 1280, height: 720 } })
  escenarios()
})

test.describe('Los diálogos son usables en una pantalla pequeña', () => {
  // Corta a propósito: el defecto depende del ALTO, y 620 px es lo que deja un
  // teléfono modesto con la barra del navegador desplegada.
  test.use({ viewport: { width: 390, height: 620 } })
  escenarios()
})
