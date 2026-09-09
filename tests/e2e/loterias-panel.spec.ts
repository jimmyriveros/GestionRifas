import { expect, test } from '@playwright/test'

import { ALLOWED_SOURCE_HOSTS } from '../../src/features/lottery/sources'
import { ACCOUNTS, loginAs, logout } from './fixtures'
import {
  abrirDetalle,
  addDays,
  card,
  compactResultRow,
  compactUpcomingRow,
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

  /**
   * Un recuadro, DOS formas (D-180): el portal administrativo conserva el
   * completo —«Resultados y próxima lotería», con sus dos tarjetas grandes— y
   * el vendedor ve el compacto, «Loterías», con dos filas y el resto detrás de
   * «Ver detalle». Los datos y la consulta son los mismos, y por eso lo que se
   * comprueba junto es lo que no puede cambiar: que ninguno de los dos salga a
   * internet.
   */
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
    await expect(card(page).getByRole('heading', { name: 'Loterías' })).toBeVisible()
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

    // En la forma compacta el reparto se lee en las DOS filas, sin abrir nada:
    // Meta es lo que viene y todavía no tiene número; Boyacá, el último
    // resultado (D-180).
    await expect(compactUpcomingRow(page)).toContainText('Meta')
    await expect(compactResultRow(page)).toContainText('Boyacá')
    await expect(compactResultRow(page)).toContainText('0046')
    await expect(compactResultRow(page)).toContainText('Fuente oficial')
    // Y el sorteo de hoy no aparece como si ya hubiera salido su número.
    await expect(compactUpcomingRow(page)).not.toContainText('0046')

    // El reparto completo es el mismo que ve el portal administrativo, y sigue
    // ahí: una acción, no una pérdida.
    await abrirDetalle(page)
    const recuadro = card(page)
    await expect(recuadro.getByRole('heading', { name: 'Meta' })).toBeVisible()
    await expect(recuadro.getByText('Resultado pendiente')).toBeVisible()
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
    // El aviso del conflicto se ve SIN abrir el detalle: la fila de al lado
    // acaba de escribir ese número como si fuera el resultado (D-180). El
    // segundo, `.first()` lo descarta, es el del detalle plegado —el recuadro
    // completo lo pinta junto a su sorteo— y ahí también corresponde.
    await expect(compactResultRow(page)).toContainText('0046')
    await expect(
      recuadro.getByText('La fuente oficial publicó otro número. Requiere verificación.').first(),
    ).toBeVisible()

    await abrirDetalle(page)
    await expect(recuadro.getByLabel('Número mayor 0046')).toBeVisible()
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

/**
 * La forma COMPACTA, que es la unica que ve un vendedor (D-180).
 *
 * DOS FILAS Y UNA ACCION. Lo que se comprueba aqui es la promesa entera: que
 * las dos filas dicen lo que tienen que decir sin abrir nada, que la
 * procedencia del numero sigue estando —es obligatoria (BR-L26)— y que lo que
 * se movio al detalle **no se perdio**, sino que esta a un toque y se anuncia
 * con un nombre que se entiende fuera de contexto.
 */
test.describe('El recuadro compacto del vendedor', () => {
  test.afterEach(async () => {
    await deleteFixtures()
  })

  test('dice la próxima lotería y el último resultado en dos filas', async ({ page }) => {
    const today = todayBogota()
    const yesterday = addDays(today, -1)
    const tomorrow = addDays(today, 1)

    const ayer = await insertSchedule({
      lottery: 'meta',
      draw: `${yesterday}-comp`,
      referenceDate: yesterday,
      officialAt: `${yesterday}T22:50:00-05:00`,
      status: 'completed',
    })
    await insertResult(ayer, '1719', '045')

    await insertSchedule({
      lottery: 'bogota',
      draw: `${tomorrow}-comp`,
      referenceDate: tomorrow,
      officialAt: `${tomorrow}T22:30:00-05:00`,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const recuadro = card(page)
    await expect(recuadro.getByRole('heading', { name: 'Loterías' })).toBeVisible()

    // Fila 1: rótulo, lotería, día y hora, en una línea.
    const proxima = compactUpcomingRow(page)
    await expect(proxima).toContainText('Próxima')
    await expect(proxima).toContainText('Bogotá')
    await expect(proxima).toContainText('mañana')
    await expect(proxima).toContainText('10:30 p. m.')

    // Fila 2: rótulo, lotería, número mayor, coincidencias y procedencia.
    const ultimo = compactResultRow(page)
    await expect(ultimo).toContainText('Último resultado')
    await expect(ultimo).toContainText('Meta')
    await expect(ultimo).toContainText('1719')
    await expect(ultimo).toContainText('Sin coincidencias')
    await expect(ultimo).toContainText('Fuente oficial')

    // El número lleva su término escrito para quien escucha la pantalla: nunca
    // «ganador», que es la palabra prohibida (BR-L15, D-167).
    await expect(ultimo).toContainText('Número mayor')
    await expect(recuadro).not.toContainText(/ganador/i)

    // Y de entrada NO se pinta el detalle: la tarjeta es compacta.
    await expect(upcomingCard(page)).toBeHidden()
    await expect(resultCard(page)).toBeHidden()
  })

  test('«Ver detalle» abre lo mismo que ve el portal administrativo', async ({ page }) => {
    const today = todayBogota()
    const yesterday = addDays(today, -1)

    const ayer = await insertSchedule({
      lottery: 'meta',
      draw: `${yesterday}-det`,
      referenceDate: yesterday,
      officialAt: `${yesterday}T22:50:00-05:00`,
      status: 'completed',
    })
    await insertResult(ayer, '1719', '045')

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const recuadro = card(page)
    const boton = recuadro.locator('[data-slot="lottery-detail"] > summary')

    // Se alcanza y se activa con el TECLADO, y su nombre accesible dice de qué
    // detalle habla: en esta misma pantalla hay un «Ver detalle de cobranza».
    await expect(boton).toHaveAccessibleName(/Ver detalle de las loterías/)
    await boton.focus()
    await expect(boton).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(recuadro.getByLabel('Número mayor 1719')).toBeVisible()
    await expect(recuadro.getByText('Serie informativa 045')).toBeVisible()
    await expect(
      recuadro.getByText('Ninguna de tus boletas coincidió con este número.'),
    ).toBeVisible()
    await expect(recuadro.getByText('Actualizado automáticamente cada día')).toBeVisible()

    // Y el botón dice ahora lo contrario, sin decir las dos cosas a la vez.
    await expect(boton).toHaveAccessibleName(/Ocultar detalle de las loterías/)
  })
})
