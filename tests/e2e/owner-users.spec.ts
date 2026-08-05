import { expect, test } from '@playwright/test'

import { ACCOUNTS, expectToast, loginAs, unique } from './fixtures'

/**
 * Pruebas 3, 4 y 5 de la Fase 3: crear vendedor, desactivar vendedor y el
 * bloqueo del Admin sobre el Owner (BR-U01, BR-U02, BR-U03, BR-U06).
 */

test.describe('Vendedores', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('invita a un vendedor y aparece en el listado (prueba 3)', async ({ page }) => {
    const name = unique('Vendedor E2E')
    const email = `vendedor.${Date.now().toString(36)}@demo.test`

    await page.goto('/owner/sellers')
    await page.getByRole('button', { name: 'Nuevo vendedor' }).click()

    await page.getByLabel('Nombre completo').fill(name)
    await page.getByLabel('Teléfono').fill('3009998877')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByRole('button', { name: 'Enviar invitación' }).click()

    await expectToast(page, /Invitación enviada/)
    await expect(page.getByRole('link', { name })).toBeVisible()
  })

  test('rechaza un teléfono inválido (BR-U08)', async ({ page }) => {
    await page.goto('/owner/sellers')
    await page.getByRole('button', { name: 'Nuevo vendedor' }).click()

    await page.getByLabel('Nombre completo').fill(unique('Vendedor teléfono'))
    await page.getByLabel('Teléfono').fill('123')
    await page.getByLabel('Correo electrónico').fill(`t.${Date.now().toString(36)}@demo.test`)
    await page.getByRole('button', { name: 'Enviar invitación' }).click()

    await expect(page.getByText('Ingresa un teléfono válido (7 a 20 dígitos).')).toBeVisible()
  })

  test('desactiva y reactiva a un vendedor (prueba 4, BR-U06)', async ({ page }) => {
    const name = unique('Vendedor baja')
    const email = `baja.${Date.now().toString(36)}@demo.test`

    await page.goto('/owner/sellers')
    await page.getByRole('button', { name: 'Nuevo vendedor' }).click()
    await page.getByLabel('Nombre completo').fill(name)
    await page.getByLabel('Teléfono').fill('3007776655')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByRole('button', { name: 'Enviar invitación' }).click()
    await expectToast(page, /Invitación enviada/)

    const row = page.getByRole('row').filter({ hasText: name })
    await row.getByRole('button', { name: `Acciones para ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Desactivar' }).click()
    await page.getByRole('button', { name: 'Desactivar', exact: true }).click()

    await expectToast(page, 'Usuario desactivado.')
    await expect(row.getByText('Inactivo')).toBeVisible()

    await row.getByRole('button', { name: `Acciones para ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Activar' }).click()
    await page.getByRole('button', { name: 'Activar', exact: true }).click()

    await expectToast(page, 'Usuario activado.')
    await expect(row.getByText('Activo')).toBeVisible()
  })

  test('edita los datos de un vendedor', async ({ page }) => {
    await page.goto('/owner/sellers')
    const row = page.getByRole('row').filter({ hasText: 'Julian Vargas' })
    await row.getByRole('button', { name: 'Acciones para Julian Vargas' }).click()
    await page.getByRole('menuitem', { name: 'Editar datos' }).click()

    const alias = unique('Alias')
    await page.getByLabel('Alias (opcional)').fill(alias)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expectToast(page, 'Datos actualizados.')
    await expect(page.getByText(alias)).toBeVisible()
  })

  test('el detalle del vendedor muestra sus indicadores', async ({ page }) => {
    await page.goto('/owner/sellers')
    await page.getByRole('link', { name: 'Julian Vargas' }).click()

    await page.waitForURL(/\/owner\/sellers\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: 'Julian Vargas' })).toBeVisible()
    await expect(page.getByText('Total vendido')).toBeVisible()
    await expect(page.getByText('Saldo pendiente')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver sus boletas' })).toBeVisible()
  })
})

test.describe('Administradores y proteccion del Owner', () => {
  test('el Owner ve la lista de administradores y puede invitar a otro', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/users')

    await expect(page.getByRole('heading', { name: 'Administradores' })).toBeVisible()
    // Acotado a la tabla: el nombre del Owner aparece tambien en el menu de usuario.
    const table = page.getByRole('table')
    await expect(table.getByRole('row').filter({ hasText: 'Camila Restrepo' })).toBeVisible()
    await expect(table.getByRole('row').filter({ hasText: 'Andres Gomez' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nuevo administrador' })).toBeVisible()
  })

  test('un Admin no tiene acciones sobre el Owner (prueba 5, BR-U02)', async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin)
    await page.goto('/owner/users')

    const ownerRow = page.getByRole('row').filter({ hasText: 'Camila Restrepo' })
    await expect(ownerRow).toBeVisible()
    // Ni menu de acciones para la fila del Owner.
    await expect(ownerRow.getByRole('button', { name: /Acciones para/ })).toHaveCount(0)
    await expect(ownerRow.getByText('Sin acciones')).toBeVisible()

    // Sobre si mismo (Admin) si las tiene.
    const adminRow = page.getByRole('row').filter({ hasText: 'Andres Gomez' })
    await expect(adminRow.getByRole('button', { name: /Acciones para/ })).toBeVisible()
  })

  test('nadie puede desactivarse a si mismo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin)
    await page.goto('/owner/users')

    const adminRow = page.getByRole('row').filter({ hasText: 'Andres Gomez' })
    await adminRow.getByRole('button', { name: 'Acciones para Andres Gomez' }).click()

    await expect(page.getByRole('menuitem', { name: 'Desactivar' })).toBeDisabled()
  })
})
