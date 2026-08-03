import { expect, type Page } from '@playwright/test'

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
} as const

export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Correo electronico').fill(email)
  await page.getByLabel('Contrasena').fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(/\/(owner|seller)\/dashboard/)
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /menu de usuario|cuenta/i }).click()
  await page.getByRole('menuitem', { name: /cerrar sesion/i }).click()
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
