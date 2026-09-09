import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * El dinero del panel, en los DOS portales.
 *
 * El administrativo conserva la tarjeta «Resumen de cobranza» (D-090). El del
 * vendedor tiene «Estado de cobro», una sola seccion que reparte el mismo total
 * y ademas escribe a la vista de que se compone lo que falta por cobrar
 * (D-112, D-171). Desde D-175 es ademas la PRIMERA region de la pantalla y la
 * unica fuente de esas cifras: los indicadores «Por cobrar» y «Cobranza», que
 * las repetian arriba, ya no existen.
 *
 * La aritmetica (vendido/recaudado/pendiente/estados de pago) ya la prueban a
 * fondo las vistas SQL en tests/db. Lo que se verifica aqui es lo que solo se
 * puede ver end-to-end: que el panel pinte EXACTAMENTE los mismos numeros que
 * las tarjetas de /owner/payments y /seller/payments —alimentadas por el mismo
 * `dashboard.totals`—, que las cifras de la seccion cuadren entre si, y que sin
 * ventas se vea un estado vacio limpio en vez de una pantalla de ceros.
 */

function parseCOP(text: string): number {
  return Number.parseInt(text.replace(/[^0-9]/g, ''), 10)
}

/** La tarjeta «Resumen de cobranza» del panel administrativo (D-090). */
function summaryCard(page: Page) {
  return page.locator('[data-tour="financial-summary"]')
}

/**
 * La sección «Estado de cobro» del panel del vendedor.
 *
 * Se busca por `data-section` y no por el anclaje del recorrido: desde D-171
 * ese anclaje marca **una mitad** de la tarjeta —las cuatro cifras—, porque una
 * tarjeta más alta que el teléfono deja el globo del recorrido fuera de la
 * pantalla. Las pruebas necesitan la tarjeta entera.
 */
function estadoDeCobro(page: Page) {
  return page.locator('[data-section="estado-de-cobro"]')
}

/** Una de las cuatro cifras del resumen del dinero, por su rotulo. */
async function figura(page: Page, label: string): Promise<number> {
  const fila = estadoDeCobro(page)
    .locator('dl > div')
    .filter({
      has: page.getByText(label, { exact: true }),
    })
  return parseCOP((await fila.locator('dd').textContent()) ?? '')
}

/** El bloque de un estado de pago, por su nombre. */
function bloque(page: Page, name: string) {
  return estadoDeCobro(page)
    .locator('a[href*="paymentStatus="]')
    .filter({ has: page.getByText(name, { exact: true }) })
}

/** Una de las cifras de dentro de un bloque, por su rotulo. */
async function importe(page: Page, name: string, label: string): Promise<number> {
  const fila = bloque(page, name)
    .locator('dl > div')
    .filter({ has: page.getByText(label, { exact: true }) })
  return parseCOP((await fila.locator('dd').textContent()) ?? '')
}

async function metricCardValue(page: Page, label: string): Promise<number> {
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(label, { exact: true }) })
  const text = await card.locator('[data-slot="card-content"] p').first().textContent()
  return parseCOP(text ?? '')
}

/**
 * La tarjeta «Recaudado»: lo que entró en el período elegido, y su selector.
 *
 * Es la única región del panel que sigue dependiendo del período (D-175). Se
 * busca por su encabezado y no por el texto suelto, porque «Recaudado» también
 * es una palabra del reporte de pagos.
 */
function recaudado(page: Page) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Recaudado', exact: true }) })
}

test.describe('Resumen de cobranza del panel administrativo (D-090)', () => {
  test('el panel del dueño coincide con las tarjetas de Pagos', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    await expect(page.getByText('Rifa activa')).toHaveCount(0)
    await expect(summaryCard(page).getByText('Resumen de cobranza')).toBeVisible()

    const bar = summaryCard(page).getByRole('progressbar')
    await expect(bar).toHaveAttribute('aria-valuemin', '0')
    await expect(bar).toHaveAttribute('aria-valuemax', '100')

    const amounts = summaryCard(page)
      .locator('p')
      .filter({ hasText: /^\$[\d.]+$/ })
    const texts = await amounts.allTextContents()
    expect(texts).toHaveLength(2)
    const shown = { collected: parseCOP(texts[0]!), pending: parseCOP(texts[1]!) }

    const percentage = Number(await bar.getAttribute('aria-valuenow'))
    expect(percentage).toBeGreaterThanOrEqual(0)
    expect(percentage).toBeLessThanOrEqual(100)

    await page.goto('/owner/payments')
    expect(shown.collected).toBe(await metricCardValue(page, 'Total recaudado'))
    expect(shown.pending).toBe(await metricCardValue(page, 'Saldo pendiente'))
  })
})

test.describe('Estado de cobro del panel del vendedor (D-112, D-171)', () => {
  test('el total del encabezado es EXACTAMENTE lo que suman sus dos cifras (D-172)', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const badge = await estadoDeCobro(page).locator('[data-slot="badge"]').first().innerText()
    const linea = await estadoDeCobro(page)
      .getByText(/disponibles? · .*vendidas?/)
      .innerText()

    const activas = Number.parseInt(badge.replace(/[^0-9]/g, ''), 10)
    const cifras = (linea.match(/\d+/g) ?? []).map(Number)
    expect(cifras).toHaveLength(2)

    expect(badge).toMatch(/boletas? activas?/)
    expect(cifras[0]! + cifras[1]!).toBe(activas)

    // Y NO es el total registrado, que cuenta además borradores, pendientes de
    // aprobación y anuladas: esa cifra vive en «Mis boletas», con su nombre.
    const misBoletas = page.locator('[data-slot="card"]').filter({ hasText: 'Mis boletas' }).first()
    await expect(misBoletas.getByText('Registradas', { exact: true })).toBeVisible()
    await expect(estadoDeCobro(page).getByText(/en total/)).toHaveCount(0)
  })

  test('las cifras de la sección cuadran entre sí y con /seller/payments', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    await expect(estadoDeCobro(page).getByText('Estado de cobro')).toBeVisible()
    // Las tarjetas anteriores no pueden quedar tambien: seria el mismo dinero
    // contado dos veces en la misma pantalla.
    await expect(page.getByText('Resumen de cobranza')).toHaveCount(0)
    await expect(page.getByText('Resumen financiero')).toHaveCount(0)
    await expect(page.getByText('Tu ganancia')).toHaveCount(0)
    // Ya esta en /seller/tickets (encabezado + estado vacio); en el panel seria redundante.
    await expect(page.getByRole('link', { name: 'Crear boletas' })).toHaveCount(0)

    const [totalVendido, yaCobraste, faltaCobrar] = await Promise.all([
      figura(page, 'Total vendido'),
      figura(page, 'Ya cobraste'),
      figura(page, 'Falta cobrar'),
    ])

    // La igualdad de arriba: lo cobrado mas lo que falta es lo vendido.
    expect(yaCobraste + faltaCobrar).toBe(totalVendido)

    const [deben, todaviaDeben, yaAbonaron, cobrado] = await Promise.all([
      importe(page, 'Sin pagos', 'Deben'),
      importe(page, 'Con abonos', 'Todavía deben'),
      importe(page, 'Con abonos', 'Ya abonaron'),
      importe(page, 'Pagadas', 'Cobrado'),
    ])

    // La igualdad que la seccion escribe a la vista, bajo las dos columnas.
    expect(deben + todaviaDeben).toBe(faltaCobrar)
    // Y la que se deduce leyendo el resumen de arriba.
    expect(cobrado + yaAbonaron).toBe(yaCobraste)

    // El valor de venta de las boletas con abonos NO se escribe en ningun
    // sitio: era la cifra que se leia como dinero abonado y no lo era (D-171).
    if (todaviaDeben > 0 && yaAbonaron > 0) {
      const cifras = (await bloque(page, 'Con abonos').locator('dd').allTextContents()).map(
        parseCOP,
      )
      expect(cifras).not.toContain(todaviaDeben + yaAbonaron)
    }

    await page.goto('/seller/payments')
    expect(totalVendido).toBe(await metricCardValue(page, 'Total vendido'))
    expect(faltaCobrar).toBe(await metricCardValue(page, 'Saldo pendiente'))
  })

  test('cada estado de pago lleva a su lista ya filtrada', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    for (const [nombre, estado] of [
      ['Sin pagos', 'unpaid'],
      ['Con abonos', 'partial'],
      ['Pagadas', 'paid'],
    ] as const) {
      await expect(bloque(page, nombre)).toHaveAttribute(
        'href',
        `/seller/tickets?inventoryStatus=assigned&paymentStatus=${estado}`,
      )
    }
  })

  test('las tres tarjetas de indicadores que repetían este dinero ya no están (D-175)', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    // «Por cobrar» era «Falta cobrar» y «Cobranza» era «Avance del cobro»: la
    // misma cifra dos veces en la misma pantalla.
    await expect(page.getByText('Por cobrar', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Cobranza', { exact: true })).toHaveCount(0)
    // Los rótulos del resumen de arriba. Se piden como término de la lista y no
    // por texto suelto: «Falta cobrar» nombra además el grupo de abajo, que es
    // la misma cifra dicha en el otro sitio de la sección.
    const rotulo = (name: RegExp) => estadoDeCobro(page).getByRole('term').filter({ hasText: name })
    await expect(rotulo(/^Falta cobrar$/)).toBeVisible()
    await expect(rotulo(/^Avance del cobro$/)).toBeVisible()

    // «Recaudado» sí era una cifra distinta —la del período, no la acumulada—,
    // así que no desapareció: bajó a la tarjeta que ya dibujaba esa serie, y el
    // selector de período se fue con ella. Ya no vive en el encabezado, donde
    // parecía gobernar toda la pantalla.
    const periodo = page.getByLabel(/^Período de las cifras/)
    await expect(periodo).toHaveCount(1)
    await expect(recaudado(page).getByLabel(/^Período de las cifras/)).toBeVisible()

    // Y sigue siendo el mismo dinero que dice Pagos.
    const faltaCobrar = await figura(page, 'Falta cobrar')
    await page.goto('/seller/payments')
    expect(faltaCobrar).toBe(await metricCardValue(page, 'Saldo pendiente'))
  })

  /**
   * El orden del panel, recompuesto en D-180 sobre el de D-175.
   *
   * Lo que cambia: arriba van las dos cosas que se HACEN al entrar —repartir el
   * catálogo y mirar la lotería—, las dos en forma compacta; «Estado de cobro»
   * las sigue inmediatamente, que era la promesa de D-175 y se conserva —el
   * dinero se lee sin abrir nada—; y los accesos rápidos cierran la pantalla.
   */
  test('el orden del panel: catálogo, loterías, dinero… y los accesos al final', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const titulos = (await page.locator('main h2').allInnerTexts()).map((t) => t.trim())

    expect(titulos.slice(0, 4)).toEqual([
      'Comparte tu catálogo',
      'Loterías',
      'Estado de cobro',
      'Mis boletas',
    ])

    // Lo que ya pasó, después del dinero.
    expect(titulos.indexOf('Actividad reciente')).toBeGreaterThan(
      titulos.indexOf('Estado de cobro'),
    )
    // Y los accesos rápidos son el último bloque de la pantalla.
    expect(titulos.at(-1)).toBe('Accesos rápidos')
  })

  test('sin ventas, el panel muestra un estado vacío limpio', async ({ page }) => {
    // «Rifas Control» solo tiene boletas disponibles, ninguna vendida (scripts/seed.ts).
    await loginAs(page, ACCOUNTS.controlSeller)
    await page.goto('/seller/dashboard')

    await expect(page.getByText('Rifa activa')).toHaveCount(0)
    await expect(estadoDeCobro(page).getByText(/Aún no tienes ventas registradas/)).toBeVisible()
    // Sin ventas no se dibuja ni el resumen ni los grupos: una pantalla de
    // ceros y una barra vacia no informan de nada.
    await expect(estadoDeCobro(page).getByRole('progressbar')).toHaveCount(0)
    await expect(estadoDeCobro(page).locator('a[href*="paymentStatus="]')).toHaveCount(0)
    // El inventario SI se dice: el vendedor tiene boletas, solo que sin vender.
    await expect(estadoDeCobro(page).getByText(/boletas? activas?/)).toBeVisible()

    // Y ninguna cifra rota por dividir entre cero.
    await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0)

    // «Recaudado» es el único dinero que sigue dependiendo del período: dice
    // cero y explica qué hacer, en vez de dibujar un gráfico vacío sin más.
    // La cifra, no la marca «$0» del eje del gráfico que hay debajo.
    await expect(recaudado(page).getByRole('paragraph').filter({ hasText: /^\$0$/ })).toBeVisible()
    await expect(recaudado(page).getByText(/no recibiste ningún abono/)).toBeVisible()
  })
})
