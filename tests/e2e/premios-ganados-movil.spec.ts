import { expect, test, type Page } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'
import {
  borrarEscenarioPremios,
  crearEscenarioPremios,
  type PremiosEscenario,
} from './premios-ganados-escenario'

/**
 * «Premios ganados» en el teléfono (D-208, Etapa 2). Proyecto `movil` (Pixel 7).
 *
 * Tres cosas que solo se ven aquí: la barra inferior conserva sus cuatro
 * accesos y la sección se alcanza desde el menú de usuario; cada premio es una
 * tarjeta que enseña TODO lo indispensable —nada se esconde por falta de
 * ancho—; y nada se sale de la pantalla, tampoco a 320 px con un nombre
 * larguísimo y cifras grandes.
 */

let esc: PremiosEscenario

test.beforeAll(async () => {
  test.setTimeout(180_000)
  esc = await crearEscenarioPremios()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await borrarEscenarioPremios()
})

function barra(page: Page) {
  return page.getByRole('navigation', { name: 'Navegación principal' })
}

async function sinDesbordamiento(page: Page, donde: string): Promise<void> {
  const exceso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(exceso, `${donde}: la pantalla se desplaza de lado`).toBeLessThanOrEqual(0)
}

function tarjeta(page: Page, texto: string) {
  return page.locator('[data-slot="prize-award-card"]').filter({ hasText: texto })
}

test('el vendedor llega desde el menú de usuario, y la barra inferior sigue con sus cuatro', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.seller)
  await expect(barra(page).getByRole('link')).toHaveCount(4)
  await expect(barra(page).getByRole('link', { name: /Premios/ })).toHaveCount(0)

  await page.getByRole('button', { name: /Menú de usuario/ }).tap()
  await page.getByRole('menuitem', { name: 'Premios ganados' }).tap()
  await page.waitForURL('**/seller/prizes')
  await expect(page.getByRole('heading', { name: 'Premios ganados', level: 1 })).toBeVisible()
  // En una pantalla que no está entre las cuatro, abajo no se enciende ninguna.
  await expect(barra(page).locator('a[aria-current="page"]')).toHaveCount(0)
})

test('cada tarjeta enseña lo indispensable, y nada se sale de la pantalla, tampoco a 320 px', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.seller)
  await page.goto(`/seller/prizes?raffleId=${esc.rifaMotor.id}&page=2`)

  const dona = tarjeta(page, esc.clientes.dona.nombre).filter({ hasText: '6263 / 8888' })
  await expect(dona).toBeVisible()
  for (const texto of [
    'Fecha del sorteo',
    'Bogotá · Sorteo',
    'Número mayor',
    '6262',
    'Cliente',
    esc.clientes.dona.nombre,
    'Diario · Semanal',
    'Jugó con',
    'Número diario 6262 · Cuatro cifras',
    'Rifa',
    esc.rifaMotor.nombre,
    '$500.000',
    'El número de esta boleta ya no es el que jugó en este sorteo. Requiere verificación.',
  ]) {
    await expect(dona, texto).toContainText(texto)
  }
  await expect(tarjeta(page, esc.clientes.camila.nombre)).toContainText(
    'La fuente oficial publicó otro número. Requiere verificación.',
  )
  // Los ceros a la izquierda llegan enteros (BR-N03).
  await expect(tarjeta(page, '0046 / 1111')).toContainText('Número diario 0046 · Cuatro cifras')
  await sinDesbordamiento(page, '/seller/prizes')

  await page.setViewportSize({ width: 320, height: 800 })
  await page.reload()
  await expect(dona).toBeVisible()
  await sinDesbordamiento(page, '/seller/prizes a 320 px')

  await page.goto(`/seller/prizes?raffleId=${esc.rifaMotor.id}`)
  await expect(tarjeta(page, 'Premio principal')).toContainText(
    'Una de estas alternativas: Camioneta KIA, $120.000.000 o Renault Logan y $70.000.000',
  )
  await sinDesbordamiento(page, '/seller/prizes con la rifa filtrada a 320 px')
})

test('la ficha del cliente resume sus premios en el teléfono, y el enlace llega filtrado', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.seller)
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto(`/seller/clients/${esc.clientes.aurora.id}`)

  const resumen = page.locator('[data-slot="client-prize-summary"]')
  await expect(resumen).toContainText(/3 premios\s·\s\$3\.000\.000 en dinero/)
  await sinDesbordamiento(page, 'ficha del cliente a 320 px')

  await resumen.getByRole('link', { name: `Ver premios de ${esc.clientes.aurora.nombre}` }).tap()
  await page.waitForURL(new RegExp(`clientId=${esc.clientes.aurora.id}`))
  await expect(page.getByText(`Solo los premios de ${esc.clientes.aurora.nombre}.`)).toBeVisible()
  await expect(page.locator('[data-slot="prize-award-card"]')).toHaveCount(3)
  await sinDesbordamiento(page, 'historial del cliente a 320 px')
})

test('el personal en el teléfono: tarjetas con el vendedor y sin un solo cliente', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.owner)
  await expect(barra(page).getByRole('link')).toHaveCount(2)

  await page.getByRole('button', { name: /Menú de usuario/ }).tap()
  await page.getByRole('menuitem', { name: 'Premios ganados' }).tap()
  await page.waitForURL('**/owner/prizes')

  await page.goto(`/owner/prizes?raffleId=${esc.rifaMotor.id}`)
  const principal = tarjeta(page, 'Premio principal')
  await expect(principal).toContainText('Vendedor')
  await expect(principal).toContainText(esc.vendedor1Nombre)
  await expect(principal).not.toContainText('Cliente')
  await expect(page.locator('main')).not.toContainText(esc.clientes.bruno.nombre)
  await sinDesbordamiento(page, '/owner/prizes')

  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto(`/owner/sellers/${esc.inactivo.id}`)
  await expect(page.locator('[data-slot="seller-prize-summary"]')).toContainText('$500.000')
  await sinDesbordamiento(page, 'ficha del vendedor inactivo a 320 px')
})

test('a 375 px tampoco se sale nada: historial y ficha del cliente, historial y ficha del vendedor (Etapa 3)', async ({
  page,
}) => {
  // 320 y 412 ya se miden arriba; 375 es el ancho de muchos iPhone y faltaba.
  await page.setViewportSize({ width: 375, height: 812 })
  await loginAs(page, ACCOUNTS.seller)
  for (const ruta of [
    '/seller/prizes',
    `/seller/prizes?clientId=${esc.clientes.dona.id}`,
    `/seller/clients/${esc.clientes.dona.id}`,
  ]) {
    await page.goto(ruta)
    await expect(page.locator('main h1').first()).toBeVisible()
    await sinDesbordamiento(page, `${ruta} a 375 px`)
  }

  await page.context().clearCookies()
  await loginAs(page, ACCOUNTS.owner)
  for (const ruta of [
    '/owner/prizes',
    `/owner/prizes?sellerId=${esc.ascendido.id}`,
    `/owner/sellers/${esc.inactivo.id}`,
  ]) {
    await page.goto(ruta)
    await expect(page.locator('main h1').first()).toBeVisible()
    await sinDesbordamiento(page, `${ruta} a 375 px`)
  }
})
