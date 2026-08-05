import { expect, test } from '@playwright/test'

import { ACCOUNTS, expectToast, loginAs, unique } from './fixtures'

/**
 * Pruebas 1 y 2 de la Fase 3: crear y editar una rifa, y las restricciones de
 * estado (BR-R03, BR-R07, BR-R08).
 */

test.describe('Rifas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('crea una rifa con el precio predeterminado y la activa', async ({ page }) => {
    const name = unique('Rifa E2E')

    await page.goto('/owner/raffles/new')
    await page.getByLabel('Nombre de la rifa').fill(name)
    await page.getByLabel('Fecha de inicio').fill('2026-01-01')
    await page.getByLabel('Fecha de fin').fill('2026-12-31')

    // BR-R04: el formulario llega con $100.000 puesto.
    await expect(page.getByLabel('Precio de la boleta')).toHaveValue('$100.000')

    await page.getByRole('button', { name: 'Crear rifa' }).click()

    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await expect(page.getByText('Borrador').first()).toBeVisible()

    // BR-R03: draft -> active
    await page.getByRole('button', { name: 'Activar rifa' }).click()
    await page.getByRole('button', { name: 'Activar rifa' }).last().click()
    await expectToast(page, /activa/i)
    await expect(page.getByText('Activa').first()).toBeVisible()
  })

  test('rechaza que la fecha de fin sea anterior a la de inicio (BR-R07)', async ({ page }) => {
    await page.goto('/owner/raffles/new')
    await page.getByLabel('Nombre de la rifa').fill(unique('Rifa fechas'))
    await page.getByLabel('Fecha de inicio').fill('2026-12-31')
    await page.getByLabel('Fecha de fin').fill('2026-01-01')
    await page.getByRole('button', { name: 'Crear rifa' }).click()

    await expect(
      page.getByText('La fecha de fin no puede ser anterior a la de inicio.'),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/owner\/raffles\/new/)
  })

  test('rechaza un nombre de rifa repetido en la organización (BR-R11)', async ({ page }) => {
    const name = unique('Rifa repetida')

    for (const attempt of [1, 2]) {
      await page.goto('/owner/raffles/new')
      await page.getByLabel('Nombre de la rifa').fill(name)
      await page.getByLabel('Fecha de inicio').fill('2026-01-01')
      await page.getByLabel('Fecha de fin').fill('2026-12-31')
      await page.getByRole('button', { name: 'Crear rifa' }).click()

      if (attempt === 1) {
        await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)
      }
    }

    await expect(
      page.getByText('Ya existe una rifa con ese nombre en la organización.'),
    ).toBeVisible()
  })

  test('edita el precio de una rifa sin tocar las boletas ya vendidas (BR-R06)', async ({
    page,
  }) => {
    const name = unique('Rifa precio')

    await page.goto('/owner/raffles/new')
    await page.getByLabel('Nombre de la rifa').fill(name)
    await page.getByLabel('Fecha de inicio').fill('2026-01-01')
    await page.getByLabel('Fecha de fin').fill('2026-12-31')
    await page.getByRole('button', { name: 'Crear rifa' }).click()
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)

    await page.getByRole('link', { name: 'Editar' }).click()
    await page.waitForURL(/\/edit$/)

    const price = page.getByLabel('Precio de la boleta')
    await price.click()
    await price.fill('50000')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expectToast(page, 'Rifa actualizada.')
    await expect(page.getByText('$50.000').first()).toBeVisible()
  })

  test('una rifa cerrada no se puede editar y solo el Owner la reabre (BR-R03)', async ({
    page,
  }) => {
    const name = unique('Rifa cierre')

    await page.goto('/owner/raffles/new')
    await page.getByLabel('Nombre de la rifa').fill(name)
    await page.getByLabel('Fecha de inicio').fill('2026-01-01')
    await page.getByLabel('Fecha de fin').fill('2026-12-31')
    await page.getByRole('button', { name: 'Crear rifa' }).click()
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)
    const raffleUrl = page.url()

    await page.getByRole('button', { name: 'Activar rifa' }).click()
    await page.getByRole('button', { name: 'Activar rifa' }).last().click()
    await expectToast(page, /activa/i)

    await page.getByRole('button', { name: 'Cerrar rifa' }).click()
    await page.getByRole('button', { name: 'Cerrar rifa' }).last().click()
    await expectToast(page, /cerrada/i)

    // Cerrada: desaparece el boton de editar y aparece el de reabrir.
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reabrir rifa' })).toBeVisible()

    // La ruta de edicion tampoco es accesible escribiendola a mano.
    await page.goto(`${raffleUrl}/edit`)
    await expect(page).toHaveURL(raffleUrl)
  })
})

test.describe('Rifas como Admin', () => {
  test('un Admin no ve la acción de reabrir una rifa cerrada (BR-R03)', async ({ page }) => {
    const name = unique('Rifa admin')

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/raffles/new')
    await page.getByLabel('Nombre de la rifa').fill(name)
    await page.getByLabel('Fecha de inicio').fill('2026-01-01')
    await page.getByLabel('Fecha de fin').fill('2026-12-31')
    await page.getByRole('button', { name: 'Crear rifa' }).click()
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)
    const raffleUrl = page.url()

    await page.getByRole('button', { name: 'Activar rifa' }).click()
    await page.getByRole('button', { name: 'Activar rifa' }).last().click()
    await expectToast(page, /activa/i)
    await page.getByRole('button', { name: 'Cerrar rifa' }).click()
    await page.getByRole('button', { name: 'Cerrar rifa' }).last().click()
    await expectToast(page, /cerrada/i)

    await page.context().clearCookies()
    await loginAs(page, ACCOUNTS.admin)
    await page.goto(raffleUrl)

    await expect(page.getByRole('button', { name: 'Anular rifa' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reabrir rifa' })).toHaveCount(0)
  })
})
