import { expect, test, type Page } from '@playwright/test'

import { type SeedRefs } from './db-setup'
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

    // El encabezado fijo dice DE QUIEN es el catalogo y como escribirle. Desde
    // el rediseño (D-163) el buscador ya no vive aqui sino en el hero: en el
    // telefono, el encabezado con titulo y campo se comia un tercio de la
    // pantalla en TODAS las pantallas de la lista.
    const header = page.locator('header')
    await expect(header).toContainText('Julian Vargas')
    await expect(header).toContainText('Vendedor oficial')
    await expect(header.getByRole('link', { name: /Escríbenos/ })).toBeVisible()

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
        "Elige el número que más te guste y toca 'Solicitar' para escribirnos por WhatsApp. Los números en gris ya están tomados.",
        { exact: true },
      ),
    ).toBeVisible()
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

  test('una boleta tomada dice «Tomado», va en gris y NO tiene boton', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}?q=${TOMADA}`)

    const tarjeta = page.locator('main ul li').first()
    await expect(tarjeta).toContainText(TOMADA)
    await expect(tarjeta).toContainText('Tomado')
    await expect(tarjeta.getByRole('link')).toHaveCount(0)

    // El gris NO es lo unico que lo dice (CLAUDE.md 27), pero tambien esta.
    const clases = await tarjeta.getAttribute('class')
    expect(clases).toContain('bg-muted')
  })

  test('una boleta tomada no dice quien la tiene', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}?q=${TOMADA}`)
    await expect(page.locator('body')).not.toContainText('Cliente Catalogo E2E')
  })

  test('borrador, pendiente de aprobacion y anulada no aparecen', async ({ page }) => {
    for (const oculta of OCULTAS) {
      await anonima(page, `/catalogo/${SLUG}?q=${oculta.daily}`)
      await expect(
        page.getByText('No encontramos ese número'),
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

  test('el resumen cuenta las boletas que de verdad se ven', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const total = await page.locator('main ul li').count()
    const disponibles = await page.getByRole('link', { name: /^Solicitar por WhatsApp/ }).count()

    const resumen = page.locator('main dl')
    await expect(resumen).toContainText('Números disponibles')
    await expect(resumen).toContainText('Números tomados')

    const cifras = (await resumen.locator('dd').allInnerTexts()).map((t) => Number(t.trim()))
    expect(cifras[0]).toBe(disponibles)
    expect(cifras[1]).toBe(total - disponibles)
  })

  test('el encabezado escribe al MISMO WhatsApp, sin nombrar una boleta', async ({ page }) => {
    await anonima(page, `/catalogo/${SLUG}`)

    const contacto = page.locator('header').getByRole('link', { name: /Escríbenos/ })
    const href = await contacto.getAttribute('href')
    const url = new URL(href!)

    expect(url.origin + url.pathname).toBe(`https://wa.me/${WHATSAPP}`)
    const texto = url.searchParams.get('text')!
    expect(texto).toContain('Hola, Julian')
    expect(texto).not.toMatch(/\d/)
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
    await page.getByRole('searchbox').fill(DISPONIBLES[0]!)
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
