import { expect, test } from '@playwright/test'

import { createTicket, loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Criterio de finalizacion de la Fase 3:
 * «Un Owner completa el ciclo: crear rifa -> crear vendedor -> generar 1.000
 * boletas -> aprobar».
 *
 * Todo el recorrido ocurre por la interfaz, con la sesion real del Owner. La
 * unica excepcion es la boleta en estado «pendiente de aprobacion»: hoy solo la
 * puede crear un vendedor desde su portal, que llega en la Fase 4, asi que se
 * prepara con la service role (ver db-setup.ts). Lo que se prueba —la
 * aprobacion— si pasa por la interfaz.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test('ciclo completo del Owner: rifa, vendedor, 1.000 boletas y aprobación', async ({ page }) => {
  test.setTimeout(300_000)

  await loginAs(page, ACCOUNTS.owner)

  // ---------------------------------------------------------------- 1. Rifa
  const raffleName = unique('Rifa ciclo')
  await page.goto('/owner/raffles/new')
  await page.getByLabel('Nombre de la rifa').fill(raffleName)
  await page.getByLabel('Fecha de inicio').fill('2026-01-01')
  await page.getByLabel('Fecha de fin').fill('2026-12-31')
  await page.getByRole('button', { name: 'Crear rifa' }).click()
  await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)

  await page.getByRole('button', { name: 'Activar rifa' }).click()
  await page.getByRole('button', { name: 'Activar rifa' }).last().click()
  await expectToast(page, /activa/i)

  // ------------------------------------------------------------ 2. Vendedor
  const sellerName = unique('Vendedor ciclo')
  await page.goto('/owner/sellers')
  await page.getByRole('button', { name: 'Nuevo vendedor' }).click()
  await page.getByLabel('Nombre completo').fill(sellerName)
  await page.getByLabel('Teléfono').fill('3005554433')
  await page.getByLabel('Correo electrónico').fill(`ciclo.${Date.now().toString(36)}@demo.test`)
  await page.getByRole('button', { name: 'Enviar invitación' }).click()
  await expectToast(page, /Invitación enviada/)
  await expect(page.getByRole('link', { name: sellerName })).toBeVisible()

  // -------------------------------------------------- 3. 1.000 boletas
  await page.goto('/owner/tickets/bulk')
  await page.getByLabel('Rifa').click()
  await page.getByRole('option', { name: new RegExp(raffleName) }).click()
  await page.getByLabel('Vendedor').click()
  await page.getByRole('option', { name: sellerName }).click()
  await page.getByLabel(/Cantidad/).fill('1000')
  await page.getByRole('button', { name: 'Generar filas' }).click()
  await expect(page.getByText('1000 fila(s).')).toBeVisible()

  await page.getByRole('button', { name: /Guardar 1000 boleta/ }).click()
  await expectToast(page, /Se crearon 1000 boleta/)
  await page.waitForURL(/\/owner\/tickets\?/)

  // La rifa refleja las 1.000 boletas.
  await page.goto('/owner/raffles')
  await page.getByRole('link', { name: raffleName }).click()
  await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)
  await expect(page.getByText('1000').first()).toBeVisible()

  // ----------------------------------------------------------- 4. Aprobacion
  const numbers = randomTicketNumbers()
  const pending = await createTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    inventoryStatus: 'pending_approval',
  })

  await page.goto(`/owner/tickets/${pending.id}`)
  await expect(page.getByText('Pendiente de aprobación').first()).toBeVisible()
  await page.getByRole('button', { name: 'Aprobar boleta' }).click()
  await expectToast(page, /aprobada/i)
  await expect(page.getByText('Disponible').first()).toBeVisible()

  // La auditoria registro la aprobacion (BR-D01).
  const { data: logs } = await serviceClient()
    .from('audit_logs')
    .select('action, entity_id')
    .eq('entity_id', pending.id)
    .eq('action', 'ticket.approve')
  expect(logs!.length).toBeGreaterThan(0)
})
