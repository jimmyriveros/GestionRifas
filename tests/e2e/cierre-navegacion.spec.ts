import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { loadSeedRefs, serviceClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * «Revisar cuenta» dice que se está abriendo (D-244), en escritorio.
 *
 * La cuenta de un vendedor no se precarga (`RowLink`, D-104) ni tiene
 * `loading.tsx`: hasta que responde el servidor se sigue viendo la lista. El
 * 2026-09-30, en producción, la lista se quedó quieta y sin ningún aviso tras
 * pulsar «Revisar cuenta». Aquí la lentitud se fabrica —la petición RSC de la
 * cuenta se retrasa, se cuelga o falla con `page.route`— y se comprueba lo que
 * ve y oye la persona, y que acaba en la cuenta que pulsó.
 *
 * Esto prueba la RESPUESTA VISUAL, no la causa de aquel incidente, que sigue
 * sin demostrarse (`KNOWN_ISSUES`, I-198).
 *
 * Usa la rifa y el vendedor del seed y solo navega: no escribe nada.
 */

let lista = ''
let vendedor = { id: '', nombre: '' }

test.beforeAll(async () => {
  const refs = await loadSeedRefs()
  const { data, error } = await serviceClient()
    .from('profiles')
    .select('full_name')
    .eq('id', refs.sellerId)
    .single()
  if (error || !data) throw error ?? new Error('Falta el vendedor del seed')
  vendedor = { id: refs.sellerId, nombre: data.full_name }
  lista = `/owner/settlements?raffleId=${refs.raffleId}`
})

/** La petición RSC que trae la cuenta; las demás pasan sin tocarlas. */
function esLaCuenta(route: Route): boolean {
  const req = route.request()
  return (
    new URL(req.url()).pathname === `/owner/settlements/${vendedor.id}` &&
    req.headers()['rsc'] === '1' &&
    !req.headers()['next-router-prefetch']
  )
}

/**
 * Hasta que React engancha el enlace, el clic es una navegación del navegador
 * y ningún aviso de la página puede encenderse (TESTING.md §5.3). Se espera a
 * la hidratación en vez de reintentar: un clic de más ya habría navegado.
 */
async function esperarHidratado(link: Locator) {
  await expect
    .poll(() => link.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))))
    .toBe(true)
}

async function abrirLista(page: Page): Promise<Locator> {
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(lista)
  const boton = page
    .getByRole('table')
    .getByRole('link', { name: `Revisar la cuenta de ${vendedor.nombre}` })
  await esperarHidratado(boton)
  return boton
}

function tituloDeLaCuenta(page: Page) {
  return page.getByRole('heading', { level: 1, name: `Cuenta de ${vendedor.nombre}` })
}

test('el botón dice «Abriendo cuenta…» en el mismo clic, no se mueve y abre la cuenta pulsada', async ({
  page,
}) => {
  const boton = await abrirLista(page)
  const fila = page.getByRole('table').getByRole('row').filter({ hasText: vendedor.nombre })
  const anunciado = boton.getByRole('status')

  // Antes del clic: el texto de siempre y nada que anunciar.
  await expect(boton.getByText('Revisar cuenta', { exact: true })).toBeVisible()
  await expect(boton.getByText('Abriendo cuenta…', { exact: true })).toBeHidden()
  await expect(anunciado).toHaveText('')
  const botonAntes = (await boton.boundingBox())!
  const filaAntes = (await fila.boundingBox())!

  await page.route(`**/owner/settlements/${vendedor.id}**`, async (route) => {
    if (!esLaCuenta(route)) return route.continue()
    await new Promise((resuelve) => setTimeout(resuelve, 2500))
    await route.continue()
  })
  await boton.click()

  // Mientras la cuenta no llega: el aviso, a la vista y para quien escucha, con
  // la lista todavía en pantalla.
  await expect(boton.getByText('Abriendo cuenta…', { exact: true })).toBeVisible({ timeout: 1000 })
  await expect(boton.getByText('Revisar cuenta', { exact: true })).toBeHidden()
  await expect(boton.locator('svg.animate-spin')).toBeVisible()
  await expect(anunciado).toHaveText(`Abriendo la cuenta de ${vendedor.nombre}…`)
  await expect(page).toHaveURL(/\/owner\/settlements\?/)

  // El aviso no empuja nada: el botón ya medía lo que mide «Abriendo cuenta…».
  const botonDurante = (await boton.boundingBox())!
  const filaDurante = (await fila.boundingBox())!
  expect(Math.abs(botonDurante.width - botonAntes.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(botonDurante.x - botonAntes.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(filaDurante.height - filaAntes.height)).toBeLessThanOrEqual(1)

  await expect(tituloDeLaCuenta(page)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/owner/settlements/${vendedor.id}\\?`))
})

test('con el teclado también se avisa', async ({ page }) => {
  const boton = await abrirLista(page)
  await page.route(`**/owner/settlements/${vendedor.id}**`, async (route) => {
    if (!esLaCuenta(route)) return route.continue()
    await new Promise((resuelve) => setTimeout(resuelve, 2000))
    await route.continue()
  })

  await boton.focus()
  await page.keyboard.press('Enter')

  await expect(boton.getByText('Abriendo cuenta…', { exact: true })).toBeVisible({ timeout: 1000 })
  await expect(boton.getByRole('status')).toHaveText(`Abriendo la cuenta de ${vendedor.nombre}…`)
  await expect(tituloDeLaCuenta(page)).toBeVisible()
})

test('si la cuenta no responde, el aviso se queda y otro clic la abre', async ({ page }) => {
  const boton = await abrirLista(page)
  const colgadas: Route[] = []
  let pedidas = 0
  await page.route(`**/owner/settlements/${vendedor.id}**`, async (route) => {
    if (!esLaCuenta(route)) return route.continue()
    pedidas++
    if (pedidas === 1) {
      colgadas.push(route) // nunca responde
      return
    }
    await route.continue()
  })

  await boton.click()
  await expect(boton.getByText('Abriendo cuenta…', { exact: true })).toBeVisible({ timeout: 1000 })
  // Pasado el rato, sigue diciendo lo que pasa: no vuelve a «Revisar cuenta»
  // como si el clic no hubiera existido.
  await page.waitForTimeout(3000)
  await expect(boton.getByText('Abriendo cuenta…', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/owner\/settlements\?/)

  // El enlace sigue vivo: otro clic pide la cuenta de nuevo y la abre.
  await boton.click()
  await expect(tituloDeLaCuenta(page)).toBeVisible()
  expect(pedidas).toBe(2)

  for (const route of colgadas) await route.abort().catch(() => undefined)
})

test('si la petición falla, la cuenta pulsada se abre igual', async ({ page }) => {
  const boton = await abrirLista(page)
  let fallos = 0
  await page.route(`**/owner/settlements/${vendedor.id}**`, async (route) => {
    if (!esLaCuenta(route)) return route.continue()
    fallos++
    await route.abort('failed')
  })

  await boton.click()

  // Next pasa entonces a una carga completa de la misma dirección, que aquí no
  // se intercepta: el aviso no se queda colgado y la cuenta es la pulsada.
  await expect(tituloDeLaCuenta(page)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/owner/settlements/${vendedor.id}\\?`))
  expect(fallos).toBe(1)
})
