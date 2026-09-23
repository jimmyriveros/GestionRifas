import { expect, test, type Page } from '@playwright/test'

import { createClientFor, loadSeedRefs, purgeTestRaffles, serviceClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * ORDENAR DESDE EL TELEFONO EN «BOLETAS» DEL PERSONAL (I-155, D-217).
 *
 * Es el mismo control que D-215 puso en «Mis boletas», con la lista blanca del
 * personal (D-198): boleta, rifa y vendedor. Nunca cliente ni dinero, ni como
 * opcion ni por la direccion.
 *
 * Se prueba con los DOS roles del personal: el Dueño y el Administrador ven la
 * misma pantalla y el mismo control.
 */

function control(page: Page) {
  return page.getByRole('combobox', { name: 'Ordenar las boletas' })
}

async function elegir(page: Page, opcion: string) {
  await control(page).click()
  await page.getByRole('option', { name: opcion, exact: true }).click()
}

test.describe('Ordenar desde el telefono en el portal del personal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('dice el orden activo, ofrece solo boleta, rifa y vendedor, y lo cambia', async ({
    page,
  }) => {
    await page.goto('/owner/tickets')
    await expect(control(page)).toHaveText(/Más recientes primero/)

    await control(page).click()
    const opciones = await page.getByRole('option').allInnerTexts()
    expect(opciones).toEqual([
      'Más recientes primero',
      'Boleta, de menor a mayor',
      'Boleta, de mayor a menor',
      'Rifa, de la A a la Z',
      'Rifa, de la Z a la A',
      'Vendedor, de la A a la Z',
      'Vendedor, de la Z a la A',
    ])
    // Ninguna palabra de la cartera (D-198).
    for (const texto of opciones) {
      expect(texto).not.toMatch(/Cliente|Falta|Abonado|Progreso|Precio|Saldo/)
    }
    await page.getByRole('option', { name: 'Vendedor, de la A a la Z', exact: true }).click()

    await expect(page).toHaveURL(/sort=sellerName/)
    await expect(page).not.toHaveURL(/dir=/)
    await expect(control(page)).toHaveText(/Vendedor, de la A a la Z/)
  })

  test('se puede volver al orden predeterminado', async ({ page }) => {
    await page.goto('/owner/tickets?sort=raffleShortCode&dir=desc')
    await expect(control(page)).toHaveText(/Rifa, de la Z a la A/)

    await elegir(page, 'Más recientes primero')

    await expect(page).not.toHaveURL(/sort=/)
    await expect(page).not.toHaveURL(/dir=/)
    await expect(control(page)).toHaveText(/Más recientes primero/)
  })

  test('al cambiar el orden vuelve a la pagina 1 y conserva busqueda y filtros', async ({
    page,
  }) => {
    await page.goto('/owner/tickets?q=0&inventoryStatus=available&page=2')
    await elegir(page, 'Boleta, de mayor a menor')

    await expect(page).toHaveURL(/q=0/)
    await expect(page).toHaveURL(/inventoryStatus=available/)
    await expect(page).toHaveURL(/sort=dailyNumber/)
    await expect(page).toHaveURL(/dir=desc/)
    await expect(page).not.toHaveURL(/page=/)
    // Un orden no es un filtro: el boton sigue contando solo el suyo.
    await expect(page.getByRole('button', { name: 'Filtros (1)' })).toBeVisible()
  })

  test('atras, adelante y recargar conservan el orden', async ({ page }) => {
    await page.goto('/owner/tickets')
    await elegir(page, 'Rifa, de la A a la Z')
    await expect(page).toHaveURL(/sort=raffleShortCode/)

    await page.goBack()
    await expect(page).not.toHaveURL(/sort=/)
    await expect(control(page)).toHaveText(/Más recientes primero/)

    await page.goForward()
    await expect(page).toHaveURL(/sort=raffleShortCode/)
    await expect(control(page)).toHaveText(/Rifa, de la A a la Z/)

    await page.reload()
    await expect(control(page)).toHaveText(/Rifa, de la A a la Z/)
  })

  test('un orden de cartera en la direccion se RECHAZA y el control no lo inventa', async ({
    page,
  }) => {
    // La consulta del personal no admite dinero ni cliente: `parseListSort` lo
    // descarta y la lista sale en su orden de siempre. El control lo cuenta asi,
    // y no describe algo que no se aplica.
    for (const columna of ['pendingAmount', 'salePrice', 'clientName', 'paidAmount']) {
      await page.goto(`/owner/tickets?sort=${columna}&dir=desc`)
      await expect(control(page)).toHaveText(/Más recientes primero/)
      await control(page).click()
      await expect(page.getByRole('option')).toHaveCount(7)
      await page.keyboard.press('Escape')
    }
  })

  test('un orden valido que el telefono no ofrece se DICE', async ({ page }) => {
    await page.goto('/owner/tickets?sort=clearance&dir=desc')
    await expect(control(page)).toHaveText(/Paz y salvo, primero Por entregar/)

    await control(page).click()
    // La opcion descrita va primero y elegida; las siete de siempre, detras.
    await expect(page.getByRole('option')).toHaveCount(8)
    await page.getByRole('option', { name: 'Más recientes primero', exact: true }).click()
    await expect(page).not.toHaveURL(/sort=/)
  })

  test('buscando: la primera opcion dice relevancia, tambien con un orden descrito', async ({
    page,
  }) => {
    await page.goto('/owner/tickets?q=12')
    await expect(control(page)).toHaveText(/Las que mejor coinciden/)

    await page.goto('/owner/tickets?q=12&sort=paymentState')
    await expect(control(page)).toHaveText(/Estado de pago, primero Pagada/)
    await control(page).click()
    await page.getByRole('option', { name: 'Las que mejor coinciden', exact: true }).click()
    await expect(page).toHaveURL(/q=12/)
    await expect(page).not.toHaveURL(/sort=/)
  })

  test('a 320 px conviven los controles y nada se desborda', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/owner/tickets')

    const elementos = [
      page.getByRole('link', { name: 'Crear en lote' }),
      page.getByRole('button', { name: /^Filtros/ }),
      page.getByRole('button', { name: 'Seleccionar varias' }),
      control(page),
    ]
    for (const elemento of elementos) {
      await expect(elemento).toBeVisible()
      const caja = await elemento.boundingBox()
      expect(caja).not.toBeNull()
      expect(caja!.x).toBeGreaterThanOrEqual(0)
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(320)
      expect(caja!.height).toBeGreaterThanOrEqual(44)
    }

    // La frase mas larga que el control puede enseñar, tambien a 320.
    await page.goto('/owner/tickets?sort=inventoryStatus&dir=desc')
    await expect(control(page)).toHaveText(/Estado de la boleta, primero Pendiente de aprobación/)
    const caja = await control(page).boundingBox()
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(320)
    expect(caja!.height).toBeGreaterThanOrEqual(44)
    // Y no se recorta: la frase entera cabe en su caja, aunque baje de linea.
    const recortada = await control(page)
      .locator('[data-slot="select-value"]')
      .evaluate(
        (valor) => valor.scrollWidth > valor.clientWidth || valor.scrollHeight > valor.clientHeight,
      )
    expect(recortada).toBe(false)

    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desbordamiento).toBeLessThanOrEqual(0)
  })

  test('el orden se lee ya en el HTML del servidor, antes de cargar el JavaScript', async ({
    page,
  }) => {
    // Hasta el 2026-09-23 el HTML servido traia el control VACIO en los dos
    // portales: la frase la copiaba Radix al hidratar. Se mide el HTML crudo,
    // no la pagina ya hidratada, que es lo que esta prueba necesita ver.
    for (const [ruta, frase] of [
      ['/owner/tickets', 'Más recientes primero'],
      ['/owner/tickets?sort=raffleShortCode&dir=desc', 'Rifa, de la Z a la A'],
      ['/owner/tickets?sort=clearance', 'Paz y salvo, primero Entregado'],
      ['/owner/tickets?q=12', 'Las que mejor coinciden'],
    ] as const) {
      const html = await (await page.request.get(ruta)).text()
      const control = html.match(/aria-label="Ordenar las boletas"[\s\S]{0,1500}/)?.[0] ?? ''
      const valor = control.match(/data-slot="select-value"[^>]*>([^<]*)</)?.[1]
      expect(valor, ruta).toBe(frase)
    }
  })

  test('se alcanza y se opera con el teclado, y el foco no se pierde', async ({ page }) => {
    await page.goto('/owner/tickets')
    const orden = control(page)

    await orden.focus()
    await expect(orden).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/sort=dailyNumber/)
    await expect(orden).toBeFocused()
  })

  test('la seleccion de boletas sobrevive al cambio de orden', async ({ page }) => {
    await page.goto('/owner/tickets')
    await page.getByRole('button', { name: 'Seleccionar varias' }).click()
    await page.getByRole('checkbox', { name: 'Seleccionar las boletas de esta página' }).check()

    const verSeleccionadas = page.getByRole('button', { name: 'Ver seleccionadas' })
    await expect(verSeleccionadas).toBeVisible()
    const antes = await page.getByRole('status').first().innerText()

    await elegir(page, 'Vendedor, de la Z a la A')
    await expect(page).toHaveURL(/sort=sellerName/)

    await expect(verSeleccionadas).toBeVisible()
    await expect(page.getByRole('status').first()).toHaveText(antes)
  })
})

test.describe('El Administrador tiene el mismo control', () => {
  test('ordena igual que el Dueño', async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin)
    await page.goto('/owner/tickets')
    await expect(control(page)).toHaveText(/Más recientes primero/)

    await elegir(page, 'Boleta, de menor a mayor')
    await expect(page).toHaveURL(/sort=dailyNumber/)
    await expect(control(page)).toHaveText(/Boleta, de menor a mayor/)
  })
})

/**
 * EL TEXTO DEL CONTROL CORRESPONDE CON LO QUE SALE (D-216, aplicado al
 * personal). Tres boletas montadas para que cada orden dé una secuencia
 * distinta. En particular, «Estado de la boleta» en el personal se compara como
 * TEXTO —`assigned` < `available` < `draft`—, no por el enumerado —que pondria
 * el borrador primero—: si la frase mintiera, esta prueba lo veria.
 */
test.describe('El texto del control del personal corresponde con lo que sale', () => {
  const STAMP = Date.now().toString(36).slice(-5)
  let raffleId = ''
  let clientId = ''

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
    clientId = (await createClientFor(refs, `Orden Personal ${STAMP}`)).id

    const { data } = await svc
      .from('raffles')
      .insert({
        organization_id: refs.organizationId,
        name: `Rifa orden personal ${STAMP}`,
        ticket_price: 120_000,
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: refs.ownerId,
      })
      .select('id')
      .single()
    raffleId = data!.id

    const base = {
      organization_id: refs.organizationId,
      raffle_id: raffleId,
      seller_id: refs.sellerId,
      created_by: refs.ownerId,
    }

    // Una a una y con pausa, para que `created_at` las separe (HANDOFF): 0012
    // la mas antigua, 4512 la mas reciente.
    const filas = [
      {
        ...base,
        daily_number: '0012',
        weekly_number: '9001',
        inventory_status: 'assigned' as const,
        client_id: clientId,
        sale_price: 120_000,
        sale_date: '2026-09-01',
        assigned_at: new Date().toISOString(),
      },
      {
        ...base,
        daily_number: '1234',
        weekly_number: '9002',
        inventory_status: 'available' as const,
      },
      { ...base, daily_number: '4512', weekly_number: '9003', inventory_status: 'draft' as const },
    ]
    for (const fila of filas) {
      const { error } = await svc.from('tickets').insert([fila])
      if (error) throw error
      await new Promise((listo) => setTimeout(listo, 1100))
    }
  })

  test.afterAll(async () => {
    await purgeTestRaffles({ raffleIds: [raffleId], clientIds: [clientId] })
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('por defecto: fecha', async ({ page }) => {
    await page.goto(`/owner/tickets?raffleId=${raffleId}`)
    await expect(control(page)).toHaveText(/Más recientes primero/)
    expect(await diariosDeTarjetas(page)).toEqual(['4512', '1234', '0012'])
  })

  test('estado de la boleta ascendente: primero Asignada, como dice el control', async ({
    page,
  }) => {
    await page.goto(`/owner/tickets?raffleId=${raffleId}&sort=inventoryStatus`)
    await expect(control(page)).toHaveText(/Estado de la boleta, primero Asignada/)
    expect(await diariosDeTarjetas(page)).toEqual(['0012', '1234', '4512'])
  })

  test('estado de la boleta descendente: el borrador antes que la disponible', async ({ page }) => {
    await page.goto(`/owner/tickets?raffleId=${raffleId}&sort=inventoryStatus&dir=desc`)
    // En esta rifa no hay ninguna pendiente de aprobación, así que la primera es
    // la de valor MAYOR presente: `draft`.
    await expect(control(page)).toHaveText(/Estado de la boleta, primero Pendiente de aprobación/)
    expect(await diariosDeTarjetas(page)).toEqual(['4512', '1234', '0012'])
  })

  test('buscando: relevancia, y el control lo dice', async ({ page }) => {
    await page.goto(`/owner/tickets?raffleId=${raffleId}&q=12`)
    await expect(control(page)).toHaveText(/Las que mejor coinciden/)
    // Primero la que EMPIEZA por «12»; despues las que lo contienen, por numero.
    expect(await diariosDeTarjetas(page)).toEqual(['1234', '0012', '4512'])
  })

  test('buscando y pidiendo boleta descendente, manda el orden pedido', async ({ page }) => {
    await page.goto(`/owner/tickets?raffleId=${raffleId}&q=12&sort=dailyNumber&dir=desc`)
    await expect(control(page)).toHaveText(/Boleta, de mayor a menor/)
    expect(await diariosDeTarjetas(page)).toEqual(['4512', '1234', '0012'])
  })
})
