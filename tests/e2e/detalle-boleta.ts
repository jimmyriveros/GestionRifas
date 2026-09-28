import type { Locator, Page } from '@playwright/test'

/**
 * Lo que comparten las dos suites del detalle de una boleta: la del vendedor
 * (`detalle-boleta-composicion.spec.ts`, D-231) y la del personal
 * (`detalle-boleta-admin.spec.ts`, D-234).
 *
 * Se movió aquí desde la del vendedor, sin cambiar la lógica, cuando el detalle
 * administrativo adoptó las mismas piezas (`TicketDetailParts`). No es un
 * archivo de pruebas: un `.spec.ts` que importara de otro registraría sus
 * pruebas dos veces.
 */

/** Dos medidas del navegador son la misma si no se separan más que la tolerancia. */
export function cerca(a: number, b: number, tolerancia = 1.5): boolean {
  return Math.abs(a - b) <= tolerancia
}

/**
 * Los dos tonos de los números (D-233), como los devuelve el navegador. Son los
 * valores de las variables de Figma, no los de la lámina. En claro, el diario es
 * `accent/indigo/surface-strong` · `foreground` · `border-strong` (indigo 100 ·
 * 700 · 300) y el semanal `surface` · `foreground-subtle` · `border` (50 · 600
 * · 200); en oscuro, sus equivalentes (900 · 300 · 600 y 950 · 400 · 800).
 */
export const TONOS = {
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

/**
 * Enciende el tema oscuro y comprueba que DE VERDAD se encendió. El portal no
 * tiene selector de tema, así que se pone la clase a mano; sin la comprobación,
 * una prueba «en oscuro» podría estar midiendo el claro (D-210).
 */
export async function encenderOscuro(page: Page): Promise<string> {
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ds-background-default').trim(),
  )
}

/** Fondo, texto y borde de una caja, como los calcula el navegador. */
export async function coloresDe(caja: Locator) {
  return caja.evaluate((el) => {
    const s = getComputedStyle(el)
    return { fondo: s.backgroundColor, texto: s.color, borde: s.borderTopColor }
  })
}

/**
 * Lo que se sale de sitio en la página: desplazamiento lateral, tarjetas que se
 * pisan y elementos que asoman fuera de su tarjeta. Devuelve una descripción por
 * fallo, para que el mensaje diga qué y dónde.
 */
export async function problemasDeMaquetacion(page: Page): Promise<string[]> {
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

/**
 * Cada hora de los `dd` de una tarjeta —«11:16 a. m.»— y en cuántas líneas
 * queda. Se mide el TEXTO, no un envoltorio: un `Range` sobre la hora devuelve
 * un rectángulo por cada línea que ocupa, así que la prueba ve la hora partida
 * aunque nadie la haya envuelto en nada (D-181).
 */
export async function horasYSusLineas(
  tarjeta: Locator,
): Promise<Array<{ texto: string; lineas: number }>> {
  return tarjeta.locator('dd').evaluateAll((dds) =>
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
}
