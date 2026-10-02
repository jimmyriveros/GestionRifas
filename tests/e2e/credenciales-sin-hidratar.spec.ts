import { expect, test, type Browser, type Page, type Route } from '@playwright/test'

import { ACCOUNTS, loginAs, SEED_PASSWORD } from './fixtures'

/**
 * I-204 (D-247): ningún formulario de acceso o de contraseña envía lo escrito por GET antes de que
 * React lo hidrate.
 *
 * Antes, un `<form onSubmit>` sin `method` caía a su envío NATIVO por GET al pulsar antes de
 * hidratar, y el navegador pedía `/login?email=…&password=…`: la contraseña en la barra de
 * direcciones, el historial y los registros (I-066 lo sufrió con la cuenta de demostración). Ahora
 * el HTML del servidor ya trae la protección —`method="post"` y el botón desactivado hasta
 * hidratar— y el botón dice que el formulario se está preparando. Lo que no necesita navegador lo
 * comprueba `tests/unit/auth-forms-sin-hidratar.test.tsx`.
 *
 * VALORES FICTICIOS en todo envío antes de hidratar: no son credenciales de nadie. Y como
 * precaución del arnés (I-066), cualquier petición con un campo sensible en la dirección se ABORTA
 * y se anota —solo los nombres de los parámetros, nunca sus valores—: la prueba falla igual, pero
 * nada llega al servidor.
 */

const FICTICIO = { email: 'ficticio@ejemplo.test', password: 'valor-ficticio-123' }
const SENSIBLE = /[?&](email|password|confirmPassword)=/i
const PREPARANDO = 'Preparando el formulario…'
const SIN_JAVASCRIPT = 'Este formulario necesita JavaScript'
const JAVASCRIPT_DE_LA_APP = /\/_next\/static\/.*\.js(\?.*)?$/

/**
 * El aviso vive dentro de `<noscript>`, y el motor de texto de Playwright NO mira dentro de
 * `<noscript>` (`getByText` no lo encuentra aunque se vea). Por eso se localiza por su sitio.
 */
const avisoSinJavascript = (page: Page) => page.locator('noscript > div')

type Formulario = {
  nombre: string
  ruta: string
  boton: string
  rellenar: (page: Page) => Promise<void>
  /** El campo donde se pulsa Enter. */
  campoEnter: (page: Page) => ReturnType<Page['getByLabel']>
  conSesion: boolean
}

const INGRESAR: Formulario = {
  nombre: 'ingresar',
  ruta: '/login',
  boton: 'Ingresar',
  rellenar: async (page) => {
    await page.getByLabel('Correo electrónico').fill(FICTICIO.email)
    await page.getByLabel('Contraseña').fill(FICTICIO.password)
  },
  campoEnter: (page) => page.getByLabel('Contraseña'),
  conSesion: false,
}

const FORMULARIOS: Formulario[] = [
  INGRESAR,
  {
    nombre: 'recuperar la contraseña',
    ruta: '/forgot-password',
    boton: 'Enviar enlace de recuperación',
    rellenar: async (page) => {
      await page.getByLabel('Correo electrónico').fill(FICTICIO.email)
    },
    campoEnter: (page) => page.getByLabel('Correo electrónico'),
    conSesion: false,
  },
  {
    nombre: 'definir la contraseña',
    ruta: '/reset-password',
    boton: 'Guardar nueva contraseña',
    rellenar: async (page) => {
      await page.getByLabel('Nueva contraseña').fill(FICTICIO.password)
      await page.getByLabel('Confirmar contraseña').fill(FICTICIO.password)
    },
    campoEnter: (page) => page.getByLabel('Confirmar contraseña'),
    conSesion: true,
  },
  {
    nombre: 'cambiar la contraseña',
    ruta: '/account/password',
    boton: 'Cambiar contraseña',
    rellenar: async (page) => {
      await page.getByLabel('Nueva contraseña').fill(FICTICIO.password)
      await page.getByLabel('Confirmar contraseña').fill(FICTICIO.password)
    },
    campoEnter: (page) => page.getByLabel('Confirmar contraseña'),
    conSesion: true,
  },
]

/** Solo la ruta y los NOMBRES de los parámetros: nunca sus valores. */
function sinValores(url: string): string {
  const parsed = new URL(url)
  return `${parsed.pathname}?${[...parsed.searchParams.keys()].join('&')}`
}

/** Anota y aborta toda petición que lleve un campo sensible en la dirección. */
async function vigilarFugas(page: Page): Promise<string[]> {
  const fugas: string[] = []
  await page.route(SENSIBLE, async (route) => {
    fugas.push(sinValores(route.request().url()))
    await route.abort()
  })
  return fugas
}

/** La sesión de un vendedor del seed, iniciada en un contexto CON JavaScript. */
async function sesionDeVendedor(browser: Browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await loginAs(page, ACCOUNTS.seller)
  const state = await context.storageState()
  await context.close()
  return state
}

/**
 * Intenta enviar de las dos formas —clic en el botón y Enter en un campo— y comprueba, después de
 * cada una, que la dirección no cambió y que no salió ninguna petición con datos en ella.
 */
async function intentarEnviar(page: Page, form: Formulario, fugas: string[]) {
  await form.rellenar(page)
  const boton = page.getByRole('button', { name: new RegExp(`^(${form.boton}|${PREPARANDO})$`) })

  // `force`: así toca una persona un botón desactivado; sin él, Playwright esperaría a que se active.
  await boton.click({ force: true })
  await page.waitForTimeout(800)
  expect(fugas, 'el clic no debe mandar nada en la dirección').toEqual([])
  expect(sinValores(page.url())).toBe(`${form.ruta}?`)

  await form.campoEnter(page).press('Enter')
  await page.waitForTimeout(800)
  expect(fugas, 'Enter no debe mandar nada en la dirección').toEqual([])
  expect(sinValores(page.url())).toBe(`${form.ruta}?`)

  await expect(boton).toBeDisabled()
}

test.describe('I-204: sin JavaScript, nada viaja en la dirección', () => {
  for (const form of FORMULARIOS) {
    test(`${form.nombre}: ni el clic ni Enter envían nada, el botón está desactivado y se explica`, async ({
      browser,
    }) => {
      const storageState = form.conSesion ? await sesionDeVendedor(browser) : undefined
      const context = await browser.newContext({ javaScriptEnabled: false, storageState })
      const page = await context.newPage()
      const fugas = await vigilarFugas(page)
      await page.goto(form.ruta)

      await intentarEnviar(page, form, fugas)
      await expect(avisoSinJavascript(page)).toBeVisible()
      await expect(avisoSinJavascript(page)).toContainText(SIN_JAVASCRIPT)
      // `<noscript>` es en línea: sin su propio margen, el aviso quedaba pegado al botón.
      const aviso = await avisoSinJavascript(page).boundingBox()
      const enviar = await page.locator('button[type="submit"]').boundingBox()
      expect(enviar!.y - (aviso!.y + aviso!.height)).toBeGreaterThanOrEqual(12)
      // Sin JavaScript el botón no dice «Preparando…»: nunca va a estar listo, y el aviso lo explica.
      await expect(page.getByRole('button', { name: form.boton, exact: true })).toBeDisabled()
      await context.close()
    })
  }
})

test.describe('I-204: con el JavaScript perdido o retrasado', () => {
  test('si el JavaScript no llega, el botón dice que se está preparando y nada se envía', async ({
    page,
  }) => {
    const fugas = await vigilarFugas(page)
    await page.route(JAVASCRIPT_DE_LA_APP, (route) => route.abort())
    await page.goto(INGRESAR.ruta, { waitUntil: 'domcontentloaded' })

    await intentarEnviar(page, INGRESAR, fugas)
    await expect(page.getByRole('button', { name: PREPARANDO })).toBeDisabled()
    // Con JavaScript activado el aviso de `<noscript>` no se pinta: el botón ya dice lo que pasa.
    await expect(avisoSinJavascript(page)).toBeHidden()
  })

  test('si el JavaScript llega tarde, antes no se envía nada y después se entra con normalidad', async ({
    page,
  }) => {
    const fugas = await vigilarFugas(page)
    const retenidas: Route[] = []
    let soltar = false
    await page.route(JAVASCRIPT_DE_LA_APP, async (route) => {
      if (soltar) return route.continue()
      retenidas.push(route)
    })
    await page.goto(INGRESAR.ruta, { waitUntil: 'domcontentloaded' })
    await intentarEnviar(page, INGRESAR, fugas)

    soltar = true
    for (const route of retenidas.splice(0)) await route.continue()
    await expect(page.getByRole('button', { name: INGRESAR.boton, exact: true })).toBeEnabled({
      timeout: 30_000,
    })

    // Funcionamiento normal, con la cuenta de desarrollo del seed y con Enter.
    await page.getByLabel('Correo electrónico').fill(ACCOUNTS.seller)
    await page.getByLabel('Contraseña').fill(SEED_PASSWORD)
    await page.getByLabel('Contraseña').press('Enter')
    await page.waitForURL(/\/seller\/dashboard/)
    expect(fugas).toEqual([])
  })
})

test.describe('I-204: con el formulario listo, todo funciona como siempre', () => {
  test('ingresar con clic lleva al panel', async ({ page }) => {
    const fugas = await vigilarFugas(page)
    await loginAs(page, ACCOUNTS.seller)
    expect(fugas).toEqual([])
  })

  test('recuperar la contraseña sigue mostrando su confirmación', async ({ page }) => {
    const fugas = await vigilarFugas(page)
    await page.goto('/forgot-password')
    await page.getByLabel('Correo electrónico').fill(FICTICIO.email)
    await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click()
    await expect(page.getByText('Si el correo está registrado')).toBeVisible()
    expect(fugas).toEqual([])
  })

  test('cambiar la contraseña valida en el navegador sin enviar nada', async ({ page }) => {
    const fugas = await vigilarFugas(page)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/account/password')
    await page.getByLabel('Nueva contraseña').fill(FICTICIO.password)
    await page.getByLabel('Confirmar contraseña').fill(`${FICTICIO.password}-distinta`)
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click()
    await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible()
    await expect(page).toHaveURL(/\/account\/password$/)
    expect(fugas).toEqual([])
  })
})
