import { expect, test, type Page } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  raffleTicketPrice,
  ticketBalance,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'
import { formatCOP } from '../../src/lib/money'

/**
 * «Registrar abono» en un teléfono (D-138).
 *
 * Corre solo en el proyecto `movil` (Pixel 7). Comprueba las promesas del
 * rediseño, que son justo las que la tabla de cuatro columnas incumplía:
 *
 *   1. El título es solo «Registrar abono»; el cliente vive debajo, con
 *      «Cambiar».
 *   2. Cada boleta es una tarjeta, no una fila. La tabla de escritorio está
 *      oculta.
 *   3. No hay scroll horizontal, ni con un nombre largo ni a 320 px.
 *   4. Los botones van encima de la barra inferior, no tapados por ella.
 *   5. La última tarjeta se puede ver entera.
 *
 * La lógica de dinero no se vuelve a probar aquí: vive en `payments.spec.ts`
 * y en `abono-desde-boleta-movil.spec.ts`.
 */

let PRICE: number
let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

function desborde(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

function listaBoletas(page: Page) {
  return page.getByRole('list', { name: 'Reparto del abono entre las boletas del cliente' })
}

test.describe('Registrar abono en el teléfono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('el cliente se lee debajo del título y Cambiar no se sale', async ({ page }) => {
    const nombre = unique('Ancheta')
    const cliente = await createClientFor(refs, nombre)
    const numbers = randomTicketNumbers()
    await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)

    const titulo = page.getByRole('heading', { name: 'Registrar abono', exact: true })
    await expect(titulo).toBeVisible()
    await expect(page.getByRole('heading', { name: `Registrar abono · ${nombre}` })).toHaveCount(0)

    await expect(page.getByText('Abono para')).toBeVisible()
    await expect(page.getByText(nombre, { exact: true })).toBeVisible()
    await expect(page.getByText('El abono se reparte entre sus boletas.')).toBeVisible()

    const cambiar = page.getByRole('link', { name: 'Cambiar de cliente' })
    await expect(cambiar).toBeVisible()
    await expect(cambiar).toHaveText('Cambiar')

    const cajaTitulo = (await titulo.boundingBox())!
    const cajaNombre = (await page.getByText(nombre, { exact: true }).boundingBox())!
    const cajaCambiar = (await cambiar.boundingBox())!
    expect(cajaNombre.y).toBeGreaterThan(cajaTitulo.y)
    expect(cajaCambiar.x + cajaCambiar.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
    expect(cajaNombre.x + cajaNombre.width).toBeLessThanOrEqual(cajaCambiar.x + 1)
  })

  test('un nombre largo baja de línea sin empujar Cambiar ni provocar scroll', async ({ page }) => {
    const nombre = unique('María Fernanda del Socorro Restrepo Villalobos de la Hoz')
    const cliente = await createClientFor(refs, nombre)
    const numbers = randomTicketNumbers()
    await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)

    const cambiar = page.getByRole('link', { name: 'Cambiar de cliente' })
    await expect(cambiar).toBeVisible()
    const cajaCambiar = (await cambiar.boundingBox())!
    expect(cajaCambiar.x + cajaCambiar.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)

    expect(await desborde(page)).toBeLessThanOrEqual(2)
  })

  test('cada boleta es una tarjeta y la tabla de cuatro columnas no se ve', async ({ page }) => {
    const cliente = await createClientFor(refs, unique('Movil tarjetas abono'))
    const first = randomTicketNumbers()
    const second = randomTicketNumbers()
    await createAssignedTicket(refs, {
      dailyNumber: first.daily,
      weeklyNumber: first.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })
    await createAssignedTicket(refs, {
      dailyNumber: second.daily,
      weeklyNumber: second.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)

    const lista = listaBoletas(page)
    await expect(lista).toBeVisible()
    await expect(lista.getByRole('listitem')).toHaveCount(2)

    await expect(lista.getByText('Boleta').first()).toBeVisible()
    await expect(lista.getByText('Debe').first()).toBeVisible()
    await expect(lista.getByText('Abonar ahora').first()).toBeVisible()
    await expect(lista.getByText(`${first.daily} / ${first.weekly}`)).toBeVisible()
    await expect(lista.getByText(`${second.daily} / ${second.weekly}`)).toBeVisible()

    await expect(page.getByRole('columnheader', { name: 'Abona ahora' })).toBeHidden()
    await expect(page.getByRole('columnheader', { name: 'Quedará' })).toBeHidden()

    expect(await desborde(page)).toBeLessThanOrEqual(2)
  })

  test('fecha y método caben en la misma fila', async ({ page }) => {
    const cliente = await createClientFor(refs, unique('Movil fecha metodo'))
    const numbers = randomTicketNumbers()
    await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)

    const fechaInput = page.getByLabel('Fecha')
    const metodoInput = page.getByLabel('Método')

    async function noSeMontan() {
      const fecha = (await fechaInput.boundingBox())!
      const metodo = (await metodoInput.boundingBox())!
      expect(Math.abs(fecha.y - metodo.y)).toBeLessThan(8)
      expect(metodo.x).toBeGreaterThan(fecha.x + fecha.width - 1)
      expect(fecha.x + fecha.width).toBeLessThanOrEqual(metodo.x + 1)
    }

    await noSeMontan()

    /*
     * D-139: en iPhone/Android el control nativo ignoraba el 50 % y se
     * pintaba encima de Metodo. Chromium de Playwright no reproduce ese
     * desborde de tinta; lo que SI se puede clavar aqui es que el input
     * ya no es un menulist-button (`appearance: none`) y que, en el corte
     * mas estrecho de dos columnas (360 px), las cajas de maquetacion no
     * se pisan.
     */
    const appearance = await fechaInput.evaluate((el) => getComputedStyle(el).appearance)
    expect(appearance).toBe('none')

    await page.setViewportSize({ width: 360, height: 720 })
    await noSeMontan()
  })

  test('los botones van a ancho completo encima de la barra inferior', async ({ page }) => {
    const cliente = await createClientFor(refs, unique('Movil botones abono'))
    const numbers = randomTicketNumbers()
    await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)

    const registrar = page.getByRole('button', { name: 'Registrar abono' })
    const cancelar = page.getByRole('button', { name: 'Cancelar' })
    await expect(registrar).toBeVisible()
    await expect(cancelar).toBeVisible()

    const cajaRegistrar = (await registrar.boundingBox())!
    const cajaCancelar = (await cancelar.boundingBox())!
    const ancho = page.viewportSize()!.width

    expect(cajaRegistrar.width).toBeGreaterThan(ancho * 0.8)
    expect(cajaCancelar.width).toBeGreaterThan(ancho * 0.8)
    expect(cajaRegistrar.height).toBeGreaterThanOrEqual(48)
    expect(cajaCancelar.height).toBeGreaterThanOrEqual(48)
    expect(cajaCancelar.y).toBeGreaterThan(cajaRegistrar.y + cajaRegistrar.height - 1)

    await cancelar.scrollIntoViewIfNeeded()
    const nav = page.getByRole('navigation', { name: 'Navegación principal' })
    const cajaNav = (await nav.boundingBox())!
    const cajaCancelarVisible = (await cancelar.boundingBox())!
    expect(cajaCancelarVisible.y + cajaCancelarVisible.height).toBeLessThanOrEqual(cajaNav.y + 1)
  })

  test('la última tarjeta se puede ver entera por encima del resumen', async ({ page }) => {
    const cliente = await createClientFor(refs, unique('Movil ultima tarjeta'))
    const creadas = []
    for (let i = 0; i < 4; i += 1) {
      const numbers = randomTicketNumbers()
      creadas.push(
        await createAssignedTicket(refs, {
          dailyNumber: numbers.daily,
          weeklyNumber: numbers.weekly,
          clientId: cliente.id,
          salePrice: PRICE,
        }),
      )
    }

    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)

    const tarjetas = listaBoletas(page).getByRole('listitem')
    await expect(tarjetas).toHaveCount(4)

    const ultima = tarjetas.last()
    await ultima.scrollIntoViewIfNeeded()
    await expect(ultima).toBeVisible()

    const cajaTarjeta = (await ultima.boundingBox())!
    const cajaResumen = (await page.getByText(/^Repartido /).boundingBox())!
    expect(cajaTarjeta.y + cajaTarjeta.height).toBeLessThanOrEqual(cajaResumen.y + 8)
  })

  test('a 320 px no hay scroll horizontal y los valores caben', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    const cliente = await createClientFor(refs, unique('Movil 320 abono'))
    const numbers = randomTicketNumbers()
    await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)

    await expect(listaBoletas(page).getByText(`${numbers.daily} / ${numbers.weekly}`)).toBeVisible()
    expect(numbers.daily).toHaveLength(4)
    expect(numbers.weekly).toHaveLength(4)
    await expect(page.getByLabel('Valor del abono')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cambiar de cliente' })).toBeVisible()

    const fecha = (await page.getByLabel('Fecha').boundingBox())!
    const registrar = (await page.getByRole('button', { name: 'Registrar abono' }).boundingBox())!
    expect(fecha.y + fecha.height).toBeLessThanOrEqual(registrar.y + 1)

    expect(await desborde(page)).toBeLessThanOrEqual(2)
  })

  test('el preview muestra Pagada o el saldo que quedará, y se puede registrar', async ({
    page,
  }) => {
    const cliente = await createClientFor(refs, unique('Movil preview abono'))
    const first = randomTicketNumbers()
    const second = randomTicketNumbers()
    const ticketA = await createAssignedTicket(refs, {
      dailyNumber: first.daily,
      weeklyNumber: first.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })
    await createAssignedTicket(refs, {
      dailyNumber: second.daily,
      weeklyNumber: second.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)
    await page.getByLabel('Valor del abono').fill(String(PRICE + 40_000))

    const lista = listaBoletas(page)
    await expect(lista.getByText('Pagada')).toBeVisible()
    await expect(lista.getByText(`Quedará ${formatCOP(PRICE - 40_000)}`)).toBeVisible()

    await page.getByRole('button', { name: 'Registrar abono' }).click()
    await expectToast(page, /registrado/)

    expect((await ticketBalance(ticketA.id)).paidAmount).toBeGreaterThan(0)
  })
})
