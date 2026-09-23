import { expect, test, type Page } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  createPaymentWithAllocation,
  loadSeedRefs,
  serviceClient,
} from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Ordenación de servidor y paginación (P1-B y P1-H).
 *
 * Lo que se comprueba aquí es lo único que una prueba de una sola página no
 * puede ver: que el orden es del CONJUNTO FILTRADO y no de las filas servidas.
 *
 * El defecto medido en local antes del cambio: ordenando «Valor» de mayor a
 * menor, la pantalla daba $150.000 como máximo cuando el máximo real eran
 * $2.280.000, porque `DataTable` reordenaba en el navegador las 25 filas que
 * tenía y la cabecera lo anunciaba con `aria-sort`.
 *
 * LA COMPROBACIÓN DECISIVA es entre páginas: con orden descendente, ningún
 * valor de la página 2 puede ser mayor que el menor de la página 1. Si el orden
 * fuera solo de la página, esa condición se rompe de inmediato.
 */

/** «1–25 de 73 pagos» → 73. */
async function totalDe(page: Page): Promise<number> {
  const texto = await page
    .getByText(/\d+–\d+ de \d+ /)
    .first()
    .innerText()
  return Number(texto.match(/de (\d+)/)?.[1] ?? '0')
}

/** Los importes de una columna, en el orden en que se ven. */
async function columnaDeImportes(page: Page, encabezado: string): Promise<number[]> {
  const indice = await page.evaluate((nombre) => {
    const ths = [...document.querySelectorAll('thead th')]
    return ths.findIndex((th) => (th.textContent ?? '').trim().startsWith(nombre))
  }, encabezado)

  return page.evaluate((i) => {
    return [...document.querySelectorAll('tbody tr')].map((tr) => {
      const celda = tr.querySelectorAll('td')[i]
      return Number((celda?.textContent ?? '').replace(/[^0-9]/g, '')) || 0
    })
  }, indice)
}

/**
 * PAGOS, CON DATOS PROPIOS. Antes estas cuatro pruebas se saltaban cuando la
 * base recien sembrada no llegaba a 25 pagos, asi que en la practica solo
 * median cuando alguien habia dejado datos de otra pasada. Ahora crean los
 * suyos y los borran al terminar, de modo que miden siempre y no dependen de
 * nadie.
 *
 * DOS COLUMNAS Y DOS PREGUNTAS DISTINTAS:
 *
 *   * «Valor» lleva importes UNICOS —60.000, 61.000, 62.000…—, asi que cada
 *     importe identifica su fila. Sirve para comprobar el orden estricto, que
 *     no se repite ninguna y que el recorrido trae exactamente el conjunto
 *     esperado.
 *   * «Método» empata a proposito: tres valores para sesenta pagos. Es el caso
 *     que rompe un orden sin desempate estable, porque PostgreSQL puede
 *     devolver las filas empatadas en otro orden entre dos consultas y entonces
 *     una sale dos veces mientras otra no sale nunca. Ahi no se comprueba el
 *     orden de los importes —no tienen por que estarlo—, sino que el CONJUNTO
 *     recorrido sea exactamente el esperado.
 */
test.describe('Pagos: el orden es del conjunto, no de la página', () => {
  const STAMP = Date.now().toString(36).slice(-5)
  /** Tres páginas de 25 no caben en dos, que es lo que hace falta para cruzar. */
  const CUANTOS = 60
  const PRECIO = 120_000
  /** Importes únicos: cada uno identifica su fila. */
  const importe = (i: number) => 60_000 + i * 1_000
  /** Tres métodos para sesenta pagos: veinte empatados en cada uno. */
  const METODOS = ['cash', 'transfer', 'other'] as const

  let clientId = ''
  const ticketIds: string[] = []
  const paymentIds: string[] = []

  test.beforeAll(async () => {
    const refs = await loadSeedRefs()

    const cliente = await createClientFor(refs, `Orden Pagos ${STAMP}`)
    clientId = cliente.id

    for (let i = 0; i < CUANTOS; i += 1) {
      const ticket = await createAssignedTicket(refs, {
        dailyNumber: String(i).padStart(4, '0'),
        weeklyNumber: String(8000 + i),
        clientId,
        salePrice: PRECIO,
      })
      ticketIds.push(ticket.id)

      paymentIds.push(
        await createPaymentWithAllocation(refs, {
          clientId,
          ticketId: ticket.id,
          amount: importe(i),
          method: METODOS[i % METODOS.length] ?? 'cash',
          paymentDate: '2026-09-01',
        }),
      )
    }
  })

  test.afterAll(async () => {
    const svc = serviceClient()
    if (paymentIds.length > 0) {
      await svc.from('payment_allocations').delete().in('payment_id', paymentIds)
      await svc.from('payments').delete().in('id', paymentIds)
    }
    if (ticketIds.length > 0) await svc.from('tickets').delete().in('id', ticketIds)
    if (clientId) await svc.from('clients').delete().eq('id', clientId)
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  /** Todos los importes del recorrido completo, página a página. */
  async function recorrido(page: Page, orden: string): Promise<number[]> {
    await page.goto(`/seller/payments?clientId=${clientId}&${orden}`)
    const total = await totalDe(page)
    expect(total).toBe(CUANTOS)

    const visto: number[] = []
    for (let p = 1; p <= Math.ceil(total / 25); p += 1) {
      await page.goto(`/seller/payments?clientId=${clientId}&${orden}&page=${p}`)
      visto.push(...(await columnaDeImportes(page, 'Valor')))
    }
    return visto
  }

  /** Lo que tiene que salir, sin importar en qué orden. */
  const esperado = () => Array.from({ length: CUANTOS }, (_, i) => importe(i))

  test('descendente: ninguna página posterior supera a la anterior', async ({ page }) => {
    await page.goto(`/seller/payments?clientId=${clientId}&sort=totalAmount&dir=desc`)
    const primera = await columnaDeImportes(page, 'Valor')
    expect(primera).toHaveLength(25)
    expect(primera[0]).toBe(importe(CUANTOS - 1))
    expect([...primera].sort((a, b) => b - a)).toEqual(primera)

    await page.goto(`/seller/payments?clientId=${clientId}&sort=totalAmount&dir=desc&page=2`)
    const segunda = await columnaDeImportes(page, 'Valor')

    // LA COMPROBACIÓN: el mayor de la página 2 no puede superar al menor de la 1.
    expect(Math.max(...segunda)).toBeLessThanOrEqual(Math.min(...primera))
  })

  test('ascendente: mismo criterio al revés', async ({ page }) => {
    await page.goto(`/seller/payments?clientId=${clientId}&sort=totalAmount&dir=asc`)
    const primera = await columnaDeImportes(page, 'Valor')
    expect(primera[0]).toBe(importe(0))
    expect([...primera].sort((a, b) => a - b)).toEqual(primera)

    await page.goto(`/seller/payments?clientId=${clientId}&sort=totalAmount&dir=asc&page=2`)
    const segunda = await columnaDeImportes(page, 'Valor')
    expect(Math.min(...segunda)).toBeGreaterThanOrEqual(Math.max(...primera))
  })

  test('por «Valor»: el recorrido sale ordenado, sin repetir y con todas', async ({ page }) => {
    const visto = await recorrido(page, 'sort=totalAmount&dir=asc')

    expect(visto).toHaveLength(CUANTOS)
    // Cada importe es único, así que sirve de identificador de su fila.
    expect(new Set(visto).size).toBe(CUANTOS)
    expect(visto).toEqual(esperado())
  })

  test('por «Método», con veinte empatados en cada uno, no se pierde ni repite ninguna', async ({
    page,
  }) => {
    const visto = await recorrido(page, 'sort=paymentMethod&dir=asc')

    expect(visto).toHaveLength(CUANTOS)
    expect(new Set(visto).size).toBe(CUANTOS)
    // El orden de los importes NO tiene por qué ser creciente: se ordenó por
    // método. Lo que sí tiene que cumplirse es que estén todos y una sola vez.
    expect([...visto].sort((a, b) => a - b)).toEqual(esperado())
  })

  test('el orden sobrevive al pasar de página, y vuelve a la 1 al cambiarlo', async ({ page }) => {
    await page.goto(`/seller/payments?clientId=${clientId}&sort=totalAmount&dir=desc`)

    await page.getByRole('button', { name: /Siguiente/ }).click()
    await expect(page).toHaveURL(/sort=totalAmount/)
    await expect(page).toHaveURL(/dir=desc/)
    await expect(page).toHaveURL(/page=2/)

    // Cambiar el orden estando en la página 2 devuelve a la 1: la página 2 del
    // orden viejo no tiene nada que ver con la del nuevo.
    await page.getByRole('button', { name: /^Fecha/ }).click()
    await expect(page).toHaveURL(/sort=paymentDate/)
    await expect(page).not.toHaveURL(/page=2/)
  })

  test('una columna que no está permitida se ignora y no rompe la pantalla', async ({ page }) => {
    // Una URL vieja, un enlace compartido o alguien escribiendo a mano.
    await page.goto('/seller/payments?sort=totalAmount%3B%20drop&dir=desc')

    await expect(page.getByRole('heading', { name: 'Mis pagos' })).toBeVisible()
    await expect(page.getByText(/\d+–\d+ de \d+ pagos/)).toBeVisible()
  })
})

/**
 * Boletas del vendedor: la lista mas larga de la aplicacion, y la que mas
 * columnas ofrece. Lo que se comprueba aqui, ademas del orden, es que las
 * cabeceras que la base NO puede ordenar ya no se ofrecen como ordenables: una
 * cabecera que promete un orden y reacomoda la pagina es peor que una que no lo
 * promete.
 */
test.describe('Boletas: solo se ofrece lo que la base puede ordenar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('«Precio» ordena y el orden viaja en la direccion', async ({ page }) => {
    await page.goto('/seller/tickets')
    await page.getByRole('button', { name: /^Precio/ }).click()

    // Ascendente NO escribe `dir`: es el valor por defecto de la lectura y la
    // direccion se queda corta, que es la que se comparte (use-list-sort.ts).
    await expect(page).toHaveURL(/sort=salePrice/)
    await expect(page).not.toHaveURL(/dir=/)

    // Segundo toque: descendente. Tercero: vuelta al orden por defecto.
    await page.getByRole('button', { name: /^Precio/ }).click()
    await expect(page).toHaveURL(/dir=desc/)
    await page.getByRole('button', { name: /^Precio/ }).click()
    await expect(page).not.toHaveURL(/sort=/)
  })

  test('«Cliente», «Falta» y «Progreso» YA ofrecen orden', async ({ page }) => {
    /*
      Hasta D-214 estas tres cabeceras no eran boton: PostgREST no sabe ordenar
      por una columna de `clients` —hay dos claves ajenas— ni por una
      expresion. La vista `v_seller_ticket_list` las tiene como COLUMNAS, asi
      que ahora se piden como cualquier otra.
    */
    await page.goto('/seller/tickets')

    for (const columna of [/^Cliente/, /^Falta/, /^Progreso/]) {
      await expect(page.getByRole('button', { name: columna })).toHaveCount(1)
    }
  })

  test('ordenar por «Falta» lo aplica la base, no la pagina', async ({ page }) => {
    await page.goto('/seller/tickets')
    await page.getByRole('button', { name: /^Falta/ }).click()

    await expect(page).toHaveURL(/sort=pendingAmount/)
    await expect(page.getByRole('columnheader', { name: /Falta/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })

  test('ordenar por «Cliente» tampoco rompe nada', async ({ page }) => {
    await page.goto('/seller/tickets?sort=clientName&dir=desc')
    await expect(page.getByRole('heading', { name: 'Mis boletas' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Cliente/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  test('el orden sobrevive a la busqueda y manda sobre la relevancia', async ({ page }) => {
    // Con termino de busqueda el orden lo decide `search_tickets`; pedir una
    // columna tiene que ganarle, no perderse en silencio.
    await page.goto('/seller/tickets?q=0&sort=dailyNumber&dir=desc')
    await expect(page.getByRole('columnheader', { name: /Boleta/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  test('una columna prohibida en la direccion no rompe la pantalla', async ({ page }) => {
    await page.goto('/seller/tickets?sort=pendingAmount&dir=desc')
    await expect(page.getByRole('heading', { name: 'Mis boletas' })).toBeVisible()
    await expect(page.getByText(/\d+–\d+ de \d+ boletas?/)).toBeVisible()
  })
})

/**
 * Las tres listas del portal administrativo que no tenian paginacion (P1-H).
 *
 * Con la base del seed son pocas filas, asi que aqui no se puede cruzar
 * paginas: eso se mide en `tests/unit/list-page.test.ts`, que si controla el
 * tamano. Lo que se comprueba aqui es que la pantalla real tiene paginacion,
 * que dice QUE esta contando (D-111) y que ordenar una cabecera cambia la
 * direccion y no rompe nada.
 */
test.describe('Vendedores, Rifas y Administradores: ahora paginan', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  const listas = [
    { ruta: '/owner/sellers', titulo: 'Vendedores', termino: /vendedores?/, columna: /^Vendedor/ },
    { ruta: '/owner/raffles', titulo: 'Rifas', termino: /rifas?/, columna: /^Código/ },
    {
      ruta: '/owner/users',
      titulo: 'Administradores',
      termino: /administradores?/,
      columna: /^Nombre/,
    },
  ]

  for (const lista of listas) {
    test(`«${lista.titulo}» dice cuantas hay y que esta contando`, async ({ page }) => {
      await page.goto(lista.ruta)
      await expect(page.getByRole('heading', { name: lista.titulo })).toBeVisible()

      const barra = page.getByText(new RegExp(String.raw`\d+–\d+ de \d+ ` + lista.termino.source))
      await expect(barra.first()).toBeVisible()
    })

    test(`«${lista.titulo}» ordena por una cabecera`, async ({ page }) => {
      await page.goto(lista.ruta)
      await page.getByRole('button', { name: lista.columna }).first().click()

      // Ascendente no escribe `dir`; el segundo toque si, y es `desc`.
      await expect(page).toHaveURL(/sort=/)
      await expect(page).not.toHaveURL(/dir=/)

      await page.getByRole('button', { name: lista.columna }).first().click()
      await expect(page).toHaveURL(/dir=desc/)

      // La pantalla sigue en pie y la barra sigue contando lo mismo.
      await expect(page.getByRole('heading', { name: lista.titulo })).toBeVisible()
    })

    test(`«${lista.titulo}» aguanta una pagina fuera de rango`, async ({ page }) => {
      await page.goto(`${lista.ruta}?page=99`)
      await expect(page.getByRole('heading', { name: lista.titulo })).toBeVisible()
      /*
        Cero filas, pero el total de VERDAD y ningun estado vacio: decir
        «todavia no hay vendedores» en la pagina 99 de una lista que si tiene
        seria mentir, y un 416 de PostgREST llegaba como «Algo salió mal».
      */
      await expect(
        page.getByText(new RegExp(String.raw`de \d+ ` + lista.termino.source)).first(),
      ).toBeVisible()
    })
  }
})

/**
 * LA COMPROBACION DECISIVA, EN EL NAVEGADOR: el orden entre paginas.
 *
 * Las de «Pagos» se saltan cuando la base recien sembrada no llega a 25 filas,
 * asi que esta crea las suyas: 60 boletas en una rifa propia, con cinco precios
 * repetidos doce veces cada uno. Los empates son el punto —sin un desempate
 * estable, al pasar de pagina una fila sale dos veces y otra no sale nunca— y
 * los precios distintos permiten la comprobacion que el defecto no pasaba: que
 * el mayor de la pagina 2 no supere al menor de la pagina 1.
 */
test.describe('Boletas: el orden entre paginas, con datos propios', () => {
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
        name: `Rifa orden E2E ${STAMP}`,
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
        weekly_number: String(6000 + i),
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

  test('el mayor de la pagina 2 no supera al menor de la pagina 1', async ({ page }) => {
    const base = `/seller/tickets?raffleId=${raffleId}&sort=salePrice&dir=desc`

    await page.goto(base)
    await expect(page.getByText(/1–25 de 60 boletas/)).toBeVisible()
    const primera = await columnaDeImportes(page, 'Precio')
    expect(primera[0]).toBe(150_000)
    expect([...primera].sort((a, b) => b - a)).toEqual(primera)

    await page.goto(`${base}&page=2`)
    const segunda = await columnaDeImportes(page, 'Precio')
    expect(Math.max(...segunda)).toBeLessThanOrEqual(Math.min(...primera))
  })

  test('el recorrido completo sale ordenado y no pierde ni repite filas', async ({ page }) => {
    const recorrido: number[] = []
    for (let p = 1; p <= 3; p += 1) {
      await page.goto(`/seller/tickets?raffleId=${raffleId}&sort=salePrice&page=${p}`)
      recorrido.push(...(await columnaDeImportes(page, 'Precio')))
    }

    expect(recorrido).toHaveLength(60)
    expect([...recorrido].sort((a, b) => a - b)).toEqual(recorrido)
  })
})

/**
 * En ESCRITORIO el control del telefono no existe: ahí se ordena pulsando las
 * cabeceras de la tabla, y dos formas de pedir lo mismo a la vez sobran (D-215).
 */
test.describe('El control de orden es solo del telefono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  const pantallas = [
    { ruta: '/seller/tickets', nombre: 'Ordenar las boletas', cabecera: /^Precio/ },
    { ruta: '/seller/clients', nombre: 'Ordenar los clientes', cabecera: /^Saldo/ },
  ]

  for (const pantalla of pantallas) {
    test(`«${pantalla.nombre}» no se ve en escritorio`, async ({ page }) => {
      await page.goto(pantalla.ruta)

      // Está en el DOM —el mismo árbol sirve a los dos anchos— pero oculto,
      // así que no cuenta para el árbol de accesibilidad ni se puede pulsar.
      await expect(page.getByRole('combobox', { name: pantalla.nombre })).toBeHidden()
      // Y la cabecera de la tabla sí ofrece su orden.
      await expect(page.getByRole('button', { name: pantalla.cabecera })).toBeVisible()
    })
  }
})
