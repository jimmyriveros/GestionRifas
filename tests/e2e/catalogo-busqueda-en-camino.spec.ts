import { expect, test } from '@playwright/test'

import { createTicket } from './db-setup'
import {
  abrirSinSesion,
  CATALOG_SLUG,
  desmontarCatalogo,
  montarCatalogo,
  type CatalogFixture,
} from './catalogo-helpers'
import {
  esNavegacionRsc,
  esperarHidratado,
  registrarNavegaciones,
  retrasarNavegacion,
} from './navegacion-helpers'

/**
 * I-200 (D-252) en el catálogo público: «Siguiente» con una búsqueda en camino conserva la búsqueda.
 *
 * La paginación del catálogo son enlaces —funcionan sin JavaScript— cuya dirección se calcula al pintar. Antes de D-252,
 * si el visitante escribía un número y pulsaba «Siguiente» mientras su búsqueda todavía no llegaba, el enlace la
 * sustituía: página 2 del catálogo entero con el número escrito en el campo. Ahora `CatalogPageLink` va a esa página
 * DE la búsqueda; el `href` es el mismo, así que abrirlo en otra pestaña o sin JavaScript sigue igual.
 *
 * Necesita dos páginas (50 por página): crea 55 boletas disponibles con el diario 81xx y las borra al terminar.
 */

const DEMORA = 1500

// En un build de producción el service worker podría servir peticiones sin pasar por `page.route`: sin él, la
// búsqueda retenida está retenida de verdad, en desarrollo y en producción.
test.use({ serviceWorkers: 'block' })

const LISTA = `/catalogo/${CATALOG_SLUG}`
let fixture: CatalogFixture

test.beforeAll(async () => {
  fixture = await montarCatalogo()
  for (let i = 0; i < 55; i++) {
    const { id } = await createTicket(fixture.refs, {
      dailyNumber: String(8100 + i),
      weeklyNumber: String(8300 + i),
      inventoryStatus: 'available',
    })
    fixture.creadas.push(id)
  }
})

test.afterAll(async () => {
  await desmontarCatalogo(fixture)
})

test('«Siguiente» con la búsqueda en camino va a la página 2 de la búsqueda', async ({ page }) => {
  await abrirSinSesion(page, LISTA)
  const campo = page.getByRole('searchbox')
  const siguiente = page.getByRole('link', { name: /Siguiente/ })
  await expect(siguiente).toBeVisible()
  await esperarHidratado(campo)
  await esperarHidratado(siguiente)
  // Sin búsqueda, el enlace dice lo que dice: la página 2 del catálogo entero.
  expect(await siguiente.getAttribute('href')).toBe('?page=2')

  const navegaciones = registrarNavegaciones(page)
  await retrasarNavegacion(
    page,
    LISTA,
    DEMORA,
    (url) => url.searchParams.get('q') === '81' && !url.searchParams.has('page'),
  )
  const salio = page.waitForRequest(
    (req) => esNavegacionRsc(req, LISTA) && new URL(req.url()).searchParams.get('q') === '81',
  )

  await campo.fill('81')
  await salio
  await siguiente.click()

  const ambas = /(?=.*[?&]page=2)(?=.*[?&]q=81)/
  await expect(page).toHaveURL(ambas, { timeout: 10_000 })
  await page.waitForTimeout(DEMORA + 500)
  await expect(page).toHaveURL(ambas)
  await expect(campo).toHaveValue('81')
  // La página 2 de la búsqueda: lo que no cabe en la primera, todo con «81».
  const diarios = await page.locator('main ul li').allInnerTexts()
  expect(diarios.length).toBeGreaterThan(0)
  for (const texto of diarios) expect(texto).toMatch(/81/)

  const deLaLista = navegaciones.filter((url) => url.pathname === LISTA)
  expect(
    deLaLista.filter((url) => url.searchParams.has('page') && !url.searchParams.has('q')),
  ).toHaveLength(0)
  expect(deLaLista).toHaveLength(2)
})

test('sin nada en camino, «Siguiente» va exactamente a su enlace', async ({ page }) => {
  await abrirSinSesion(page, LISTA)
  const siguiente = page.getByRole('link', { name: /Siguiente/ })
  await esperarHidratado(siguiente)
  const navegaciones = registrarNavegaciones(page)

  await siguiente.click()
  await expect(page).toHaveURL(new RegExp(`${LISTA}\\?page=2$`))
  await expect(page.getByRole('link', { name: /Anterior/ })).toBeVisible()
  expect(navegaciones.filter((url) => url.pathname === LISTA)).toHaveLength(1)
})
