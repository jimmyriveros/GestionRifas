import { expect, test } from '@playwright/test'

import { loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * «Configuración» en el teléfono (BR-M, BR-S; D-188).
 *
 * Escritorio vive en `configuracion-cobro.spec.ts`. Aqui se mide lo que solo se
 * ve en un viewport estrecho: que nada se desborde a 320 px —el ancho del
 * encargo—, que todos los controles nuevos lleguen a la diana tactil de 44 px
 * (`CLAUDE.md` §27, y el defecto real que encontraron I-102, I-103 e I-104), y
 * que el dialogo se pueda completar entero sin que el boton se salga.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

async function reset(sellerId: string) {
  const svc = serviceClient()
  // ORDEN OBLIGATORIO: la ocurrencia apunta al recordatorio y a la campana
  // con `on delete restrict` (0052).
  await svc.from('payment_reminder_occurrences').delete().eq('seller_id', sellerId)
  await svc.from('notifications').delete().eq('recipient_profile_id', sellerId)
  await svc.from('seller_payment_reminders').delete().eq('seller_id', sellerId)
  await svc.from('seller_payment_accounts').delete().eq('seller_id', sellerId)
  // Y el grupo de WhatsApp, que vive en la membresia (0050): sin esto, «Para
  // enviar ahora» enseñaria «Abrir grupo» o «Configurar WhatsApp» segun lo que
  // hubiera dejado otra suite con este vendedor compartido.
  await svc
    .from('memberships')
    .update({
      whatsapp_group_url: null,
      whatsapp_use_custom_message: false,
      whatsapp_custom_message: null,
    })
    .eq('profile_id', sellerId)
}

test.beforeEach(async () => {
  await reset(refs.sellerId)
})

test.afterAll(async () => {
  await reset(refs.sellerId)
})

/** Lo que el encargo llama «no se desborda»: la página no se mueve de lado. */
async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test('a 320 px no se desborda nada, ni en el resumen ni en las dos secciones', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await loginAs(page, ACCOUNTS.seller)

  for (const path of [
    '/seller/settings',
    '/seller/settings/accounts',
    '/seller/settings/whatsapp',
    '/seller/settings/reminders',
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading').first()).toBeVisible()
    await expectNoHorizontalOverflow(page)
  }
})

test('los controles nuevos llegan a la diana tactil de 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/settings/accounts')

  // El boton del estado vacio.
  const add = page.getByRole('button', { name: 'Agregar cuenta' })
  // `getComputedStyle().height` y no `boundingBox()`: el segundo miente
  // mientras algo se escala al entrar (la lección de D-177).
  const addHeight = await add.evaluate((el) => parseFloat(getComputedStyle(el).height))
  expect(addHeight).toBeGreaterThanOrEqual(44)

  await add.click()

  // Los campos del dialogo y sus dos botones.
  for (const label of ['Teléfono', 'Titular', 'Nombre para reconocerla']) {
    const height = await page
      .getByLabel(label)
      .evaluate((el) => parseFloat(getComputedStyle(el).height))
    expect(height, label).toBeGreaterThanOrEqual(44)
  }

  for (const name of ['Cancelar', 'Guardar cuenta']) {
    const height = await page
      .getByRole('button', { name })
      .evaluate((el) => parseFloat(getComputedStyle(el).height))
    expect(height, name).toBeGreaterThanOrEqual(44)
  }
})

test('el dialogo se completa entero, y la cuenta queda en la lista', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/settings/accounts')

  await page.getByRole('button', { name: 'Agregar cuenta' }).click()
  await page.getByLabel('Teléfono').fill('3001112233')
  await page.getByLabel('Titular').fill('Ana Torres')

  // El boton final tiene que estar ALCANZABLE, que es otra cosa que estar
  // visible: el dialogo acota su alto y desplaza por dentro (D-099).
  const submit = page.getByRole('button', { name: 'Guardar cuenta' })
  await submit.scrollIntoViewIfNeeded()
  await submit.click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Nequi · 300 111 2233 · Ana Torres')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('el recordatorio y su vista previa caben en el telefono', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/settings/reminders')

  await page.getByRole('button', { name: 'Crear recordatorio' }).click()
  await expect(page.getByText('Así lo verán en tu grupo')).toBeVisible()
  await expectNoHorizontalOverflow(page)

  const submit = page.getByRole('button', { name: 'Crear recordatorio' }).last()
  await submit.scrollIntoViewIfNeeded()
  await submit.click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Viernes a las 6:00 p. m.')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('«Para enviar ahora» cabe a 320 px, con sus tres botones alcanzables', async ({ page }) => {
  // El mensaje completo con las cuentas es el bloque mas ancho que pinta esta
  // pantalla: si algo se va a desbordar en el telefono, es aqui (D-125).
  const svc = serviceClient()
  await svc.from('seller_payment_accounts').insert({
    organization_id: refs.organizationId,
    seller_id: refs.sellerId,
    kind: 'bank',
    holder_name: 'Ana Torres',
    bank_name: 'Bancolombia',
    account_type: 'savings',
    account_number: '123-456-789',
    sort_order: 1,
  })
  const { data: recordatorio } = await svc
    .from('seller_payment_reminders')
    .insert({
      organization_id: refs.organizationId,
      seller_id: refs.sellerId,
      weekday: 3,
      time_of_day: '19:00:00',
    })
    .select('id')
    .single()
  await svc
    .from('seller_payment_reminders')
    .update({ next_run_at: new Date(Date.now() - 20 * 60_000).toISOString() })
    .eq('id', recordatorio!.id)
  await svc.rpc('process_due_payment_reminders', {})

  await page.setViewportSize({ width: 320, height: 720 })
  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/settings/reminders')

  await expect(page.getByRole('heading', { name: 'Para enviar ahora' })).toBeVisible()
  await expect(page.getByText('• Bancolombia · Ahorros · 123-456-789 · Ana Torres')).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Los tres botones del flujo, en la diana tactil de 44 px. Se miden con
  // `getComputedStyle` y no con `boundingBox()` (D-177).
  for (const name of ['Copiar mensaje', 'Configurar WhatsApp', 'Marcar como atendido']) {
    const height = await page
      .getByRole(name === 'Configurar WhatsApp' ? 'link' : 'button', { name })
      .evaluate((el) => parseFloat(getComputedStyle(el).height))
    expect(height, name).toBeGreaterThanOrEqual(44)
  }
})
