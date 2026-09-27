import type { Locator } from '@playwright/test'

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
export async function textContrast(locator: Locator): Promise<number> {
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
