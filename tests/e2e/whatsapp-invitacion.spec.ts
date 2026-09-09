import { expect, test, type Page } from '@playwright/test'

import { createTicket, loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Invitacion al grupo de WhatsApp de un cliente nuevo (BR-W01..BR-W08, D-176).
 *
 * Lo que se prueba aqui es lo que solo se ve en un navegador de verdad: que el
 * dialogo NO se cierra sin querer, que dice cosas distintas en cada flujo, y
 * que el enlace que sale lleva el telefono y el mensaje que tiene que llevar.
 *
 * NO SE ABRE WHATSAPP EN NINGUNA PRUEBA. Se intercepta la ventana nueva y se
 * comprueba su direccion: abrirla de verdad sacaria a la prueba de la
 * aplicacion y dependeria de una web de terceros.
 */

const GROUP_URL = 'https://chat.whatsapp.com/E2Eabc123456'

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/** Deja la configuracion como estaba: otras pruebas comparten este vendedor. */
test.afterAll(async () => {
  await serviceClient()
    .from('memberships')
    .update({
      whatsapp_group_url: null,
      whatsapp_use_custom_message: false,
      whatsapp_custom_message: null,
    })
    .eq('profile_id', refs.sellerId)
})

/** Escribe la configuracion del vendedor directamente, para partir de ahi. */
async function setGroup(groupUrl: string | null): Promise<void> {
  await serviceClient()
    .from('memberships')
    .update({
      whatsapp_group_url: groupUrl,
      whatsapp_use_custom_message: false,
      whatsapp_custom_message: null,
    })
    .eq('profile_id', refs.sellerId)
}

/**
 * Sustituye `window.open` por un espia, y devuelve como leer lo que abrio.
 *
 * NO SE ABRE WHATSAPP DE VERDAD, y no es por comodidad: `wa.me` es una web de
 * terceros, la prueba no tiene por que tener internet, y esperar a que una
 * navegacion externa se confirme es justo lo que hacia fallar la version
 * anterior de esta prueba —`popup.url()` devolvia `about:blank` porque la
 * navegacion nunca llegaba a comprometerse—.
 *
 * El doble devuelve un objeto, no `null`: si devolviera `null`, la aplicacion
 * creeria que el navegador bloqueo la ventana y mostraria el aviso, que es
 * otro camino distinto del que esta prueba quiere recorrer.
 */
async function spyOnWindowOpen(page: Page): Promise<() => Promise<string | null>> {
  await page.addInitScript(() => {
    const target = window as unknown as { __openedUrl?: string; open: unknown }
    target.open = (url?: string | URL) => {
      target.__openedUrl = String(url ?? '')
      return {} as Window
    }
  })
  return () =>
    page.evaluate(() => (window as unknown as { __openedUrl?: string }).__openedUrl ?? null)
}

/** Registra un cliente desde «Mis clientes» y deja el dialogo abierto. */
async function createClientFromForm(page: Page, name: string, phone: string): Promise<void> {
  await page.goto('/seller/clients/new')
  await page.getByLabel('Nombre').fill(name)
  await page.getByLabel('Teléfono').fill(phone)
  await page.getByRole('button', { name: 'Crear cliente' }).click()
}

test.describe('Configuración del grupo', () => {
  test.beforeEach(async ({ page }) => {
    await setGroup(null)
    await loginAs(page, ACCOUNTS.seller)
  })

  test('se llega desde el menú del avatar, se guarda y persiste al recargar', async ({ page }) => {
    await page.goto('/seller/dashboard')
    await page.getByRole('button', { name: /Menú de usuario/ }).click()
    await page.getByRole('menuitem', { name: 'Configuración' }).click()

    await page.waitForURL('/seller/settings')
    await expect(page.getByRole('heading', { name: 'Grupo de WhatsApp' })).toBeVisible()

    await page.getByLabel('Enlace del grupo de WhatsApp').fill(GROUP_URL)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, 'Los cambios fueron guardados.')

    await page.reload()
    await expect(page.getByLabel('Enlace del grupo de WhatsApp')).toHaveValue(GROUP_URL)
  })

  test('rechaza un enlace que no es de un grupo, sin guardarlo', async ({ page }) => {
    await page.goto('/seller/settings')
    await page.getByLabel('Enlace del grupo de WhatsApp').fill('https://ejemplo.test/grupo')

    await expect(
      page.getByText('Ese enlace no parece de un grupo de WhatsApp.', { exact: false }),
    ).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Enlace del grupo de WhatsApp')).toHaveValue('')
  })

  test('el mensaje propio se escribe SIN el enlace, y la vista previa lo añade', async ({
    page,
  }) => {
    // Es la comprobacion de la decision de D-176: no hay marcador que conservar.
    await page.goto('/seller/settings')
    await page.getByLabel('Enlace del grupo de WhatsApp').fill(GROUP_URL)
    await page.getByLabel('Usar mi propio mensaje').click()

    const area = page.getByLabel('Mensaje de invitación')
    await area.fill('Hola, gracias por participar.')

    // Lo escrito NO lleva el enlace...
    await expect(area).toHaveValue('Hola, gracias por participar.')
    // ...y aun asi el cliente lo recibiria.
    const vistaPrevia = page.getByText('Así lo recibirá tu cliente').locator('..')
    await expect(vistaPrevia).toContainText('Hola, gracias por participar.')
    await expect(vistaPrevia).toContainText(GROUP_URL)

    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, 'Los cambios fueron guardados.')

    await page.reload()
    await expect(page.getByLabel('Mensaje de invitación')).toHaveValue(
      'Hola, gracias por participar.',
    )
  })

  test('volver al predeterminado apaga el interruptor y bloquea el área', async ({ page }) => {
    await page.goto('/seller/settings')
    await page.getByLabel('Enlace del grupo de WhatsApp').fill(GROUP_URL)
    await page.getByLabel('Usar mi propio mensaje').click()
    await page.getByLabel('Mensaje de invitación').fill('Texto propio.')

    await page.getByRole('button', { name: 'Volver al mensaje predeterminado' }).click()

    await expect(page.getByLabel('Usar mi propio mensaje')).not.toBeChecked()
    await expect(page.getByLabel('Mensaje de invitación')).toHaveAttribute('readonly', '')
    await expect(page.getByLabel('Mensaje de invitación')).toContainText(
      'Gracias por participar con nosotros',
    )
  })
})

test.describe('El diálogo no se cierra sin querer (sección 4)', () => {
  test.beforeEach(async ({ page }) => {
    await setGroup(GROUP_URL)
    await loginAs(page, ACCOUNTS.seller)
  })

  test('ni con Escape, ni pulsando fuera, y no tiene «X»', async ({ page }) => {
    await createClientFromForm(page, unique('Cliente firme'), '3001234567')

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialogo).toBeVisible()

    // El fondo, lo más lejos posible de la caja del diálogo.
    await page.mouse.click(5, 5)
    await expect(dialogo).toBeVisible()

    await expect(dialogo.getByRole('button', { name: /^Cerrar$/ })).toHaveCount(1)
    await expect(dialogo.getByRole('button', { name: 'Close' })).toHaveCount(0)

    // Y «Cerrar» sí lo cierra, que es la otra mitad de la regla.
    await dialogo.getByRole('button', { name: 'Cerrar' }).click()
    await expect(dialogo).toBeHidden()
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)
  })
})

test.describe('Flujo B — desde «Mis clientes»', () => {
  test.beforeEach(async ({ page }) => {
    await setGroup(GROUP_URL)
    await loginAs(page, ACCOUNTS.seller)
  })

  test('dice que el cliente quedó registrado y NO menciona ninguna boleta', async ({ page }) => {
    const name = unique('Cliente solo')
    await createClientFromForm(page, name, '3001234567')

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo.getByRole('heading', { name: '¡Cliente creado!' })).toBeVisible()
    await expect(dialogo).toContainText(name)
    await expect(dialogo).not.toContainText('boleta')
  })

  test('«Invitar al grupo» abre WhatsApp con el teléfono y el mensaje', async ({ page }) => {
    const openedUrl = await spyOnWindowOpen(page)
    await createClientFromForm(page, unique('Cliente invitado'), '3009998877')

    await page.getByRole('alertdialog').getByRole('button', { name: 'Invitar al grupo' }).click()

    const url = await openedUrl()
    expect(url).not.toBeNull()

    // El telefono, normalizado con su indicativo (sección 12 del encargo).
    expect(url!.startsWith('https://wa.me/573009998877?text=')).toBe(true)

    // Y el mensaje, con el enlace del grupo dentro.
    const mensaje = decodeURIComponent(url!.split('?text=')[1]!)
    expect(mensaje).toContain('Gracias por participar con nosotros')
    expect(mensaje).toContain(GROUP_URL)

    // Al invitar, el diálogo termina y se llega a la ficha del cliente.
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)
  })
})

test.describe('Flujo A — desde una boleta', () => {
  test.beforeEach(async ({ page }) => {
    await setGroup(GROUP_URL)
    await loginAs(page, ACCOUNTS.seller)
  })

  test('dice que la boleta quedó asignada y la nombra por sus dos números', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })
    const name = unique('Cliente con boleta')

    await page.goto(`/seller/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()
    await page.getByRole('tab', { name: 'Cliente nuevo' }).click()
    await page.getByLabel('Nombre').fill(name)
    await page.getByLabel('Teléfono').fill('3001234567')
    await page.getByRole('button', { name: 'Crear cliente y asignar' }).click()

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo.getByRole('heading', { name: '¡Boleta asignada!' })).toBeVisible()
    await expect(dialogo).toContainText(name)
    // BR-N11: los DOS numeros, que es como se nombra una boleta.
    await expect(dialogo).toContainText(`${numbers.daily} / ${numbers.weekly}`)

    // Cerrar deja la venta hecha y no navega a ninguna parte.
    await dialogo.getByRole('button', { name: 'Cerrar' }).click()
    await expect(dialogo).toBeHidden()
    await expect(page).toHaveURL(`/seller/tickets/${ticket.id}`)
    await expect(page.getByText('Asignada').first()).toBeVisible()
  })
})

test.describe('Sin grupo configurado (sección 14)', () => {
  test.beforeEach(async ({ page }) => {
    await setGroup(null)
    await loginAs(page, ACCOUNTS.seller)
  })

  test('ofrece «Configurar WhatsApp», lleva a la pantalla y NO pierde el cliente', async ({
    page,
  }) => {
    const name = unique('Cliente sin grupo')
    await createClientFromForm(page, name, '3001234567')

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo).toContainText('Configura tu grupo de WhatsApp')
    await expect(dialogo.getByRole('button', { name: 'Invitar al grupo' })).toHaveCount(0)

    await dialogo.getByRole('button', { name: 'Configurar WhatsApp' }).click()
    await page.waitForURL('/seller/settings')

    // El cliente NO se deshizo: sigue en la cartera.
    await page.goto('/seller/clients')
    await page.getByPlaceholder('Nombre, alias, teléfono o correo').fill(name)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await expect(page.getByRole('link', { name })).toBeVisible()
  })
})

test.describe('Teléfono que no sirve para WhatsApp (sección 15)', () => {
  test.beforeEach(async ({ page }) => {
    await setGroup(GROUP_URL)
    await loginAs(page, ACCOUNTS.seller)
  })

  test('lo explica y no ofrece una acción que iba a fallar', async ({ page }) => {
    // Siete digitos: pasa el formulario de cliente y no es un numero de
    // WhatsApp valido. El dialogo lo dice en vez de abrir un enlace roto.
    await createClientFromForm(page, unique('Cliente con fijo'), '2345678')

    const dialogo = page.getByRole('alertdialog')
    await expect(dialogo).toContainText('no sirve para WhatsApp')
    await expect(dialogo.getByRole('button', { name: 'Invitar al grupo' })).toHaveCount(0)
    await expect(dialogo.getByRole('button', { name: 'Configurar WhatsApp' })).toHaveCount(0)
  })
})

test.describe('Aislamiento (sección 22)', () => {
  test('el personal no ve «Configuración» ni alcanza la pantalla', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)

    await page.getByRole('button', { name: /Menú de usuario/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Configuración' })).toHaveCount(0)

    await page.goto('/seller/settings')
    await expect(page).toHaveURL(/\/denied/)
  })

  test('la configuración de un vendedor no es la de otro', async ({ page }) => {
    await setGroup(GROUP_URL)

    // El vendedor 2 entra a SU pantalla y no ve el grupo del vendedor 1.
    await loginAs(page, ACCOUNTS.otherSeller)
    await page.goto('/seller/settings')
    await expect(page.getByLabel('Enlace del grupo de WhatsApp')).not.toHaveValue(GROUP_URL)
  })
})
