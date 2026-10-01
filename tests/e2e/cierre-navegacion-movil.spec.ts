import { expect, test, type Page } from '@playwright/test'

import {
  borrarEscenarioCierre,
  crearEscenarioCierre,
  type CierreEscenario,
} from './cierre-escenario'
import { loadSeedRefs, serviceClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'
import {
  comprobarTarjetaAbriendose,
  comprobarTarjetaEnReposo,
  esperarHidratado,
  retrasarNavegacion,
} from './navegacion-helpers'
import { TOURS } from '../../src/features/tour/tours'

/**
 * «Cierre de cuentas» en el teléfono: la tarjeta de una cuenta dice que se
 * está abriendo (D-244).
 *
 * En el teléfono la tarjeta entera es el enlace y no hay un texto «Revisar
 * cuenta» que cambiar: en el mismo toque la tarjeta toma el fondo de la fila
 * pulsada y su flecha se convierte en el icono girando —el recurso del menú,
 * en el mismo hueco—, y quien escucha la pantalla oye «Abriendo la cuenta de…».
 * Lo mismo en «Cuentas con tu equipo», la lista del vendedor a cargo. La
 * petición RSC de la cuenta se retrasa con `page.route` para poder mirarlo.
 *
 * La lista del personal usa la rifa y el vendedor del seed; la del equipo, el
 * escenario de Figma del cierre (`cierre-escenario.ts`). Solo navegan.
 */

async function sinDesborde(page: Page) {
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(desborde, 'la pantalla no se desplaza de lado').toBeLessThanOrEqual(0)
}

test.describe('la lista del personal', () => {
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

  test('la tarjeta cambia de fondo y gira su flecha en el mismo toque, sin moverse', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(lista)
    const tarjeta = page
      .getByRole('list', { name: 'Cuentas de los vendedores' })
      .getByRole('link', { name: `Revisar la cuenta de ${vendedor.nombre}` })
    await esperarHidratado(tarjeta)
    await comprobarTarjetaEnReposo(tarjeta)
    const antes = (await tarjeta.boundingBox())!

    await retrasarNavegacion(page, `/owner/settlements/${vendedor.id}`, 2500)
    await tarjeta.tap()

    await comprobarTarjetaAbriendose(
      page,
      tarjeta,
      `Abriendo la cuenta de ${vendedor.nombre}…`,
      antes,
    )
    await expect(page).toHaveURL(/\/owner\/settlements\?/)
    await sinDesborde(page)

    await expect(
      page.getByRole('heading', { level: 1, name: `Cuenta de ${vendedor.nombre}` }),
    ).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/owner/settlements/${vendedor.id}\\?`))
  })
})

test.describe('«Cuentas con tu equipo», del vendedor a cargo', () => {
  let esc: CierreEscenario

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    esc = await crearEscenarioCierre()
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    await borrarEscenarioCierre()
  })

  test('la fila del integrante cambia de fondo y gira su flecha en el mismo toque, y abre su cuenta', async ({
    page,
  }) => {
    // Las cuentas del escenario nacen después del seed: su recorrido guiado se
    // da por visto aquí, como en `cierre-cuentas.spec.ts`.
    const claves = Object.values(esc.personas).flatMap((persona) =>
      TOURS.map((tour) => `rifas.tour.${persona.id}.${tour.id}`),
    )
    await page.addInitScript((keys: string[]) => {
      for (const key of keys) window.localStorage.setItem(key, 'e2e')
    }, claves)
    await loginAs(page, esc.personas.carlos.correo)
    await page.goto(`/seller/settlement?raffleId=${esc.rifa.id}`)

    const ana = esc.personas.ana
    const fila = page.getByRole('link', { name: `Ver la cuenta de ${ana.nombre}` })
    await esperarHidratado(fila)
    await comprobarTarjetaEnReposo(fila)
    const antes = (await fila.boundingBox())!

    await retrasarNavegacion(page, `/seller/settlement/team/${ana.id}`, 2500)
    await fila.tap()

    await comprobarTarjetaAbriendose(page, fila, `Abriendo la cuenta de ${ana.nombre}…`, antes)
    await expect(page).toHaveURL(/\/seller\/settlement\?/)
    await sinDesborde(page)

    await expect(
      page.getByRole('heading', { level: 1, name: `Cuenta de ${ana.nombre}` }),
    ).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/seller/settlement/team/${ana.id}\\?`))
  })
})
