import { expect, test } from '@playwright/test'

import { ALLOWED_SOURCE_HOSTS } from '../../src/features/lottery/sources'
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
 * Recuadro de resultados oficiales en el Panel (Etapa 4, D-147).
 *
 * El acto que se prueba es la PINTURA: el recuadro lee tablas locales. Las
 * coincidencias y el matching ya los cubren tests/db. Aqui no se crean
 * fotografias: no se pueden borrar (trigger inmutable).
 *
 * Las filas de prueba y los localizadores viven en `lottery-fixtures.ts`, que
 * comparte con la suite del telefono (D-167).
 */

function officialHostsOf(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (ALLOWED_SOURCE_HOSTS as readonly string[]).includes(host)
  } catch {
    return false
  }
}

test.describe('Resultados oficiales en el Panel', () => {
  test.afterEach(async () => {
    await deleteFixtures()
  })

  test('el recuadro aparece en los dos portales y no consulta webs oficiales', async ({ page }) => {
    const hits: string[] = []
    page.on('request', (request) => {
      if (officialHostsOf(request.url())) hits.push(request.url())
    })

    await loginAs(page, ACCOUNTS.owner)
    await expect(
      card(page).getByRole('heading', { name: 'Resultados y próxima lotería' }),
    ).toBeVisible()

    await logout(page)
    await loginAs(page, ACCOUNTS.seller)
    await expect(
      card(page).getByRole('heading', { name: 'Resultados y próxima lotería' }),
    ).toBeVisible()
    expect(hits, 'el Panel no debe consultar fuentes oficiales').toEqual([])
  })

  test('un resultado confirmado muestra el numero mayor con ceros y la serie', async ({ page }) => {
    const today = todayBogota()
    const scheduleId = await insertSchedule({
      lottery: 'meta',
      draw: `${today}-m`,
      referenceDate: today,
      officialAt: `${today}T22:50:00-05:00`,
      status: 'completed',
    })
    await insertResult(scheduleId, '0046', '045')

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    const recuadro = card(page)
    await expect(recuadro.getByRole('heading', { name: 'Meta' })).toBeVisible()
    await expect(recuadro.getByLabel('Número mayor 0046')).toBeVisible()
    await expect(recuadro.getByText('Serie informativa 045')).toBeVisible()
    await expect(recuadro.getByRole('link', { name: 'Fuente oficial' })).toBeVisible()
    // El sorteo de hoy YA esta confirmado: se pinta como resultado y no hay
    // una segunda tarjeta repitiendolo como «ultimo resultado» (D-147, D-167).
    await expect(resultCard(page)).toHaveCount(1)
    await expect(upcomingCard(page)).toHaveCount(0)
    await expect(resultCard(page)).toContainText('Hoy')
  })

  test('un sorteo de hoy sin confirmar no se pinta como si ya hubiera resultado', async ({
    page,
  }) => {
    const today = todayBogota()
    const previous = addDays(today, -3)
    await insertSchedule({
      lottery: 'boyaca',
      draw: `${previous}-b`,
      referenceDate: previous,
      officialAt: `${previous}T22:50:00-05:00`,
      status: 'completed',
    }).then(async (id) => insertResult(id, '0046'))

    await insertSchedule({
      lottery: 'meta',
      draw: `${today}-m`,
      referenceDate: today,
      officialAt: `${today}T01:00:00-05:00`,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const recuadro = card(page)
    await expect(recuadro.getByRole('heading', { name: 'Meta' })).toBeVisible()
    await expect(recuadro.getByText('Resultado pendiente')).toBeVisible()
    // Meta va en la tarjeta de lo que viene; Boyaca, en la del resultado.
    await expect(upcomingCard(page)).toContainText('Meta')
    const resultado = resultCard(page)
    await expect(resultado).toBeVisible()
    await expect(resultado).toContainText('Boyacá')
    await expect(recuadro.getByLabel('Número mayor 0046')).toBeVisible()
    await expect(recuadro.getByRole('heading', { name: 'Boyacá' })).toBeVisible()
  })
})

/**
 * El recuadro no bloquea el Panel (Etapa 4/6, D-155).
 *
 * Lo que se comprueba aqui es la FORMA de la respuesta: el hueco de espera
 * viaja en el armazon —el primer HTML que sale del servidor— y el recuadro
 * resuelto llega despues, por el mismo flujo. Los tiempos, con la consulta
 * local retrasada a proposito, estan medidos en `docs/TEST_RESULTS.md`; aqui
 * basta con que el limite exista y funcione contra la aplicacion de verdad.
 */
test.describe('El Panel no espera por las loterias', () => {
  test.afterEach(async () => {
    await deleteFixtures()
  })

  for (const portal of [
    { rol: 'dueño', cuenta: ACCOUNTS.owner, ruta: '/owner/dashboard' },
    { rol: 'vendedor', cuenta: ACCOUNTS.seller, ruta: '/seller/dashboard' },
  ]) {
    test(`el hueco del recuadro sale antes que el recuadro (${portal.rol})`, async ({ page }) => {
      await loginAs(page, portal.cuenta)

      const respuesta = await page.request.get(portal.ruta)
      expect(respuesta.status()).toBe(200)
      const html = await respuesta.text()

      const hueco = html.indexOf('lottery-results-loading')
      const recuadro = html.indexOf('data-slot="lottery-results"')
      expect(hueco, 'el hueco de espera tiene que estar en la respuesta').toBeGreaterThan(-1)
      expect(recuadro, 'y el recuadro resuelto tambien').toBeGreaterThan(-1)
      expect(hueco, 'el hueco va PRIMERO: el recuadro llega despues').toBeLessThan(recuadro)
      expect(html).toContain('Buscando los resultados oficiales')

      // Y el contenido principal de la pantalla va en el armazon, antes del
      // recuadro: es justo lo que dejo de esperar.
      const principal = html.indexOf(
        portal.rol === 'dueño' ? 'Resumen por vendedor' : 'Accesos rápidos',
      )
      expect(principal, 'faltaba el contenido principal').toBeGreaterThan(-1)
      expect(principal, 'el contenido principal no espera al recuadro').toBeLessThan(recuadro)
    })
  }

  test('sin programaciones en la ventana, el recuadro lo dice y el Panel sigue entero', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    await expect(card(page).getByText('Todavía no hay resultados oficiales')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Resumen por vendedor' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible()
  })

  test('un resultado en conflicto muestra el numero y avisa de que hay que verificarlo', async ({
    page,
  }) => {
    const today = todayBogota()
    const scheduleId = await insertSchedule({
      lottery: 'cruz_roja',
      draw: `${today}-c`,
      referenceDate: today,
      officialAt: `${today}T01:00:00-05:00`,
      status: 'completed',
    })
    await insertResult(scheduleId, '0046', '045', 'conflict')

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const recuadro = card(page)
    await expect(recuadro.getByLabel('Número mayor 0046')).toBeVisible()
    await expect(
      recuadro.getByText('La fuente oficial publicó otro número. Requiere verificación.'),
    ).toBeVisible()
  })

  test('una fuente que aun no publica: hay fila de resultado, pero ningun numero', async ({
    page,
  }) => {
    const today = todayBogota()
    const scheduleId = await insertSchedule({
      lottery: 'medellin',
      draw: `${today}-me`,
      referenceDate: today,
      officialAt: `${today}T01:00:00-05:00`,
      status: 'completed',
    })
    await insertResult(scheduleId, null, null, 'pending')

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    const recuadro = card(page)
    await expect(recuadro.getByRole('heading', { name: 'Medellín' })).toBeVisible()
    await expect(recuadro.getByText('Resultado pendiente')).toBeVisible()
    await expect(recuadro.getByText('Número mayor')).toHaveCount(0)
  })

  test('un resultado que llega tarde no se presenta como el de hoy', async ({ page }) => {
    const today = todayBogota()
    const previous = addDays(today, -1)

    const ayer = await insertSchedule({
      lottery: 'boyaca',
      draw: `${previous}-b`,
      referenceDate: previous,
      officialAt: `${previous}T22:50:00-05:00`,
      status: 'completed',
    })
    await insertResult(ayer, '1234', null, 'confirmed')

    await insertSchedule({
      lottery: 'meta',
      draw: `${today}-m`,
      referenceDate: today,
      officialAt: `${today}T01:00:00-05:00`,
      status: 'completed',
    })

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    const recuadro = card(page)
    // Hoy: Meta, sin numero, en la tarjeta de lo que viene.
    const proximo = upcomingCard(page)
    await expect(recuadro.getByRole('heading', { name: 'Meta' })).toBeVisible()
    await expect(recuadro.getByText('Resultado pendiente')).toBeVisible()
    await expect(proximo).toContainText('Hoy')
    // Ayer: Boyaca, en su propia tarjeta y rotulada como de ayer.
    const ultimo = resultCard(page)
    await expect(ultimo).toBeVisible()
    await expect(ultimo).toContainText('Ayer')
    await expect(recuadro.getByLabel('Número mayor 1234')).toBeVisible()
    await expect(recuadro.getByRole('heading', { name: 'Boyacá' })).toBeVisible()
  })
})
