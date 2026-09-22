import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Prueba 15 de la Fase 3: responsive basico.
 *
 * Se ejecuta solo en el proyecto «movil» (Pixel 7) de playwright.config.ts.
 * Comprueba lo que de verdad rompe la experiencia en un telefono: navegacion
 * accesible con el pulgar y ausencia de scroll horizontal en la pagina.
 */

test.describe('Portal administrativo en movil', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  // El detalle de la barra inferior —cuantas opciones, cual queda marcada,
  // que no tapa nada— vive en `navegacion-movil.spec.ts` (D-106). Aqui solo se
  // comprueba que desde el panel se llega a otro modulo con el pulgar.
  test('la navegacion se hace desde la barra inferior', async ({ page }) => {
    await page.goto('/owner/dashboard')

    // La barra lateral esta oculta bajo `md`; lo que se ve es la de abajo.
    await expect(page.locator('[data-tour="nav-sidebar"]')).toBeHidden()

    const barra = page.getByRole('navigation', { name: 'Navegación principal' })
    await expect(barra).toBeVisible()

    await barra.getByRole('link', { name: 'Boletas', exact: true }).tap()
    await page.waitForURL(/\/owner\/tickets/)
    await expect(page.getByRole('heading', { name: 'Boletas' })).toBeVisible()
  })

  test('ninguna pantalla desborda horizontalmente', async ({ page }) => {
    for (const path of [
      '/owner/dashboard',
      '/owner/raffles',
      '/owner/tickets',
      '/owner/sellers',
      // `/owner/clients` ya no existe (D-198); «Reportes» ocupa su sitio.
      '/owner/reports',
      '/owner/users',
      '/owner/tickets/bulk',
    ]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      // Un par de pixeles de holgura por redondeo de subpixeles.
      expect(overflow, `desbordamiento horizontal en ${path}`).toBeLessThanOrEqual(2)
    }
  })

  // «En el teléfono los clientes son tarjetas» vivía aquí, sobre `/owner/clients`.
  // Desde D-198 esa lista no existe en el portal administrativo: la del vendedor
  // la comprueba `clientes-movil.spec.ts`, y `privacidad-admin-movil.spec.ts`
  // comprueba que la dirección antigua ya no responde.

  test('en el telefono las boletas son tarjetas, no una tabla encogida', async ({ page }) => {
    await page.goto('/owner/tickets')

    // La tabla existe en el DOM pero Tailwind la oculta bajo `md` (D-107): lo
    // que se ve es la lista de tarjetas, y con ella deja de haber encabezados.
    const lista = page.getByRole('list', { name: 'Boletas' })
    await expect(lista).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Boleta', exact: true })).toBeHidden()

    // Y no se pierde nada de lo que la tabla enseña en escritorio: los dos
    // numeros, el vendedor y los dos estados. Desde D-198 ninguna de las dos
    // trae cliente ni precio, y la tarjeta tampoco inventa «Sin cliente».
    const tarjeta = lista.getByRole('listitem').first()
    await expect(tarjeta.getByRole('link', { name: /Ver la boleta/ })).toBeVisible()
    await expect(tarjeta).toContainText('Diario · Semanal')
    await expect(tarjeta).not.toContainText('Sin cliente')
  })

  test('el formulario de boleta es usable con teclado numerico', async ({ page }) => {
    await page.goto('/owner/tickets/new')

    const daily = page.getByLabel('Número diario')
    await expect(daily).toHaveAttribute('inputmode', 'numeric')
    await daily.fill('0007')
    await expect(daily).toHaveValue('0007')
  })
})

/**
 * La rejilla de creación masiva EN EL TELÉFONO (cierre de D-211).
 *
 * El bloque 1 tocó dos cosas de esta pantalla —el aviso de la cantidad y la
 * confirmación al regenerar— y las dos se habían comprobado solo en escritorio.
 * Aquí se comprueba que en un teléfono se ven, caben y se pueden usar.
 *
 * No guarda nada: genera filas, escribe en una y mira la pantalla.
 */
test.describe('Creación masiva en el teléfono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets/bulk')
    await page.getByLabel('Rifa').tap()
    await page.getByRole('option', { name: /Rifa Navidad 2026/ }).tap()
  })

  test('el aviso de la cantidad se lee y la pantalla no desborda', async ({ page }) => {
    const cantidad = page.getByLabel(/Cantidad/)
    await cantidad.fill('5000')

    const aviso = page.getByText('Puedes generar hasta 1000 boletas por lote.')
    await expect(aviso).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generar filas' })).toBeDisabled()
    await expect(cantidad).toHaveValue('5000')

    // El aviso entra en el ancho del teléfono y la página no se va de lado.
    const caja = await aviso.boundingBox()
    const ancho = page.viewportSize()!.width
    expect(caja!.x).toBeGreaterThanOrEqual(0)
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(ancho)
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(desborde).toBe(false)
  })

  test('la confirmación de regenerar cabe en la pantalla y sus botones se tocan', async ({
    page,
  }) => {
    await page.getByLabel(/Cantidad/).fill('3')
    await page.getByRole('button', { name: 'Generar filas' }).tap()
    await page.getByLabel('Número diario de la fila 1', { exact: true }).fill('1234')

    await page.getByRole('button', { name: 'Generar filas' }).tap()

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo).toBeVisible()
    await expect(dialogo).toContainText('Escribiste números en 1 fila.')

    /*
      MEDIR DESPUÉS DE `zoom-in-95`, como ya hace `formularios-alineacion`.
      Sin esperar a que termine la animación de apertura, el botón se mide
      escalado y da 42,29 px en vez de 44: no es un defecto del producto, es la
      medida tomada a mitad del zoom. Misma trampa que I-150.
    */
    await dialogo.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))),
    )

    // Los dos botones caben dentro del viewport y llegan a los 44 px de alto.
    const alto = page.viewportSize()!.height
    for (const nombre of ['Cancelar', 'Generar de nuevo']) {
      const caja = await dialogo.getByRole('button', { name: nombre }).boundingBox()
      expect(caja!.y).toBeGreaterThanOrEqual(0)
      expect(caja!.y + caja!.height).toBeLessThanOrEqual(alto)
      expect(caja!.height).toBeGreaterThanOrEqual(44)
    }

    // Cancelar con el dedo conserva lo escrito.
    await dialogo.getByRole('button', { name: 'Cancelar' }).tap()
    await expect(dialogo).toBeHidden()
    await expect(page.getByLabel('Número diario de la fila 1', { exact: true })).toHaveValue('1234')
  })
})
