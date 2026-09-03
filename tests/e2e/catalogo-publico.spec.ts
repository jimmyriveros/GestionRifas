import { expect, test, type Page } from '@playwright/test'

import { serviceClient, type SeedRefs } from './db-setup'
import {
  CATALOG_DISPONIBLES,
  CATALOG_OCULTAS,
  CATALOG_SLUG,
  CATALOG_TOMADA,
  CATALOG_WHATSAPP,
  abrirSinSesion,
  configurarCatalogo,
  desmontarCatalogo,
  montarCatalogo,
  type CatalogFixture,
} from './catalogo-helpers'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Catalogo publico de boletas por vendedor (D-159, BR-K01..BR-K12).
 *
 * LO QUE MAS IMPORTA DE ESTA SUITE: casi todas las pruebas se ejecutan SIN
 * iniciar sesion. Se usa un contexto de navegador limpio, sin cookies, que es
 * exactamente lo que tiene quien llega desde un enlace de WhatsApp. Si alguna
 * de estas pantallas empezara a exigir sesion, estas pruebas lo dirian.
 *
 * El montaje vive en `catalogo-helpers.ts`, compartido con la suite del
 * telefono. Es PREPARACION con la service role; el bloque final si configura el
 * catalogo por la interfaz real, que es como ocurre en la vida.
 */

const SLUG = CATALOG_SLUG
const WHATSAPP = CATALOG_WHATSAPP
const DISPONIBLES = CATALOG_DISPONIBLES
const TOMADA = CATALOG_TOMADA
const OCULTAS = CATALOG_OCULTAS

let fixture: CatalogFixture
let refs: SeedRefs

test.beforeAll(async () => {
  fixture = await montarCatalogo()
  refs = fixture.refs
})

test.afterAll(async () => {
  await desmontarCatalogo(fixture)
})

/** Una pagina SIN sesion: ni cookies ni almacenamiento previos. */
async function anonima(page: Page, path: string) {
  await abrirSinSesion(page, path)
}

test.describe('se abre sin iniciar sesion (BR-K01)', () => {
  test('un visitante sin sesion ve el catalogo y NO lo mandan a /login', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    await expect(page).toHaveURL(new RegExp(`/catalogo/${SLUG}$`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('el encabezado dice el vendedor y el titulo exacto, en ese orden', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    // El titulo se deriva del nombre de la rifa, en mayusculas (D-159).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'NÚMEROS DISPONIBLES RIFA NAVIDAD 2026',
    )

    // El encabezado fijo dice DE QUIEN es el catalogo. Desde el rediseño
    // (D-163) el buscador ya no vive aqui sino en el hero: en el telefono, el
    // encabezado con titulo y campo se comia un tercio de la pantalla en TODAS
    // las pantallas de la lista.
    const header = page.locator('header')
    await expect(header).toContainText('Julian Vargas')
    await expect(header).toContainText('Vendedor oficial')

    // Y NO hay boton general de WhatsApp (D-164): el unico camino a WhatsApp es
    // «Solicitar», que si nombra la boleta.
    await expect(header.getByRole('link')).toHaveCount(0)

    // Y el buscador sigue estando ANTES de la reja, que es el orden en que se
    // usa la pantalla.
    const campo = page.getByRole('searchbox')
    await expect(campo).toBeVisible()
    const cajaCampo = await campo.boundingBox()
    const cajaPrimera = await page.locator('main ul li').first().boundingBox()
    expect(cajaCampo!.y).toBeLessThan(cajaPrimera!.y)
  })

  test('el texto de introduccion es exactamente el pedido', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    await expect(
      page.getByText(
        "Elige el número que más te guste y toca 'Solicitar' para escribirnos por WhatsApp.",
        { exact: true },
      ),
    ).toBeVisible()

    // Ya no se promete lo que la pagina no enseña (D-164): no hay numeros en
    // gris porque no hay boletas tomadas.
    await expect(page.locator('body')).not.toContainText('en gris')
  })

  test('el encabezado sigue arriba despues de bajar', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const header = page.locator('header')
    const antes = await header.boundingBox()
    await page.mouse.wheel(0, 2000)
    await page.waitForTimeout(300)
    const despues = await header.boundingBox()

    expect(despues?.y).toBeCloseTo(antes?.y ?? 0, 0)
    await expect(header).toBeInViewport()
  })

  test('el contenido no queda tapado por el encabezado', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    await page.mouse.wheel(0, 1200)
    await page.waitForTimeout(300)

    const header = await page.locator('header').boundingBox()
    const primera = await page.locator('main ul li').first().boundingBox()
    // La primera tarjeta visible empieza por debajo del encabezado, o ya ha
    // salido de la vista por arriba. Lo que no puede es solaparse con el.
    if (primera && primera.y + primera.height > 0) {
      expect(primera.y + primera.height).toBeGreaterThan(header!.y)
    }
  })
})

test.describe('las tarjetas (BR-K08, BR-K09)', () => {
  test('una boleta disponible dice «Disponible» y ofrece «Solicitar»', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}?q=${DISPONIBLES[0]}`)

    const tarjeta = page.locator('main ul li').first()
    await expect(tarjeta).toContainText(DISPONIBLES[0]!)
    await expect(tarjeta).toContainText('Disponible')
    await expect(tarjeta.getByRole('link', { name: /Solicitar/ })).toBeVisible()
  })

  test('una boleta tomada NO se publica: ni tarjeta, ni HTML, ni busqueda (D-164)', async ({
    page,
  }) => {
    const respuesta = await page.goto(`/catalogo/${SLUG}`)
    const html = (await respuesta!.text()).replace(/\/_next\/[^"']*/g, '')

    // No es que se pinte en gris: es que su numero no viaja al navegador.
    expect(html).not.toContain(TOMADA)
    await expect(page.locator('body')).not.toContainText('Tomado')

    // Y buscarla por su numero exacto tampoco la saca.
    await anonima(page, `/catalogo/${SLUG}?q=${TOMADA}`)
    await expect(page.getByText('No encontramos ese número entre los disponibles')).toBeVisible()
    await expect(page.locator('main ul li')).toHaveCount(0)
  })

  test('una boleta tomada no dice quien la tiene', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}?q=${TOMADA}`)
    await expect(page.locator('body')).not.toContainText('Cliente Catalogo E2E')
  })

  test('todas las tarjetas de la reja son solicitables', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const tarjetas = await page.locator('main ul li').count()
    expect(tarjetas).toBeGreaterThan(0)
    // Una por tarjeta: si se colara una tomada, no tendria boton y las cuentas
    // no cuadrarian.
    await expect(page.getByRole('link', { name: /^Solicitar por WhatsApp/ })).toHaveCount(tarjetas)
    // La insignia, no el texto suelto: `getByText` tambien encuentra a los
    // antepasados que la contienen y contaria de mas.
    await expect(page.locator('main ul li [data-slot="badge"]')).toHaveCount(tarjetas)
  })

  test('borrador, pendiente de aprobacion y anulada no aparecen', async ({ page }) => {
    for (const oculta of OCULTAS) {
      await anonima(page, `/catalogo/${SLUG}?q=${oculta.daily}`)
      await expect(
        page.getByText('No encontramos ese número entre los disponibles'),
        `${oculta.estado} aparecio en el catalogo publico`,
      ).toBeVisible()
    }
  })

  test('el enlace de WhatsApp lleva el numero y el mensaje exactos', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}?q=${DISPONIBLES[0]}`)

    const enlace = page
      .locator('main ul li')
      .first()
      .getByRole('link', { name: /Solicitar/ })
    const href = await enlace.getAttribute('href')
    expect(href).not.toBeNull()

    const url = new URL(href!)
    expect(url.origin + url.pathname).toBe(`https://wa.me/${WHATSAPP}`)
    expect(url.searchParams.get('text')).toBe(
      `Hola, Julian. Quiero solicitar la boleta con diario ${DISPONIBLES[0]} y semanal 7200 de la rifa. ¿Sigue disponible?`,
    )
    // Sale del sitio: se abre de forma segura.
    expect(await enlace.getAttribute('rel')).toContain('noopener')
  })

  test('se avisa de que solicitar NO aparta el numero', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    await expect(page.getByText(/no aparta el número/i)).toBeVisible()
  })
})

test.describe('el rediseño visual (D-163)', () => {
  test('en escritorio se descarga UNA composicion, la horizontal', async ({ page }) => {
    const imagenes: string[] = []
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('/_next/image') || /\.(webp|png|jpg|avif)(\?|$)/i.test(url)) {
        imagenes.push(decodeURIComponent(url))
      }
    })

    await anonima(page, `/catalogo/${SLUG}`)
    await page.waitForLoadState('networkidle')

    const heroes = imagenes.filter((url) => url.includes('/images/catalog/catalog-hero-'))
    // UNA, no dos: es lo que separa el art direction de verdad de dos <img>
    // con `hidden md:block`, que bajan las dos.
    expect(heroes).toHaveLength(1)
    expect(heroes[0]).toContain('catalog-hero-desktop')
    expect(heroes[0]).not.toContain('catalog-hero-mobile')
  })

  test('la composicion del hero no se anuncia: es decoracion', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const imagen = page.locator('main picture img')
    await expect(imagen).toHaveAttribute('alt', '')
    // Y no la precarga nadie: el elemento grande de la primera pantalla es el
    // titulo, que ya viene en el HTML.
    await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(0)
  })

  test('el boton de limpiar se puede tocar aunque el campo lleve fondo desenfocado', async ({
    page,
  }) => {
    await anonima(page, `/catalogo/${SLUG}?q=${DISPONIBLES[0]}`)

    // Regresion real: con `backdrop-filter` el campo se pintaba ENCIMA de sus
    // propios iconos y el boton dejaba de recibir el toque.
    const limpiar = page.getByRole('button', { name: 'Limpiar búsqueda' })
    await expect(limpiar).toBeVisible()
    await limpiar.click()
    await expect(page).not.toHaveURL(/q=/)
  })
})

/**
 * El buscador y el titulo que se posan en el encabezado al hacer scroll (D-164).
 *
 * Lo que hace comprobables estos cinco estados es que el buscador es UNO: no se
 * comprueba «cual de los dos se ve», se comprueba DONDE esta el unico que hay.
 * Por eso cada prueba afirma tambien que sigue habiendo exactamente uno.
 */
test.describe('el buscador y el titulo se posan al bajar (D-164)', () => {
  /**
   * `true` cuando el campo esta DENTRO de la caja del encabezado.
   *
   * Desde D-165 no basta con «cerca»: el buscador entra en la fila del
   * encabezado, asi que se exige que su caja quepa entera dentro de la suya. Si
   * alguien volviera a una franja aparte debajo, esto fallaria.
   */
  async function posado(page: Page): Promise<boolean> {
    const campo = page.getByRole('searchbox')
    const caja = await campo.boundingBox()
    const header = await page.locator('header').boundingBox()
    if (!caja || !header) return false
    return caja.y >= header.y - 1 && caja.y + caja.height <= header.y + header.height + 1
  }

  async function bajar(page: Page, px: number) {
    await page.evaluate((y) => window.scrollTo(0, y), px)
    // El observador avisa en el siguiente fotograma; no hay temporizador que
    // esperar, pero si un repintado.
    await page.waitForTimeout(350)
  }

  test('1. arriba del todo: titulo y buscador solo en el hero', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const header = page.locator('header')
    await expect(header).toContainText('Vendedor oficial')
    await expect(header).not.toContainText('RIFA NAVIDAD')
    // El nombre de la rifa se lee UNA vez, en el h1 del hero.
    await expect(page.getByRole('searchbox')).toHaveCount(1)
    expect(await posado(page)).toBe(false)
  })

  test('2. scroll intermedio: el titulo ya esta en el encabezado y el buscador todavia no', async ({
    page,
  }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!
    const campo = (await page.getByRole('searchbox').boundingBox())!
    const alto = (await page.locator('header').boundingBox())!.height

    // La ventana intermedia existe entre «el titulo acaba de pasar bajo el
    // encabezado» y «el buscador todavia no lo ha alcanzado». Es estrecha —el
    // titulo y el campo estan a un par de lineas— asi que se calcula en vez de
    // adivinar un numero de pixeles.
    const minimo = h1.y + h1.height - alto + 4
    const maximo = campo.y - alto - 24
    expect(
      minimo,
      'no hay ventana intermedia: el titulo y el buscador desaparecen a la vez',
    ).toBeLessThanOrEqual(maximo)

    await bajar(page, minimo)

    await expect(page.locator('header')).toContainText('Rifa Navidad 2026')
    expect(await posado(page)).toBe(false)
    await expect(page.getByRole('searchbox')).toHaveCount(1)
  })

  test('3. mas abajo: el buscador se posa bajo el encabezado, y sigue habiendo uno solo', async ({
    page,
  }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    await bajar(page, 1200)

    await expect(page.locator('header')).toContainText('Rifa Navidad 2026')
    expect(await posado(page)).toBe(true)

    // NUNCA dos: no es que el otro este oculto, es que no existe.
    await expect(page.getByRole('searchbox')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Limpiar búsqueda' })).toHaveCount(0)
  })

  test('4. al volver arriba, cada uno vuelve a su sitio', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    await bajar(page, 1200)
    expect(await posado(page)).toBe(true)

    await bajar(page, 0)
    await expect(page.locator('header')).toContainText('Vendedor oficial')
    await expect(page.locator('header')).not.toContainText('Rifa Navidad 2026')
    expect(await posado(page)).toBe(false)
    await expect(page.getByRole('searchbox')).toHaveCount(1)
  })

  test('5. posarse no pierde lo escrito ni el foco, y no desplaza la pagina en horizontal', async ({
    page,
  }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const campo = page.getByRole('searchbox')
    await campo.click()
    // «0» a proposito: casi todas las boletas lo llevan, asi que la lista sigue
    // siendo larga y queda pagina que bajar. Con un termino que filtrara a un
    // solo resultado la pagina se queda corta y no habria scroll que probar.
    await campo.pressSequentially('0', { delay: 30 })
    await expect(campo).toBeFocused()

    // HAY QUE ESPERAR A QUE LA BUSQUEDA ATERRICE ANTES DE BAJAR: al navegar, el
    // enrutador devuelve la pagina al principio. Bajar antes y medir despues
    // daba un buscador «sin recoger» que en realidad se habia recogido y habia
    // vuelto solo.
    await expect(page).toHaveURL(/q=0/)

    await bajar(page, 1200)
    expect(await posado(page)).toBe(true)

    // El campo se ha mudado de sitio en el DOM, asi que conserva el valor —que
    // vive en el estado compartido— Y el foco, que se guarda al desmontar y se
    // devuelve al montar (D-165). Sin ese relevo, en un telefono se cerraria el
    // teclado a mitad de palabra.
    await expect(campo).toHaveValue('0')
    await expect(campo).toBeFocused()

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(desborde).toBeLessThanOrEqual(0)
  })

  test('el titulo del encabezado NO es un segundo h1', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    await bajar(page, 1200)

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.locator('header h1')).toHaveCount(0)
  })

  test('el encabezado NO cambia de alto al recoger titulo y buscador (D-165)', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const arriba = (await page.locator('header').boundingBox())!.height
    await bajar(page, 1200)
    const abajo = (await page.locator('header').boundingBox())!.height

    // No es estetica: si el encabezado creciera, empujaria el contenido, el
    // elemento observado se moveria y el observador entraria en un bucle de
    // aparecer y desaparecer. Es la garantia que sostiene todo lo demas.
    expect(abajo).toBe(arriba)
  })

  test('solo hay UNA superficie pegada a la pantalla (D-165)', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    await bajar(page, 1200)

    const pegados = await page.evaluate(() => {
      const todos = Array.from(document.querySelectorAll('body *'))
      return todos
        .filter((el) => {
          const p = getComputedStyle(el).position
          return p === 'fixed' || p === 'sticky'
        })
        .filter((el) => (el as HTMLElement).offsetHeight > 0)
        .map((el) => el.tagName.toLowerCase() + '.' + (el.className || '').toString().slice(0, 40))
    })

    // El encabezado y las dos capas decorativas del fondo (resplandor y
    // estrellas), que no ocupan sitio ni reciben toques. Nada mas: la franja
    // aparte del buscador desaparecio en D-165.
    const barras = pegados.filter((p) => !p.includes('catalog-glow') && !p.includes('catalog-stars'))
    expect(barras, `superficies pegadas: ${pegados.join(' | ')}`).toHaveLength(1)
    expect(barras[0]).toContain('header')
  })

  test('el buscador recogido no tapa el resumen ni las boletas (D-165)', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    await bajar(page, 400)

    const header = (await page.locator('header').boundingBox())!
    const resumen = await page
      .getByRole('region', { name: 'Resumen del catálogo' })
      .boundingBox()

    // El resumen puede haber salido de la vista por arriba; lo que no puede es
    // quedar por debajo del encabezado y taparse con el.
    if (resumen && resumen.y + resumen.height > 0) {
      expect(resumen.y + resumen.height).toBeGreaterThan(header.y)
    }
  })
})

test.describe('las cifras del catalogo (D-164, BR-K14)', () => {
  /** Las tres cifras de la franja, en el orden en que se pintan. */
  async function cifras(page: Page): Promise<string[]> {
    const resumen = page.getByRole('region', { name: 'Resumen del catálogo' })
    await expect(resumen).toBeVisible()
    return (
      await resumen.locator('[data-testid="catalog-stat-value"]').allInnerTexts()
    ).map((t) => t.trim())
  }

  test('son del catalogo COMPLETO, no de la pagina, y cuadran entre si', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const [disponibles, tomados, reservado] = await cifras(page)

    // «36 de 50»: el segundo numero es el total.
    const [tomadas, total] = tomados!.split(' de ').map(Number)
    expect(Number(disponibles) + tomadas!).toBe(total)

    // El porcentaje es el redondeo de tomadas/total, y nunca NaN ni fuera de rango.
    const porcentaje = Number(reservado!.replace('%', ''))
    expect(porcentaje).toBe(Math.round((tomadas! / total!) * 100))
    expect(porcentaje).toBeGreaterThanOrEqual(0)
    expect(porcentaje).toBeLessThanOrEqual(100)

    // Y el total supera a las tarjetas de esta pagina: cuenta tambien las tomadas.
    const enPantalla = await page.locator('main ul li').count()
    expect(total).toBeGreaterThan(enPantalla)
  })

  test('la barra usa exactamente el porcentaje escrito', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const [, , reservado] = await cifras(page)
    const barra = page
      .getByRole('region', { name: 'Resumen del catálogo' })
      .locator('div[style*="width"]')
      .first()

    const ancho = (await barra.getAttribute('style'))!.replace(/\s+/g, '')
    expect(ancho).toContain(`width:${Number(reservado!.replace('%', ''))}%`)
  })

  test('no cambian al pasar de pagina ni al buscar, ni con una busqueda vacia', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    const primera = await cifras(page)

    await anonima(page, `/catalogo/${SLUG}?page=2`)
    expect(await cifras(page)).toEqual(primera)

    await anonima(page, `/catalogo/${SLUG}?q=${DISPONIBLES[0]}`)
    expect(await cifras(page)).toEqual(primera)

    // Una busqueda sin resultados conserva las cifras: quien busco un numero
    // que no existe sigue necesitando saber cuantos quedan.
    await anonima(page, `/catalogo/${SLUG}?q=9995`)
    await expect(page.getByText('No encontramos ese número entre los disponibles')).toBeVisible()
    expect(await cifras(page)).toEqual(primera)
  })

  test('las cifras coinciden con lo que devuelve la base para ese vendedor', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    const [disponibles, tomados] = await cifras(page)
    const [tomadas] = tomados!.split(' de ').map(Number)

    const { data } = await serviceClient().rpc('public_catalog_seller', { p_slug: SLUG })
    const fila = data![0]!

    expect(Number(disponibles)).toBe(Number(fila.available_count))
    expect(tomadas).toBe(Number(fila.taken_count))
  })
})

test.describe('el buscador (BR-K08)', () => {
  test('busca, guarda el termino en la URL y se puede limpiar', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const campo = page.getByRole('searchbox')
    // `pressSequentially` y no `fill`: teclear es lo unico que programa el
    // debounce de `useUrlSearch`; `fill` pone el texto de una vez y no dispara
    // ninguna busqueda (es la misma nota que deja `busqueda-hibrida.spec.ts`).
    await campo.pressSequentially(DISPONIBLES[1]!, { delay: 30 })
    await expect(page).toHaveURL(new RegExp(`q=${DISPONIBLES[1]}`))
    await expect(page.locator('main ul li')).toHaveCount(1)

    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click()
    await expect(page).not.toHaveURL(/q=/)
    expect(await page.locator('main ul li').count()).toBeGreaterThan(1)
  })

  test('conserva los ceros iniciales', async ({ page }) => {
    // `0100` es una boleta del seed del mismo vendedor y la misma rifa.
    await anonima(page, `/catalogo/${SLUG}?q=0100`)
    const primera = page.locator('main ul li').first()
    await expect(primera).toContainText('0100')
  })

  test('una busqueda sin resultados lo explica', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}?q=9995`)
    await expect(page.getByText('No encontramos ese número')).toBeVisible()
  })

  test('mas de cuatro cifras avisa de la regla, sin hablar de nada interno', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}?q=123456`)

    // La REGLA se dice una sola vez, bajo el campo; el estado vacio dice que
    // hacer. Que la frase saliera dos veces fue un fallo real que encontro esta
    // prueba.
    const aviso = page.getByText('Los números tienen 4 cifras como máximo.')
    await expect(aviso).toHaveCount(1)
    await expect(aviso).toBeVisible()
    await expect(page.getByText('Revisa el número, o borra la búsqueda')).toBeVisible()

    // La pantalla es publica: no puede nombrar nada interno.
    await expect(page.locator('body')).not.toContainText('código interno')
    await expect(page.locator('body')).not.toContainText('cliente')
  })
})

test.describe('paginacion (BR-K11)', () => {
  test('la primera pagina no ofrece «Anterior» y la segunda vuelve', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const siguiente = page.getByRole('link', { name: /Siguiente/ })
    if ((await siguiente.count()) === 0) {
      // El seed no da para dos paginas: no hay nada que comprobar aqui.
      await expect(page.getByRole('link', { name: /Anterior/ })).toHaveCount(0)
      return
    }

    await expect(page.getByRole('link', { name: /Anterior/ })).toHaveCount(0)
    await siguiente.click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('link', { name: /Anterior/ })).toBeVisible()
  })

  test('nunca se sirven mas de 50 boletas en una peticion', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    expect(await page.locator('main ul li').count()).toBeLessThanOrEqual(50)
  })
})

test.describe('lo que no se publica (BR-K10)', () => {
  test('un slug inexistente da «no encontrado», sin decir por que', async ({ page }) => {
    const respuesta = await page.goto('/catalogo/no-existe-en-ningun-sitio')
    expect(respuesta?.status()).toBe(404)
    await expect(page.getByText('Este enlace ya no está disponible')).toBeVisible()
  })

  test('un catalogo apagado responde igual que uno inexistente', async ({ page }) => {
    await configurarCatalogo(refs, false)
    try {
      const respuesta = await page.goto(`/catalogo/${SLUG}`)
      expect(respuesta?.status()).toBe(404)
      await expect(page.getByText('Este enlace ya no está disponible')).toBeVisible()
      // No se filtra ni el nombre del vendedor ni el de la rifa.
      await expect(page.locator('body')).not.toContainText('Julian Vargas')
      await expect(page.locator('body')).not.toContainText('Navidad')
    } finally {
      await configurarCatalogo(refs, true)
    }
  })
})

test.describe('privacidad y ruido (BR-K07)', () => {
  test('el HTML no lleva identificadores internos, clientes, precios ni codigos', async ({
    page,
  }) => {
    await page.context().clearCookies()
    const respuesta = await page.goto(`/catalogo/${SLUG}`)
    const html = (await respuesta!.text()).replace(/\/_next\/[^"']*/g, '')

    expect(html).not.toContain(refs.sellerId)
    expect(html).not.toContain(refs.organizationId)
    expect(html).not.toContain(refs.raffleId)
    expect(html).not.toContain(fixture.clienteId)
    expect(html).not.toContain('Cliente Catalogo E2E')
    expect(html).not.toContain('120000')
    expect(html).not.toContain('120.000')
    expect(html).not.toMatch(/internal_code|payment_status|paid_amount|sale_price/)
  })

  test('no se indexa en buscadores (BR-K01)', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex.*nofollow/,
    )
  })

  test('la consola queda limpia', async ({ page }) => {
    const errores: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errores.push(msg.text())
    })
    page.on('pageerror', (error) => errores.push(error.message))

    await anonima(page, `/catalogo/${SLUG}`)
    // `pressSequentially` y no `fill`, por la misma razón que en «el buscador»:
    // `fill` escribe de una vez y deja UNA sola oportunidad al debounce de
    // `useUrlSearch`, que se cancela al desmontarse el campo. Con `fill` esta
    // prueba fallaba de forma intermitente —la lista se quedaba entera— y el
    // fallo no decía nada de la consola, que es lo que aquí se comprueba.
    await page.getByRole('searchbox').pressSequentially(DISPONIBLES[0]!, { delay: 30 })
    await expect(page.locator('main ul li')).toHaveCount(1)

    expect(errores).toEqual([])
  })

  test('se puede recorrer con el teclado y el buscador tiene nombre accesible', async ({
    page,
  }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const campo = page.getByRole('searchbox')
    await expect(campo).toHaveAccessibleName(/Buscar número/)

    await campo.focus()
    await expect(campo).toBeFocused()

    // El primer «Solicitar» se alcanza tabulando, y se anuncia con los DOS
    // numeros de la boleta (BR-N11).
    const primerBoton = page
      .getByRole('link', { name: /^Solicitar por WhatsApp la boleta/ })
      .first()
    await expect(primerBoton).toHaveAttribute('aria-label', /\d+ \/ \d+/)
  })
})

test.describe('configurar el catalogo desde el portal (BR-K12)', () => {
  test('el Dueño lo configura desde la ficha del vendedor y el vendedor solo lo ve', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/sellers/${refs.sellerId}`)

    // `CardTitle` es un `div`, no un encabezado: se busca por texto.
    await expect(page.getByText('Catálogo público', { exact: true })).toBeVisible()
    // «Activo» / «Inactivo», las mismas palabras que el panel del vendedor: es
    // el MISMO estado y un término tiene un solo nombre (D-161). Decía
    // «Publicado» hasta entonces.
    const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: 'Catálogo público' })
    await expect(tarjeta.getByText('Activo', { exact: true })).toBeVisible()

    // El enlace publico se ofrece para copiar, con la direccion completa.
    // `getByRole('textbox')` y no `getByLabel`: este ultimo tambien encuentra
    // el boton, cuyo nombre accesible es «Copiar el enlace público».
    await expect(page.getByRole('textbox', { name: 'Enlace público' })).toHaveValue(
      new RegExp(`/catalogo/${SLUG}$`),
    )
    await expect(page.getByRole('button', { name: 'Copiar el enlace público' })).toBeVisible()

    // El WhatsApp y la rifa publicada se ven sin abrir el diálogo.
    await expect(page.getByText(WHATSAPP)).toBeVisible()
  })

  test('un vendedor ve su propio enlace en su panel', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    // La tarjeta y sus tres acciones se prueban a fondo en
    // `catalogo-panel.spec.ts` (D-161); aquí solo importa que el vendedor vea
    // SU enlace, que es la mitad de BR-K12.
    const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: 'Mi catálogo público' })
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta.getByTestId('catalog-public-url')).toContainText(`/catalogo/${SLUG}`)
  })

  test('un vendedor no puede ver ni configurar el catalogo de otro', async ({ page }) => {
    await loginAs(page, ACCOUNTS.otherSeller)

    // La ficha del vendedor es del portal administrativo: no le pertenece.
    await page.goto(`/owner/sellers/${refs.sellerId}`)
    await expect(page).toHaveURL(/\/denied|\/seller\//)

    // Y en su propio panel no aparece el enlace ajeno.
    await page.goto('/seller/dashboard')
    await expect(page.locator('body')).not.toContainText(SLUG)
  })
})
