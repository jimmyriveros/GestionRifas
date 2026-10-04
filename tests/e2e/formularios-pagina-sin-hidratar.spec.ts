import { expect, test, type Browser, type Page, type Route } from '@playwright/test'

import {
  createClientFor,
  loadSeedRefs,
  purgeTestData,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, closeClientCreatedDialog, loginAs, unique } from './fixtures'

/**
 * El resto de I-204: los formularios de PÁGINA tampoco envían lo escrito por GET antes de que React
 * los hidrate. Los de acceso y de contraseña los prueba `credenciales-sin-hidratar.spec.ts`.
 *
 * Antes, un `<form onSubmit>` sin `method` caía a su envío NATIVO por GET al pulsar antes de
 * hidratar, y el navegador pedía `/seller/clients/new?name=…&phone=…&email=…`: los datos de un
 * cliente en la barra de direcciones, el historial y los registros. En la edición ni siquiera hace
 * falta escribir: los campos ya traen los datos guardados.
 *
 * Qué formularios y por qué (el HTML del servidor, comprobado en
 * `tests/unit/formularios-pagina-sin-hidratar.test.tsx`):
 *
 *   · cliente (alta y edición): nombre, teléfono, alias, correo y notas → datos personales;
 *   · rifa y boleta (personal): nombre, descripción, precio, fechas y números de la organización;
 *   · la lista general de tramos NO tiene campos con nombre: un envío nativo no llevaría nada;
 *   · «asignar boletas» solo existe dentro de un diálogo cerrado: no está en el HTML del servidor.
 *
 * VALORES SINTÉTICOS en todo envío antes de hidratar. Y como precaución del arnés (I-066), cualquier
 * petición con uno de estos campos en la dirección se ABORTA y se anota —solo los nombres de los
 * parámetros, nunca sus valores—: la prueba falla igual, pero nada llega al servidor.
 */

const SINTETICO = {
  name: 'Cliente Sintético Prueba',
  phone: '3005550199',
  alias: 'Alias sintético',
  email: 'sintetico@ejemplo.test',
  notes: 'Nota sintética',
}
const CAMPOS = [
  'name',
  'phone',
  'alias',
  'email',
  'notes',
  'description',
  'ticketPrice',
  'startDate',
  'endDate',
  'dailyNumber',
  'weeklyNumber',
]
const EN_LA_DIRECCION = new RegExp(`[?&](${CAMPOS.join('|')})=`)
const PREPARANDO = 'Preparando el formulario…'
const SIN_JAVASCRIPT = 'Este formulario necesita JavaScript'
const JAVASCRIPT_DE_LA_APP = /\/_next\/static\/.*\.js(\?.*)?$/

/**
 * El aviso vive dentro de `<noscript>`, y el motor de texto de Playwright NO mira dentro de
 * `<noscript>` (`getByText` no lo encuentra aunque se vea). Por eso se localiza por su sitio.
 */
const avisoSinJavascript = (page: Page) => page.locator('form noscript > div')

type Formulario = {
  nombre: string
  ruta: (refs: Contexto) => string
  cuenta: string
  boton: string
  rellenar: (page: Page) => Promise<void>
  /** El campo donde se pulsa Enter. */
  campoEnter: (page: Page) => ReturnType<Page['getByLabel']>
}

type Contexto = SeedRefs & { clienteId: string }

const FORMULARIOS: Formulario[] = [
  {
    nombre: 'crear un cliente',
    ruta: () => '/seller/clients/new',
    cuenta: ACCOUNTS.seller,
    boton: 'Crear cliente',
    rellenar: async (page) => {
      await page.getByLabel('Nombre').fill(SINTETICO.name)
      await page.getByLabel('Teléfono').fill(SINTETICO.phone)
      await page.getByLabel('Alias (opcional)').fill(SINTETICO.alias)
      await page.getByLabel('Correo (opcional)').fill(SINTETICO.email)
      await page.getByLabel('Notas (opcional)').fill(SINTETICO.notes)
    },
    campoEnter: (page) => page.getByLabel('Nombre'),
  },
  {
    // Sin escribir nada: los campos ya traen los datos guardados del cliente.
    nombre: 'editar un cliente',
    ruta: (refs) => `/seller/clients/${refs.clienteId}/edit`,
    cuenta: ACCOUNTS.seller,
    boton: 'Guardar cambios',
    rellenar: async () => {},
    campoEnter: (page) => page.getByLabel('Alias (opcional)'),
  },
  {
    nombre: 'crear una rifa',
    ruta: () => '/owner/raffles/new',
    cuenta: ACCOUNTS.owner,
    boton: 'Crear rifa',
    rellenar: async (page) => {
      await page.getByLabel('Nombre de la rifa').fill('Rifa sintética de prueba')
      await page.getByLabel('Descripción (opcional)').fill('Descripción sintética')
    },
    campoEnter: (page) => page.getByLabel('Nombre de la rifa'),
  },
  {
    nombre: 'crear una boleta',
    ruta: () => '/owner/tickets/new',
    cuenta: ACCOUNTS.owner,
    boton: 'Crear boleta',
    rellenar: async (page) => {
      await page.getByLabel('Número diario').fill('0001')
      await page.getByLabel('Número semanal').fill('0002')
    },
    campoEnter: (page) => page.getByLabel('Número semanal'),
  },
]

let refs: Contexto
const clientesCreados: string[] = []

test.beforeAll(async () => {
  const seed = await loadSeedRefs()
  const cliente = await createClientFor(seed, unique('Cliente Sintético'))
  clientesCreados.push(cliente.id)
  refs = { ...seed, clienteId: cliente.id }
})

test.afterAll(async () => {
  await purgeTestData({ clientIds: clientesCreados })
})

/** Solo la ruta y los NOMBRES de los parámetros: nunca sus valores. */
function sinValores(url: string): string {
  const parsed = new URL(url)
  return `${parsed.pathname}?${[...parsed.searchParams.keys()].join('&')}`
}

/** Anota y aborta toda petición que lleve un campo del formulario en la dirección. */
async function vigilarFugas(page: Page): Promise<string[]> {
  const fugas: string[] = []
  await page.route(EN_LA_DIRECCION, async (route) => {
    fugas.push(sinValores(route.request().url()))
    await route.abort()
  })
  return fugas
}

/** La sesión de una cuenta del seed, iniciada en un contexto CON JavaScript. */
async function sesionDe(browser: Browser, cuenta: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await loginAs(page, cuenta)
  const state = await context.storageState()
  await context.close()
  return state
}

/**
 * Intenta enviar de las dos formas —clic en el botón y Enter en un campo— y comprueba, después de
 * cada una, que la dirección no cambió y que no salió ninguna petición con datos en ella.
 */
async function intentarEnviar(page: Page, form: Formulario, fugas: string[]) {
  const ruta = new URL(page.url()).pathname
  await form.rellenar(page)
  const boton = page.getByRole('button', { name: new RegExp(`^(${form.boton}|${PREPARANDO})$`) })

  // `force`: así toca una persona un botón desactivado; sin él, Playwright esperaría a que se active.
  await boton.click({ force: true })
  await page.waitForTimeout(800)
  expect(fugas, 'el clic no debe mandar nada en la dirección').toEqual([])
  expect(sinValores(page.url())).toBe(`${ruta}?`)

  await form.campoEnter(page).press('Enter')
  await page.waitForTimeout(800)
  expect(fugas, 'Enter no debe mandar nada en la dirección').toEqual([])
  expect(sinValores(page.url())).toBe(`${ruta}?`)

  await expect(boton).toBeDisabled()
}

test.describe('I-204, formularios de página: sin JavaScript, nada viaja en la dirección', () => {
  for (const form of FORMULARIOS) {
    test(`${form.nombre}: ni el clic ni Enter envían nada, el botón está desactivado y se explica`, async ({
      browser,
    }) => {
      const storageState = await sesionDe(browser, form.cuenta)
      const context = await browser.newContext({ javaScriptEnabled: false, storageState })
      const page = await context.newPage()
      const fugas = await vigilarFugas(page)
      await page.goto(form.ruta(refs))

      await intentarEnviar(page, form, fugas)
      await expect(avisoSinJavascript(page)).toBeVisible()
      await expect(avisoSinJavascript(page)).toContainText(SIN_JAVASCRIPT)
      // Sin JavaScript el botón no dice «Preparando…»: nunca va a estar listo, y el aviso lo explica.
      await expect(page.getByRole('button', { name: form.boton, exact: true })).toBeDisabled()
      await context.close()
    })
  }

  test('la lista general de tramos no tiene campos con nombre: un envío nativo no llevaría nada', async ({
    browser,
  }) => {
    const storageState = await sesionDe(browser, ACCOUNTS.owner)
    const context = await browser.newContext({ javaScriptEnabled: false, storageState })
    const page = await context.newPage()
    await page.goto('/owner/settings/earnings')
    const form = page.locator('form')
    await expect(form).toHaveCount(1)
    await expect(form.locator('[name]')).toHaveCount(0)
    await context.close()
  })

  test('«asignar a un cliente» vive en un diálogo cerrado: no está en el HTML del servidor', async ({
    browser,
  }) => {
    const { data: disponible } = await serviceClient()
      .from('tickets')
      .select('id')
      .eq('seller_id', refs.sellerId)
      .eq('inventory_status', 'available')
      .limit(1)
      .single()
    const storageState = await sesionDe(browser, ACCOUNTS.seller)
    const context = await browser.newContext({ javaScriptEnabled: false, storageState })
    const page = await context.newPage()
    await page.goto(`/seller/tickets/${disponible!.id}`)
    await expect(page.getByRole('button', { name: 'Asignar a un cliente' })).toBeVisible()
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('input[name], textarea[name]')).toHaveCount(0)
    await context.close()
  })
})

test.describe('I-204, formularios de página: con el JavaScript perdido o retrasado', () => {
  const CREAR_CLIENTE = FORMULARIOS[0]!

  // En un build de producción, `loginAs` registra el service worker y este sirve `/_next/static/…` desde su
  // caché: Playwright no intercepta lo que sirve un service worker, así que la ruta que retiene el JavaScript no
  // retendría nada y el formulario se hidrataría (medido el 2026-10-04: Enter creaba el cliente). Sin service
  // worker, la prueba es lo que dice ser —una primera visita en la que el JavaScript no llega—, en desarrollo y
  // en producción.
  test.use({ serviceWorkers: 'block' })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('si el JavaScript no llega, el botón dice que se está preparando y nada se envía', async ({
    page,
  }) => {
    const fugas = await vigilarFugas(page)
    await page.route(JAVASCRIPT_DE_LA_APP, (route) => route.abort())
    await page.goto(CREAR_CLIENTE.ruta(refs), { waitUntil: 'domcontentloaded' })

    await intentarEnviar(page, CREAR_CLIENTE, fugas)
    await expect(page.getByRole('button', { name: PREPARANDO })).toBeDisabled()
    // Con JavaScript activado el aviso de `<noscript>` no se pinta: el botón ya dice lo que pasa.
    await expect(avisoSinJavascript(page)).toBeHidden()
  })

  test('si el JavaScript llega tarde, antes no se envía nada y después se crea el cliente', async ({
    page,
  }) => {
    const fugas = await vigilarFugas(page)
    const retenidas: Route[] = []
    let soltar = false
    await page.route(JAVASCRIPT_DE_LA_APP, async (route) => {
      if (soltar) return route.continue()
      retenidas.push(route)
    })
    await page.goto(CREAR_CLIENTE.ruta(refs), { waitUntil: 'domcontentloaded' })
    await intentarEnviar(page, CREAR_CLIENTE, fugas)

    soltar = true
    for (const route of retenidas.splice(0)) await route.continue()
    const crear = page.getByRole('button', { name: CREAR_CLIENTE.boton, exact: true })
    await expect(crear).toBeEnabled({ timeout: 30_000 })

    // Funcionamiento normal, con un cliente sintético y con Enter.
    const nombre = unique('Cliente Sintético')
    await page.getByLabel('Nombre').fill(nombre)
    await page.getByLabel('Teléfono').fill(SINTETICO.phone)
    await page.getByLabel('Nombre').press('Enter')
    await closeClientCreatedDialog(page)
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)
    clientesCreados.push(new URL(page.url()).pathname.split('/').pop()!)
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible()
    expect(fugas).toEqual([])
  })
})

test.describe('I-204, formularios de página: con el formulario listo, todo funciona como siempre', () => {
  test('editar un cliente guarda y vuelve a su ficha', async ({ page }) => {
    const fugas = await vigilarFugas(page)
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${refs.clienteId}/edit`)
    const alias = unique('Alias sintético')
    await page.getByLabel('Alias (opcional)').fill(alias)
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await page.waitForURL(new RegExp(`/seller/clients/${refs.clienteId}$`))
    await expect(page.getByText(alias)).toBeVisible()
    expect(fugas).toEqual([])
  })

  test('la rifa valida en el navegador sin enviar nada', async ({ page }) => {
    const fugas = await vigilarFugas(page)
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/raffles/new')
    await page.getByLabel('Nombre de la rifa').fill('')
    await page.getByRole('button', { name: 'Crear rifa', exact: true }).click()
    await expect(page.getByLabel('Nombre de la rifa')).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/\/owner\/raffles\/new$/)
    expect(fugas).toEqual([])
  })

  test('la boleta valida en el navegador sin enviar nada', async ({ page }) => {
    const fugas = await vigilarFugas(page)
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets/new')
    // El campo solo admite cifras: sin ninguna, la boleta no está completa.
    await page.getByLabel('Número semanal').fill('0002')
    await page.getByRole('button', { name: 'Crear boleta', exact: true }).click()
    await expect(page.getByLabel('Número diario')).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/\/owner\/tickets\/new$/)
    expect(fugas).toEqual([])
  })
})
