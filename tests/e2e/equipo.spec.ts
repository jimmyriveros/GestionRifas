import { expect, test } from '@playwright/test'

import { serviceClient } from './db-setup'
import { ACCOUNTS, expectToast, loginAs, logout } from './fixtures'

/**
 * Equipos de vendedores — menu «Mi equipo» y alta de integrantes (BR-E01,
 * BR-E03, BR-E04).
 *
 * El alta ocurre por la interfaz, con la sesion real del vendedor: es lo unico
 * que demuestra que la politica `memberships_insert_seller` deja pasar al
 * vendedor de verdad, y no solo a la service role.
 *
 * Cada prueba que crea un integrante lo borra al terminar. Sin eso, la cuenta
 * quedaria en el seed y las siguientes ejecuciones contarian vendedores de mas
 * (I-035).
 */

/** Correos creados por esta suite, para dejar la base como estaba. */
const created: string[] = []

function uniqueEmail(prefix: string): string {
  const email = `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@demo.test`
  created.push(email)
  return email
}

test.afterAll(async () => {
  const svc = serviceClient()
  for (const email of created) {
    const { data: profile } = await svc.from('profiles').select('id').eq('email', email).maybeSingle()
    if (!profile) continue
    await svc.from('memberships').delete().eq('profile_id', profile.id)
    await svc.auth.admin.deleteUser(profile.id)
  }
})

test.describe('Mi equipo', () => {
  test('todo vendedor tiene el menú, aunque no tenga equipo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.otherSeller)

    const link = page.getByRole('link', { name: 'Mi equipo' }).first()
    await expect(link).toBeVisible()

    // Reintento deliberado: el primer clic puede caer entre que el HTML del
    // servidor esta pintado y que React lo hidrata, y entonces no navega
    // (TESTING.md 5.3, mismo motivo que `toggleCheckbox`).
    await expect(async () => {
      await link.click()
      await page.waitForURL(/\/seller\/team/, { timeout: 3000 })
    }).toPass({ timeout: 20_000 })

    await expect(page.getByRole('heading', { name: 'Mi equipo' })).toBeVisible()
  })

  test('sin integrantes explica qué es y ofrece agregar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.otherSeller)
    await page.goto('/seller/team')

    await expect(page.getByText('Todavía no tienes vendedores en tu equipo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar vendedor' })).toBeVisible()
  })

  test('el vendedor agrega un integrante y aparece en su equipo', async ({ page }) => {
    const email = uniqueEmail('equipo-e2e')

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/team')

    await page.getByRole('button', { name: 'Agregar vendedor' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Agregar vendedor a tu equipo')).toBeVisible()

    await dialog.getByLabel('Nombre completo').fill('Pedro Martínez E2E')
    await dialog.getByLabel('Teléfono').fill('3001234567')
    await dialog.getByLabel('Correo electrónico').fill(email)
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click()

    await expectToast(page, /Ya está en tu equipo/i)
    await expect(page.getByText('Pedro Martínez E2E')).toBeVisible()

    // Y sigue siendo invisible para un vendedor ajeno (BR-E05, BR-U07).
    await logout(page)
    await loginAs(page, ACCOUNTS.otherSeller)
    await page.goto('/seller/team')
    await expect(page.getByText('Pedro Martínez E2E')).toHaveCount(0)
  })

  test('un integrante no puede formar su propio equipo (BR-E03)', async ({ page }) => {
    // Se prepara el escenario con la service role: quien se prueba es la
    // PANTALLA del integrante, no el alta que ya cubre la prueba anterior.
    const svc = serviceClient()
    const email = uniqueEmail('integrante-e2e')

    const { data: parent } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.seller)
      .single()
    const { data: parentMembership } = await svc
      .from('memberships')
      .select('organization_id')
      .eq('profile_id', parent!.id)
      .single()

    const { data: created } = await svc.auth.admin.createUser({
      email,
      password: 'DesarrolloLocal2026',
      email_confirm: true,
      user_metadata: { full_name: 'Integrante E2E', phone: '3007654321' },
    })
    const newUser = created?.user
    expect(newUser, 'no se pudo crear la cuenta del integrante').toBeTruthy()

    // I-007: `createUser` no deja la contrasena usable hasta que se actualiza.
    await svc.auth.admin.updateUserById(newUser!.id, { password: 'DesarrolloLocal2026' })
    await svc.from('memberships').insert({
      organization_id: parentMembership!.organization_id,
      profile_id: newUser!.id,
      role: 'seller',
      parent_seller_id: parent!.id,
    })

    await loginAs(page, email)
    await page.goto('/seller/team')

    await expect(page.getByText('Formas parte del equipo de otro vendedor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar vendedor' })).toHaveCount(0)
  })
})
