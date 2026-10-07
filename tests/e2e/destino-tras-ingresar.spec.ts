import { expect, test, type Page } from '@playwright/test'

import { loadSeedRefs, purgeSellers, serviceClient } from './db-setup'
import { SEED_PASSWORD } from './fixtures'

/**
 * D-253: el destino después de ingresar (`next`) no puede sacar a nadie de Rifas.
 *
 * Con un navegador real y la base local: el formulario de `/login` con un `next` manipulado, la
 * vuelta legítima a la pantalla que se pidió sin sesión y el callback de Auth con un código PKCE
 * de verdad —el del flujo «¿Olvidaste tu contraseña?», leído del correo en Mailpit—.
 *
 * El dominio ficticio `evil.test` no se resuelve nunca: toda petición hacia él la contesta la
 * propia prueba y queda anotada. Si el destino se escapa, la prueba lo dice con su dirección.
 *
 * La cuenta es propia de la suite y se borra al terminar (I-035). Sin datos de clientes.
 */

const ORIGIN = 'http://localhost:3000'
const MAILPIT = 'http://127.0.0.1:54324'
const EVIL = /^https?:\/\/evil\.test(?::\d+)?\//

test.describe.configure({ mode: 'serial' })

let email: string
let profileId: string

test.beforeAll(async () => {
  const refs = await loadSeedRefs()
  const svc = serviceClient()
  email = `destino-${Date.now().toString(36)}@demo.test`
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Destino Prueba', phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear la cuenta de prueba: ${error.message}`)
  profileId = data.user.id
  const { error: membershipError } = await svc.from('memberships').insert({
    organization_id: refs.organizationId,
    profile_id: profileId,
    role: 'seller',
  })
  if (membershipError) throw new Error(membershipError.message)
})

test.afterAll(async () => {
  if (!profileId) return
  await purgeSellers([profileId])
  const { error } = await serviceClient().auth.admin.deleteUser(profileId)
  if (error) throw new Error(`No se pudo borrar la cuenta ${profileId}: ${error.message}`)
})

/** Contesta toda petición a `evil.test` y devuelve la lista de las que hubo. */
async function watchEscapes(page: Page): Promise<string[]> {
  const escapes: string[] = []
  await page.context().route(EVIL, async (route) => {
    escapes.push(route.request().url())
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Fuera de Rifas</h1>' })
  })
  return escapes
}

async function submitLogin(page: Page): Promise<void> {
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
}

/** Espera a que la página llegue a Rifas o se escape a `evil.test`, lo que pase primero. */
async function settle(page: Page, pathname: string): Promise<void> {
  await page.waitForURL((url) => url.pathname === pathname || url.hostname === 'evil.test')
}

test.describe('D-253: ingresar con un `next` manipulado', () => {
  for (const [nombre, next] of [
    ['barra invertida', '/\\evil.test/path'],
    ['tabulador', '/\t/evil.test/path'],
  ] as const) {
    test(`${nombre}: entra a su panel y no sale de Rifas`, async ({ page }) => {
      const escapes = await watchEscapes(page)
      await page.goto(`/login?next=${encodeURIComponent(next)}`)
      await submitLogin(page)
      await settle(page, '/seller/dashboard')

      expect(escapes, 'el navegador salió hacia otro sitio').toEqual([])
      expect(page.url()).toBe(`${ORIGIN}/seller/dashboard`)
    })
  }

  test('una pantalla pedida sin sesión se abre después de ingresar', async ({ page }) => {
    await page.goto('/seller/clients')
    await page.waitForURL(/\/login\?next=%2Fseller%2Fclients$/)
    await submitLogin(page)
    await page.waitForURL(`${ORIGIN}/seller/clients`)
    await expect(page.getByRole('heading', { name: 'Mis clientes' })).toBeVisible()
  })

  test('un destino con búsqueda y fragmento se conserva entero', async ({ page }) => {
    await page.goto(`/login?next=${encodeURIComponent('/seller/clients?q=Destino#lista')}`)
    await submitLogin(page)
    await page.waitForURL((url) => url.pathname === '/seller/clients')
    const url = new URL(page.url())
    expect(url.searchParams.get('q')).toBe('Destino')
    expect(url.hash).toBe('#lista')
  })
})

/** Pide la recuperación por la interfaz y devuelve el `code` PKCE del enlace del correo. */
async function recoveryCode(page: Page): Promise<string> {
  const before = await mailIds()
  await page.goto('/forgot-password')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click()
  await expect(page.getByText(/te enviamos un enlace/i)).toBeVisible()

  let link: string | undefined
  await expect
    .poll(
      async () => {
        link = (await newLinks(before)).find((l) => l.includes('/auth/v1/verify'))
        return Boolean(link)
      },
      { timeout: 15_000, message: 'no llegó el correo de recuperación a Mailpit' },
    )
    .toBe(true)

  // Abrir el enlace en Auth devuelve la redirección con el código; se lee sin seguirla.
  const response = await fetch(link!, { redirect: 'manual' })
  const location = response.headers.get('location') ?? ''
  const code = new URL(location).searchParams.get('code')
  expect(code, `Auth no devolvió un código: ${location.split('#')[0]}`).toBeTruthy()
  return code!
}

async function mailIds(): Promise<Set<string>> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`)
  const body = (await res.json()) as { messages: { ID: string }[] }
  return new Set(body.messages.map((m) => m.ID))
}

async function newLinks(before: Set<string>): Promise<string[]> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`)
  const body = (await res.json()) as { messages: { ID: string; To: { Address: string }[] }[] }
  const links: string[] = []
  for (const m of body.messages) {
    if (before.has(m.ID) || !m.To.some((t) => t.Address === email)) continue
    const full = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
      Text: string
    }
    for (const match of full.Text.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
      links.push(match[0].replaceAll('&amp;', '&'))
    }
  }
  return links
}

test.describe('D-253: el callback de Auth con un código real', () => {
  test('con `next=/reset-password` abre «Nueva contraseña», como la recuperación', async ({
    page,
  }) => {
    const code = await recoveryCode(page)
    await page.goto(`/auth/callback?code=${encodeURIComponent(code)}&next=%2Freset-password`)
    await page.waitForURL(`${ORIGIN}/reset-password`)
    await expect(page.getByLabel('Nueva contraseña')).toBeVisible()
  })

  test('con un `next` manipulado vuelve a Rifas, a su panel', async ({ page }) => {
    const escapes = await watchEscapes(page)
    const code = await recoveryCode(page)
    await page.goto(
      `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent('/\\evil.test/path')}`,
    )
    // La portada lleva a cada quien a su panel.
    await settle(page, '/seller/dashboard')
    expect(escapes, 'el navegador salió hacia otro sitio').toEqual([])
    expect(page.url()).toBe(`${ORIGIN}/seller/dashboard`)
  })
})
