import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  createClientFor,
  createTicket,
  loadSeedRefs,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Fila seleccionable de las tablas y estados visuales de la lista de clientes.
 *
 * Lo que se comprueba aqui no es que la fila navegue —eso es un `router.push`—,
 * sino los dos bordes que se rompen callados:
 *
 * 1. Que un clic sobre algo que YA hace algo (la casilla de aprobacion, el menu
 *    de acciones) no dispare ademas la apertura del detalle.
 * 2. Que ningun estado deje texto ilegible. El contraste se mide sobre los
 *    colores que el navegador calcula de verdad, no sobre las clases escritas:
 *    el fallo original (I-033) era justamente que las clases parecian correctas
 *    y en pantalla ganaba otra cosa.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/** Boleta disponible del vendedor 1, con sus dos numeros a mano. */
async function availableTicket(status: 'available' | 'pending_approval' = 'available') {
  const numbers = randomTicketNumbers()
  const ticket = await createTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    inventoryStatus: status,
  })
  return { ...ticket, numbers }
}

/**
 * Contraste real de un texto contra el fondo que acaba viendose detras (WCAG).
 *
 * Dos cosas obligan a hacerlo asi y no leyendo dos colores:
 *
 * - La paleta esta en `oklch` (globals.css) y el navegador devuelve los colores
 *   ya calculados en `lab()` / `oklab()`, no en `rgb()`. Leer sus numeros como
 *   canales de 0 a 255 daba un contraste de 1,00 en textos perfectamente
 *   legibles. Por eso se PINTAN en un canvas y se leen los pixeles: asi el
 *   navegador hace la conversion, sea cual sea la notacion.
 * - Casi todos los fondos llevan alfa (`bg-muted/50`, `text-primary-foreground/80`).
 *   Hay que componerlos de la raiz hacia el elemento, no quedarse en el primero.
 */
async function textContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d')!

    /** Pinta el color sobre una base opaca y devuelve el pixel resultante. */
    const paintOver = (color: string, base: string): [number, number, number] => {
      context.fillStyle = base
      context.fillRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data
      return [r!, g!, b!]
    }

    /**
     * Cualquier notacion de color CSS -> [r, g, b, alfa].
     *
     * El mismo color sobre blanco y sobre negro da dos ecuaciones con dos
     * incognitas: de la diferencia sale el alfa, y de ahi el color.
     */
    const parse = (color: string): [number, number, number, number] => {
      const onWhite = paintOver(color, '#ffffff')
      const onBlack = paintOver(color, '#000000')
      const alpha = 1 - (onWhite[0] - onBlack[0]) / 255
      if (alpha <= 0) return [0, 0, 0, 0]
      return [onBlack[0] / alpha, onBlack[1] / alpha, onBlack[2] / alpha, alpha]
    }

    type Rgb = [number, number, number, number]
    const over = (top: Rgb, bottom: Rgb): Rgb => [
      top[0] * top[3] + bottom[0] * (1 - top[3]),
      top[1] * top[3] + bottom[1] * (1 - top[3]),
      top[2] * top[3] + bottom[2] * (1 - top[3]),
      1,
    ]

    // Fondos desde el elemento hasta la raiz, compuestos de abajo arriba.
    const layers: Rgb[] = []
    for (let node: Element | null = element; node; node = node.parentElement) {
      layers.push(parse(getComputedStyle(node).backgroundColor))
    }
    let background: Rgb = [255, 255, 255, 1]
    for (const layer of layers.reverse()) background = over(layer, background)

    const text = over(parse(getComputedStyle(element).color), background)

    const luminance = ([r, g, b]: Rgb) => {
      const channel = (value: number) => {
        const c = value / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }

    const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a)
    return (light! + 0.05) / (dark! + 0.05)
  })
}

/**
 * Caja del elemento una vez que deja de moverse.
 *
 * El dialogo entra con una animacion de escala: medir sin esperarla compara el
 * fotograma intermedio con el final y finge un desplazamiento que no existe.
 */
async function stableBox(locator: Locator): Promise<{ x: number; width: number; height: number }> {
  let previous = (await locator.boundingBox())!
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await locator.page().waitForTimeout(50)
    const current = (await locator.boundingBox())!
    if (
      current.x === previous.x &&
      current.width === previous.width &&
      current.height === previous.height
    ) {
      return current
    }
    previous = current
  }
  return previous
}

/**
 * Fondo calculado de un elemento una vez que deja de cambiar.
 *
 * Filas y opciones llevan `transition-colors`: medir justo despues del hover
 * captura un fotograma a medio camino —un fondo que no existe en reposo— y la
 * comprobacion pasa o falla segun lo rapida que vaya la maquina.
 */
async function backgroundOf(locator: Locator): Promise<string> {
  const read = () => locator.evaluate((element) => getComputedStyle(element).backgroundColor)
  let previous = await read()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await locator.page().waitForTimeout(50)
    const current = await read()
    if (current === previous) return current
    previous = current
  }
  return previous
}

/**
 * Fondo despues de un cambio de estado, esperando primero a que el cambio
 * OCURRA.
 *
 * `backgroundOf` por si solo devuelve en cuanto dos lecturas coinciden, y con
 * la maquina cargada las dos primeras pueden caer antes de que el hover surta
 * efecto: devolveria el color anterior y la prueba fallaria diciendo que el
 * hover no se nota. Aqui se espera a que el valor deje de ser el de antes y
 * solo entonces se deja reposar.
 */
async function backgroundAfterChange(locator: Locator, previous: string): Promise<string> {
  await expect
    .poll(() => locator.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(previous)
  return backgroundOf(locator)
}

async function firstRow(page: Page): Promise<Locator> {
  const row = page.locator('tbody tr').first()
  await expect(row).toBeVisible()
  return row
}

test.describe('Fila seleccionable en las tablas', () => {
  test('abre el detalle pulsando cualquier parte de la fila, no solo el código', async ({
    page,
  }) => {
    const ticket = await availableTicket()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${ticket.internalCode}`)

    const row = await firstRow(page)
    // La celda de los números: texto suelto, sin enlace ni botón dentro.
    await row.getByText(`${ticket.numbers.daily} / ${ticket.numbers.weekly}`).click()

    await page.waitForURL(`**/seller/tickets/${ticket.id}`)
    await expect(page.getByRole('heading', { name: ticket.internalCode })).toBeVisible()
  })

  test('la fila se abre con el teclado: Enter sobre la fila enfocada', async ({ page }) => {
    const ticket = await availableTicket()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${ticket.internalCode}`)

    await (await firstRow(page)).focus()
    await page.keyboard.press('Enter')

    await page.waitForURL(`**/seller/tickets/${ticket.id}`)
  })

  test('la casilla de aprobación marca la boleta sin abrir su detalle', async ({ page }) => {
    const ticket = await availableTicket('pending_approval')

    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/tickets?q=${ticket.internalCode}`)

    const row = await firstRow(page)
    await row.getByRole('checkbox').click()

    await expect(page).toHaveURL(/\/owner\/tickets\?/)
    await expect(row.getByRole('checkbox')).toBeChecked()
    await expect(page.getByRole('button', { name: 'Aprobar seleccionadas' })).toBeEnabled()
  })

  test('el menú de acciones de un vendedor no abre su detalle', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/sellers')

    const row = await firstRow(page)
    await row.getByRole('button', { name: /^Acciones para / }).click()

    // El menú de Radix se dibuja en un portal: su clic llega igual al manejador
    // de la fila por la propagación de React, y debe quedarse en el menú.
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page).toHaveURL(/\/owner\/sellers$/)
  })

  test('el hover marca la fila sin quitarle legibilidad', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/sellers')

    const row = await firstRow(page)
    const nameCell = row.locator('td').first()

    const restBackground = await backgroundOf(row)
    await row.hover()
    await backgroundAfterChange(row, restBackground)

    expect(await textContrast(nameCell)).toBeGreaterThanOrEqual(4.5)
  })
})

test.describe('Estados de la lista de clientes al asignar una boleta', () => {
  /**
   * Un solo cliente para las cuatro pruebas, y se borra al terminar.
   *
   * El selector del diálogo muestra los primeros 50 clientes cuando no se ha
   * escrito nada en el buscador, y hay pruebas anteriores que cuentan con eso
   * (`seller-tickets.spec.ts`, BR-I08). Dejar cuatro clientes por ejecución las
   * rompe en cuanto alguien corre la suite varias veces sin `db:reset`. Se
   * borra con la conexión de servicio, igual que `F9-02` con su pago.
   */
  let client: { id: string; name: string }

  test.beforeAll(async () => {
    client = await createClientFor(refs, unique('Cliente contraste'))
  })

  test.afterAll(async () => {
    await serviceClient().from('clients').delete().eq('id', client.id)
  })

  /** Deja una boleta disponible y abre el diálogo de asignación sobre ella. */
  async function openDialog(page: Page): Promise<{ option: Locator; name: string }> {
    const ticket = await availableTicket()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()
    await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(client.name)

    /*
      Hay que esperar a que la busqueda TERMINE, no solo a que el cliente
      aparezca. Desde que la busqueda va al servidor (D-078) el nombre puede
      verse porque venia en el bloque inicial, con la consulta todavia en
      camino; cuando esa consulta vuelve, la lista se encoge y la opcion que se
      estaba midiendo se mueve de sitio —el cursor deja de estar encima y el
      hover se pierde a mitad de la comprobacion—.

      `aria-busy` no sirve para esperar: durante el debounce todavia no se esta
      buscando, asi que vale `false` sin que haya terminado nada. El nombre es
      unico, asi que la senal fiable es que quede UNA sola opcion.
    */
    const option = page.getByRole('option', { name: new RegExp(client.name) })
    await expect(page.getByRole('option')).toHaveCount(1)
    await expect(option).toBeVisible()
    return { option, name: client.name }
  }

  test('el cliente elegido sigue legible al pasar el cursor por encima (I-033)', async ({
    page,
  }) => {
    const { option, name } = await openDialog(page)
    const nameText = option.getByText(name)

    const unselected = await backgroundOf(option)
    expect(await textContrast(nameText)).toBeGreaterThanOrEqual(4.5)

    await option.click()
    await expect(option).toHaveAttribute('aria-selected', 'true')
    // Tras el clic el cursor sigue encima: hay que apartarlo para medir el
    // estado en reposo.
    await page.mouse.move(0, 0)
    const selected = await backgroundOf(option)
    expect(await textContrast(nameText)).toBeGreaterThanOrEqual(4.5)

    await option.hover()
    const selectedHover = await backgroundAfterChange(option, selected)

    // Sigue viéndose elegido —el fondo no vuelve al de una opción cualquiera—,
    // el hover se nota, y el nombre nunca se acerca a su propio fondo.
    expect(selectedHover).not.toBe(unselected)
    expect(selectedHover).not.toBe(selected)
    expect(await textContrast(nameText)).toBeGreaterThanOrEqual(4.5)
  })

  test('el teléfono del cliente elegido también se lee al pasar el cursor', async ({ page }) => {
    const { option } = await openDialog(page)
    await option.click()
    await option.hover()
    await backgroundOf(option) // deja terminar la transición de color

    // La línea secundaria es la primera en perderse: más pequeña y más suave.
    const description = option.locator('span.text-xs').first()
    expect(await textContrast(description)).toBeGreaterThanOrEqual(4.5)
  })

  test('la elección no se anuncia solo con color', async ({ page }) => {
    const { option } = await openDialog(page)
    await option.click()

    // `aria-selected` para quien no ve el color y un visto para quien no lo
    // distingue (CLAUDE.md §27).
    await expect(option).toHaveAttribute('aria-selected', 'true')
    await expect(option.locator('svg')).toHaveCSS('opacity', '1')
  })

  test('elegir un cliente no desplaza el contenido de la lista', async ({ page }) => {
    const { option } = await openDialog(page)

    const before = await stableBox(option)
    await option.click()
    await option.hover()
    const after = await stableBox(option)

    expect(after.width).toBeCloseTo(before.width, 0)
    expect(after.height).toBeCloseTo(before.height, 0)
    expect(after.x).toBeCloseTo(before.x, 0)
  })
})
