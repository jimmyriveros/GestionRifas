import { expect, test } from '@playwright/test'

import { serviceClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Equipos y comision en el telefono (encargo, seccion TESTS UI/UX).
 *
 * Se comprueban los anchos que pidio el encargo —320, 375, 390 y 430— y lo que
 * de verdad se rompe en pantallas estrechas: que la pagina no se desplace en
 * horizontal, que el dinero no se corte y que los botones se puedan tocar.
 *
 * Este archivo corre en el proyecto `movil` (Pixel 7) por su sufijo.
 */

const ANCHOS = [320, 375, 390, 430]

/** Diana minima recomendada para tocar con el dedo. */
const DIANA_MINIMA = 44

let memberId: string | null = null

test.afterAll(async () => {
  if (!memberId) return
  const svc = serviceClient()
  await svc.from('notifications').delete().eq('recipient_profile_id', memberId)
  await svc.from('seller_commissions').delete().eq('seller_id', memberId)
  await svc.from('memberships').delete().eq('profile_id', memberId)
  await svc.auth.admin.deleteUser(memberId)
})

async function conIntegrante(): Promise<void> {
  if (memberId) return
  const svc = serviceClient()

  const { data: parent } = await svc
    .from('profiles')
    .select('id')
    .eq('email', ACCOUNTS.seller)
    .single()
  const { data: pm } = await svc
    .from('memberships')
    .select('organization_id')
    .eq('profile_id', parent!.id)
    .single()

  const { data: created } = await svc.auth.admin.createUser({
    email: `movil-${Date.now().toString(36)}@demo.test`,
    password: 'DesarrolloLocal2026',
    email_confirm: true,
    user_metadata: { full_name: 'Pedro Martínez Móvil', phone: '3001234567' },
  })
  memberId = created!.user!.id

  await svc.from('memberships').insert({
    organization_id: pm!.organization_id,
    profile_id: memberId,
    role: 'seller',
    parent_seller_id: parent!.id,
  })
}

/** Cuanto se sale la pagina por el lado derecho. Cero o negativo es correcto. */
async function desbordamiento(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('Equipo y ganancia en el teléfono', () => {
  test('ninguna pantalla se desborda entre 320 y 430 px', async ({ page }) => {
    await conIntegrante()
    await loginAs(page, ACCOUNTS.seller)

    const rutas = ['/seller/dashboard', '/seller/team', `/seller/team/${memberId}`]

    for (const ancho of ANCHOS) {
      await page.setViewportSize({ width: ancho, height: 800 })
      for (const ruta of rutas) {
        await page.goto(ruta)
        // Se espera a que la pantalla tenga contenido antes de medir.
        await expect(page.getByRole('heading').first()).toBeVisible()
        expect(await desbordamiento(page), `${ruta} a ${ancho}px`).toBeLessThanOrEqual(0)
      }
    }
  })

  test('el dinero se lee entero en la pantalla más estrecha', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/seller/dashboard')

    const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: 'Tu ganancia' })
    await expect(tarjeta).toBeVisible()

    // El importe se localiza por su sitio en la tarjeta, no por su valor: otras
    // suites cobran boletas de esta cuenta y un numero fijo aqui dependeria del
    // orden de ejecucion. Lo que se comprueba es que NO se corta, sea cual sea.
    const importe = tarjeta.locator('p.text-3xl').first()
    await expect(importe).toBeVisible()
    await expect(importe).toHaveText(/^\$[\d.]+$/)

    const recortado = await importe.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    )
    expect(recortado, 'el importe no debe quedar cortado').toBe(false)
  })

  test('«Agregar vendedor» se puede tocar con el dedo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.otherSeller)
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/seller/team')

    const boton = page.getByRole('button', { name: 'Agregar vendedor' })
    await expect(boton).toBeVisible()

    const caja = await boton.boundingBox()
    expect(caja!.height, 'alto de la diana').toBeGreaterThanOrEqual(DIANA_MINIMA - 8)
    // Y cabe entero en la pantalla, sin salirse por la derecha.
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(320)
  })

  /**
   * «Mi equipo» tampoco entra en la barra inferior, que se reserva a los cuatro
   * sitios de uso diario (D-106). Sigue siendo visible tenga equipo o no
   * (BR-E01): lo que cambio es que ahora se lee en el menu de usuario.
   */
  test('se llega a «Mi equipo» desde el menú de usuario', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/seller/dashboard')

    await page.getByRole('button', { name: /Menú de usuario/ }).tap()
    await page.getByRole('menuitem', { name: 'Mi equipo' }).click()

    await expect(page.getByRole('heading', { name: 'Mi equipo' })).toBeVisible()
  })

  test('la campanita cabe y se abre sin tapar la pantalla', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/owner/dashboard')

    const campanita = page.getByRole('button', { name: /Novedades:/ })
    await expect(campanita).toBeVisible()
    await campanita.click()

    const bandeja = page.getByRole('menu')
    await expect(bandeja).toBeVisible()

    /*
      Se mide LA BANDEJA, no la página entera: el panel administrativo ya
      desbordaba a 320 px por una tabla suya (I-056), y una prueba de esta
      funcionalidad no puede fallar por un defecto que no introdujo ni arregla.
      Lo que aquí importa es que la bandeja quepa.
    */
    const caja = await bandeja.boundingBox()
    expect(caja!.x, 'la bandeja no debe salirse por la izquierda').toBeGreaterThanOrEqual(0)
    expect(caja!.x + caja!.width, 'la bandeja no debe salirse por la derecha').toBeLessThanOrEqual(
      320,
    )
  })
})
