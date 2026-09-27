import { expect, test, type Locator, type Page } from '@playwright/test'

import { textContrast } from './contrast'
import {
  createAssignedTicket,
  createClientFor,
  createPaymentWithAllocation,
  createTicket,
  loadSeedRefs,
  raffleTicketPrice,
  type SeedRefs,
} from './db-setup'
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

/**
 * Los dos tonos de los números (D-233), como los devuelve el navegador. Son los
 * valores de las variables de Figma, no los de la lámina. En claro, el diario es
 * `accent/indigo/surface-strong` · `foreground` · `border-strong` (indigo 100 ·
 * 700 · 300) y el semanal `surface` · `foreground-subtle` · `border` (50 · 600
 * · 200); en oscuro, sus equivalentes (900 · 300 · 600 y 950 · 400 · 800).
 */
const TONOS = {
  claro: {
    diario: { fondo: 'rgb(224, 231, 255)', texto: 'rgb(67, 56, 202)', borde: 'rgb(165, 180, 252)' },
    semanal: {
      fondo: 'rgb(238, 242, 255)',
      texto: 'rgb(79, 70, 229)',
      borde: 'rgb(199, 210, 254)',
    },
  },
  oscuro: {
    diario: { fondo: 'rgb(49, 46, 129)', texto: 'rgb(165, 180, 252)', borde: 'rgb(79, 70, 229)' },
    semanal: { fondo: 'rgb(30, 27, 75)', texto: 'rgb(129, 140, 248)', borde: 'rgb(55, 48, 163)' },
  },
} as const

let refs: SeedRefs
let abonada: { id: string; daily: string; weekly: string }
let disponibleId: string

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  const precio = await raffleTicketPrice(refs)
  const cliente = await createClientFor(refs, unique('Composicion detalle'))
  const numeros = randomTicketNumbers()
  const ticket = await createAssignedTicket(refs, {
    dailyNumber: numeros.daily,
    weeklyNumber: numeros.weekly,
    clientId: cliente.id,
    salePrice: precio,
  })
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
  disponibleId = (
    await createTicket(refs, {
      dailyNumber: libres.daily,
      weeklyNumber: libres.weekly,
      inventoryStatus: 'available',
    })
  ).id
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

function cerca(a: number, b: number, tolerancia = 1.5): boolean {
  return Math.abs(a - b) <= tolerancia
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

/**
 * Lo que se sale de sitio en la página: desplazamiento lateral, tarjetas que se
 * pisan y elementos que asoman fuera de su tarjeta. Devuelve una descripción por
 * fallo, para que el mensaje diga qué y dónde.
 */
async function problemasDeMaquetacion(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problemas: string[] = []
    const raiz = document.documentElement
    const lateral = raiz.scrollWidth - raiz.clientWidth
    if (lateral > 0) problemas.push(`la página se desplaza ${lateral} px de lado`)

    const tarjetas = [...document.querySelectorAll<HTMLElement>('main [data-slot="card"]')]
    const rects = tarjetas.map((t) => t.getBoundingClientRect())
    const nombre = (t: HTMLElement) => t.querySelector('h2')?.textContent ?? '(sin título)'

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!
        const b = rects[j]!
        const ancho = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const alto = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (ancho > 1 && alto > 1) {
          problemas.push(`«${nombre(tarjetas[i]!)}» pisa a «${nombre(tarjetas[j]!)}»`)
        }
      }
    }

    tarjetas.forEach((t, i) => {
      const caja = rects[i]!
      for (const el of t.querySelectorAll<HTMLElement>('*')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (
          r.left < caja.left - 1 ||
          r.right > caja.right + 1 ||
          r.top < caja.top - 1 ||
          r.bottom > caja.bottom + 1
        ) {
          const texto = (el.textContent ?? '').trim().slice(0, 40)
          problemas.push(`en «${nombre(t)}», <${el.tagName.toLowerCase()}> «${texto}» asoma fuera`)
        }
      }
    })
    return problemas
  })
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
      // Se mide el TEXTO, no un envoltorio: un `Range` sobre «11:16 a. m.»
      // devuelve un rectángulo por cada línea que ocupa. Así la prueba ve la
      // hora partida aunque nadie la haya envuelto en nada.
      const horas = await tarjeta(page, 'Detalles de la boleta')
        .locator('dd')
        .evaluateAll((dds) =>
          dds.flatMap((dd) => {
            const nodos: Text[] = []
            const walker = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT)
            while (walker.nextNode()) nodos.push(walker.currentNode as Text)
            const completo = nodos.map((n) => n.data).join('')
            const posicion = (offset: number): [Text, number] => {
              let resto = offset
              for (const nodo of nodos) {
                if (resto <= nodo.length) return [nodo, resto]
                resto -= nodo.length
              }
              const ultimo = nodos[nodos.length - 1]!
              return [ultimo, ultimo.length]
            }
            return [...completo.matchAll(/\d{2}:\d{2}\s[ap]\.\s?m\./g)].map((m) => {
              const range = document.createRange()
              range.setStart(...posicion(m.index!))
              range.setEnd(...posicion(m.index! + m[0].length))
              const tops = [...range.getClientRects()]
                .filter((r) => r.width > 0)
                .map((r) => Math.round(r.top))
              return { texto: m[0], lineas: new Set(tops).size }
            })
          }),
        )
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
    const colores = (rotulo: string) =>
      caja(rotulo).evaluate((el) => {
        const s = getComputedStyle(el)
        return { fondo: s.backgroundColor, texto: s.color, borde: s.borderTopColor }
      })
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
        await page.evaluate(() => document.documentElement.classList.add('dark'))
        const fondoOscuro = await page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue('--ds-background-default')
            .trim(),
        )
        expect(fondoOscuro.toLowerCase()).toBe('#0a0a0a')
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

  test('el detalle administrativo no cambia (D-198)', async ({ page }) => {
    await logout(page)
    await loginAs(page, ACCOUNTS.owner)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/owner/tickets/${abonada.id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Detalle boleta' })).toBeVisible()
    expect(await page.locator('main h2').allTextContents()).toEqual([
      'Boleta',
      'Información administrativa',
    ])
    await expect(page.getByRole('heading', { name: 'Números de la boleta' })).toHaveCount(0)
  })
})
