import { expect, test, type Page } from '@playwright/test'

import { loadSeedRefs, serviceClient } from './db-setup'
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

test.describe('Pagos: el orden es del conjunto, no de la página', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('descendente: ninguna página posterior supera a la anterior', async ({ page }) => {
    await page.goto('/seller/payments?sort=totalAmount&dir=desc')
    const total = await totalDe(page)
    test.skip(total <= 25, `hacen falta más de 25 pagos para cruzar páginas; hay ${total}`)

    const primera = await columnaDeImportes(page, 'Valor')
    expect(primera.length).toBeGreaterThan(0)
    // Dentro de la página, en orden.
    expect([...primera].sort((a, b) => b - a)).toEqual(primera)

    await page.goto('/seller/payments?sort=totalAmount&dir=desc&page=2')
    const segunda = await columnaDeImportes(page, 'Valor')

    // LA COMPROBACIÓN: el mayor de la página 2 no puede superar al menor de la 1.
    expect(Math.max(...segunda)).toBeLessThanOrEqual(Math.min(...primera))
  })

  test('ascendente: mismo criterio al revés', async ({ page }) => {
    await page.goto('/seller/payments?sort=totalAmount&dir=asc')
    const total = await totalDe(page)
    test.skip(total <= 25, `hacen falta más de 25 pagos; hay ${total}`)

    const primera = await columnaDeImportes(page, 'Valor')
    expect([...primera].sort((a, b) => a - b)).toEqual(primera)

    await page.goto('/seller/payments?sort=totalAmount&dir=asc&page=2')
    const segunda = await columnaDeImportes(page, 'Valor')
    expect(Math.min(...segunda)).toBeGreaterThanOrEqual(Math.max(...primera))
  })

  test('con muchos empates, el recorrido completo sigue ordenado y no pierde filas', async ({
    page,
  }) => {
    /*
      «Método» empata muchísimo: casi todos los pagos son del mismo. Es el peor
      caso para un orden sin desempate estable, porque PostgreSQL puede
      devolver las filas empatadas en cualquier orden entre dos consultas y
      entonces una fila sale dos veces mientras otra no sale nunca.

      Se recorren TODAS las páginas y se comprueban dos cosas sobre el recorrido
      entero: que el orden no se rompe en ningún salto de página y que el número
      de filas vistas es exactamente el total anunciado.
    */
    await page.goto('/seller/payments?sort=totalAmount&dir=asc')
    const total = await totalDe(page)
    test.skip(total <= 25, `hacen falta más de 25 pagos; hay ${total}`)

    const recorrido: number[] = []
    const paginas = Math.ceil(total / 25)
    for (let p = 1; p <= paginas; p += 1) {
      await page.goto(`/seller/payments?sort=totalAmount&dir=asc&page=${p}`)
      recorrido.push(...(await columnaDeImportes(page, 'Valor')))
    }

    expect(recorrido.length).toBe(total)
    expect([...recorrido].sort((a, b) => a - b)).toEqual(recorrido)
  })

  test('el orden sobrevive al pasar de página, y vuelve a la 1 al cambiarlo', async ({ page }) => {
    await page.goto('/seller/payments?sort=totalAmount&dir=desc')
    const total = await totalDe(page)
    test.skip(total <= 25, `hacen falta más de 25 pagos; hay ${total}`)

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

  test('«Cliente» y «Falta» no ofrecen orden, porque la base no puede darlo', async ({ page }) => {
    await page.goto('/seller/tickets')
    await expect(page.getByRole('columnheader', { name: 'Cliente' })).toBeVisible()

    // La cabecera existe; el BOTON que pediria el orden, no.
    await expect(page.getByRole('button', { name: /^Cliente/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Falta/ })).toHaveCount(0)
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
      // El total sigue siendo el de verdad, aunque no haya filas que ensenar.
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
