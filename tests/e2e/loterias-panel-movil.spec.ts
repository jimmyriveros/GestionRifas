import { expect, test, type Locator } from '@playwright/test'

import { ACCOUNTS, loginAs, logout } from './fixtures'
import {
  addDays,
  card,
  deleteFixtures,
  insertResult,
  insertSchedule,
  resultCard,
  todayBogota,
  upcomingCard,
} from './lottery-fixtures'

/**
 * El recuadro de resultados oficiales en el telefono (Etapa 4, D-147; D-167).
 * La logica vive en loterias-panel.spec.ts; aqui se mira que quepa.
 */

async function overflow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

async function box(locator: Locator) {
  const caja = await locator.boundingBox()
  if (!caja) throw new Error('el elemento no tiene caja: no se esta pintando')
  return caja
}

test.describe('Resultados oficiales en el telefono', () => {
  test('el recuadro cabe a 320 px en los dos portales', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })

    await loginAs(page, ACCOUNTS.seller)
    await expect(card(page)).toBeVisible()
    expect(await overflow(page), 'desbordamiento en el panel del vendedor').toBeLessThanOrEqual(2)

    await logout(page)
    await loginAs(page, ACCOUNTS.owner)
    await expect(card(page)).toBeVisible()
    expect(await overflow(page), 'desbordamiento en el panel administrativo').toBeLessThanOrEqual(2)
  })
})

/**
 * Las dos tarjetas, con datos de verdad, en la pantalla mas estrecha (D-167).
 *
 * La prueba de arriba mide el recuadro VACIO, asi que no llega a tocar lo que
 * el rediseno introdujo: dos tarjetas, un numero de cuatro cifras grande, la
 * hora y la insignia de estado. Aqui se siembran las dos.
 *
 * EL SORTEO QUE VIENE ES EL DE MANANA, no el de hoy, y es a proposito: una
 * programacion de hoy deja de tener hora futura en cuanto pasa su instante
 * oficial —y entonces la tarjeta dice «Resultado pendiente», que es lo
 * correcto—, de modo que la hora solo se puede comprobar sin depender del reloj
 * usando un dia posterior. El caso «Hoy» lo cubre la suite de escritorio.
 */
test.describe('Las dos tarjetas del recuadro a 320 px', () => {
  test.afterEach(async () => {
    await deleteFixtures()
  })

  test('se apilan en una columna, con el numero mayor entero y sin desbordar', async ({ page }) => {
    const today = todayBogota()
    const yesterday = addDays(today, -1)
    const tomorrow = addDays(today, 1)

    const ayer = await insertSchedule({
      lottery: 'meta',
      draw: `${yesterday}-mov`,
      referenceDate: yesterday,
      officialAt: `${yesterday}T22:50:00-05:00`,
      status: 'completed',
    })
    await insertResult(ayer, '1719', '045')

    await insertSchedule({
      lottery: 'cundinamarca',
      draw: `${tomorrow}-mov`,
      referenceDate: tomorrow,
      officialAt: `${tomorrow}T23:20:00-05:00`,
    })

    await page.setViewportSize({ width: 320, height: 720 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const recuadro = card(page)
    await expect(recuadro).toBeVisible()

    // Sin sorteo hoy, el recuadro lo dice y ensena el que viene.
    await expect(recuadro.getByText('Hoy no hay sorteo programado.')).toBeVisible()

    const proximo = upcomingCard(page)
    const ultimo = resultCard(page)
    await expect(proximo).toContainText('Mañana')
    await expect(proximo).toContainText('Cundinamarca')
    await expect(proximo).toContainText('Juega mañana a las')
    await expect(ultimo).toContainText('Ayer')
    await expect(ultimo).toContainText('Meta')
    await expect(recuadro.getByLabel('Número mayor 1719')).toBeVisible()

    // UNA columna: misma izquierda, y la del resultado empieza por debajo de
    // donde termina la otra. En dos columnas compartirian fila.
    const cajaProximo = await box(proximo)
    const cajaUltimo = await box(ultimo)
    expect(cajaUltimo.x, 'las dos tarjetas arrancan en la misma izquierda').toBeCloseTo(
      cajaProximo.x,
      0,
    )
    expect(cajaUltimo.y, 'la tarjeta del resultado va DEBAJO, no al lado').toBeGreaterThanOrEqual(
      cajaProximo.y + cajaProximo.height,
    )

    // Nada se sale: ni la pagina, ni el numero de cuatro cifras dentro de su
    // tarjeta, ni la insignia de estado, que es lo que a 320 px apretaba mas.
    expect(await overflow(page), 'la pagina no puede desbordar').toBeLessThanOrEqual(2)
    const cajaNumero = await box(recuadro.getByLabel('Número mayor 1719'))
    expect(cajaNumero.x, 'el numero mayor empieza dentro de su tarjeta').toBeGreaterThanOrEqual(
      cajaUltimo.x,
    )
    expect(cajaNumero.x + cajaNumero.width, 'y termina dentro de ella').toBeLessThanOrEqual(
      cajaUltimo.x + cajaUltimo.width,
    )
    for (const tarjeta of [proximo, ultimo]) {
      const caja = await box(tarjeta)
      expect(caja.width, 'la tarjeta cabe en la pantalla').toBeLessThanOrEqual(320)
    }
  })
})
