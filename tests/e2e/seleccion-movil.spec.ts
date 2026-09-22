import { expect, test, type Locator, type Page } from '@playwright/test'

import { createTicket, loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers } from './fixtures'

/**
 * Selección múltiple con el dedo (secciones 3 a 7, 14 y 46 del encargo).
 *
 * Corre con viewport de teléfono (proyecto `movil`, Pixel 7). Aquí se comprueba
 * justo lo que no se puede comprobar en escritorio:
 *
 *   * En modo normal, tocar una boleta abre su detalle y no selecciona nada.
 *   * En modo selección, tocar CUALQUIER zona libre de la boleta la marca, y
 *     deja de abrir el detalle.
 *   * La casilla tiene una diana de 44 px aunque se vea de 20.
 *   * La barra de acciones se queda pegada abajo mientras se hace scroll.
 *   * Buscar no pierde la selección y «Cancelar» la limpia.
 *
 * DESDE D-107 EN EL TELÉFONO NO HAY TABLA: cada boleta es una tarjeta de la
 * lista «Boletas». El comportamiento es el mismo —lo pone el mismo
 * `row-activation` y el mismo `useLongPress`—, pero el elemento ya no es una
 * fila, así que aquí se busca por `listitem` y no por `row`.
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

/** La lista de tarjetas del teléfono, que es lo que sustituyó a la tabla. */
function lista(page: Page) {
  return page.getByRole('list', { name: 'Boletas' })
}

/**
 * La tarjeta de una boleta, buscada POR SUS DOS NUMEROS y no por su enlace.
 *
 * Antes filtraba por `a[href$="<id>"]`, y eso dejo de servir en modo seleccion:
 * ahi los numeros ya no son un enlace (P1-A). No es una limitacion del arnes,
 * es el arreglo — mientras se selecciona, la tarjeta marca y no abre nada, asi
 * que no puede haber un `href` que se lleve el toque.
 *
 * Los dos numeros juntos son ademas como se nombra una boleta (BR-N11), y estan
 * a la vista en los dos modos, que es justo lo que necesita este localizador.
 */
function filaDe(page: Page, boleta: { daily: string; weekly: string }) {
  return lista(page)
    .getByRole('listitem')
    .filter({ hasText: `${boleta.daily} / ${boleta.weekly}` })
}

/**
 * Toca la tarjeta en una zona libre: ni la casilla ni el enlace del número.
 *
 * `locator.tap` con `position` y no `touchscreen.tap` con coordenadas de
 * pantalla: el primero desplaza la tarjeta a la vista y espera a que sea
 * pulsable. Con el segundo, en cuanto la barra de selección empuja la lista
 * hacia abajo, el toque cae fuera del viewport y se pierde en silencio.
 *
 * El 62 % del ancho a media altura cae sobre la leyenda «Diario · Semanal» o
 * sobre el nombre del cliente: texto suelto, sin enlace ni botón debajo.
 */
async function tocarFila(fila: Locator) {
  const box = await fila.boundingBox()
  if (!box) throw new Error('La boleta no está visible')
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
  const boton = page.getByRole('button', { name: 'Seleccionar varias', exact: true })
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
    const fila = filaDe(page, boleta)
    await expect(fila).toBeVisible()

    // Las tarjetas no llevan casilla hasta que se entra en modo selección. La
    // tabla de escritorio sí las tiene, pero Tailwind la oculta bajo `md` y con
    // ella salen del árbol de accesibilidad.
    await expect(page.getByRole('checkbox')).toHaveCount(0)

    await tocarFila(fila)
    await page.waitForURL(`**/seller/tickets/${boleta.id}`)
  })
})

test.describe('Modo selección en el teléfono', () => {
  test('se entra con «Seleccionar varias» y la fila entera pasa a marcar', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    await expect(filaDe(page, boleta)).toBeVisible()

    await activarModoSeleccion(page)
    await expect(page.getByRole('checkbox').first()).toBeVisible()

    const fila = filaDe(page, boleta)
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
    await expect(lista(page)).toBeVisible()
    await activarModoSeleccion(page)

    // La primera casilla es la de «toda esta página»; la segunda ya es de una
    // boleta, que es la que interesa medir.
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
    const fila = filaDe(page, boleta)
    await expect(fila).toBeVisible()

    await pulsacionLarga(page, fila)

    await expect(recuento(page)).toHaveText('1 seleccionada')
    await expect(page).toHaveURL(new RegExp(`/seller/tickets\\?q=${boleta.daily}`))
  })

  test('la barra de acciones se queda abajo y sobrevive a la búsqueda', async ({ page }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets\?q=${a.daily}`)
    await expect(filaDe(page, a)).toBeVisible()

    await activarModoSeleccion(page)
    await tocarFila(filaDe(page, a))
    await expect(recuento(page)).toHaveText('1 seleccionada')

    const barra = page.getByRole('button', { name: 'Asignar a un cliente' })
    await expect(barra).toBeVisible()

    // Buscar otra cosa: la anterior sigue contando (sección 11).
    await page.goto(`/seller/tickets\?q=${b.daily}`)
    await expect(recuento(page)).toHaveText('1 seleccionada')
    await expect(page.getByRole('button', { name: 'Asignar a un cliente' })).toBeVisible()

    // Y la barra sigue pegada al borde inferior tras desplazarse.
    await page.mouse.wheel(0, 600)
    const caja = await page.getByRole('button', { name: 'Asignar a un cliente' }).boundingBox()
    const alto = page.viewportSize()!.height
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(alto)
    expect(caja!.y).toBeGreaterThan(alto / 2)
  })

  /**
   * D-110. La barra es un elemento fijo escrito en medio de la lista, y por ahí
   * se coló el mismo error dos veces: el hueco que reservaba para no tapar nada
   * caía donde está escrita —80 px en blanco entre el recuento y la primera
   * boleta— y aun así la paginación quedaba debajo de la barra, de modo que no
   * había forma de pasar de página con una boleta marcada. Se comprueban juntas
   * porque son la misma pregunta: dónde se reserva el sitio.
   */
  test('marcar no abre un hueco y la paginación no queda debajo de la barra', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await expect(lista(page)).toBeVisible()

    await activarModoSeleccion(page)
    await tocarFila(filaDe(page, boleta))
    await expect(recuento(page)).toHaveText('1 seleccionada')

    // Entre el recuento y lo que sigue solo cabe la separación normal de la
    // pantalla, 24 px. Si vuelve a aparecer un hueco reservado, no cabe.
    const limpiar = (await page.getByRole('button', { name: 'Limpiar selección' }).boundingBox())!
    const cabecera = (await page
      .getByRole('checkbox', { name: 'Seleccionar las boletas de esta página' })
      .boundingBox())!
    expect(cabecera.y - (limpiar.y + limpiar.height)).toBeLessThan(40)

    // Y al final del todo «Siguiente» se ve entero: la barra se posa por debajo.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const siguiente = (await page.getByRole('button', { name: 'Siguiente' }).boundingBox())!
    const barra = (await page.locator('[data-selection-bar]').boundingBox())!
    expect(siguiente.y + siguiente.height).toBeLessThanOrEqual(barra.y)
  })

  test('«Cancelar» sale del modo y limpia la selección', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    await expect(filaDe(page, boleta)).toBeVisible()

    await activarModoSeleccion(page)
    await tocarFila(filaDe(page, boleta))
    await expect(recuento(page)).toHaveText('1 seleccionada')

    await page.getByRole('button', { name: 'Cancelar' }).tap()
    await expect(recuento(page)).toHaveText('')
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    // Y la fila vuelve a abrir el detalle.
    await tocarFila(filaDe(page, boleta))
    await page.waitForURL(`**/seller/tickets/${boleta.id}`)
  })

  test('«Ver seleccionadas» deja solo las marcadas y conserva la búsqueda', async ({ page }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await expect(lista(page)).toBeVisible()

    await activarModoSeleccion(page)
    await tocarFila(filaDe(page, a))
    await tocarFila(filaDe(page, b))
    await expect(recuento(page)).toHaveText('2 seleccionadas')

    await page.getByRole('button', { name: 'Ver seleccionadas' }).tap()
    await expect(page.getByText('Estás viendo solo las boletas seleccionadas.')).toBeVisible()
    // Se cuentan TARJETAS y no enlaces: seguimos en modo seleccion, donde los
    // numeros no son enlace (P1-A). Lo que esta prueba comprueba es que la
    // lista se quedo con las dos marcadas, y eso no depende de como se pinten.
    await expect(lista(page).getByRole('listitem')).toHaveCount(2)

    await page.getByRole('button', { name: 'Volver a los resultados' }).tap()
    await expect(recuento(page)).toHaveText('2 seleccionadas')
  })
})

/**
 * P1-A — El número de la boleta deja de abrir el detalle mientras se selecciona.
 *
 * Reproducido en el navegador sobre la instancia local antes de corregirlo: en
 * modo selección, tocar los dos números —el objetivo más grande de la tarjeta—
 * navegaba al detalle en vez de marcar la boleta.
 *
 * LO QUE SE PERDÍA ERA EL MODO, NO LO MARCADO. La selección vive en
 * `sessionStorage` y sobrevive a la navegación (ver `selection-store.ts`); lo
 * que se queda atrás es `selectionMode`, que es estado de React de la pantalla
 * abandonada. Al volver, las casillas ya no están y hay que entrar otra vez en
 * «Seleccionar varias». Sigue siendo el toque más probable haciendo lo que
 * nadie pidió, pero no se pierde trabajo: conviene no exagerarlo.
 *
 * Se busca SIEMPRE con `?q=`, nunca sobre la lista completa: con miles de
 * boletas acumuladas, una recién creada no cae en la primera página. Con la
 * base recién sembrada toda la suite pasa, pero `?q=` no depende de eso: es la
 * diferencia entre una prueba que falla cuando la base crece y una que no
 * (I-151).
 */
test.describe('Modo selección: los números no abren el detalle (P1-A)', () => {
  /** Los dos números dentro de la tarjeta, que es lo que se toca. */
  function numerosDe(fila: Locator, boleta: { daily: string; weekly: string }) {
    return fila.getByText(`${boleta.daily} / ${boleta.weekly}`, { exact: true })
  }

  /**
   * Vuelve a encender el modo CON una selección ya en marcha.
   *
   * `activarModoSeleccion` espera «Toca las boletas que quieras seleccionar.»,
   * que solo se lee con cero marcadas. Aquí se espera a que aparezcan las
   * casillas, que es la señal de que el modo está encendido sea cual sea el
   * recuento. El reintento es por lo mismo de siempre: la hidratación.
   */
  async function reentrarEnModoSeleccion(page: Page) {
    const boton = page.getByRole('button', { name: 'Seleccionar varias', exact: true })
    await expect(async () => {
      await boton.tap()
      await expect(page.getByRole('checkbox').first()).toBeVisible({ timeout: 1500 })
    }).toPass({ timeout: 20_000 })
  }

  test('tocar los números marca la boleta y no abre su detalle', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    await expect(filaDe(page, boleta)).toBeVisible()

    await activarModoSeleccion(page)
    await numerosDe(filaDe(page, boleta), boleta).tap()

    // Marca, que es lo que la pantalla promete: «Toca las boletas que quieras
    // seleccionar».
    await expect(recuento(page)).toHaveText('1 seleccionada')
    // Y no se fue a ninguna parte.
    await expect(page).toHaveURL(new RegExp(`/seller/tickets\\?q=${boleta.daily}`))
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeHidden()

    // Volver a tocarlos la desmarca, igual que cualquier zona libre.
    await numerosDe(filaDe(page, boleta), boleta).tap()
    await expect(recuento(page)).toHaveText('Toca las boletas que quieras seleccionar.')
  })

  test('lo que ya estaba marcado sigue contando al marcar por los números', async ({ page }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${a.daily}`)
    await activarModoSeleccion(page)
    await tocarFila(filaDe(page, a))
    await expect(recuento(page)).toHaveText('1 seleccionada')

    // La selección sobrevive a la búsqueda (sección 11); el modo hay que
    // volver a encenderlo, porque es estado de la pantalla.
    await page.goto(`/seller/tickets?q=${b.daily}`)
    await expect(recuento(page)).toHaveText('1 seleccionada')
    // `activarModoSeleccion` no sirve aquí: espera el texto de «sin nada
    // marcado», y aquí ya hay una boleta contando.
    await reentrarEnModoSeleccion(page)

    await numerosDe(filaDe(page, b), b).tap()
    await expect(recuento(page)).toHaveText('2 seleccionadas')
    await expect(page).toHaveURL(new RegExp(`/seller/tickets\\?q=${b.daily}`))
  })

  test('mientras se selecciona, los números no son un enlace', async ({ page }) => {
    const boleta = await nuevaBoleta()
    const nombre = `${boleta.daily} / ${boleta.weekly}`

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    const fila = filaDe(page, boleta)
    await expect(fila).toBeVisible()

    // Fuera del modo, el enlace es el de siempre: da menú contextual, «abrir en
    // otra pestaña» y una parada de teclado con nombre.
    await expect(fila.getByRole('link', { name: `Ver la boleta ${nombre}` })).toBeVisible()

    await activarModoSeleccion(page)

    // Dentro del modo no queda ningún enlace que se lleve el toque.
    await expect(fila.getByRole('link')).toHaveCount(0)
    // Pero los números siguen a la vista: es como se nombra una boleta (BR-N11).
    await expect(numerosDe(fila, boleta)).toBeVisible()
    // Y la casilla conserva el nombre accesible con los dos números.
    await expect(
      fila.getByRole('checkbox', { name: `Seleccionar la boleta ${nombre}` }),
    ).toBeVisible()
  })

  test('al salir del modo, los números vuelven a abrir el detalle', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    await expect(filaDe(page, boleta)).toBeVisible()

    await activarModoSeleccion(page)
    await page.getByRole('button', { name: 'Cancelar' }).tap()
    await expect(page.getByRole('checkbox')).toHaveCount(0)

    await numerosDe(filaDe(page, boleta), boleta).tap()
    await page.waitForURL(`**/seller/tickets/${boleta.id}`)
  })

  /**
   * PRUEBA FUNCIONAL, no revisión visual: quitar el enlace quita una parada de
   * teclado, así que hay que demostrar que la tarjeta sigue siendo operable sin
   * dedo. `Enter` y `Space` los atiende `handleKeyDown` del `li`, y solo cuando
   * el foco está en la tarjeta misma.
   */
  test('con el teclado, la tarjeta se marca y se desmarca sin abrir el detalle', async ({
    page,
  }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${boleta.daily}`)
    const fila = filaDe(page, boleta)
    await expect(fila).toBeVisible()

    await activarModoSeleccion(page)

    await fila.focus()
    await expect(fila).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(recuento(page)).toHaveText('1 seleccionada')
    await expect(page).toHaveURL(new RegExp(`/seller/tickets\\?q=${boleta.daily}`))

    // `Space` hace lo mismo y no desplaza la página: `handleKeyDown` lo evita.
    await page.keyboard.press(' ')
    await expect(recuento(page)).toHaveText('Toca las boletas que quieras seleccionar.')
    await expect(page).toHaveURL(new RegExp(`/seller/tickets\\?q=${boleta.daily}`))
  })
})
