import { expect, test, type Locator, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'
import {
  esNavegacionRsc,
  esperarHidratado,
  registrarNavegaciones,
  retrasarNavegacion,
} from './navegacion-helpers'

/**
 * I-200 (D-252): un orden o un filtro elegidos con la búsqueda YA en camino no la sustituyen, en escritorio.
 *
 * Es I-199 al revés. La pausa de 350 ms ya venció y la búsqueda salió (`router.replace` con `q`), pero su pantalla
 * todavía no llegó. Antes de D-252, lo que se elegía entonces se construía con la dirección PINTADA —sin `q`— y, como
 * navegación más reciente, sustituía a la búsqueda: la lista quedaba sin buscar y el campo seguía diciendo lo escrito.
 * Aquí la búsqueda se retiene 1,5 s y se elige mientras tanto: tienen que quedar las dos, en UNA navegación más.
 *
 * Recorre las piezas que construyen una dirección: el orden por columna (`useListSort`) en «Mis boletas» y en «Boletas»
 * del personal, con el ratón y con el teclado, y un filtro (`ClientFilters.apply`) en «Mis clientes». La paginación usa
 * la misma función y la prueba `navigation-start.test.ts`.
 *
 * Usa el seed y solo navega: no escribe nada.
 */

const DEMORA = 1500

// En un build de producción el service worker podría servir peticiones sin pasar por `page.route`: sin él, la
// búsqueda retenida está retenida de verdad, en desarrollo y en producción.
test.use({ serviceWorkers: 'block' })

async function elegirConLaBusquedaEnCamino(
  page: Page,
  opciones: {
    campo: Locator
    termino: string
    listaPath: string
    param: string
    elegir: () => Promise<void>
  },
) {
  const { campo, termino, listaPath, param } = opciones
  await esperarHidratado(campo)
  const navegaciones = registrarNavegaciones(page)
  // Solo la búsqueda se retiene: lo elegido después llega enseguida, como pasaría con una búsqueda lenta.
  await retrasarNavegacion(
    page,
    listaPath,
    DEMORA,
    (url) => url.searchParams.get('q') === termino && !url.searchParams.has(param),
  )
  const salio = page.waitForRequest(
    (req) =>
      esNavegacionRsc(req, listaPath) && new URL(req.url()).searchParams.get('q') === termino,
  )

  await campo.fill(termino)
  await salio // la pausa venció y la búsqueda está en camino
  await opciones.elegir()

  const ambas = new RegExp(`(?=.*[?&]${param}=)(?=.*[?&]q=${termino})`)
  await expect(page).toHaveURL(ambas, { timeout: 10_000 })
  // La búsqueda retenida termina en este rato: nada la vuelve a pisar.
  await page.waitForTimeout(DEMORA + 500)
  await expect(page).toHaveURL(ambas)
  await expect(campo).toHaveValue(termino)

  const deLaLista = navegaciones.filter((url) => url.pathname === listaPath)
  expect(
    deLaLista.filter((url) => url.searchParams.has(param) && !url.searchParams.has('q')),
    'lo elegido no sale sin la búsqueda',
  ).toHaveLength(0)
  expect(deLaLista, 'la búsqueda y lo elegido, nada más').toHaveLength(2)
}

test.describe('con la búsqueda en camino, lo elegido la conserva (I-200)', () => {
  test('mis boletas, con el ratón: el orden por «Cliente» se queda con la búsqueda', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    const columna = page.getByRole('table').getByRole('button', { name: 'Cliente', exact: true })
    await esperarHidratado(columna)

    await elegirConLaBusquedaEnCamino(page, {
      campo: page.getByLabel('Buscar por número de boleta o por cliente'),
      termino: '03',
      listaPath: '/seller/tickets',
      param: 'sort',
      elegir: () => columna.click(),
    })
    await expect(page).toHaveURL(/[?&]sort=clientName/)
    await expect(page.getByRole('columnheader', { name: /Cliente/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })

  test('mis boletas, con el teclado: Enter sobre «Cliente» hace lo mismo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    const columna = page.getByRole('table').getByRole('button', { name: 'Cliente', exact: true })
    await esperarHidratado(columna)

    await elegirConLaBusquedaEnCamino(page, {
      campo: page.getByLabel('Buscar por número de boleta o por cliente'),
      termino: '03',
      listaPath: '/seller/tickets',
      param: 'sort',
      elegir: async () => {
        await columna.focus()
        await page.keyboard.press('Enter')
      },
    })
    await expect(page).toHaveURL(/[?&]sort=clientName/)
  })

  test('boletas del personal: el orden por «Vendedor» se queda con la búsqueda', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')
    const columna = page.getByRole('table').getByRole('button', { name: 'Vendedor', exact: true })
    await esperarHidratado(columna)

    await elegirConLaBusquedaEnCamino(page, {
      campo: page.getByLabel('Buscar por número de boleta', { exact: true }),
      termino: '06',
      listaPath: '/owner/tickets',
      param: 'sort',
      elegir: () => columna.click(),
    })
    await expect(page).toHaveURL(/[?&]sort=sellerName/)
  })

  test('mis clientes: «Incluir archivados» se queda con la búsqueda', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients')
    const interruptor = page.getByLabel('Incluir archivados')
    await esperarHidratado(interruptor)

    await elegirConLaBusquedaEnCamino(page, {
      campo: page.getByLabel('Buscar cliente'),
      termino: 'An',
      listaPath: '/seller/clients',
      param: 'archived',
      elegir: () => interruptor.click(),
    })
    await expect(interruptor).toBeChecked()
  })
})

test.describe('lo de siempre no cambia', () => {
  test('después, Atrás deja la lista como estaba antes de buscar, y Adelante vuelve a las dos', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    const campo = page.getByLabel('Buscar por número de boleta o por cliente')
    const columna = page.getByRole('table').getByRole('button', { name: 'Cliente', exact: true })
    await esperarHidratado(columna)

    await elegirConLaBusquedaEnCamino(page, {
      campo,
      termino: '03',
      listaPath: '/seller/tickets',
      param: 'sort',
      elegir: () => columna.click(),
    })

    await page.goBack()
    await expect(page).toHaveURL(/\/seller\/tickets$/)
    await expect(campo).toHaveValue('')
    await page.goForward()
    await expect(page).toHaveURL(/(?=.*[?&]sort=clientName)(?=.*[?&]q=03)/)
    await expect(campo).toHaveValue('03')
  })

  test('una búsqueda sola, sin elegir nada, sigue siendo una sola navegación', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    const campo = page.getByLabel('Buscar por número de boleta o por cliente')
    await esperarHidratado(campo)
    const navegaciones = registrarNavegaciones(page)

    await campo.fill('03')
    await expect(page).toHaveURL(/[?&]q=03/)
    await page.waitForTimeout(800)
    expect(navegaciones.filter((url) => url.pathname === '/seller/tickets')).toHaveLength(1)
  })
})
