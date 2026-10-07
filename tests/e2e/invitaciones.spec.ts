import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { LOCAL_ANON_KEY, LOCAL_URL, loadSeedRefs, purgeSellers, serviceClient } from './db-setup'
import { ACCOUNTS, expectToast, loginAs } from './fixtures'
import { mailIds, waitForMail } from './mailpit'

/**
 * I-206, D-254: el alta de personas sigue funcionando con el registro público cerrado.
 *
 * Con la pila local configurada como debe quedar producción (`supabase/config.toml`): registro
 * público cerrado, plantillas en español con el enlace a `/auth/confirm` y Mailpit como servidor
 * de correo. Cada enlace se abre en OTRO navegador —un contexto nuevo, sin cookies— que el que
 * provocó el correo: así lo abre de verdad un vendedor, desde su teléfono.
 *
 * Antes de D-254, el enlace de la invitación y el de «Reenviar acceso por correo» acababan en
 * «El enlace no es válido o ya expiró» (la sesión llegaba en el fragmento), y el de «¿Olvidaste tu
 * contraseña?» solo servía en el mismo navegador que lo pidió (código PKCE).
 *
 * Cuentas ficticias `@demo.test`, borradas al terminar (I-035). Ninguna toca producción.
 */

test.describe.configure({ mode: 'serial' })

const ORIGIN = 'http://localhost:3000'
const CONFIRM_LINK =
  /^http:\/\/localhost:3000\/auth\/confirm\?token_hash=[^&\s]+&type=(invite|recovery)$/
const EXPIRED = 'El enlace no es válido o ya expiró. Solicítalo nuevamente.'

/** Correos creados por esta suite. */
const created: string[] = []
const stamp = Date.now().toString(36)

function newEmail(prefix: string): string {
  const email = `${prefix}-${stamp}${created.length}@demo.test`
  created.push(email)
  return email
}

/** Contraseñas de prueba de esta suite, solo locales. */
function testPassword(n: number): string {
  return `Invitacion-${stamp}-${n}`
}

test.afterAll(async () => {
  const svc = serviceClient()
  const { data } = await svc.from('profiles').select('id').in('email', created)
  const ids = (data ?? []).map((fila) => fila.id)
  if (ids.length > 0) await purgeSellers(ids)
  // También las cuentas de Auth sin perfil, si alguna llegara a quedar.
  const { data: users } = await svc.auth.admin.listUsers({ perPage: 1000 })
  for (const user of users.users.filter((u) => u.email && created.includes(u.email))) {
    const { error } = await svc.auth.admin.deleteUser(user.id)
    if (error) throw new Error(`No se pudo borrar la cuenta ${user.id}: ${error.message}`)
  }
})

/** Abre el enlace del correo en un navegador nuevo y lo deja en «Nueva contraseña». */
async function openLink(
  browser: Browser,
  link: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(link)
  return { ctx, page }
}

/**
 * Define la contraseña desde «Nueva contraseña» y vuelve a entrar con ella.
 *
 * Al guardar, la persona ya tiene la sesión que abrió el enlace: `/login?message=password_updated`
 * la lleva directamente a su panel, como antes de D-254. Para comprobar la contraseña se sale de
 * esa sesión y se ingresa otra vez.
 */
async function choosePasswordAndLogin(page: Page, email: string, password: string): Promise<void> {
  await page.waitForURL(`${ORIGIN}/reset-password`)
  await page.getByLabel('Nueva contraseña').fill(password)
  await page.getByLabel('Confirmar contraseña').fill(password)
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
  await page.waitForURL(`${ORIGIN}/seller/dashboard`)

  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(`${ORIGIN}/seller/dashboard`)
}

/** La cuenta tiene EXACTAMENTE la membresía que le dio quien la invitó, y nada más. */
async function expectOnlyMembership(
  email: string,
  expected: { parentSellerId: string | null },
): Promise<void> {
  const refs = await loadSeedRefs()
  const svc = serviceClient()
  const { data: profile } = await svc
    .from('profiles')
    .select('id, activated_at')
    .eq('email', email)
    .single()
  expect(profile?.activated_at, 'definir la contraseña activa la cuenta (BR-E14)').toBeTruthy()

  const { data: memberships } = await svc
    .from('memberships')
    .select('organization_id, role, is_active, parent_seller_id')
    .eq('profile_id', profile!.id)
  expect(memberships).toEqual([
    {
      organization_id: refs.organizationId,
      role: 'seller',
      is_active: true,
      parent_seller_id: expected.parentSellerId,
    },
  ])
}

/** Con la sesión de la cuenta nueva, el portal administrativo sigue cerrado (BR-A08). */
async function expectStaffPortalDenied(page: Page): Promise<void> {
  await page.goto('/owner/dashboard')
  await page.waitForURL(/\/denied/)
}

test.describe('I-206: registro público cerrado', () => {
  test('un alta con la clave pública se rechaza y no crea nada', async () => {
    const email = newEmail('alta-publica')
    const res = await fetch(`${LOCAL_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: testPassword(0) }),
    })
    expect(res.status).toBe(422)
    expect(((await res.json()) as { error_code?: string }).error_code).toBe('signup_disabled')

    const { data } = await serviceClient().from('profiles').select('id').eq('email', email)
    expect(data).toEqual([])
  })
})

test.describe('I-206: las dos vías de invitación', () => {
  test('el personal invita a un vendedor y este define su contraseña desde otro navegador', async ({
    page,
    browser,
  }) => {
    const email = newEmail('inv-personal')
    const name = `Invitado Personal ${stamp}`

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/sellers')
    const before = await mailIds()
    await page.getByRole('button', { name: 'Nuevo vendedor' }).click()
    await page.getByLabel('Nombre completo').fill(name)
    await page.getByLabel('Teléfono').fill('3009998877')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByRole('button', { name: 'Enviar invitación' }).click()
    await expectToast(page, /Invitación enviada/)

    const mail = await waitForMail(email, before)
    expect(mail.subject).toBe('Tu invitación a Rifas')
    const link = mail.links.find((l) => l.includes('/auth/confirm'))
    expect(link).toMatch(CONFIRM_LINK)
    expect(link).toContain('&type=invite')

    const invited = await openLink(browser, link!)
    await choosePasswordAndLogin(invited.page, email, testPassword(1))
    await expectStaffPortalDenied(invited.page)
    await expectOnlyMembership(email, { parentSellerId: null })

    // El mismo enlace, otra vez: ya no sirve.
    const again = await openLink(browser, link!)
    await again.page.waitForURL(/\/login\?error=auth_callback/)
    await expect(again.page.getByText(EXPIRED)).toBeVisible()
    await again.ctx.close()
    await invited.ctx.close()

    // Y en la lista del personal ya no es una invitación pendiente.
    await page.reload()
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row.getByText('Cuenta activa')).toBeVisible()
  })

  test('un vendedor agrega a su equipo y el integrante define su contraseña', async ({
    page,
    browser,
  }) => {
    const email = newEmail('inv-equipo')
    const refs = await loadSeedRefs()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/team')
    const before = await mailIds()
    await page.getByRole('button', { name: 'Agregar vendedor' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nombre completo').fill(`Integrante Invitado ${stamp}`)
    await dialog.getByLabel('Teléfono').fill('3001234567')
    await dialog.getByLabel('Correo electrónico').fill(email)
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click()
    await expectToast(page, /Ya está en tu equipo/i)

    const mail = await waitForMail(email, before)
    expect(mail.subject).toBe('Tu invitación a Rifas')
    const link = mail.links.find((l) => l.includes('/auth/confirm'))
    expect(link).toMatch(CONFIRM_LINK)

    const invited = await openLink(browser, link!)
    await choosePasswordAndLogin(invited.page, email, testPassword(2))
    await expectStaffPortalDenied(invited.page)
    await expectOnlyMembership(email, { parentSellerId: refs.sellerId })
    await invited.ctx.close()
  })
})

test.describe('I-206: elegir la contraseña sin haber entrado nunca, o recuperarla', () => {
  test('«Reenviar acceso por correo» del personal lleva a definir la contraseña', async ({
    page,
    browser,
  }) => {
    const email = newEmail('inv-reenvio')
    const name = `Invitado Reenvio ${stamp}`

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/sellers')
    let before = await mailIds()
    await page.getByRole('button', { name: 'Nuevo vendedor' }).click()
    await page.getByLabel('Nombre completo').fill(name)
    await page.getByLabel('Teléfono').fill('3007776655')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByRole('button', { name: 'Enviar invitación' }).click()
    await expectToast(page, /Invitación enviada/)
    await waitForMail(email, before)

    before = await mailIds()
    const row = page.getByRole('row').filter({ hasText: name })
    await row.getByRole('button', { name: `Acciones para ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Reenviar acceso por correo' }).click()
    await expectToast(page, new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    const mail = await waitForMail(email, before)
    expect(mail.subject).toBe('Elige tu contraseña de Rifas')
    const link = mail.links.find((l) => l.includes('/auth/confirm'))
    expect(link).toMatch(CONFIRM_LINK)
    expect(link).toContain('&type=recovery')

    const invited = await openLink(browser, link!)
    await choosePasswordAndLogin(invited.page, email, testPassword(3))
    await expectOnlyMembership(email, { parentSellerId: null })
    await invited.ctx.close()
  })

  test('«¿Olvidaste tu contraseña?» funciona aunque el correo se abra en otro navegador', async ({
    page,
    browser,
  }) => {
    // Una cuenta propia con contraseña, para no tocar las del seed.
    const email = newEmail('recupera')
    const refs = await loadSeedRefs()
    const svc = serviceClient()
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password: testPassword(4),
      email_confirm: true,
      user_metadata: { full_name: 'Recupera Prueba', phone: '3001234567' },
    })
    if (error) throw new Error(error.message)
    const { error: membershipError } = await svc.from('memberships').insert({
      organization_id: refs.organizationId,
      profile_id: data.user.id,
      role: 'seller',
    })
    if (membershipError) throw new Error(membershipError.message)

    const before = await mailIds()
    await page.goto('/forgot-password')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click()
    await expect(page.getByText(/te enviamos un enlace/i)).toBeVisible()

    const mail = await waitForMail(email, before)
    expect(mail.subject).toBe('Elige tu contraseña de Rifas')
    const link = mail.links.find((l) => l.includes('/auth/confirm'))
    expect(link).toMatch(CONFIRM_LINK)

    const other = await openLink(browser, link!)
    await choosePasswordAndLogin(other.page, email, testPassword(5))
    await other.ctx.close()

    // La contraseña anterior ya no sirve.
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña').fill(testPassword(4))
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.getByText(/correo o contraseña incorrectos/i)).toBeVisible()
  })
})
