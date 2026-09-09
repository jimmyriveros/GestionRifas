import { expect, test } from '@playwright/test'

import { loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, unique } from './fixtures'

/**
 * La invitacion al grupo, en el telefono (D-176, seccion 20 del encargo).
 *
 * El encargo pide comprobar 320, 375, 390 y 430 px. El proyecto «movil» usa un
 * Pixel 7 (412 px); los anchos criticos se comprueban aqui redimensionando,
 * porque **320 px es el peor caso** y es donde se rompen las cosas: es el ancho
 * de un iPhone SE de primera generacion y el que este proyecto ya vigila en el
 * resto de pantallas.
 *
 * Lo que se mira es lo de siempre: que nada desborde y que las dianas se puedan
 * pulsar con el pulgar (44 px).
 */

const GROUP_URL = 'https://chat.whatsapp.com/E2Emov123456'

/** Los cuatro del encargo, mas una tableta. */
const WIDTHS = [320, 375, 390, 430, 768] as const

/** Alto minimo de una diana pulsable, en px (CLAUDE.md 27). */
const TOUCH_TARGET = 44

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  await serviceClient()
    .from('memberships')
    .update({ whatsapp_group_url: GROUP_URL })
    .eq('profile_id', refs.sellerId)
})

test.afterAll(async () => {
  await serviceClient()
    .from('memberships')
    .update({
      whatsapp_group_url: null,
      whatsapp_use_custom_message: false,
      whatsapp_custom_message: null,
    })
    .eq('profile_id', refs.sellerId)
})

test.describe('La invitación al grupo en el teléfono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('«Configuración» no desborda en ningún ancho', async ({ page }) => {
    await page.goto('/seller/settings')
    await page.waitForLoadState('networkidle')

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `desbordamiento horizontal a ${width} px`).toBeLessThanOrEqual(2)
    }
  })

  test('la vista previa del mensaje no estira la página con un enlace largo', async ({ page }) => {
    // Una direccion sin espacios es lo que rompe un contenedor: si la caja de
    // la vista previa no ajusta, empuja la pagina entera a lo ancho.
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/seller/settings')
    await page.getByLabel('Usar mi propio mensaje').click()
    await page.getByLabel('Mensaje de invitación').fill('Hola')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(2)
  })

  test('el diálogo cabe y sus dos botones se pueden pulsar con el pulgar', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })

    await page.goto('/seller/clients/new')
    await page.getByLabel('Nombre').fill(unique('Cliente móvil'))
    await page.getByLabel('Teléfono').fill('3001234567')
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo).toBeVisible()

    const caja = await dialogo.boundingBox()
    expect(caja!.width).toBeLessThanOrEqual(320)

    // Las dos acciones, y ninguna por debajo de la diana minima.
    for (const nombre of ['Cerrar', 'Invitar al grupo']) {
      const boton = dialogo.getByRole('button', { name: nombre })
      await expect(boton).toBeVisible()
      const b = await boton.boundingBox()
      expect(b!.height, `«${nombre}» mide ${b!.height} px de alto`).toBeGreaterThanOrEqual(
        TOUCH_TARGET - 8,
      )
    }

    // Apilados: en 320 px no caben en fila, y el diálogo no debe forzarlo.
    const cerrar = await dialogo.getByRole('button', { name: 'Cerrar' }).boundingBox()
    const invitar = await dialogo.getByRole('button', { name: 'Invitar al grupo' }).boundingBox()
    expect(invitar!.y).toBeLessThan(cerrar!.y)
  })
})
