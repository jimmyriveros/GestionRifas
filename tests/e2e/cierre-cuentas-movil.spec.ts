import { expect, test, type Page } from '@playwright/test'

import {
  CIERRE_ESPERADO as ESPERADO,
  borrarEscenarioCierre,
  crearEscenarioCierre,
  type CierreEscenario,
} from './cierre-escenario'
import { ACCOUNTS, loginAs } from './fixtures'
import { TOURS } from '../../src/features/tour/tours'

/**
 * «Cierre de cuentas» en el teléfono (D-241): lo que un vendedor usa de pie y lo
 * que el dueño revisa fuera de la oficina. Sin desplazamiento lateral, con las
 * dianas de 44 px y con el saldo ANTES que el calculo que lo explica.
 */

test.describe.configure({ mode: 'serial' })

let esc: CierreEscenario

test.beforeAll(async () => {
  test.setTimeout(180_000)
  esc = await crearEscenarioCierre()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await borrarEscenarioCierre()
})

async function entrarComo(page: Page, correo: string) {
  const claves = Object.values(esc.personas).flatMap((persona) =>
    TOURS.map((tour) => `rifas.tour.${persona.id}.${tour.id}`),
  )
  await page.addInitScript((keys: string[]) => {
    for (const key of keys) window.localStorage.setItem(key, 'e2e')
  }, claves)
  await loginAs(page, correo)
}

async function sinDesborde(page: Page) {
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(desborde, 'la pantalla no se desplaza de lado').toBeLessThanOrEqual(0)
}

async function alto(page: Page, nombre: RegExp | string) {
  const caja = await page.getByRole('button', { name: nombre }).first().boundingBox()
  expect(caja, `el botón «${nombre}» se ve`).not.toBeNull()
  return caja!.height
}

test('el dueño en el teléfono: tarjetas, el saldo antes del cálculo y botones de 44 px', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(`/owner/settlements?raffleId=${esc.rifa.id}`)
  await sinDesborde(page)

  const carlos = page.getByRole('link', { name: 'Revisar la cuenta de Carlos Ruiz' })
  await expect(carlos).toBeVisible()
  await expect(carlos).toContainText('Falta recibir')
  await expect(carlos).toContainText(ESPERADO.carlos.falta)
  await expect(carlos).toContainText('45 pagadas de 48 vendidas')

  await carlos.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Cuenta de Carlos Ruiz' })).toBeVisible()
  await sinDesborde(page)

  // El recuadro del saldo va antes que el calculo en el orden de lectura.
  const saldo = page.locator('[data-slot="settlement-hero"]')
  const calculo = page.getByRole('heading', { level: 2, name: 'Así se calcula la entrega' })
  const ySaldo = (await saldo.boundingBox())!.y
  const yCalculo = (await calculo.boundingBox())!.y
  expect(ySaldo).toBeLessThan(yCalculo)

  expect(await alto(page, 'Registrar lo que recibiste de Carlos')).toBeGreaterThanOrEqual(44)
})

test('Carlos en el teléfono: su entrega, su equipo y el botón de cada integrante', async ({
  page,
}) => {
  await entrarComo(page, esc.personas.carlos.correo)
  await page.goto(`/seller/settlement?raffleId=${esc.rifa.id}`)
  await sinDesborde(page)

  const saldo = page.locator('[data-slot="settlement-hero"]')
  await expect(saldo).toContainText('Para entregar al dueño')
  await expect(saldo).toContainText(ESPERADO.carlos.falta)
  await expect(saldo).toContainText('Incluye tus ventas y las de tu equipo.')

  const cuenta = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Tu cuenta', exact: true }) })
  await expect(cuenta).toContainText('$600.000 por tus ventas y $300.000 por las de tu equipo.')
  await expect(cuenta).toContainText('Ganancia de tu equipo')
  await expect(cuenta).toContainText(ESPERADO.carlos.total)

  expect(await alto(page, 'Registrar lo que recibiste de Ana')).toBeGreaterThanOrEqual(44)
  // Luis ya entregó todo: su fila no ofrece el botón.
  await expect(
    page.getByRole('button', { name: 'Registrar lo que recibiste de Luis' }),
  ).toHaveCount(0)
})

test('Ana en el teléfono: su saldo arriba, su premio con su cliente y sin desborde', async ({
  page,
}) => {
  await entrarComo(page, esc.personas.ana.correo)
  await page.goto(`/seller/settlement?raffleId=${esc.rifa.id}`)
  await sinDesborde(page)
  await expect(page.locator('[data-slot="settlement-hero"]')).toContainText(ESPERADO.ana.falta)
  await expect(page.getByText(`Cliente: ${esc.clienteAna}`)).toBeVisible()
})
