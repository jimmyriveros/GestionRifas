import { expect, test, type Page } from '@playwright/test'

import { loadSeedRefs } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'
import {
  abrirDuranteLaPausa,
  esperarHidratado,
  registrarNavegaciones,
  retrasarNavegacion,
} from './navegacion-helpers'

/**
 * Una búsqueda a medio escribir no cancela la navegación que la persona acaba
 * de elegir (I-199, D-245), en escritorio.
 *
 * El buscador de las listas (`useUrlSearch`) espera 350 ms antes de buscar y
 * busca con `router.replace`. Antes de D-245, si en esa pausa se abría una fila
 * y su pantalla tardaba, el `replace` llegaba con la navegación en curso y la
 * sustituía: la persona se quedaba en la lista. Aquí se escribe, se abre la
 * fila ANTES de que venza la pausa y la respuesta del destino se retrasa 1,5 s:
 * tiene que verse el destino elegido, quedarse ahí, y no haber salido ninguna
 * búsqueda. Con el código anterior, estas pruebas acaban en la lista filtrada.
 *
 * Recorre los consumidores del buscador: «Cierre de cuentas», «Boletas» de los
 * dos portales y «Mis clientes». El catálogo público usa el mismo buscador y no
 * tiene ningún enlace que salga de su página: lo cubren sus suites.
 *
 * Además comprueba lo que NO debe cancelar la búsqueda —abrir en otra pestaña,
 * un filtro elegido en la pausa— y Atrás/Adelante.
 *
 * Usa el seed y solo navega: no escribe nada.
 */

const DEMORA = 1500

let lista = ''

test.beforeAll(async () => {
  const refs = await loadSeedRefs()
  lista = `/owner/settlements?raffleId=${refs.raffleId}`
})

/** La primera fila del cierre: su enlace, el vendedor y la dirección de su cuenta. */
async function primeraCuenta(page: Page) {
  const enlace = page
    .getByRole('table')
    .getByRole('link', { name: /^Revisar la cuenta de / })
    .first()
  await esperarHidratado(enlace)
  const nombre = (await enlace.getAttribute('aria-label'))!.replace('Revisar la cuenta de ', '')
  const destino = new URL((await enlace.getAttribute('href'))!, 'http://x').pathname
  return { enlace, nombre, destino }
}

test.describe('una búsqueda pendiente no cancela la fila que se abre (I-199)', () => {
  test('cierre de cuentas, con el ratón: abre la cuenta pulsada y no vuelve a la lista', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(lista)
    const cuenta = await primeraCuenta(page)

    await abrirDuranteLaPausa(page, {
      campo: page.getByLabel('Buscar vendedor'),
      termino: cuenta.nombre.slice(0, 2),
      listaPath: '/owner/settlements',
      destino: cuenta.destino,
      abrir: () => cuenta.enlace.click(),
      titulo: page.getByRole('heading', { level: 1, name: `Cuenta de ${cuenta.nombre}` }),
    })
  })

  test('cierre de cuentas, con el teclado: Enter sobre «Revisar cuenta»', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(lista)
    const cuenta = await primeraCuenta(page)

    await abrirDuranteLaPausa(page, {
      campo: page.getByLabel('Buscar vendedor'),
      termino: cuenta.nombre.slice(0, 2),
      listaPath: '/owner/settlements',
      destino: cuenta.destino,
      abrir: async () => {
        await cuenta.enlace.focus()
        await page.keyboard.press('Enter')
      },
      titulo: page.getByRole('heading', { level: 1, name: `Cuenta de ${cuenta.nombre}` }),
    })
  })

  test('boletas del vendedor: el número de la boleta', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    const enlace = page
      .getByRole('table')
      .getByRole('link', { name: /^Ver la boleta \d{1,4} \/ \d{1,4}$/ })
      .first()
    await esperarHidratado(enlace)
    const diario = (await enlace.getAttribute('aria-label'))!.match(/Ver la boleta (\d+)/)![1]!
    const destino = new URL((await enlace.getAttribute('href'))!, 'http://x').pathname

    await abrirDuranteLaPausa(page, {
      campo: page.getByLabel('Buscar por número de boleta o por cliente'),
      termino: diario.slice(0, 2).padEnd(2, '0'),
      listaPath: '/seller/tickets',
      destino,
      abrir: () => enlace.click(),
      titulo: page.getByRole('heading', { level: 1, name: 'Detalle boleta' }),
    })
  })

  test('boletas del personal: la fila entera, que navega con router.push', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')
    const tabla = page.getByRole('table')
    const fila = tabla.locator('tbody tr').first()
    const enlace = fila.getByRole('link', { name: /^Ver la boleta / })
    await esperarHidratado(fila)
    const diario = (await enlace.getAttribute('aria-label'))!.match(/Ver la boleta (\d+)/)![1]!
    const destino = new URL((await enlace.getAttribute('href'))!, 'http://x').pathname
    // Se pulsa la celda del vendedor, que no es un enlace: abre la fila el
    // `router.push` de `DataTable`, no un `Link`.
    const columna = await tabla
      .locator('thead th')
      .evaluateAll((ths) => ths.findIndex((th) => th.textContent?.trim() === 'Vendedor'))
    expect(columna, 'la tabla tiene columna «Vendedor»').toBeGreaterThan(-1)

    await abrirDuranteLaPausa(page, {
      campo: page.getByLabel('Buscar por número de boleta', { exact: true }),
      termino: diario.slice(0, 2).padEnd(2, '0'),
      listaPath: '/owner/tickets',
      destino,
      abrir: () => fila.locator('td').nth(columna).click(),
      titulo: page.getByRole('heading', { level: 1, name: 'Detalle boleta' }),
    })
  })

  test('mis clientes: el nombre del cliente', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients')
    const enlace = page.getByRole('table').getByRole('link').first()
    await esperarHidratado(enlace)
    const nombre = (await enlace.innerText()).trim()
    const destino = new URL((await enlace.getAttribute('href'))!, 'http://x').pathname

    await abrirDuranteLaPausa(page, {
      campo: page.getByLabel('Buscar cliente'),
      termino: nombre.slice(0, 2),
      listaPath: '/seller/clients',
      destino,
      abrir: () => enlace.click(),
      titulo: page.getByRole('heading', { level: 1, name: nombre }),
    })
  })
})

test.describe('lo que no sale de la pantalla no cancela la búsqueda', () => {
  test('abrir la cuenta en otra pestaña: esta pestaña busca igual', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(lista)
    const cuenta = await primeraCuenta(page)
    const campo = page.getByLabel('Buscar vendedor')
    await esperarHidratado(campo)
    const termino = cuenta.nombre.slice(0, 2)

    await campo.fill(termino)
    const [pestana] = await Promise.all([
      page.context().waitForEvent('page'),
      cuenta.enlace.click({ modifiers: ['Control'] }),
    ])

    // La pestaña nueva abre la cuenta…
    await expect(
      pestana.getByRole('heading', { level: 1, name: `Cuenta de ${cuenta.nombre}` }),
    ).toBeVisible()
    // …y esta se queda en la lista y hace la búsqueda escrita.
    await expect(page).toHaveURL(new RegExp(`/owner/settlements\\?.*q=${termino}`))
    await expect(page.getByRole('heading', { level: 1, name: 'Cierre de cuentas' })).toBeVisible()
    await expect(campo).toHaveValue(termino)
    await pestana.close()
  })

  test('boletas del vendedor en otra pestaña: esta pestaña busca igual', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    const enlace = page
      .getByRole('table')
      .getByRole('link', { name: /^Ver la boleta \d{1,4} \/ \d{1,4}$/ })
      .first()
    await esperarHidratado(enlace)
    const diario = (await enlace.getAttribute('aria-label'))!.match(/Ver la boleta (\d+)/)![1]!
    const termino = diario.slice(0, 2).padEnd(2, '0')
    const campo = page.getByLabel('Buscar por número de boleta o por cliente')
    await esperarHidratado(campo)

    await campo.fill(termino)
    const [pestana] = await Promise.all([
      page.context().waitForEvent('page'),
      enlace.click({ modifiers: ['Control'] }),
    ])

    await expect(pestana.getByRole('heading', { level: 1, name: 'Detalle boleta' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/seller/tickets\\?.*q=${termino}`))
    await expect(campo).toHaveValue(termino)
    await pestana.close()
  })

  /**
   * Una navegación dentro de la pantalla —un filtro, el orden— elegida durante
   * la pausa. Se retrasa para que siga en curso cuando vence la pausa, que es
   * cuando la búsqueda la sustituye: tienen que quedar las dos. Con el buscador
   * anterior quedaba solo la búsqueda, construida con los parámetros de antes.
   * Las dos se disparan con UN clic, para elegir con holgura dentro de los
   * 350 ms; la prueba comprueba además que de verdad salió primero.
   */
  async function elegirDuranteLaPausa(
    page: Page,
    opciones: {
      campo: ReturnType<Page['getByLabel']>
      termino: string
      listaPath: string
      param: string
      elegir: () => Promise<void>
    },
  ) {
    await esperarHidratado(opciones.campo)
    const navegaciones = registrarNavegaciones(page)
    await retrasarNavegacion(page, opciones.listaPath, DEMORA, (url) =>
      url.searchParams.has(opciones.param),
    )

    await opciones.campo.fill(opciones.termino)
    await opciones.elegir()

    const ambas = new RegExp(`(?=.*[?&]${opciones.param}=)(?=.*[?&]q=${opciones.termino})`)
    await expect(page).toHaveURL(ambas, { timeout: 10_000 })
    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(ambas)
    await expect(opciones.campo).toHaveValue(opciones.termino)

    // Primero salió lo elegido, sin la búsqueda; después, la búsqueda con ello.
    expect(navegaciones[0]?.searchParams.has(opciones.param)).toBe(true)
    expect(navegaciones[0]?.searchParams.has('q')).toBe(false)
    expect(navegaciones.filter((url) => url.searchParams.has('q'))).toHaveLength(1)
  }

  test('un filtro elegido durante la pausa («Incluir archivados»): se quedan el filtro y la búsqueda', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients')
    const nombre = (await page.getByRole('table').getByRole('link').first().innerText()).trim()
    const interruptor = page.getByLabel('Incluir archivados')
    await esperarHidratado(interruptor)

    await elegirDuranteLaPausa(page, {
      campo: page.getByLabel('Buscar cliente'),
      termino: nombre.slice(0, 2),
      listaPath: '/seller/clients',
      param: 'archived',
      elegir: () => interruptor.click(),
    })
    await expect(interruptor).toBeChecked()
  })

  test('un orden elegido durante la pausa (columna «Cliente»): se quedan el orden y la búsqueda', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    const columna = page.getByRole('table').getByRole('button', { name: 'Cliente', exact: true })
    await esperarHidratado(columna)

    await elegirDuranteLaPausa(page, {
      campo: page.getByLabel('Buscar por número de boleta o por cliente'),
      termino: '00',
      listaPath: '/seller/tickets',
      param: 'sort',
      elegir: () => columna.click(),
    })
    await expect(page.getByRole('columnheader', { name: /Cliente/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })
})

test.describe('Atrás y Adelante', () => {
  test('conservan la búsqueda hecha y la cuenta abierta', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(lista)
    const cuenta = await primeraCuenta(page)
    const campo = page.getByLabel('Buscar vendedor')
    await esperarHidratado(campo)
    const termino = cuenta.nombre.slice(0, 2)

    await campo.fill(termino)
    await expect(page).toHaveURL(new RegExp(`q=${termino}`))
    await expect(cuenta.enlace).toBeVisible()
    await cuenta.enlace.click()
    const titulo = page.getByRole('heading', { level: 1, name: `Cuenta de ${cuenta.nombre}` })
    await expect(titulo).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/owner/settlements\\?.*q=${termino}`))
    await expect(page.getByLabel('Buscar vendedor')).toHaveValue(termino)
    await expect(cuenta.enlace).toBeVisible()

    await page.goForward()
    await expect(titulo).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${cuenta.destino}\\?`))
  })

  test('Atrás durante la pausa vuelve a la pantalla anterior y nada la pisa', async ({ page }) => {
    // Del panel a la lista por el menú: en el mismo documento, así que Atrás es
    // una navegación del router y no una carga del navegador.
    await loginAs(page, ACCOUNTS.owner)
    const menu = page.getByRole('link', { name: 'Cierre de cuentas', exact: true }).first()
    await esperarHidratado(menu)
    await menu.click()
    await expect(page.getByRole('heading', { level: 1, name: 'Cierre de cuentas' })).toBeVisible()
    const campo = page.getByLabel('Buscar vendedor')
    await esperarHidratado(campo)

    const navegaciones = registrarNavegaciones(page)
    await campo.fill('Ju')
    await page.goBack()

    await expect(page).toHaveURL(/\/owner\/dashboard/)
    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(/\/owner\/dashboard/)
    expect(navegaciones.filter((url) => url.searchParams.has('q'))).toHaveLength(0)

    // Y Adelante devuelve la lista tal como estaba, sin la búsqueda a medias.
    await page.goForward()
    await expect(page).toHaveURL(/\/owner\/settlements$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Cierre de cuentas' })).toBeVisible()
  })
})
