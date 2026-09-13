import { expect, test, type Page } from '@playwright/test'

import { WEEKLY_RESULTS_COPY } from '../../src/features/weekly-results/copy'
import { stubShareAndClipboard } from './catalogo-helpers'
import { loadSeedRefs, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'
import {
  configurarGrupo,
  configurarRifaDelCatalogo,
  desmontar,
  esperarImagen,
  montarSemana,
  vistaPrevia,
} from './resultados-semana-helpers'

/**
 * «Resultados de la semana» a 320 px, el ancho más estrecho que soporta la
 * aplicación (D-125).
 *
 * Se mide lo que en un teléfono se estropea primero: que nada empuje la página
 * de lado, que la vista previa conserve su 4:5 al ancho que haya y que cada
 * acción tenga su diana de 44 px.
 */

const COPY = WEEKLY_RESULTS_COPY.share

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  await desmontar(refs)
})

async function desborde(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('a 320 px', () => {
  test.setTimeout(150_000)

  test('lista: sin desplazamiento lateral, la vista previa en 4:5 y dianas de 44 px', async ({
    page,
  }) => {
    await montarSemana()
    await configurarRifaDelCatalogo(refs, refs.raffleId)
    await configurarGrupo(refs, null)
    await stubShareAndClipboard(page, { share: 'ok' })

    await page.setViewportSize({ width: 320, height: 740 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')
    await esperarImagen(page)

    expect(await desborde(page)).toBeLessThanOrEqual(0)

    const caja = await vistaPrevia(page).boundingBox()
    expect(caja).not.toBeNull()
    expect(caja!.width).toBeLessThanOrEqual(320)
    expect(caja!.width / caja!.height).toBeCloseTo(0.8, 2)

    for (const accion of [
      page.getByRole('button', { name: COPY.shareImage }),
      page.getByRole('button', { name: COPY.downloadImage }),
      page.getByRole('button', { name: COPY.copyMessage }),
      page.getByRole('link', { name: COPY.configureGroup }),
    ]) {
      await accion.scrollIntoViewIfNeeded()
      const medida = await accion.boundingBox()
      expect(medida, await accion.innerText()).not.toBeNull()
      expect(medida!.height, await accion.innerText()).toBeGreaterThanOrEqual(44)
      expect(medida!.x + medida!.width, await accion.innerText()).toBeLessThanOrEqual(320)
    }
  })

  test('pendiente: también cabe, y dice qué falta', async ({ page }) => {
    await montarSemana({ pendientes: ['cundinamarca', 'boyaca'] })
    await configurarRifaDelCatalogo(refs, refs.raffleId)

    await page.setViewportSize({ width: 320, height: 740 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')

    await expect(page.getByText('Faltan los resultados de Cundinamarca y Boyacá.')).toBeVisible()
    expect(await desborde(page)).toBeLessThanOrEqual(0)
  })

  test('sin rifa: el aviso cabe entero', async ({ page }) => {
    await montarSemana()
    await configurarRifaDelCatalogo(refs, null)

    await page.setViewportSize({ width: 320, height: 740 })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/weekly-results')

    await expect(page.getByText(COPY.previewNoRaffle)).toBeVisible()
    expect(await desborde(page)).toBeLessThanOrEqual(0)
  })
})
