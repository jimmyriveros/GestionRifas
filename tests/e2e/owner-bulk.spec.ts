import { expect, test, type Page } from '@playwright/test'

import { createTicket, loadSeedRefs, type SeedRefs } from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers } from './fixtures'

/**
 * Pruebas 10 y 11 de la Fase 3: creacion masiva de boletas, guardado parcial en
 * borrador y deteccion de duplicados por fila (CLAUDE.md 15, BR-N10).
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/** Deja la pantalla con `quantity` filas listas para escribir. */
async function generateRows(page: Page, quantity: number) {
  await page.goto('/owner/tickets/bulk')
  await page.getByLabel('Rifa').click()
  await page.getByRole('option', { name: /Rifa Navidad 2026/ }).click()
  await page.getByLabel(/Cantidad/).fill(String(quantity))
  await page.getByRole('button', { name: 'Generar filas' }).click()
  await expect(page.getByText(`${quantity} fila(s).`)).toBeVisible()
}

test.describe('Creación masiva', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('crea un lote pequeno con números válidos (prueba 10)', async ({ page }) => {
    await generateRows(page, 3)

    const numbers = [randomTicketNumbers(), randomTicketNumbers(), randomTicketNumbers()]
    for (let index = 0; index < numbers.length; index += 1) {
      await page
        .getByLabel(`Número diario de la fila ${index + 1}`, { exact: true })
        .fill(numbers[index]!.daily)
      await page
        .getByLabel(`Número semanal de la fila ${index + 1}`, { exact: true })
        .fill(numbers[index]!.weekly)
    }

    await expect(page.getByText('Sin errores')).toBeVisible()
    await page.getByRole('button', { name: /Guardar 3 boleta/ }).click()

    await expectToast(page, /Se crearon 3 boleta/)
    await page.waitForURL(/\/owner\/tickets\?/)
  })

  test('guarda filas vacias como borrador (prueba 11)', async ({ page }) => {
    await generateRows(page, 2)

    // Sin escribir nada: las dos filas son borradores validos.
    await expect(page.getByText('Sin errores')).toBeVisible()
    await page.getByRole('button', { name: /Guardar 2 boleta/ }).click()

    await expectToast(page, /Se crearon 2 boleta/)
    await page.waitForURL(/\/owner\/tickets\?/)

    await page.goto('/owner/tickets?inventoryStatus=draft')
    await expect(page.getByText('Borrador').first()).toBeVisible()
  })

  test('exige los dos números o ninguno (BR-N09)', async ({ page }) => {
    await generateRows(page, 1)

    await page.getByLabel('Número diario de la fila 1', { exact: true }).fill('1234')
    await expect(page.getByText(/Completa los dos números o deja la fila vacía/)).toBeVisible()
    await expect(page.getByText('1 con error')).toBeVisible()
    await expect(page.getByRole('button', { name: /Guardar 1 boleta/ })).toBeDisabled()

    await page.getByLabel('Número semanal de la fila 1', { exact: true }).fill('5678')
    await expect(page.getByText('Sin errores')).toBeVisible()
  })

  test('detecta una combinación repetida dentro del formulario (prueba 8, BR-N04)', async ({
    page,
  }) => {
    await generateRows(page, 2)
    const numbers = randomTicketNumbers()

    for (const index of [1, 2]) {
      await page
        .getByLabel(`Número diario de la fila ${index}`, { exact: true })
        .fill(numbers.daily)
      await page
        .getByLabel(`Número semanal de la fila ${index}`, { exact: true })
        .fill(numbers.weekly)
    }

    await expect(page.getByText('Combinación repetida en la fila 1.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Guardar 2 boleta/ })).toBeDisabled()
  })

  test('detecta una combinación que ya existe en la base de datos (prueba 9, BR-N05)', async ({
    page,
  }) => {
    const numbers = randomTicketNumbers()
    await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })

    await generateRows(page, 1)
    await page.getByLabel('Número diario de la fila 1', { exact: true }).fill(numbers.daily)
    await page.getByLabel('Número semanal de la fila 1', { exact: true }).fill(numbers.weekly)

    await page.getByRole('button', { name: 'Verificar duplicados' }).click()
    await expectToast(page, /1 combinación\(es\) ya existen/)
    await expect(page.getByText('Esa combinación ya existe en esta rifa.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Guardar 1 boleta/ })).toBeDisabled()
  })

  test('no permite mas de 4 dígitos por campo (prueba 7)', async ({ page }) => {
    await generateRows(page, 1)
    const daily = page.getByLabel('Número diario de la fila 1', { exact: true })
    await daily.pressSequentially('98765')
    await expect(daily).toHaveValue('9876')
  })

  test('genera y valida 1.000 filas sin congelar el navegador (CLAUDE.md 15)', async ({ page }) => {
    test.setTimeout(180_000)

    const started = Date.now()
    await generateRows(page, 1000)
    const generation = Date.now() - started

    // Virtualizacion: solo se renderiza un punado de filas, nunca 1.000.
    const rendered = await page.getByLabel(/Número diario de la fila/).count()
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(60)

    // La pagina sigue respondiendo: se puede escribir en la primera fila.
    const numbers = randomTicketNumbers()
    await page.getByLabel('Número diario de la fila 1', { exact: true }).fill(numbers.daily)
    await page.getByLabel('Número semanal de la fila 1', { exact: true }).fill(numbers.weekly)
    await expect(page.getByText('Sin errores')).toBeVisible()

    expect(generation).toBeLessThan(30_000)
  })

  test('guarda 1.000 boletas en lotes con indicador de progreso', async ({ page }) => {
    test.setTimeout(300_000)

    await generateRows(page, 1000)

    // Todas vacias: se guardan como borrador. Lo que se prueba aqui es el
    // troceado en lotes y el progreso, no la numeracion.
    await page.getByRole('button', { name: /Guardar 1000 boleta/ }).click()

    await expect(page.getByRole('progressbar')).toBeVisible()
    await expectToast(page, /Se crearon 1000 boleta/)
    await page.waitForURL(/\/owner\/tickets\?/)
  })
})
