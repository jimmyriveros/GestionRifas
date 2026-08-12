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

  test('el panel resume el equipo y se entra al detalle de un integrante', async ({ page }) => {
    const svc = serviceClient()
    const email = uniqueEmail('detalle-e2e')

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
      user_metadata: { full_name: 'Andrea Rojas E2E', phone: '3009998877' },
    })
    const member = created?.user
    expect(member, 'no se pudo crear la cuenta del integrante').toBeTruthy()
    await svc.from('memberships').insert({
      organization_id: parentMembership!.organization_id,
      profile_id: member!.id,
      role: 'seller',
      parent_seller_id: parent!.id,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/team')

    // El resumen del equipo aparece con los integrantes, no antes.
    await expect(page.getByText('Vendedores', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: /Andrea Rojas E2E/ }).click()
    await expect(page.getByRole('heading', { name: 'Andrea Rojas E2E' })).toBeVisible()
    await expect(page.getByText('Todavía no ha vendido boletas')).toBeVisible()
  })

  test('no se puede ver a un vendedor de otro equipo por la URL (BR-E05)', async ({ page }) => {
    const svc = serviceClient()
    const { data: otro } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.otherSeller)
      .single()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/team/${otro!.id}`)

    // «No encontrada», no «acceso denegado»: un vendedor de otro equipo no debe
    // distinguirse de un id inexistente.
    //
    // El codigo HTTP es 200 y no 404 porque el segmento tiene `loading.tsx` y la
    // respuesta ya iba en streaming cuando se decidio el 404 (I-014). No filtra
    // nada: lo que se pinta es la pagina de no encontrada, y eso es lo que se
    // comprueba, igual que en seller-clients.spec.ts.
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  })

  test('el aviso de la venta de un integrante llega a la campanita del padre', async ({ page }) => {
    const svc = serviceClient()
    const email = uniqueEmail('aviso-e2e')

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
    const { data: raffle } = await svc
      .from('raffles')
      .select('id')
      .eq('name', 'Rifa Navidad 2026')
      .single()

    const { data: created } = await svc.auth.admin.createUser({
      email,
      password: 'DesarrolloLocal2026',
      email_confirm: true,
      user_metadata: { full_name: 'Sofía Aviso E2E', phone: '3001112233' },
    })
    const member = created?.user
    expect(member, 'no se pudo crear la cuenta del integrante').toBeTruthy()
    await svc.from('memberships').insert({
      organization_id: pm!.organization_id,
      profile_id: member!.id,
      role: 'seller',
      parent_seller_id: parent!.id,
    })

    const { data: cliente } = await svc
      .from('clients')
      .insert({
        organization_id: pm!.organization_id,
        seller_id: member!.id,
        name: 'Cliente de Sofía',
        phone: '3004445555',
      })
      .select('id')
      .single()

    const { data: ticket } = await svc
      .from('tickets')
      .insert({
        organization_id: pm!.organization_id,
        raffle_id: raffle!.id,
        seller_id: member!.id,
        created_by: parent!.id,
        daily_number: '4321',
        weekly_number: '8765',
        inventory_status: 'available',
      })
      .select('id')
      .single()

    await svc
      .from('tickets')
      .update({
        client_id: cliente!.id,
        inventory_status: 'assigned',
        sale_price: 100000,
        sale_date: '2026-08-12',
        assigned_at: new Date().toISOString(),
      })
      .eq('id', ticket!.id)

    await loginAs(page, ACCOUNTS.seller)

    await page.getByRole('button', { name: /Novedades:/ }).click()
    await expect(page.getByText('Sofía Aviso E2E vendió la boleta 4321 / 8765.')).toBeVisible()

    // Y se pueden marcar como leídas. Se comprueba que la acción desaparece, no
    // el nombre del botón de la campanita: mientras el menú está abierto, Radix
    // deja el resto de la página fuera del árbol de accesibilidad.
    await page.getByRole('button', { name: 'Marcar como leídas' }).click()
    await expect(page.getByRole('button', { name: 'Marcar como leídas' })).toHaveCount(0)

    // El aviso llegó también al personal: se limpia por la boleta, no por el
    // destinatario, para no dejar ninguna copia detrás (I-035).
    await svc.from('notifications').delete().eq('entity_id', ticket!.id)
    await svc.from('tickets').delete().eq('id', ticket!.id)
    await svc.from('clients').delete().eq('id', cliente!.id)
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
