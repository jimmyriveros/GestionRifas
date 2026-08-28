import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Barra lateral que se cierra sola cuando no cabe (D-131).
 *
 * Corre en el proyecto `escritorio`. Cada prueba fija su propio ancho de
 * ventana porque el ancho ES lo que se esta probando: los 1.280 px del proyecto
 * no valen para las dos orillas del punto de corte.
 *
 * ANCHOS QUE SE USAN Y POR QUE:
 *   1.600  ancho amplio. La barra llega a su maximo, 232 px.
 *   1.360  el punto exacto en el que todavia cabe abierta, y por tanto donde
 *          las etiquetas mas largas estan mas apretadas: 208 px.
 *   1.100  ancho intermedio, el de la segunda captura del encargo. Aqui la
 *          barra tiene que estar en modo iconos aunque nadie la haya cerrado.
 */

const ABIERTA_MAX = 232
const ABIERTA_MIN = 208
const CERRADA = 56

async function anchoDeLaBarra(page: Page): Promise<number> {
  const caja = await page.locator('[data-tour="nav-sidebar"]').boundingBox()
  return Math.round(caja?.width ?? 0)
}

async function anchoDeLaTabla(page: Page): Promise<number> {
  const caja = await page.locator('[data-tour="data-table"]').first().boundingBox()
  return Math.round(caja?.width ?? 0)
}

/**
 * Espera a que la barra termine de moverse. La anchura se anima 200 ms, asi que
 * medir justo despues de un clic o de un cambio de ventana daria el valor
 * anterior.
 */
async function esperarAncho(page: Page, esperado: number): Promise<void> {
  await expect
    .poll(() => anchoDeLaBarra(page), { timeout: 5_000 })
    .toBeGreaterThanOrEqual(esperado - 2)
  await expect.poll(() => anchoDeLaBarra(page)).toBeLessThanOrEqual(esperado + 2)
}

test.describe('Menú lateral en escritorio', () => {
  test.use({ viewport: { width: 1600, height: 900 } })

  test('en una ventana amplia se ve abierta, con su nombre y su botón', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)

    const lateral = page.locator('[data-tour="nav-sidebar"]')
    await esperarAncho(page, ABIERTA_MAX)

    // Las ocho entradas del portal administrativo, con su nombre a la vista.
    for (const nombre of [
      'Panel',
      'Rifas',
      'Boletas',
      'Vendedores',
      'Clientes',
      'Pagos',
      'Reportes',
      'Administradores',
    ]) {
      await expect(lateral.getByRole('link', { name: nombre, exact: true })).toBeVisible()
    }

    const boton = lateral.getByRole('button', { name: 'Cerrar el menú' })
    await expect(boton).toBeVisible()
    await expect(boton).toHaveAttribute('aria-expanded', 'true')
  })

  /**
   * Lo que pedia el encargo: al cerrarla, el sitio que suelta se lo queda el
   * contenido. Se mide sobre la tabla de boletas, que es la que se comprimia.
   */
  test('cerrarla deja solo los iconos y le da ese ancho a la tabla', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')

    const anchoAntes = await anchoDeLaTabla(page)

    await page.getByRole('button', { name: 'Cerrar el menú' }).click()
    await esperarAncho(page, CERRADA)

    // El nombre sigue siendo el nombre del enlace aunque ya no se lea: es
    // `sr-only`, no se ha borrado del HTML.
    const lateral = page.locator('[data-tour="nav-sidebar"]')
    await expect(lateral.getByRole('link', { name: 'Boletas', exact: true })).toHaveAttribute(
      'href',
      '/owner/tickets',
    )
    await expect(lateral.locator('a[aria-current="page"]')).toHaveText(/Boletas/)

    await expect.poll(() => anchoDeLaTabla(page)).toBeGreaterThan(anchoAntes + 150)
  })

  test('sigue cerrada al cambiar de pantalla y en la siguiente visita', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.getByRole('button', { name: 'Cerrar el menú' }).click()
    await esperarAncho(page, CERRADA)

    // Navegacion normal, por el propio menu.
    await page.locator('[data-tour="nav-sidebar"]').getByRole('link', { name: 'Pagos' }).click()
    await page.waitForURL(/\/owner\/payments/)
    await esperarAncho(page, CERRADA)

    // Y una carga completa: la preferencia viaja en una cookie, asi que el HTML
    // del servidor ya sale cerrado y no hay parpadeo.
    await page.reload()
    await esperarAncho(page, CERRADA)

    // Volver a abrirla con el mismo boton, que ahora ofrece lo contrario.
    await page.getByRole('button', { name: 'Abrir el menú' }).click()
    await esperarAncho(page, ABIERTA_MAX)
  })

  test('con la barra cerrada, cada icono dice su nombre al pasar por encima', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.getByRole('button', { name: 'Cerrar el menú' }).click()
    await esperarAncho(page, CERRADA)

    const lateral = page.locator('[data-tour="nav-sidebar"]')
    await lateral.getByRole('link', { name: 'Vendedores', exact: true }).hover()
    await expect(page.getByRole('tooltip', { name: 'Vendedores' })).toBeVisible()
  })

  /**
   * El teclado tiene que llegar al boton y a los enlaces, y el globo debe
   * aparecer tambien con el foco: quien navega con teclado no pasa el raton por
   * encima de nada.
   */
  test('se maneja con el teclado y el globo aparece con el foco', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.getByRole('button', { name: 'Cerrar el menú' }).click()
    await esperarAncho(page, CERRADA)

    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Panel', exact: true })).toBeFocused()
    await expect(page.getByRole('tooltip', { name: 'Panel' })).toBeVisible()

    await page.keyboard.press('Enter')
    await page.waitForURL(/\/owner\/dashboard/)
  })
})

test.describe('Menú lateral al cambiar el ancho de la ventana', () => {
  test.use({ viewport: { width: 1600, height: 900 } })

  /**
   * El caso que origino el encargo: se estrecha la ventana y la barra deja de
   * quitarle sitio a la tabla. Y al revés: se vuelve a ensanchar y la barra
   * vuelve a estar como la persona la habia dejado.
   */
  test('se cierra sola cuando deja de caber y vuelve a abrirse al haber sitio', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')
    await esperarAncho(page, ABIERTA_MAX)

    // Justo en el punto de corte todavia cabe abierta, en su ancho minimo.
    await page.setViewportSize({ width: 1360, height: 900 })
    await esperarAncho(page, ABIERTA_MIN)

    // Un pixel menos y se queda en iconos, sin que nadie la haya tocado.
    await page.setViewportSize({ width: 1100, height: 900 })
    await esperarAncho(page, CERRADA)

    await page.setViewportSize({ width: 1600, height: 900 })
    await esperarAncho(page, ABIERTA_MAX)
  })

  test('una barra cerrada a mano sigue cerrada aunque sobre sitio', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.getByRole('button', { name: 'Cerrar el menú' }).click()
    await esperarAncho(page, CERRADA)

    await page.setViewportSize({ width: 1100, height: 900 })
    await esperarAncho(page, CERRADA)

    // Al recuperar el ancho manda lo que eligio la persona, no el ancho.
    await page.setViewportSize({ width: 1600, height: 900 })
    await esperarAncho(page, CERRADA)
  })

  test('al volver a haber sitio, la barra recupera el ancho que le toca', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.setViewportSize({ width: 1100, height: 900 })
    await esperarAncho(page, CERRADA)

    await page.setViewportSize({ width: 1600, height: 900 })
    await esperarAncho(page, ABIERTA_MAX)
  })
})

/**
 * En un ancho donde no cabe abierta, el boton **si** la abre: encima del
 * contenido (D-132). Es lo contrario de lo que hacia hasta el 2026-08-28, cuando
 * se quedaba inerte con un globo que lo explicaba.
 *
 * Lo que hay que comprobar no es solo que se abra, sino las dos promesas que la
 * acompañan: que **no mueve el contenido** —que es el motivo de que flote— y que
 * **se cierra sola** por los cuatro caminos, sin dejar rastro en la preferencia.
 */
test.describe('Menú lateral flotante donde no cabe abierto', () => {
  test.use({ viewport: { width: 1100, height: 900 } })

  async function posicionDelContenido(page: Page) {
    const caja = await page.locator('main').boundingBox()
    return { x: Math.round(caja?.x ?? 0), ancho: Math.round(caja?.width ?? 0) }
  }

  const barra = (page: Page) => page.locator('[data-tour="nav-sidebar"]')
  const capa = (page: Page) => page.locator('div[aria-hidden].fixed.inset-0')

  test('se abre flotando y el contenido no se mueve ni un píxel', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')
    await esperarAncho(page, CERRADA)

    const antes = await posicionDelContenido(page)

    await page.getByRole('button', { name: 'Abrir el menú' }).click()
    await esperarAncho(page, ABIERTA_MIN)

    // Flota: fuera del flujo, pegada al borde y de alto completo.
    await expect(barra(page)).toHaveAttribute('data-sidebar-overlay', '')
    await expect(barra(page)).toHaveCSS('position', 'fixed')
    await expect(capa(page)).toBeVisible()

    // La promesa del encargo: el hueco de 56 px se queda en su sitio.
    expect(await posicionDelContenido(page)).toEqual(antes)

    // Y con los nombres a la vista, que es para lo que se abre.
    await expect(barra(page).getByText('Administradores', { exact: true })).toBeVisible()
  })

  test('elegir una opción del menú la cierra y navega', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.getByRole('button', { name: 'Abrir el menú' }).click()
    await esperarAncho(page, ABIERTA_MIN)

    await barra(page).getByRole('link', { name: 'Pagos', exact: true }).click()
    await page.waitForURL(/\/owner\/payments/)
    await esperarAncho(page, CERRADA)
    await expect(capa(page)).toBeHidden()
  })

  test('pulsar fuera la cierra, y con Escape también', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)

    await page.getByRole('button', { name: 'Abrir el menú' }).click()
    await esperarAncho(page, ABIERTA_MIN)
    await capa(page).click()
    await esperarAncho(page, CERRADA)

    await page.getByRole('button', { name: 'Abrir el menú' }).click()
    await esperarAncho(page, ABIERTA_MIN)
    await page.keyboard.press('Escape')
    await esperarAncho(page, CERRADA)
  })

  /**
   * Con el teclado: se abre con `Enter`, se recorre con el tabulador y, al salir
   * de ella, se cierra sola. Sin esto ultimo se tabularia hacia un contenido que
   * esta detras de la capa y no se deja pulsar.
   *
   * Es la unica rama que **no se puede comprobar sin una ventana con foco**: en
   * un panel sin foco, `focus()` mueve `document.activeElement` pero el navegador
   * no emite un solo evento de foco.
   */
  test('con el teclado se abre, se recorre y se cierra al salir de ella', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')

    await page.getByRole('button', { name: 'Abrir el menú' }).focus()
    await page.keyboard.press('Enter')
    await esperarAncho(page, ABIERTA_MIN)

    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Panel', exact: true })).toBeFocused()

    // Salir de la barra con el foco la cierra.
    await page.locator('main').getByRole('searchbox').first().focus()
    await esperarAncho(page, CERRADA)
  })

  test('flotar no cambia la preferencia guardada', async ({ page, context }) => {
    await loginAs(page, ACCOUNTS.owner)

    await page.getByRole('button', { name: 'Abrir el menú' }).click()
    await esperarAncho(page, ABIERTA_MIN)

    const galletas = await context.cookies()
    expect(galletas.find((c) => c.name === 'rifas.sidebar')).toBeUndefined()

    // Y al recuperar el ancho manda la preferencia de siempre, no la capa.
    await page.setViewportSize({ width: 1600, height: 900 })
    await esperarAncho(page, ABIERTA_MAX)
    await expect(barra(page)).not.toHaveAttribute('data-sidebar-overlay', '')
    await expect(capa(page)).toBeHidden()
  })
})

test.describe('Menú lateral del vendedor', () => {
  test.use({ viewport: { width: 1360, height: 900 } })

  /**
   * 1.360 px es el ancho mas apretado en el que la barra sigue abierta, asi que
   * es donde hay que comprobar que ningun nombre se parte en dos lineas ni se
   * recorta. Se mide sobre el portal del vendedor, y la etiqueta mas larga de
   * los dos portales —«Administradores»— la cubre la prueba de arriba.
   */
  test('ningún nombre se parte ni se recorta en el ancho mínimo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await esperarAncho(page, ABIERTA_MIN)

    const medidas = await page.evaluate(() =>
      [...document.querySelectorAll('[data-tour="nav-sidebar"] a')].map((link) => {
        const label = link.querySelector('[data-slot="sidebar-label"]') as HTMLElement
        return {
          texto: label.textContent ?? '',
          lineas: label.getClientRects().length,
          recorte: label.scrollWidth - label.clientWidth,
        }
      }),
    )

    expect(medidas.length).toBeGreaterThan(0)
    for (const medida of medidas) {
      expect(medida.lineas, `«${medida.texto}» ocupa mas de una linea`).toBe(1)
      expect(medida.recorte, `«${medida.texto}» sale recortado`).toBeLessThanOrEqual(0)
    }
  })

  test('la barra inferior del teléfono no aparece en escritorio', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeHidden()
  })
})
