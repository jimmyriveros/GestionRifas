import { expect, type Locator, type Page } from '@playwright/test'

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

/**
 * Va al login tolerando que otra navegacion nos gane la carrera.
 *
 * `page.goto` falla con `ERR_ABORTED` cuando la pagina anterior tenia una
 * peticion en vuelo. Pasa sobre todo despues de `clearCookies()`: las
 * peticiones RSC que quedaban se encuentran sin sesion, el navegador redirige
 * por su cuenta al login, y ESA redireccion aborta la nuestra. La pagina de
 * login acaba pintada igual —se ve en la captura del fallo—, asi que no es un
 * defecto del producto sino una carrera del arnes.
 *
 * Era la causa de I-038: fallaba de forma intermitente en el bloque de
 * anulacion de pagos, y con mas frecuencia cuanto mas larga era la suite.
 * Reintentar una vez basta: la segunda navegacion ya no compite con nada.
 */
async function gotoLogin(page: Page): Promise<void> {
  try {
    await page.goto('/login')
  } catch (error) {
    if (!String(error).includes('ERR_ABORTED')) throw error
    await page.goto('/login')
  }
}

export async function loginAs(
  page: Page,
  email: string,
  options: { withTour?: boolean } = {},
): Promise<void> {
  if (!options.withTour) await silenceTours(page)
  await gotoLogin(page)
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

/**
 * Marca o desmarca una casilla, reintentando hasta que el clic surta efecto.
 *
 * Un clic sobre un componente cliente puede caer en el hueco entre que el HTML
 * del servidor esta pintado —y por tanto Playwright lo considera pulsable— y
 * que React haya terminado de hidratarlo. Entonces el clic no hace nada y la
 * prueba falla en la comprobacion siguiente, echandole la culpa al producto.
 *
 * `toPass` con una espera corta dentro distingue las dos cosas: si el clic se
 * perdio, se repite; si la casilla de verdad no cambia, la prueba falla igual.
 */
export async function toggleCheckbox(box: Locator, expected: boolean): Promise<void> {
  await expect(async () => {
    await box.click()
    await expect(box).toBeChecked({ checked: expected, timeout: 1500 })
  }).toPass({ timeout: 20_000 })
}
