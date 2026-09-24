import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { WEEKLY_RESULTS_COPY, weeklyResultsMessage } from '../../src/features/weekly-results/copy'
import { weeklyResultsImageUrl } from '../../src/features/weekly-results/share'
import { formatWeekLong, weeklyResultsFileName } from '../../src/features/weekly-results/week'
import { clipboardWrites, shareCalls, stubShareAndClipboard } from './catalogo-helpers'
import { loadSeedRefs, type SeedRefs } from './db-setup'
import { ACCOUNTS, expectToast, loginAs, toggleCheckbox } from './fixtures'
import {
  campoMensaje,
  configurarGrupo,
  configurarMensaje,
  configurarRifaDelCatalogo,
  contarPeticionesDeImagen,
  desmontar,
  esperarImagen,
  fila,
  GRUPO,
  interruptorMensaje,
  leerMensaje,
  medidasPng,
  montarSemana,
  resumen,
  semanaDelResumen,
  vistaPrevia,
  vistaPreviaMensaje,
} from './resultados-semana-helpers'

/**
 * «Resultados de la semana» en el navegador (BR-H01..BR-H09, D-194, D-197).
 *
 * Lo que se prueba aquí es lo que solo se ve con un navegador y un servidor de
 * verdad: que la ruta del PNG existe y se protege, que la vista previa es la
 * imagen que se descarga —byte a byte—, qué se le pide a `navigator.share` y al
 * portapapeles, que ningún estado ofrece algo que no está listo y que el mensaje
 * propio se guarda, se recupera y es el que se copia y se comparte.
 *
 * Qué NO se prueba aquí, y dónde está: el cálculo de la semana, el estado con
 * resultados en conflicto o inválidos, el estado de error de las LECTURAS y los
 * fallos al guardar el mensaje (`tests/unit/weekly-results*.test.ts*`), y la RLS,
 * la RPC y la auditoría (`tests/db/weekly-results*.test.ts`). Aquí el error que se
 * provoca es el de la imagen, que es el que el navegador puede ver.
 */

const COPY = WEEKLY_RESULTS_COPY.share
const PREDETERMINADO = { usarPropio: false, texto: null }

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  await desmontar(refs)
})

test.describe('la tarjeta en Configuración', () => {
  test('lleva a «Resultados de la semana» y NO pide la imagen', async ({ page }) => {
    await montarSemana()
    await configurarRifaDelCatalogo(refs, refs.raffleId)
    const peticiones = contarPeticionesDeImagen(page)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings')

    const tarjeta = page.getByRole('link', { name: /Resultados de la semana/ })
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta).toContainText('Imagen y mensaje para compartir')
    // El resumen no genera nada: la imagen se pide al entrar en su sección.
    expect(peticiones()).toBe(0)

    await tarjeta.click()
    // Plazo largo a propósito: si esta es la primera prueba con `.next/dev` frío,
    // la navegación espera a que `next dev` compile la ruta nueva (I-075).
    await expect(page).toHaveURL(/\/seller\/settings\/weekly-results$/, { timeout: 90_000 })
    await expect(
      page.getByRole('heading', { level: 1, name: 'Resultados de la semana' }),
    ).toBeVisible()
  })
})

test.describe('con la semana completa', () => {
  test.setTimeout(150_000)

  test.beforeEach(async () => {
    await montarSemana()
    await configurarRifaDelCatalogo(refs, refs.raffleId)
    await configurarGrupo(refs, null)
    await configurarMensaje(refs, PREDETERMINADO)
  })

  test('enseña los seis números con sus ceros, la imagen 4:5 y el mensaje de la semana', async ({
    page,
  }) => {
    const week = await montarSemana()
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')

    await expect(resumen(page)).toContainText('6 de 6 resultados')
    await expect(resumen(page)).toContainText('Rifa de tu catálogo: Rifa Navidad 2026')
    await expect(fila(page, 'meta')).toContainText('0046')
    await expect(fila(page, 'boyaca')).toContainText('0007')

    await esperarImagen(page)
    const imagen = vistaPrevia(page).locator('img')
    await expect(imagen).toHaveAttribute(
      'alt',
      WEEKLY_RESULTS_COPY.week.imageAlt(formatWeekLong(week)),
    )
    const natural = await imagen.evaluate((img: HTMLImageElement) => ({
      width: img.naturalWidth,
      height: img.naturalHeight,
    }))
    expect(natural).toEqual({ width: 1080, height: 1350 })

    const caja = await vistaPrevia(page).boundingBox()
    expect(caja).not.toBeNull()
    expect(caja!.width / caja!.height).toBeCloseTo(0.8, 2)

    const mensaje = page.locator('[data-slot="weekly-results-message"]')
    await expect(mensaje).toContainText(formatWeekLong(week))
    await expect(mensaje).toContainText('Revisa tu boleta en la imagen')
  })

  test('la ruta entrega un PNG privado de 1080 × 1350', async ({ page }) => {
    const week = await montarSemana()
    await loginAs(page, ACCOUNTS.seller)

    const respuesta = await page.request.get(weeklyResultsImageUrl(week))
    expect(respuesta.status()).toBe(200)
    expect(respuesta.headers()['content-type']).toBe('image/png')
    expect(respuesta.headers()['cache-control']).toContain('private')
    expect(respuesta.headers()['cache-control']).toContain('no-store')
    expect(medidasPng(await respuesta.body())).toEqual({ width: 1080, height: 1350 })
  })

  test('sale aunque el optimizador de imágenes haya trabajado antes en el mismo servidor (I-163)', async ({
    page,
  }) => {
    // El optimizador, al cargar `sharp`, le quita al proceso el cargador SVG
    // que usa `next/og` (D-223). Con la caché de imágenes vacía esta petición
    // lo carga seguro; si responde de caché (`HIT`) puede que no, y se anota.
    const optimizada = await page.request.get(
      '/_next/image?url=%2Fimages%2Fcatalog%2Fcatalog-hero-desktop-sportage-hev-2026.webp&w=1920&q=75',
    )
    expect(optimizada.status()).toBe(200)
    const cache = optimizada.headers()['x-nextjs-cache'] ?? 'sin cabecera'
    if (cache === 'HIT') {
      test.info().annotations.push({
        type: 'I-163',
        description: 'El optimizador respondió de caché: puede que no haya cargado sharp en esta pasada.',
      })
    }

    const week = await montarSemana()
    await loginAs(page, ACCOUNTS.seller)
    const respuesta = await page.request.get(weeklyResultsImageUrl(week))
    expect(respuesta.status()).toBe(200)
    expect(respuesta.headers()['content-type']).toBe('image/png')
    expect(medidasPng(await respuesta.body())).toEqual({ width: 1080, height: 1350 })
  })

  test('descargar entrega EXACTAMENTE la imagen de la vista previa', async ({ page }) => {
    const week = await montarSemana()
    await loginAs(page, ACCOUNTS.seller)

    // La vista previa hace la ÚNICA petición del PNG, así que su cuerpo es la
    // imagen que se ve. No se relee desde la página: la CSP no deja hacer
    // `fetch` a una dirección `blob:` (`connect-src`), y no debe dejarlo.
    const respuestaImagen = page.waitForResponse(
      (response) =>
        response.url().includes('/api/weekly-results/image') && response.status() === 200,
    )
    await page.goto('/seller/settings/weekly-results')
    const cuerpoVistaPrevia = await (await respuestaImagen).body()
    await esperarImagen(page)

    const descarga = page.waitForEvent('download')
    await page.getByRole('button', { name: COPY.downloadImage }).click()
    const archivo = await descarga

    expect(archivo.suggestedFilename()).toBe(weeklyResultsFileName(week))
    const bytes = readFileSync((await archivo.path())!)
    expect(medidasPng(bytes)).toEqual({ width: 1080, height: 1350 })
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      createHash('sha256').update(cuerpoVistaPrevia).digest('hex'),
    )
  })

  test('compartir manda la imagen como archivo, con título y mensaje', async ({ page }) => {
    const week = await montarSemana()
    await stubShareAndClipboard(page, { share: 'ok' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    await page.getByRole('button', { name: COPY.shareImage }).click()
    await expect.poll(async () => (await shareCalls(page)).length).toBe(1)

    const [llamada] = await shareCalls(page)
    expect(llamada?.title).toBe(COPY.shareTitle)
    expect(llamada?.text).toBe(weeklyResultsMessage(week))
    expect(llamada?.files).toHaveLength(1)
    expect(llamada?.files?.[0]).toMatchObject({
      name: weeklyResultsFileName(week),
      type: 'image/png',
    })
    expect(llamada?.files?.[0]?.size).toBeGreaterThan(0)
  })

  test('cancelar el menú del teléfono no es un error', async ({ page }) => {
    await stubShareAndClipboard(page, { share: 'cancelled' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    await page.getByRole('button', { name: COPY.shareImage }).click()
    await expect.poll(async () => (await shareCalls(page)).length).toBe(1)
    // Ni aviso de error ni nada copiado que nadie pidió.
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: COPY.shareFailed }),
    ).toHaveCount(0)
    expect(await clipboardWrites(page)).toEqual([])
  })

  test('sin `navigator.share` no se ofrece compartir, y se propone descargar', async ({ page }) => {
    await stubShareAndClipboard(page, { share: 'unsupported' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    await expect(page.getByRole('button', { name: COPY.shareImage })).toHaveCount(0)
    await expect(page.getByText(COPY.shareUnavailable)).toBeVisible()
    await expect(page.getByRole('button', { name: COPY.downloadImage })).toBeEnabled()
  })

  test('un navegador que no acepta archivos tampoco ofrece compartir', async ({ page }) => {
    await stubShareAndClipboard(page, { share: 'ok', files: 'rejected' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    await expect(page.getByRole('button', { name: COPY.shareImage })).toHaveCount(0)
    await expect(page.getByText(COPY.shareUnavailable)).toBeVisible()
  })

  test('copiar mensaje pone en el portapapeles SOLO el mensaje', async ({ page }) => {
    const week = await montarSemana()
    await stubShareAndClipboard(page, { share: 'unsupported', clipboard: 'ok' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')

    await page.getByRole('button', { name: COPY.copyMessage }).click()
    await expectToast(page, 'Mensaje copiado')
    expect(await clipboardWrites(page)).toEqual([weeklyResultsMessage(week)])
  })

  test('si el portapapeles falla, lo dice en vez de darlo por copiado', async ({ page }) => {
    await stubShareAndClipboard(page, { share: 'unsupported', clipboard: 'failed' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')

    await page.getByRole('button', { name: COPY.copyMessage }).click()
    await expectToast(page, COPY.copyFailed)
  })

  test('si la imagen falla, lo dice y se puede reintentar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.route('**/api/weekly-results/image**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }),
    )
    await page.goto('/seller/settings/weekly-results')

    await expect(vistaPrevia(page)).toHaveAttribute('data-state', 'failed', { timeout: 60_000 })
    await expect(vistaPrevia(page)).toContainText(COPY.previewFailed)
    await expect(page.getByRole('button', { name: COPY.downloadImage })).toBeDisabled()

    await page.unroute('**/api/weekly-results/image**')
    await vistaPrevia(page).getByRole('button', { name: COPY.retry }).click()
    await esperarImagen(page)
  })

  test('sin grupo se ofrece configurarlo, y lo demás sigue disponible', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')

    await expect(page.getByText(COPY.noGroup)).toBeVisible()
    await expect(page.getByRole('link', { name: COPY.configureGroup })).toHaveAttribute(
      'href',
      '/seller/settings/whatsapp',
    )
    await expect(page.getByRole('link', { name: COPY.openGroup })).toHaveCount(0)
    await esperarImagen(page)
    await expect(page.getByRole('button', { name: COPY.downloadImage })).toBeEnabled()
    await expect(page.getByRole('button', { name: COPY.copyMessage })).toBeEnabled()
  })

  test('con grupo, «Abrir mi grupo» abre su enlace en otra pestaña y sin `opener`', async ({
    page,
  }) => {
    await configurarGrupo(refs, GRUPO)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')

    const enlace = page.getByRole('link', { name: COPY.openGroup })
    await expect(enlace).toHaveAttribute('href', GRUPO)
    await expect(enlace).toHaveAttribute('target', '_blank')
    await expect(enlace).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('el teclado recorre las acciones en el orden en que se leen', async ({ page }) => {
    await stubShareAndClipboard(page, { share: 'ok' })
    await configurarGrupo(refs, GRUPO)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    // Desde D-197 el mensaje se edita entre la imagen y «Copiar mensaje»: el
    // interruptor, el área (de solo lectura, pero se lee) y «Guardar cambios».
    await page.getByRole('button', { name: COPY.shareImage }).focus()
    for (const siguiente of [
      page.getByRole('button', { name: COPY.downloadImage }),
      interruptorMensaje(page),
      campoMensaje(page),
      page.getByRole('button', { name: COPY.messageSave }),
      page.getByRole('button', { name: COPY.copyMessage }),
      page.getByRole('link', { name: COPY.openGroup }),
    ]) {
      await page.keyboard.press('Tab')
      await expect(siguiente).toBeFocused()
    }
  })

  test('ningún texto dice que algo se envió', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    const seccion = page.locator('[data-slot="weekly-results-share"]')
    await expect(seccion.getByText('Rifas no los envía por ti', { exact: false })).toBeVisible()
    for (const prohibido of ['Mensaje enviado', 'Enviado', 'Entregado', 'Se envió', 'ganador']) {
      await expect(page.getByText(prohibido, { exact: false })).toHaveCount(0)
    }
  })
})

test.describe('el mensaje propio (BR-H09, D-197)', () => {
  test.setTimeout(150_000)

  const PROPIO =
    '¡Hola, grupo! 🍀\n\nYa salieron los números de la semana.\nRevisen su boleta en la imagen.'

  test.beforeEach(async () => {
    await montarSemana()
    await configurarRifaDelCatalogo(refs, refs.raffleId)
    await configurarGrupo(refs, null)
    await configurarMensaje(refs, PREDETERMINADO)
  })

  test('arranca con el predeterminado de la semana, en modo lectura', async ({ page }) => {
    const week = semanaDelResumen()
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    await expect(interruptorMensaje(page)).not.toBeChecked()
    await expect(campoMensaje(page)).toHaveAttribute('readonly', '')
    await expect(campoMensaje(page)).toHaveValue(weeklyResultsMessage(week))
    await expect(page.getByText(COPY.messageDefaultHint)).toBeVisible()
    await expect(page.getByText(COPY.messagePreview)).toBeVisible()
    await expect.poll(() => vistaPreviaMensaje(page).textContent()).toBe(weeklyResultsMessage(week))
    await expect(page.getByRole('button', { name: COPY.messageRestore })).toHaveCount(0)
  })

  test('encender, escribir con la vista previa en vivo, guardar y encontrarlo al recargar', async ({
    page,
  }) => {
    const week = semanaDelResumen()
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    await toggleCheckbox(interruptorMensaje(page), true)
    await expect(campoMensaje(page)).not.toHaveAttribute('readonly', '')
    // Arranca con una copia del predeterminado: retocar es más fácil que empezar en blanco.
    await expect(campoMensaje(page)).toHaveValue(weeklyResultsMessage(week))
    await expect(page.getByText(COPY.messageCustomHint)).toBeVisible()

    await campoMensaje(page).fill(PROPIO)
    // La vista previa cambia mientras se escribe, antes de guardar nada.
    await expect.poll(() => vistaPreviaMensaje(page).textContent()).toBe(PROPIO)
    expect(await leerMensaje(refs)).toEqual(PREDETERMINADO)

    await page.getByRole('button', { name: COPY.messageSave }).click()
    await expectToast(page, COPY.messageSaved)
    expect(await leerMensaje(refs)).toEqual({ usarPropio: true, texto: PROPIO })

    await page.reload()
    await expect(interruptorMensaje(page)).toBeChecked()
    await expect(campoMensaje(page)).toHaveValue(PROPIO)
    await expect.poll(() => vistaPreviaMensaje(page).textContent()).toBe(PROPIO)
  })

  test('copiar y compartir usan el mensaje propio en cuanto se guarda, sin volver a pedir la imagen', async ({
    page,
  }) => {
    await stubShareAndClipboard(page, { share: 'ok', clipboard: 'ok' })
    const peticiones = contarPeticionesDeImagen(page)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)
    // No se compara con 1: en `next dev` el modo estricto de React monta el efecto
    // dos veces y la primera petición sale abortada (`reactStrictMode`). Lo que
    // importa es que guardar el mensaje no añada ninguna.
    const antesDeGuardar = peticiones()

    await toggleCheckbox(interruptorMensaje(page), true)
    await campoMensaje(page).fill(PROPIO)
    await page.getByRole('button', { name: COPY.messageSave }).click()
    await expectToast(page, COPY.messageSaved)

    await page.getByRole('button', { name: COPY.copyMessage }).click()
    await expectToast(page, 'Mensaje copiado')
    expect(await clipboardWrites(page)).toEqual([PROPIO])

    await esperarImagen(page)
    await page.getByRole('button', { name: COPY.shareImage }).click()
    await expect.poll(async () => (await shareCalls(page)).length).toBe(1)
    const [llamada] = await shareCalls(page)
    expect(llamada?.text).toBe(PROPIO)
    expect(llamada?.title).toBe(COPY.shareTitle)
    expect(llamada?.files).toHaveLength(1)

    // Guardar el mensaje no recompone la imagen ni la vuelve a pedir.
    expect(antesDeGuardar).toBeGreaterThanOrEqual(1)
    expect(peticiones()).toBe(antesDeGuardar)
  })

  test('apagar vuelve al predeterminado sin borrar lo escrito, y encender lo recupera', async ({
    page,
  }) => {
    const week = semanaDelResumen()
    await configurarMensaje(refs, { usarPropio: true, texto: PROPIO })
    await stubShareAndClipboard(page, { share: 'unsupported', clipboard: 'ok' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    await expect(interruptorMensaje(page)).toBeChecked()
    await toggleCheckbox(interruptorMensaje(page), false)
    await expect(campoMensaje(page)).toHaveValue(weeklyResultsMessage(week))
    await expect.poll(() => vistaPreviaMensaje(page).textContent()).toBe(weeklyResultsMessage(week))

    await page.getByRole('button', { name: COPY.copyMessage }).click()
    await expectToast(page, 'Mensaje copiado')
    expect(await clipboardWrites(page)).toEqual([weeklyResultsMessage(week)])

    await page.getByRole('button', { name: COPY.messageSave }).click()
    await expectToast(page, COPY.messageSaved)
    // Apagado, pero con su texto guardado para cuando lo vuelva a encender.
    expect(await leerMensaje(refs)).toEqual({ usarPropio: false, texto: PROPIO })

    await page.reload()
    await esperarImagen(page)
    await expect(interruptorMensaje(page)).not.toBeChecked()
    await toggleCheckbox(interruptorMensaje(page), true)
    await expect(campoMensaje(page)).toHaveValue(PROPIO)
    await expect.poll(() => vistaPreviaMensaje(page).textContent()).toBe(PROPIO)
  })

  test('«Volver al mensaje predeterminado» vacía el mensaje propio', async ({ page }) => {
    const week = semanaDelResumen()
    await configurarMensaje(refs, { usarPropio: true, texto: PROPIO })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    const volver = page.getByRole('button', { name: COPY.messageRestore })
    await volver.click()
    await expect(interruptorMensaje(page)).not.toBeChecked()
    await expect(volver).toHaveCount(0)
    await expect(campoMensaje(page)).toHaveValue(weeklyResultsMessage(week))
    await expect.poll(() => vistaPreviaMensaje(page).textContent()).toBe(weeklyResultsMessage(week))

    await page.getByRole('button', { name: COPY.messageSave }).click()
    await expectToast(page, COPY.messageSaved)
    expect(await leerMensaje(refs)).toEqual(PREDETERMINADO)

    // Encender otra vez ya no recupera nada: arranca de nuevo del predeterminado.
    await toggleCheckbox(interruptorMensaje(page), true)
    await expect(campoMensaje(page)).toHaveValue(weeklyResultsMessage(week))
  })

  test('no guarda un mensaje propio vacío, y lo dice junto al campo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    await toggleCheckbox(interruptorMensaje(page), true)
    await campoMensaje(page).fill('')
    await page.getByRole('button', { name: COPY.messageSave }).click()

    await expect(page.getByRole('alert').filter({ hasText: COPY.messageEmpty })).toBeVisible()
    await expect(campoMensaje(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: COPY.messageSaved }),
    ).toHaveCount(0)
    expect(await leerMensaje(refs)).toEqual(PREDETERMINADO)
  })

  test('el campo no admite más de 1.000 caracteres', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    await toggleCheckbox(interruptorMensaje(page), true)
    await expect(campoMensaje(page)).toHaveAttribute('maxlength', '1000')
    await campoMensaje(page).fill('x'.repeat(1001))
    await expect(campoMensaje(page)).toHaveValue('x'.repeat(1000))

    await page.getByRole('button', { name: COPY.messageSave }).click()
    await expectToast(page, COPY.messageSaved)
    expect(await leerMensaje(refs)).toEqual({ usarPropio: true, texto: 'x'.repeat(1000) })
  })
})

test.describe('cuando no está lista', () => {
  test('con un resultado pendiente dice cuál falta y no pide ninguna imagen', async ({ page }) => {
    const week = await montarSemana({ pendientes: ['meta'] })
    await configurarRifaDelCatalogo(refs, refs.raffleId)
    const peticiones = contarPeticionesDeImagen(page)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')

    await expect(resumen(page)).toContainText('5 de 6 resultados')
    await expect(resumen(page)).toContainText('Falta el resultado de Meta.')
    await expect(fila(page, 'meta')).toContainText('Resultado pendiente')
    await expect(page.getByText(COPY.previewPending)).toBeVisible()
    await expect(page.getByText(COPY.messagePending)).toBeVisible()
    for (const nombre of [COPY.shareImage, COPY.downloadImage, COPY.copyMessage]) {
      await expect(page.getByRole('button', { name: nombre })).toBeDisabled()
    }
    expect(peticiones()).toBe(0)

    // Y la ruta tampoco dibuja una imagen a medias.
    const respuesta = await page.request.get(weeklyResultsImageUrl(week))
    expect(respuesta.status()).toBe(409)
  })

  test('con un resultado pendiente, el mensaje se prepara y se guarda, pero no se copia ni se comparte', async ({
    page,
  }) => {
    const TEXTO = 'Mañana salen los resultados. ¡Suerte!'
    await montarSemana({ pendientes: ['meta'] })
    await configurarRifaDelCatalogo(refs, refs.raffleId)
    await configurarMensaje(refs, PREDETERMINADO)
    await stubShareAndClipboard(page, { share: 'ok', clipboard: 'ok' })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await expect(resumen(page)).toContainText('5 de 6 resultados')

    await toggleCheckbox(interruptorMensaje(page), true)
    await campoMensaje(page).fill(TEXTO)
    await page.getByRole('button', { name: COPY.messageSave }).click()
    await expectToast(page, COPY.messageSaved)
    expect(await leerMensaje(refs)).toEqual({ usarPropio: true, texto: TEXTO })

    await expect(page.getByText(COPY.messagePending)).toBeVisible()
    await expect(vistaPreviaMensaje(page)).toHaveCount(0)
    for (const nombre of [COPY.shareImage, COPY.downloadImage, COPY.copyMessage]) {
      await expect(page.getByRole('button', { name: nombre })).toBeDisabled()
    }
    expect(await clipboardWrites(page)).toEqual([])
    expect(await shareCalls(page)).toEqual([])
  })

  test('sin rifa en el catálogo lo explica y no ofrece nada', async ({ page }) => {
    const week = await montarSemana()
    await configurarRifaDelCatalogo(refs, null)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')

    await expect(
      page.getByText('Tu catálogo todavía no tiene una rifa.', { exact: false }),
    ).toBeVisible()
    await expect(page.getByText(COPY.previewNoRaffle)).toBeVisible()
    await expect(page.getByRole('button', { name: COPY.downloadImage })).toBeDisabled()
    await expect(page.getByRole('button', { name: COPY.copyMessage })).toBeDisabled()

    const respuesta = await page.request.get(weeklyResultsImageUrl(week))
    expect(respuesta.status()).toBe(409)
  })
})

test.describe('quién puede pedir la imagen (BR-H05)', () => {
  test('sin sesión no se entrega nada', async ({ playwright, baseURL }) => {
    const week = await montarSemana()
    await configurarRifaDelCatalogo(refs, refs.raffleId)
    const contexto = await playwright.request.newContext({ baseURL })

    const respuesta = await contexto.get(weeklyResultsImageUrl(week), { maxRedirects: 0 })
    // El proxy corta antes que el handler; su 401 es la segunda línea (D-060).
    expect([307, 401]).toContain(respuesta.status())
    const cuerpo = await respuesta.body()
    expect([...cuerpo.subarray(0, 4)]).not.toEqual([137, 80, 78, 71])

    await contexto.dispose()
  })

  test('un administrador no la obtiene', async ({ page }) => {
    const week = await montarSemana()
    await loginAs(page, ACCOUNTS.admin)
    const respuesta = await page.request.get(weeklyResultsImageUrl(week))
    expect(respuesta.status()).toBe(403)
    expect(respuesta.headers()['content-type']).toContain('application/json')
  })

  test('rechaza una semana mal escrita, sin terminar o ausente', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    for (const consulta of ['?week=2026-13-01', '?week=hoy', '', `?week=${lunesDeEstaSemana()}`]) {
      const respuesta = await page.request.get(`/api/weekly-results/image${consulta}`)
      expect(respuesta.status(), consulta).toBe(400)
    }
  })

  test('el vendedor de otra organización no ve la rifa de esta', async ({ page }) => {
    const week = await montarSemana()
    await configurarRifaDelCatalogo(refs, refs.raffleId)

    await loginAs(page, ACCOUNTS.controlSeller)
    await page.goto('/seller/settings/weekly-results')
    await expect(
      page.getByText('Tu catálogo todavía no tiene una rifa.', { exact: false }),
    ).toBeVisible()
    await expect(page.getByText('Rifa Navidad 2026')).toHaveCount(0)

    const respuesta = await page.request.get(weeklyResultsImageUrl(week))
    expect(respuesta.status()).toBe(409)
  })
})

/** El lunes de la semana en curso en Bogotá: nunca está terminada. */
function lunesDeEstaSemana(): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const fecha = new Date(`${hoy}T12:00:00Z`)
  const dia = fecha.getUTCDay() === 0 ? 7 : fecha.getUTCDay()
  // El domingo, la semana «en curso» ya es la siguiente: su lunes es mañana.
  fecha.setUTCDate(fecha.getUTCDate() + (dia === 7 ? 1 : 1 - dia))
  return fecha.toISOString().slice(0, 10)
}
