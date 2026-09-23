import { expect, test, type Page } from '@playwright/test'

import { createClientFor, loadSeedRefs, serviceClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * EN EL TELEFONO no hay tabla: hay tarjetas (D-107), asi que no hay cabecera
 * que pulsar. El orden llega por la direccion —compartida, pegada o guardada—
 * y lo que hay que comprobar es que las tarjetas salen en el orden que dio la
 * base, no en el que tenian antes.
 *
 * Que el telefono no OFREZCA ordenar es anterior a este bloque y queda
 * anotado (I-155): la lista de tarjetas nunca tuvo ese control.
 */
test.describe('En el telefono el orden llega por la direccion', () => {
  const STAMP = Date.now().toString(36).slice(-5)
  const PRECIOS = [60_000, 80_000, 100_000, 120_000, 150_000]
  let raffleId = ''

  test.beforeAll(async () => {
    const svc = serviceClient()
    const refs = await loadSeedRefs()
    const { data: raffle } = await svc
      .from('raffles')
      .insert({
        organization_id: refs.organizationId,
        name: `Rifa orden movil ${STAMP}`,
        ticket_price: 120_000,
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: refs.ownerId,
      })
      .select('id')
      .single()
    raffleId = raffle!.id

    await svc.from('tickets').insert(
      Array.from({ length: 60 }, (_, i) => ({
        organization_id: refs.organizationId,
        raffle_id: raffleId,
        seller_id: refs.sellerId,
        created_by: refs.ownerId,
        daily_number: String(i).padStart(4, '0'),
        weekly_number: String(7000 + i),
        inventory_status: 'available' as const,
        sale_price: PRECIOS[i % PRECIOS.length],
      })),
    )
  })

  test.afterAll(async () => {
    if (!raffleId) return
    const svc = serviceClient()
    await svc.from('tickets').delete().eq('raffle_id', raffleId)
    await svc.from('raffles').delete().eq('id', raffleId)
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  /** Los precios de las tarjetas, en el orden en que se ven. */
  async function preciosDeTarjetas(page: Page): Promise<number[]> {
    return page.evaluate(() =>
      [...document.querySelectorAll('li')]
        .map((li) => li.textContent ?? '')
        .map((texto) => texto.match(/\$[\d.]+/)?.[0] ?? '')
        .filter((precio) => precio !== '')
        .map((precio) => Number(precio.replace(/[^0-9]/g, ''))),
    )
  }

  test('las tarjetas salen en el orden que dio la base, y la pagina 2 no lo rompe', async ({
    page,
  }) => {
    const base = `/seller/tickets?raffleId=${raffleId}&sort=salePrice&dir=desc`

    await page.goto(base)
    await expect(page.getByText(/1–25 de 60 boletas/)).toBeVisible()
    const primera = await preciosDeTarjetas(page)
    expect(primera.length).toBeGreaterThan(0)
    expect(primera[0]).toBe(150_000)
    expect([...primera].sort((a, b) => b - a)).toEqual(primera)

    await page.goto(`${base}&page=2`)
    const segunda = await preciosDeTarjetas(page)
    expect(Math.max(...segunda)).toBeLessThanOrEqual(Math.min(...primera))
  })

  test('la paginacion del telefono dice que esta contando', async ({ page }) => {
    await page.goto(`/seller/tickets?raffleId=${raffleId}`)
    // En movil el indicador central dice «1 de 3», y el recuento sigue estando
    // para quien escucha la pantalla (D-111).
    await expect(page.getByText(/1–25 de 60 boletas/)).toBeVisible()
  })
})

/**
 * EL CONTROL DE ORDEN DEL TELEFONO (I-155, D-215).
 *
 * Hasta aqui el orden llegaba solo por la direccion: en un telefono la lista
 * son tarjetas y la tabla —con sus cabeceras— esta oculta con `display:none`,
 * asi que no habia nada que pulsar. Lo que se comprueba es que el control pide
 * el orden de verdad, que dice cual esta puesto, que se puede volver atras, y
 * que convive con «Filtros» y «Seleccionar varias» sin romper la fila.
 */
test.describe('Ordenar desde el telefono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  /** El control de orden de la pantalla, por su nombre accesible. */
  function control(page: Page, lista: 'boletas' | 'clientes') {
    return page.getByRole('combobox', {
      name: lista === 'boletas' ? 'Ordenar las boletas' : 'Ordenar los clientes',
    })
  }

  async function elegir(page: Page, lista: 'boletas' | 'clientes', opcion: string) {
    await control(page, lista).click()
    await page.getByRole('option', { name: opcion, exact: true }).click()
  }

  test('«Mis boletas»: dice el orden activo y lo cambia', async ({ page }) => {
    await page.goto('/seller/tickets')

    // Sin nada en la direccion, el control dice el orden de SIEMPRE, que la
    // pantalla nunca habia contado.
    await expect(control(page, 'boletas')).toHaveText(/Más recientes primero/)

    await elegir(page, 'boletas', 'Falta, de mayor a menor')

    await expect(page).toHaveURL(/sort=pendingAmount/)
    await expect(page).toHaveURL(/dir=desc/)
    await expect(control(page, 'boletas')).toHaveText(/Falta, de mayor a menor/)
  })

  test('se puede volver al orden predeterminado', async ({ page }) => {
    await page.goto('/seller/tickets?sort=salePrice&dir=desc')
    await expect(control(page, 'boletas')).toHaveText(/Precio, de mayor a menor/)

    await elegir(page, 'boletas', 'Más recientes primero')

    // Los dos parametros se BORRAN: una direccion sin `sort` es la lista tal
    // como la sirve la consulta.
    await expect(page).not.toHaveURL(/sort=/)
    await expect(page).not.toHaveURL(/dir=/)
  })

  test('al cambiar el orden se vuelve a la pagina 1, y la busqueda se conserva', async ({
    page,
  }) => {
    await page.goto('/seller/tickets?q=0&page=2')
    await elegir(page, 'boletas', 'Precio, de menor a mayor')

    await expect(page).toHaveURL(/q=0/)
    await expect(page).toHaveURL(/sort=salePrice/)
    await expect(page).not.toHaveURL(/page=2/)
  })

  test('un filtro puesto sobrevive al cambio de orden', async ({ page }) => {
    await page.goto('/seller/tickets?inventoryStatus=available')
    await elegir(page, 'boletas', 'Boleta, de mayor a menor')

    await expect(page).toHaveURL(/inventoryStatus=available/)
    await expect(page).toHaveURL(/sort=dailyNumber/)
    // Y el boton de filtros sigue contando el suyo: un orden NO es un filtro.
    await expect(page.getByRole('button', { name: 'Filtros (1)' })).toBeVisible()
  })

  test('atras y adelante recuperan el orden', async ({ page }) => {
    await page.goto('/seller/tickets')
    await elegir(page, 'boletas', 'Abonado, de mayor a menor')
    await expect(page).toHaveURL(/sort=paidAmount/)

    await page.goBack()
    await expect(page).not.toHaveURL(/sort=/)
    await expect(control(page, 'boletas')).toHaveText(/Más recientes primero/)

    await page.goForward()
    await expect(page).toHaveURL(/sort=paidAmount/)
    await expect(control(page, 'boletas')).toHaveText(/Abonado, de mayor a menor/)
  })

  test('el orden se lee ya en el HTML del servidor (I-155, corrección de D-215)', async ({
    page,
  }) => {
    // El control nacio vacio en el HTML servido: la frase la copiaba Radix al
    // hidratar. Se mide el HTML crudo de las dos pantallas.
    for (const [ruta, nombre, frase] of [
      ['/seller/tickets?sort=salePrice&dir=desc', 'Ordenar las boletas', 'Precio, de mayor a menor'],
      ['/seller/clients', 'Ordenar los clientes', 'Nombre, de la A a la Z'],
    ] as const) {
      const html = await (await page.request.get(ruta)).text()
      const trozo = html.match(new RegExp(`aria-label="${nombre}"[\\s\\S]{0,1500}`))?.[0] ?? ''
      expect(trozo.match(/data-slot="select-value"[^>]*>([^<]*)</)?.[1], ruta).toBe(frase)
    }
  })

  test('recargar conserva el orden', async ({ page }) => {
    await page.goto('/seller/tickets?sort=percentage&dir=asc')
    await page.reload()
    await expect(control(page, 'boletas')).toHaveText(/Progreso, de menor a mayor/)
  })

  /*
    LA CORRESPONDENCIA ENTRE LO QUE DICE EL CONTROL Y LO QUE SALE EN LA LISTA
    (D-216). Hasta aqui el control caia al valor por defecto en cuanto la
    direccion pedia un orden que el no ofrece, aunque la consulta SI lo
    aplicara: decia «Más recientes primero» mientras la lista salia por rifa.
    La prueba anterior exigia ese comportamiento; estaba mal y se invirtio.
  */

  test('un orden válido que el control no ofrece se DICE, no se esconde', async ({ page }) => {
    // «Rifa» está en `TICKET_SORT_COLUMNS`, así que la consulta la aplica.
    await page.goto('/seller/tickets?sort=raffleShortCode&dir=desc')

    await expect(control(page, 'boletas')).toHaveText(/Rifa, de la Z a la A/)
    // Y no se reescribe la dirección: pasar de escritorio a teléfono no cambia
    // el orden, solo lo cuenta.
    await expect(page).toHaveURL(/sort=raffleShortCode/)
    await expect(page).toHaveURL(/dir=desc/)
  })

  test('un estado se describe por su primera etiqueta, no con «A–Z»', async ({ page }) => {
    await page.goto('/seller/tickets?sort=inventoryStatus')
    await expect(control(page, 'boletas')).toHaveText(/Estado de la boleta, primero Borrador/)

    await page.goto('/seller/tickets?sort=inventoryStatus&dir=desc')
    await expect(control(page, 'boletas')).toHaveText(/Estado de la boleta, primero Anulada/)
  })

  test('desde ese orden se puede volver al predeterminado', async ({ page }) => {
    await page.goto('/seller/tickets?sort=sellerName&dir=asc')
    await expect(control(page, 'boletas')).toHaveText(/Vendedor, de la A a la Z/)

    await elegir(page, 'boletas', 'Más recientes primero')

    await expect(page).not.toHaveURL(/sort=/)
    await expect(control(page, 'boletas')).toHaveText(/Más recientes primero/)
  })

  test('un orden que la consulta RECHAZA sí cae al predeterminado', async ({ page }) => {
    // `inventado` no está en la lista blanca: `parseListSort` lo descarta y la
    // lista sale por fecha. Ahí el control acierta diciendo el orden de
    // siempre — es el caso que NO hay que confundir con el de arriba.
    await page.goto('/seller/tickets?sort=inventado&dir=desc')
    await expect(control(page, 'boletas')).toHaveText(/Más recientes primero/)
    await expect(page.getByRole('heading', { name: 'Mis boletas' })).toBeVisible()
  })

  test('buscando, el control dice RELEVANCIA y no fecha', async ({ page }) => {
    // Con término y sin columna pedida la lista sale por relevancia
    // (`search_tickets`), no por `created_at`.
    await page.goto('/seller/tickets?q=0')
    await expect(control(page, 'boletas')).toHaveText(/Las que mejor coinciden/)

    // Sin búsqueda vuelve a ser la fecha.
    await page.goto('/seller/tickets')
    await expect(control(page, 'boletas')).toHaveText(/Más recientes primero/)
  })

  test('restablecer el orden durante una búsqueda devuelve a la relevancia', async ({ page }) => {
    await page.goto('/seller/tickets?q=0&sort=salePrice&dir=desc')
    await expect(control(page, 'boletas')).toHaveText(/Precio, de mayor a menor/)

    await elegir(page, 'boletas', 'Las que mejor coinciden')

    // Se borran `sort` y `dir`, se conserva la búsqueda, y el texto sigue
    // diciendo lo que de verdad ordena la lista.
    await expect(page).not.toHaveURL(/sort=/)
    await expect(page).toHaveURL(/q=0/)
    await expect(control(page, 'boletas')).toHaveText(/Las que mejor coinciden/)
  })

  test('atrás y adelante conservan la correspondencia con la búsqueda', async ({ page }) => {
    await page.goto('/seller/tickets?q=0')
    await expect(control(page, 'boletas')).toHaveText(/Las que mejor coinciden/)

    await elegir(page, 'boletas', 'Precio, de mayor a menor')
    await expect(control(page, 'boletas')).toHaveText(/Precio, de mayor a menor/)

    await page.goBack()
    await expect(page).toHaveURL(/q=0/)
    await expect(page).not.toHaveURL(/sort=/)
    await expect(control(page, 'boletas')).toHaveText(/Las que mejor coinciden/)

    await page.goForward()
    await expect(control(page, 'boletas')).toHaveText(/Precio, de mayor a menor/)
  })

  test('«Mis clientes»: un orden que no ofrece también se dice', async ({ page }) => {
    await page.goto('/seller/clients?sort=totalPurchased&dir=desc')
    await expect(control(page, 'clientes')).toHaveText(/Comprado, de mayor a menor/)
    await expect(page).toHaveURL(/sort=totalPurchased/)
  })

/*
    DOS COMBINACIONES QUE SE ESCAPARON (D-216, corregido). Las dos salían de
    tratar cada caso por separado, sin mirar qué pasa cuando coinciden.
  */

  test('buscando Y con un orden que no se ofrece: se describe, y restablecer sigue siendo la relevancia', async ({
    page,
  }) => {
    await page.goto('/seller/tickets?q=12&sort=raffleShortCode&dir=desc')

    // El orden puesto se describe, como sin búsqueda.
    await expect(control(page, 'boletas')).toHaveText(/Rifa, de la Z a la A/)

    // Y la opción que restablece dice a dónde devuelve DE VERDAD: hay
    // búsqueda, así que quitar el orden deja la lista por relevancia.
    await control(page, 'boletas').click()
    await expect(page.getByRole('option', { name: 'Las que mejor coinciden' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Más recientes primero' })).toHaveCount(0)

    // Y al elegirla, eso es lo que pasa: se borra el orden y queda la búsqueda.
    await page.getByRole('option', { name: 'Las que mejor coinciden' }).click()
    await expect(page).not.toHaveURL(/sort=/)
    await expect(page).toHaveURL(/q=12/)
    await expect(control(page, 'boletas')).toHaveText(/Las que mejor coinciden/)
  })

  test('«Mis clientes» con el orden de siempre pedido por su nombre', async ({ page }) => {
    // `?sort=name` y una dirección limpia dan la MISMA lista: el orden de
    // siempre de esta pantalla es el nombre ascendente.
    await page.goto('/seller/clients?sort=name')

    await expect(control(page, 'clientes')).toHaveText(/Nombre, de la A a la Z/)
    // Y la dirección se conserva: el control cuenta el orden, no lo reescribe.
    await expect(page).toHaveURL(/sort=name/)
  })

  test('desde ahí se puede cambiar, y entonces sí cambia la dirección', async ({ page }) => {
    await page.goto('/seller/clients?sort=name')
    await elegir(page, 'clientes', 'Saldo, de mayor a menor')

    await expect(page).toHaveURL(/sort=pendingAmount/)
    await expect(page).toHaveURL(/dir=desc/)
    await expect(control(page, 'clientes')).toHaveText(/Saldo, de mayor a menor/)
  })

  test('«Mis clientes»: buscar NO cambia el orden, y el control no lo inventa', async ({ page }) => {
    // Aquí el término es un `ilike` sobre la misma consulta: el `order by`
    // sigue siendo el nombre. El control dice lo mismo con y sin búsqueda.
    await page.goto('/seller/clients')
    await expect(control(page, 'clientes')).toHaveText(/Nombre, de la A a la Z/)

    await page.goto('/seller/clients?q=a')
    await expect(control(page, 'clientes')).toHaveText(/Nombre, de la A a la Z/)
  })

  test('a 320 px conviven los tres controles y nada se desborda', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/seller/tickets')

    const filtros = page.getByRole('button', { name: /^Filtros/ })
    const seleccionar = page.getByRole('button', { name: 'Seleccionar varias' })
    const orden = control(page, 'boletas')

    for (const elemento of [filtros, seleccionar, orden]) {
      await expect(elemento).toBeVisible()
      const caja = await elemento.boundingBox()
      expect(caja).not.toBeNull()
      // Dentro de la pantalla, por los dos lados.
      expect(caja!.x).toBeGreaterThanOrEqual(0)
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(320)
      // 44 px de diana tactil, como el resto de la fila.
      expect(caja!.height).toBeGreaterThanOrEqual(44)
    }

    // Y la pagina no gana barra horizontal.
    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desbordamiento).toBeLessThanOrEqual(0)
  })

  test('el control se alcanza con el teclado y se opera con el', async ({ page }) => {
    await page.goto('/seller/tickets')
    const orden = control(page, 'boletas')

    await orden.focus()
    await expect(orden).toBeFocused()

    // Radix abre con Enter y mueve con las flechas; Enter elige.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/sort=dailyNumber/)
    // Al cerrarse, el foco vuelve al control, no se pierde en `body`.
    await expect(orden).toBeFocused()
  })

  test('la seleccion de boletas sobrevive al cambio de orden', async ({ page }) => {
    await page.goto('/seller/tickets')
    await page.getByRole('button', { name: 'Seleccionar varias' }).click()
    await page.getByRole('checkbox', { name: 'Seleccionar las boletas de esta página' }).check()

    // «Ver seleccionadas» solo existe habiendo seleccion, asi que sirve de
    // ancla sin depender de cuantas boletas tenga la base.
    const verSeleccionadas = page.getByRole('button', { name: 'Ver seleccionadas' })
    await expect(verSeleccionadas).toBeVisible()
    const antes = await page.getByRole('status').first().innerText()

    await elegir(page, 'boletas', 'Precio, de mayor a menor')
    await expect(page).toHaveURL(/sort=salePrice/)

    // La seleccion es por id y vive en `sessionStorage`: cambiar el orden no la
    // toca, y el modo seleccion tampoco se apaga (D-211).
    await expect(verSeleccionadas).toBeVisible()
    await expect(page.getByRole('status').first()).toHaveText(antes)
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible()
  })
  test('«Mis clientes»: ordena y conserva el interruptor', async ({ page }) => {
    await page.goto('/seller/clients?archived=1')
    await expect(control(page, 'clientes')).toHaveText(/Nombre, de la A a la Z/)

    await elegir(page, 'clientes', 'Saldo, de mayor a menor')

    await expect(page).toHaveURL(/sort=pendingAmount/)
    await expect(page).toHaveURL(/dir=desc/)
    await expect(page).toHaveURL(/archived=1/)
    await expect(control(page, 'clientes')).toHaveText(/Saldo, de mayor a menor/)
  })

  test('«Mis clientes»: el orden llega a las tarjetas', async ({ page }) => {
    await page.goto('/seller/clients?sort=name&dir=desc')
    const nombres = await page.evaluate(() =>
      [...document.querySelectorAll('ul[aria-label="Clientes"] li')]
        .map((li) => li.querySelector('a')?.textContent?.trim() ?? '')
        .filter((texto) => texto !== ''),
    )

    expect(nombres.length).toBeGreaterThan(1)
    const descendente = [...nombres].sort((a, b) => b.localeCompare(a, 'es'))
    expect(nombres).toEqual(descendente)
  })
})

/**
 * EL TEXTO CONTRA LOS RESULTADOS, con datos hechos para distinguirlos (D-216).
 *
 * Comprobar que el control DICE «Las que mejor coinciden» no prueba nada si la
 * lista podría salir igual por fecha. Estos datos están montados para que cada
 * orden dé una secuencia DISTINTA:
 *
 *   * la rifa de código MENOR tiene las boletas más RECIENTES, así que ordenar
 *     por rifa descendente y ordenar por fecha dan listas al revés;
 *   * buscando «12», la coincidencia exacta es la boleta más ANTIGUA, así que
 *     relevancia y fecha tampoco coinciden.
 *
 * Si el control dijera una cosa y la consulta hiciera otra, estas pruebas lo
 * verían.
 */
test.describe('El texto del control corresponde con lo que sale', () => {
  const STAMP = Date.now().toString(36).slice(-5)
  let clientId = ''
  let raffleMenor = ''
  let raffleMayor = ''

  /** Los números diarios de las tarjetas, en el orden en que se ven. */
  async function diariosDeTarjetas(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      [...document.querySelectorAll('ul li')]
        .map((li) => (li.textContent ?? '').match(/(\d{4})\s*\/\s*\d{4}/)?.[1] ?? '')
        .filter((numero) => numero !== ''),
    )
  }

  test.beforeAll(async () => {
    const svc = serviceClient()
    const refs = await loadSeedRefs()

    const cliente = await createClientFor(refs, `Orden Texto ${STAMP}`)
    clientId = cliente.id

    // Dos rifas: el disparador da el código por orden de creación, así que la
    // primera se queda con el MENOR.
    for (const cual of ['menor', 'mayor'] as const) {
      const { data } = await svc
        .from('raffles')
        .insert({
          organization_id: refs.organizationId,
          name: `Rifa ${cual} ${STAMP}`,
          ticket_price: 120_000,
          status: 'active',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          created_by: refs.ownerId,
        })
        .select('id')
        .single()
      if (cual === 'menor') raffleMenor = data!.id
      else raffleMayor = data!.id
    }

    // Se insertan en dos tandas para que `created_at` las separe de verdad: las
    // de la rifa MAYOR primero (más antiguas), las de la MENOR después.
    const fila = (raffleId: string, daily: string, weekly: string) => ({
      organization_id: refs.organizationId,
      raffle_id: raffleId,
      seller_id: refs.sellerId,
      client_id: clientId,
      daily_number: daily,
      weekly_number: weekly,
      inventory_status: 'assigned' as const,
      sale_price: 120_000,
      sale_date: '2026-09-01',
      assigned_at: new Date().toISOString(),
      created_by: refs.ownerId,
    })

    /*
      UNA A UNA, con pausa. Dos boletas en el mismo `insert` comparten
      `created_at` al milisegundo y entonces las desempata el `id`, que es un
      uuid: el orden por fecha dejaria de ser predecible y la prueba mediria el
      azar. Asi quedan: 0012 la mas antigua y 4512 la mas reciente.
    */
    for (const [raffleId, daily, weekly] of [
      [raffleMayor, '0012', '9001'],
      [raffleMayor, '1234', '9002'],
      [raffleMenor, '4512', '9003'],
    ] as const) {
      await svc.from('tickets').insert([fila(raffleId, daily, weekly)])
      await new Promise((listo) => setTimeout(listo, 1100))
    }
  })

  test.afterAll(async () => {
    const svc = serviceClient()
    for (const raffleId of [raffleMenor, raffleMayor]) {
      if (raffleId) await svc.from('tickets').delete().eq('raffle_id', raffleId)
    }
    if (clientId) await svc.from('clients').delete().eq('id', clientId)
    for (const raffleId of [raffleMenor, raffleMayor]) {
      if (raffleId) await svc.from('raffles').delete().eq('id', raffleId)
    }
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  function control(page: Page) {
    return page.getByRole('combobox', { name: 'Ordenar las boletas' })
  }

  test('por defecto: el control dice la fecha y la lista sale por fecha', async ({ page }) => {
    await page.goto(`/seller/tickets?clientId=${clientId}`)

    await expect(control(page)).toHaveText(/Más recientes primero/)
    // La más reciente es la de la rifa menor.
    expect(await diariosDeTarjetas(page)).toEqual(['4512', '1234', '0012'])
  })

  test('por rifa descendente: el control lo dice y la lista cambia de verdad', async ({ page }) => {
    await page.goto(`/seller/tickets?clientId=${clientId}&sort=raffleShortCode&dir=desc`)

    await expect(control(page)).toHaveText(/Rifa, de la Z a la A/)
    // Primero la rifa de código mayor —sus dos boletas— y después la otra: es
    // justo lo contrario del orden por fecha de la prueba anterior.
    const diarios = await diariosDeTarjetas(page)
    expect(diarios).toHaveLength(3)
    expect(diarios[2]).toBe('4512')
    expect(diarios.slice(0, 2).sort()).toEqual(['0012', '1234'])
  })

  test('buscando: el control dice relevancia y la lista sale por relevancia', async ({ page }) => {
    await page.goto(`/seller/tickets?q=12&clientId=${clientId}`)

    await expect(control(page)).toHaveText(/Las que mejor coinciden/)

    const diarios = (await diariosDeTarjetas(page)).filter((numero) =>
      ['0012', '1234', '4512'].includes(numero),
    )
    /*
      Primero la que EMPIEZA por «12», después las que solo lo contienen, y
      entre esas dos, por número. «0012» no es coincidencia exacta: el número
      guardado lleva sus ceros, y «12» no es «0012».

      Por fecha saldría «4512» primero, que es la más reciente: los dos órdenes
      no coinciden, que es de lo que se trata.
    */
    expect(diarios).toEqual(['1234', '0012', '4512'])
  })

  test('buscando y pidiendo precio, manda el precio y el control lo dice', async ({ page }) => {
    await page.goto(`/seller/tickets?q=12&clientId=${clientId}&sort=dailyNumber&dir=desc`)

    await expect(control(page)).toHaveText(/Boleta, de mayor a menor/)

    const diarios = (await diariosDeTarjetas(page)).filter((numero) =>
      ['0012', '1234', '4512'].includes(numero),
    )
    // Ni relevancia ni fecha: el número, de mayor a menor como texto.
    expect(diarios).toEqual(['4512', '1234', '0012'])
  })
})
