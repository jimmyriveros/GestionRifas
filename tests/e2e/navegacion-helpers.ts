import { expect, type Locator, type Page, type Request } from '@playwright/test'

/**
 * Lo que comparten las pruebas que fabrican una navegación lenta (D-244, D-245):
 * esperar a que React enganche lo que se va a pulsar, retrasar la petición que
 * trae una pantalla y contar las navegaciones que hace la página.
 *
 * La lentitud se fabrica sobre la petición RSC —la que el router pide al
 * pulsar—, no sobre el documento: una carga completa de la misma dirección pasa
 * sin tocarla.
 */

/**
 * Hasta que React engancha un elemento, pulsarlo es una navegación del
 * navegador —o nada— y ningún aviso de la página puede encenderse (TESTING.md
 * §5.3). Se espera a la hidratación en vez de reintentar: un clic de más ya
 * habría navegado. Vale también para un campo: escribir antes de hidratar no
 * llega a `onChange`.
 */
export async function esperarHidratado(elemento: Locator): Promise<void> {
  await expect
    .poll(() =>
      elemento.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))),
    )
    .toBe(true)
}

/** ¿La tarjeta-enlace está diciendo que se abre? (`RowLinkPendingChevron`, D-244). */
function abriendose(tarjeta: Locator): Promise<boolean> {
  return tarjeta.evaluate((el) => el.matches(':has([data-link-pending="true"])'))
}

/** Una tarjeta-enlace en reposo: ni aviso, ni icono girando, ni nada que anunciar. */
export async function comprobarTarjetaEnReposo(tarjeta: Locator): Promise<void> {
  expect(await abriendose(tarjeta)).toBe(false)
  await expect(tarjeta.locator('svg.animate-spin')).toHaveCount(0)
  await expect(tarjeta.getByRole('status')).toHaveText('')
}

/**
 * Lo que tiene que verse en una tarjeta-enlace mientras se abre (D-244): en el
 * mismo clic, el fondo de una fila pulsada y el icono girando en el hueco de la
 * flecha; el anuncio con el nombre; y la tarjeta, del mismo tamaño que `antes`.
 */
export async function comprobarTarjetaAbriendose(
  page: Page,
  tarjeta: Locator,
  anuncio: string,
  antes: { width: number; height: number },
): Promise<void> {
  await expect.poll(() => abriendose(tarjeta), { timeout: 1000 }).toBe(true)
  await expect(tarjeta.locator('svg.animate-spin')).toBeVisible()
  await expect(tarjeta.getByRole('status')).toHaveText(anuncio)

  const fondo = await tarjeta.evaluate((el) => getComputedStyle(el).backgroundColor)
  const acento = await page.evaluate(() => {
    const muestra = document.createElement('div')
    muestra.style.backgroundColor = 'var(--ds-surface-accent)'
    document.body.append(muestra)
    const color = getComputedStyle(muestra).backgroundColor
    muestra.remove()
    return color
  })
  expect(fondo, 'el fondo de una fila pulsada').toBe(acento)

  const durante = (await tarjeta.boundingBox())!
  expect(Math.abs(durante.height - antes.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(durante.width - antes.width)).toBeLessThanOrEqual(1)
}

/** La petición RSC con la que el router trae `pathname`; una precarga no cuenta. */
export function esNavegacionRsc(req: Request, pathname?: string): boolean {
  const headers = req.headers()
  if (headers['rsc'] !== '1' || headers['next-router-prefetch']) return false
  return pathname === undefined || new URL(req.url()).pathname === pathname
}

/**
 * Retrasa `ms` cada petición RSC que trae `pathname`, o solo las que además
 * cumplan `cuales`. Devuelve cuántas se retrasaron.
 */
export async function retrasarNavegacion(
  page: Page,
  pathname: string,
  ms: number,
  cuales: (url: URL) => boolean = () => true,
): Promise<{ retrasadas: () => number }> {
  let retrasadas = 0
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      const req = route.request()
      if (!esNavegacionRsc(req, pathname) || !cuales(new URL(req.url()))) {
        // `fallback` y no `continue`: deja pasar la petición a otra
        // intercepción de la misma prueba, si la hay.
        await route.fallback()
        return
      }
      retrasadas++
      await new Promise((resuelve) => setTimeout(resuelve, ms))
      await route.continue().catch(() => undefined)
    },
  )
  return { retrasadas: () => retrasadas }
}

/** Las navegaciones RSC que hace la página desde ahora, en orden. */
export function registrarNavegaciones(page: Page): URL[] {
  const urls: URL[] = []
  page.on('request', (req) => {
    if (esNavegacionRsc(req)) urls.push(new URL(req.url()))
  })
  return urls
}

/**
 * La carrera de I-199 (D-245): escribe `termino` en el buscador de una lista,
 * abre un destino con `abrir` ANTES de que venzan los 350 ms de la pausa, con
 * la respuesta del destino retrasada `demora` ms, y comprueba lo que tiene que
 * pasar: el destino elegido se ve y se queda, y la única navegación es la del
 * destino —ninguna búsqueda—. Con el buscador anterior a D-245, la búsqueda
 * sustituía a la navegación y la persona acababa en la lista filtrada.
 */
export async function abrirDuranteLaPausa(
  page: Page,
  opciones: {
    campo: Locator
    termino: string
    listaPath: string
    destino: string
    abrir: () => Promise<void>
    titulo: Locator
    demora?: number
  },
): Promise<void> {
  const navegaciones = registrarNavegaciones(page)
  await retrasarNavegacion(page, opciones.destino, opciones.demora ?? 1500)
  await esperarHidratado(opciones.campo)

  await opciones.campo.fill(opciones.termino)
  await opciones.abrir()

  await expect(opciones.titulo).toBeVisible()
  // La pausa venció hace rato: si la búsqueda siguiera viva, ya habría vuelto
  // a la lista.
  await page.waitForTimeout(1000)
  await expect(page).toHaveURL(new RegExp(`${opciones.destino}(\\?|$)`))
  await expect(opciones.titulo).toBeVisible()

  const busquedas = navegaciones.filter(
    (url) => url.pathname === opciones.listaPath && url.searchParams.has('q'),
  )
  expect(busquedas, 'la búsqueda pendiente no llega a salir').toHaveLength(0)
  expect(
    navegaciones.filter((url) => url.pathname === opciones.destino),
    'una sola petición al destino',
  ).toHaveLength(1)
}
