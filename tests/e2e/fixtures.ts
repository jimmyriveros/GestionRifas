import { expect, type Page } from '@playwright/test'

import { serviceClient } from './db-setup'
import { TOURS } from '../../src/features/tour/tours'

/**
 * Utilidades compartidas de las pruebas end-to-end.
 *
 * El inicio de sesion se hace por la interfaz real, no inyectando cookies: si
 * el login se rompe, las pruebas deben enterarse.
 */

export const SEED_PASSWORD = 'DesarrolloLocal2026'

export const ACCOUNTS = {
  owner: 'owner@demo.test',
  admin: 'admin@demo.test',
  seller: 'vendedor1@demo.test',
  otherSeller: 'vendedor2@demo.test',
  /** Vendedor de «Rifas Control»: su rifa NO permite que cree boletas. */
  controlSeller: 'vendedor@control.test',
} as const

/**
 * Ids de perfil de las cuentas del seed, leidos una sola vez.
 *
 * Sirven para construir la clave real con la que el recorrido guiado recuerda
 * lo que ya se vio (`rifas.tour.<perfil>.<recorrido>`). Se consulta la base en
 * vez de dejar un interruptor de pruebas en el codigo de produccion.
 */
let profileIdsPromise: Promise<string[]> | null = null

async function seedProfileIds(): Promise<string[]> {
  profileIdsPromise ??= (async () => {
    const { data } = await serviceClient().from('profiles').select('id')
    return (data ?? []).map((row) => row.id)
  })()
  return profileIdsPromise
}

/**
 * Da por visto el recorrido guiado antes de que cargue la pagina.
 *
 * Sin esto, el recorrido se abriria automaticamente en cada prueba que entra a
 * un panel y su capa taparia la pantalla. Las pruebas del recorrido en si
 * (`tour.spec.ts`) usan `loginAs(page, email, { withTour: true })`.
 */
async function silenceTours(page: Page): Promise<void> {
  const profileIds = await seedProfileIds()
  const keys = profileIds.flatMap((profileId) =>
    TOURS.map((tour) => `rifas.tour.${profileId}.${tour.id}`),
  )
  await page.addInitScript((storageKeys: string[]) => {
    for (const key of storageKeys) window.localStorage.setItem(key, 'e2e')
  }, keys)
}

export async function loginAs(
  page: Page,
  email: string,
  options: { withTour?: boolean } = {},
): Promise<void> {
  if (!options.withTour) await silenceTours(page)
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(/\/(owner|seller)\/dashboard/)
}

/**
 * Cierra la sesion por la interfaz.
 *
 * Es necesario para cambiar de usuario dentro de una misma prueba: ir a
 * `/login` con una sesion abierta redirige al panel y el formulario no llega a
 * aparecer.
 */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /menú de usuario/i }).click()
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).click()
  await page.waitForURL(/\/login/)
}

/** Sufijo unico para no chocar con datos de ejecuciones anteriores. */
export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
}

/** Numeros de boleta aleatorios de 4 digitos, como texto (BR-N03). */
export function randomTicketNumbers(): { daily: string; weekly: string } {
  const digits = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return { daily: digits(), weekly: digits() }
}

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text })).toBeVisible()
}
