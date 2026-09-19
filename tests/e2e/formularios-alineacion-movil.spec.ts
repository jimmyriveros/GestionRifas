import { expect, test, type Locator } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  raffleTicketPrice,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * La misma alineación, en el teléfono: debajo de `sm` las filas se apilan;
 * desde 360 px el abono pone Fecha y Método en dos columnas; nada se recorta.
 */

let refs: SeedRefs
let PRICE: number

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

type Box = {
  top: number
  bottom: number
  left: number
  right: number
  height: number
}

async function finishedOpening(dialog: Locator) {
  await expect(dialog).toBeVisible()
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))),
  )
}

async function boxOf(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      height: Number.parseFloat(getComputedStyle(el).height),
    }
  })
}

test.describe('Recordatorios y abonos en el teléfono', () => {
  test('a 390 px Día y Hora se apilan, sin recortes, y el interruptor sigue en horizontal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Crear recordatorio' }).click()
    const dialog = page.getByRole('dialog')
    await finishedOpening(dialog)

    const dia = dialog.getByLabel('Día')
    const hora = dialog.getByLabel('Hora')
    const d = await boxOf(dia)
    const h = await boxOf(hora)
    expect(h.top, 'Hora queda debajo de Día, no al lado').toBeGreaterThan(d.bottom - 1)
    expect(d.height, 'Día conserva el suelo táctil').toBeGreaterThanOrEqual(44)
    expect(h.height, 'Hora conserva el suelo táctil').toBeGreaterThanOrEqual(44)

    const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow, 'el diálogo no se desplaza de lado').toBeLessThanOrEqual(0)

    const etiqueta = dialog.getByText('Usar mi propio mensaje')
    const interruptor = dialog.getByRole('switch')
    const e = await boxOf(etiqueta)
    const i = await boxOf(interruptor)
    expect(i.left, 'el interruptor sigue a la derecha').toBeGreaterThan(e.right)
  })

  test('a 320 px el diálogo de recordatorio no se desborda', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Crear recordatorio' }).click()
    const dialog = page.getByRole('dialog')
    await finishedOpening(dialog)
    const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    expect(
      await dialog
        .getByLabel('Hora')
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).height)),
    ).toBeGreaterThanOrEqual(44)
  })

  test('desde 360 px, Fecha y Método del abono alinean', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    const cliente = await createClientFor(refs, unique('Cliente alineación móvil'))
    const numbers = randomTicketNumbers()
    await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)
    const fecha = page.getByLabel('Fecha')
    const metodo = page.getByLabel('Método')
    await expect(fecha).toBeVisible()
    const f = await boxOf(fecha)
    const m = await boxOf(metodo)
    expect(Math.abs(f.top - m.top), 'Fecha y Método comparten el top').toBeLessThanOrEqual(1)
    expect(f.height, 'Fecha conserva el suelo táctil').toBeGreaterThanOrEqual(44)
    expect(m.height, 'Método conserva el suelo táctil').toBeGreaterThanOrEqual(44)
  })
})
