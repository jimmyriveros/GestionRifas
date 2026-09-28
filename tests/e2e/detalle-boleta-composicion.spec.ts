import { expect, test, type Locator, type Page } from '@playwright/test'

import { textContrast } from './contrast'
import {
  createAssignedTicket,
  createClientFor,
  createPaymentWithAllocation,
  createTicket,
  loadSeedRefs,
  purgeTestData,
  raffleTicketPrice,
  type SeedRefs,
} from './db-setup'
import {
  cerca,
  coloresDe,
  encenderOscuro,
  horasYSusLineas,
  problemasDeMaquetacion,
  TONOS,
} from './detalle-boleta'
import { ACCOUNTS, loginAs, logout, randomTicketNumbers, unique } from './fixtures'

/**
 * El detalle de boleta del vendedor, recompuesto según Figma (D-231).
 *
 * Lo que se mide aquí es lo que una revisión de código no puede ver: DÓNDE cae
 * cada tarjeta en cada ancho, que nada se salga de su tarjeta ni de la página,
 * que las dos cifras queden a la misma altura, que la hora no se parta, que los
 * colores sean los del sistema en claro y en oscuro, y que el foco recorra la
 * pantalla en el orden en que se lee. Todo con las cajas y los estilos que el
 * navegador calcula, no con las clases escritas.
 *
 * Fija sus propios anchos —320, 390, 834, 1024, 1360, 1440 y 1920—, así que
 * corre en el proyecto de escritorio.
 */

const SECCIONES = [
  'Números de la boleta',
  'Cliente',
  'Información de venta',
  'Estado y resumen de pago',
  'Abonos de esta boleta',
  'Detalles de la boleta',
] as const

type Seccion = (typeof SECCIONES)[number]
type Caja = { x: number; y: number; width: number; height: number }

/*
  Los tonos de los números (D-233), las medidas de maquetación y la hora partida
  viven en `detalle-boleta.ts` desde D-234: la suite del detalle administrativo
  mide lo mismo sobre las mismas piezas.
*/

let refs: SeedRefs
let abonada: { id: string; daily: string; weekly: string }
let disponibleId: string

/**
 * Lo que crea la suite, apuntado EN CUANTO EXISTE y no al final: si `beforeAll`
 * falla a medias, `afterAll` borra lo que alcanzó a crear. Y si una prueba
 * falla, Playwright cambia de proceso y vuelve a ejecutar `beforeAll`; cada
 * proceso borra lo suyo. El abono no se apunta: cuelga del cliente, y
 * `purgeTestData` lo borra por él (I-035).
 */
const clientesCreados: string[] = []
const ticketsCreados: string[] = []

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  const precio = await raffleTicketPrice(refs)
  const cliente = await createClientFor(refs, unique('Composicion detalle'))
  clientesCreados.push(cliente.id)
  const numeros = randomTicketNumbers()
  const ticket = await createAssignedTicket(refs, {
    dailyNumber: numeros.daily,
    weeklyNumber: numeros.weekly,
    clientId: cliente.id,
    salePrice: precio,
  })
  ticketsCreados.push(ticket.id)
  // Un abono parcial: con historial de abonos la tarjeta del cliente lleva su
  // aviso y el cobro enseña el anillo, que es la pantalla más completa.
  await createPaymentWithAllocation(refs, {
    clientId: cliente.id,
    ticketId: ticket.id,
    amount: 20_000,
    method: 'cash',
    paymentDate: new Date().toISOString().slice(0, 10),
  })
  abonada = { id: ticket.id, daily: numeros.daily, weekly: numeros.weekly }

  const libres = randomTicketNumbers()
  const disponible = await createTicket(refs, {
    dailyNumber: libres.daily,
    weeklyNumber: libres.weekly,
    inventoryStatus: 'available',
  })
  ticketsCreados.push(disponible.id)
  disponibleId = disponible.id
})

test.afterAll(async () => {
  await purgeTestData({ clientIds: clientesCreados, ticketIds: ticketsCreados })
})

/** La tarjeta de una sección: el `Card` que contiene su `h2`. */
function tarjeta(page: Page, titulo: Seccion): Locator {
  return page
    .locator('main [data-slot="card"]')
    .filter({ has: page.getByRole('heading', { level: 2, name: titulo, exact: true }) })
}

async function abrir(page: Page, ticketId: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`/seller/tickets/${ticketId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Detalle boleta' })).toBeVisible()
}

async function cajas(page: Page, secciones: readonly Seccion[]): Promise<Record<string, Caja>> {
  const out: Record<string, Caja> = {}
  for (const titulo of secciones) {
    const caja = await tarjeta(page, titulo).boundingBox()
    expect(caja, `la tarjeta «${titulo}» existe`).not.toBeNull()
    out[titulo] = caja!
  }
  return out
}

/**
 * Escritorio: dos columnas que se apilan cada una por su cuenta —la boleta a la
 * izquierda, a 360 px, y el cobro a la derecha—, con 20 px entre tarjetas.
 */
async function dosColumnas(page: Page): Promise<void> {
  const c = await cajas(page, SECCIONES)
  const izquierda = [c['Números de la boleta']!, c['Cliente']!, c['Información de venta']!]
  const derecha = [
    c['Estado y resumen de pago']!,
    c['Abonos de esta boleta']!,
    c['Detalles de la boleta']!,
  ]

  for (const columna of [izquierda, derecha]) {
    for (let i = 1; i < columna.length; i++) {
      expect(cerca(columna[i]!.x, columna[0]!.x)).toBe(true)
      // Cada columna se apila sola: 20 px entre tarjetas, sin el hueco que
      // dejaría compartir filas con la otra columna.
      const hueco = columna[i]!.y - (columna[i - 1]!.y + columna[i - 1]!.height)
      expect(cerca(hueco, 20), `hueco de ${hueco} px entre tarjetas de una columna`).toBe(true)
    }
  }
  expect(cerca(izquierda[0]!.y, derecha[0]!.y), 'las dos columnas empiezan juntas').toBe(true)
  expect(derecha[0]!.x).toBeGreaterThan(izquierda[0]!.x + izquierda[0]!.width)
  // La columna de la boleta mide lo de Figma: 360 px.
  expect(cerca(izquierda[0]!.width, 360)).toBe(true)
}

test.describe('Detalle de boleta del vendedor: composición (D-231)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('seis secciones con su h2, en el orden del teléfono', async ({ page }) => {
    await abrir(page, abonada.id, 390)
    const titulos = await page.locator('main h2').allTextContents()
    expect(titulos).toEqual([...SECCIONES])
  })

  test('teléfono (390): una sola columna, en ese orden', async ({ page }) => {
    await abrir(page, abonada.id, 390)
    const c = await cajas(page, SECCIONES)
    const primera = c[SECCIONES[0]]!
    for (let i = 1; i < SECCIONES.length; i++) {
      const anterior = c[SECCIONES[i - 1]!]!
      const actual = c[SECCIONES[i]!]!
      expect(cerca(actual.x, primera.x), `${SECCIONES[i]} alineada a la izquierda`).toBe(true)
      expect(cerca(actual.width, primera.width), `${SECCIONES[i]} a todo el ancho`).toBe(true)
      expect(actual.y, `${SECCIONES[i]} debajo de ${SECCIONES[i - 1]}`).toBeGreaterThan(
        anterior.y + anterior.height,
      )
    }
  })

  test('tableta (834): números | cliente, venta | estado, y abonos y detalles a lo ancho', async ({
    page,
  }) => {
    await abrir(page, abonada.id, 834)
    const c = await cajas(page, SECCIONES)
    const numeros = c['Números de la boleta']!
    const cliente = c['Cliente']!
    const venta = c['Información de venta']!
    const estado = c['Estado y resumen de pago']!
    const abonos = c['Abonos de esta boleta']!
    const detalles = c['Detalles de la boleta']!

    expect(cerca(numeros.y, cliente.y), 'números y cliente comparten fila').toBe(true)
    expect(cliente.x).toBeGreaterThan(numeros.x + numeros.width)
    expect(cerca(venta.y, estado.y), 'venta y estado comparten fila').toBe(true)
    expect(cerca(venta.x, numeros.x) && cerca(estado.x, cliente.x)).toBe(true)
    // En la misma fila, la misma altura: los bordes de abajo coinciden.
    expect(cerca(numeros.height, cliente.height)).toBe(true)
    expect(cerca(venta.height, estado.height)).toBe(true)

    const anchoTotal = cliente.x + cliente.width - numeros.x
    for (const [nombre, caja] of [
      ['abonos', abonos],
      ['detalles', detalles],
    ] as const) {
      expect(cerca(caja.x, numeros.x), `${nombre} empieza a la izquierda`).toBe(true)
      expect(cerca(caja.width, anchoTotal), `${nombre} ocupa las dos columnas`).toBe(true)
    }
    expect(abonos.y).toBeGreaterThan(venta.y + venta.height)
    expect(detalles.y).toBeGreaterThan(abonos.y + abonos.height)
  })

  for (const width of [1440, 1920]) {
    test(`escritorio (${width}): dos columnas que se apilan cada una por su cuenta`, async ({
      page,
    }) => {
      await abrir(page, abonada.id, width)
      await dosColumnas(page)
    })
  }

  for (const width of [320, 390, 834, 1024, 1360, 1440, 1920]) {
    test(`a ${width} px nada desborda, nada se pisa y nada asoma de su tarjeta`, async ({
      page,
    }) => {
      await abrir(page, abonada.id, width)
      expect(await problemasDeMaquetacion(page)).toEqual([])
    })
  }

  test('una boleta sin vender tampoco se descompone, a 320 y a 834', async ({ page }) => {
    for (const width of [320, 834]) {
      await abrir(page, disponibleId, width)
      expect(await page.locator('main h2').allTextContents()).toEqual(
        SECCIONES.filter((s) => s !== 'Abonos de esta boleta'),
      )
      expect(await problemasDeMaquetacion(page), `a ${width} px`).toEqual([])
    }
  })

  test('a 320 px las dos cifras quedan a la misma altura aunque un rótulo baje de línea', async ({
    page,
  }) => {
    await abrir(page, abonada.id, 320)
    const numeros = tarjeta(page, 'Números de la boleta')
    const rotulo = await numeros.getByText('Número semanal', { exact: true }).boundingBox()
    // Sin rótulo partido no hay nada que comprobar: la prueba se aseguraría de
    // algo que no ocurre.
    expect(rotulo!.height, '«Número semanal» ocupa dos líneas a 320 px').toBeGreaterThan(24)

    const diario = await numeros.getByText(abonada.daily, { exact: true }).boundingBox()
    const semanal = await numeros.getByText(abonada.weekly, { exact: true }).boundingBox()
    expect(cerca(diario!.y, semanal!.y), `diario en ${diario!.y}, semanal en ${semanal!.y}`).toBe(
      true,
    )
  })

  test('la hora no se parte entre «a.» y «m.», ni a 320 ni a 390', async ({ page }) => {
    for (const width of [320, 390]) {
      await abrir(page, abonada.id, width)
      // Se mide el TEXTO, no un envoltorio (`horasYSusLineas`).
      const horas = await horasYSusLineas(tarjeta(page, 'Detalles de la boleta'))
      expect(horas.length, 'la fecha de creación y la de asignación').toBeGreaterThanOrEqual(2)
      for (const hora of horas) {
        expect(hora.lineas, `«${hora.texto}» a ${width} px`).toBe(1)
      }
    }
  })

  test('el diario y el semanal llevan sus dos tonos de índigo, en claro y en oscuro, a 320, 390 y 1920', async ({
    page,
  }) => {
    await abrir(page, abonada.id, 390)
    const numeros = tarjeta(page, 'Números de la boleta')
    const caja = (rotulo: string) => numeros.getByText(rotulo, { exact: true }).locator('..')
    const colores = (rotulo: string) => coloresDe(caja(rotulo))
    // Los cuatro textos de las dos cajas: los rótulos son de 12 px y también
    // tienen que leerse.
    const textos = {
      'rótulo del diario': numeros.getByText('Número diario', { exact: true }),
      'cifra del diario': numeros.getByText(abonada.daily, { exact: true }),
      'rótulo del semanal': numeros.getByText('Número semanal', { exact: true }),
      'cifra del semanal': numeros.getByText(abonada.weekly, { exact: true }),
    }

    for (const tema of ['claro', 'oscuro'] as const) {
      if (tema === 'oscuro') {
        // El portal no tiene selector de tema, así que se enciende a mano y se
        // comprueba que de verdad se encendió antes de medir.
        expect((await encenderOscuro(page)).toLowerCase()).toBe('#0a0a0a')
      }
      for (const width of [320, 390, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        const diario = await colores('Número diario')
        const semanal = await colores('Número semanal')
        expect(diario, `${tema} a ${width} px: el diario`).toEqual(TONOS[tema].diario)
        expect(semanal, `${tema} a ${width} px: el semanal`).toEqual(TONOS[tema].semanal)
        for (const [nombre, texto] of Object.entries(textos)) {
          expect(
            await textContrast(texto),
            `${tema} a ${width} px: contraste del ${nombre}`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  test('en escritorio, el foco recorre la pantalla en el orden en que se lee', async ({ page }) => {
    await abrir(page, abonada.id, 1440)
    await page.getByRole('link', { name: /^Registrar un abono de / }).focus()

    const recorrido: Array<{ nombre: string; y: number; x: number }> = []
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const paso = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return null
        const r = el.getBoundingClientRect()
        const etiquetado = el.getAttribute('aria-labelledby')
        // `innerText`, no `textContent`: el enlace del cliente son tres
        // párrafos, y `textContent` los pega sin espacio («ClienteAna…»).
        const nombre =
          el.getAttribute('aria-label') ??
          (etiquetado ? document.getElementById(etiquetado)?.innerText : null) ??
          el.innerText ??
          ''
        return { nombre: nombre.replace(/\s+/g, ' ').trim(), y: r.top + scrollY, x: r.left }
      })
      if (!paso) break
      recorrido.push(paso)
      if (paso.nombre.startsWith('Editar el abono')) break
    }

    const nombres = recorrido.map((p) => p.nombre)
    const indice = (patron: RegExp) => nombres.findIndex((n) => patron.test(n))
    // Sin distinguir mayúsculas: `innerText` devuelve los rótulos en mayúsculas
    // porque así los pinta el CSS («CLIENTE», «ENTREGA DEL PAZ Y SALVO»).
    const cliente = indice(/^cliente /i)
    const precio = indice(/^editar precio de venta$/i)
    const pazYSalvo = indice(/^entrega del paz y salvo$/i)
    const abono = indice(/^editar el abono/i)
    expect([cliente, precio, pazYSalvo, abono], nombres.join(' → ')).not.toContain(-1)
    expect(cliente).toBeLessThan(precio)
    expect(precio).toBeLessThan(pazYSalvo)
    expect(pazYSalvo).toBeLessThan(abono)

    // Lo de la columna izquierda baja; el abono está a la derecha.
    const columnaIzquierda = [recorrido[cliente]!, recorrido[precio]!, recorrido[pazYSalvo]!]
    for (let i = 1; i < columnaIzquierda.length; i++) {
      expect(columnaIzquierda[i]!.y).toBeGreaterThan(columnaIzquierda[i - 1]!.y)
    }
    expect(recorrido[abono]!.x).toBeGreaterThan(recorrido[pazYSalvo]!.x)
  })

  /**
   * Hasta D-234 esta prueba fijaba el detalle administrativo de antes —«Boleta»
   * e «Información administrativa»— para que el rediseño del vendedor no lo
   * tocara. Desde D-234 ese detalle comparte las piezas de este, así que lo que
   * se comprueba es lo que importa: comparte los NÚMEROS, con los mismos tonos,
   * y ninguna tarjeta de la venta o del cobro, que son de la cartera (D-198).
   * Su composición la mide `detalle-boleta-admin.spec.ts`.
   */
  test('el detalle administrativo comparte los números, no la cartera (D-198, D-234)', async ({
    page,
  }) => {
    await logout(page)
    await loginAs(page, ACCOUNTS.owner)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/owner/tickets/${abonada.id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Detalle boleta' })).toBeVisible()
    expect(await page.locator('main h2').allTextContents()).toEqual([
      'Números de la boleta',
      'Vendedor y rifa',
      'Estado y venta',
      'Detalles de la boleta',
    ])

    const numeros = page
      .locator('main [data-slot="card"]')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Números de la boleta' }) })
    const caja = (rotulo: string) => numeros.getByText(rotulo, { exact: true }).locator('..')
    await expect(numeros.getByText(abonada.daily, { exact: true })).toBeVisible()
    await expect(numeros.getByText(abonada.weekly, { exact: true })).toBeVisible()
    expect(await coloresDe(caja('Número diario'))).toEqual(TONOS.claro.diario)
    expect(await coloresDe(caja('Número semanal'))).toEqual(TONOS.claro.semanal)

    // La boleta tiene un abono: para el personal es «Sin pagar», y ni el
    // cliente, ni el precio, ni el historial de abonos llegan a la pantalla.
    await expect(page.getByText('Sin pagar', { exact: true })).toBeVisible()
    await expect(page.getByText('Abonada')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('$')
    for (const titulo of SECCIONES.filter(
      (s) => s !== 'Números de la boleta' && s !== 'Detalles de la boleta',
    )) {
      await expect(page.getByRole('heading', { name: titulo, exact: true })).toHaveCount(0)
    }
  })
})
