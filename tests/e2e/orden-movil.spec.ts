import { expect, test, type Page } from '@playwright/test'

import { loadSeedRefs, serviceClient } from './db-setup'
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

  test('recargar conserva el orden', async ({ page }) => {
    await page.goto('/seller/tickets?sort=percentage&dir=asc')
    await page.reload()
    await expect(control(page, 'boletas')).toHaveText(/Progreso, de menor a mayor/)
  })

  test('un orden que el control no ofrece no lo hace mentir', async ({ page }) => {
    // «Rifa» se puede pedir por la direccion pero no se ofrece en el telefono:
    // el control cae al valor por defecto en vez de anunciar algo que no tiene.
    await page.goto('/seller/tickets?sort=raffleShortCode&dir=desc')
    await expect(control(page, 'boletas')).toHaveText(/Más recientes primero/)
    await expect(page.getByRole('heading', { name: 'Mis boletas' })).toBeVisible()
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
