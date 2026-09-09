import { expect, test, type Locator, type Page } from '@playwright/test'

import { createTicket, loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * El diálogo de éxito NO se cierra solo (BR-W06, D-179).
 *
 * Esta suite nace de un defecto real y de una prueba que no lo cogió. Las de
 * `whatsapp-invitacion.spec.ts` comprobaban que `Escape` y el clic fuera no
 * cerraran el diálogo —y no lo cerraban—, pero **ninguna esperaba**: el modal
 * aparecía, y a los pocos cientos de milisegundos se desmontaba solo, porque al
 * venderse la boleta `canAssign` pasaba a `false` en la página y se llevaba por
 * delante el componente que lo contenía.
 *
 * Por eso aquí lo que se prueba es el **paso del tiempo**: el diálogo tiene que
 * seguir en pantalla después de que TODO lo asíncrono haya terminado —la Server
 * Action, la revalidación, el refresco del árbol de servidor y el re-render que
 * eso provoca—. 15 segundos no es una cifra mágica: es mucho más de lo que
 * tardan esas cuatro cosas juntas en local, así que si sobrevive a eso, sobrevive.
 */

const GRUPO = 'https://chat.whatsapp.com/PersistE2E1234'

/** Margen amplio: estas pruebas esperan a propósito. */
test.describe.configure({ timeout: 120_000 })

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  await serviceClient()
    .from('memberships')
    .update({ whatsapp_group_url: GRUPO })
    .eq('profile_id', refs.sellerId)
})

test.afterAll(async () => {
  await serviceClient()
    .from('memberships')
    .update({ whatsapp_group_url: null })
    .eq('profile_id', refs.sellerId)
})

/** Registra un cliente desde «Mis clientes» y devuelve el diálogo abierto. */
async function crearDesdeClientes(page: Page): Promise<Locator> {
  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/clients/new')
  await page.getByLabel('Nombre').fill(unique('Persistente'))
  await page.getByLabel('Teléfono').fill('3001234567')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  const dialogo = page.getByRole('alertdialog')
  await expect(dialogo).toBeVisible()
  return dialogo
}

/** Vende una boleta creando el cliente al vuelo. Devuelve el diálogo y la boleta. */
async function venderConClienteNuevo(page: Page) {
  const numbers = randomTicketNumbers()
  const ticket = await createTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    inventoryStatus: 'available',
  })
  await loginAs(page, ACCOUNTS.seller)
  await page.goto(`/seller/tickets/${ticket.id}`)
  await page.getByRole('button', { name: 'Asignar a un cliente' }).click()
  await page.getByRole('tab', { name: 'Cliente nuevo' }).click()
  await page.getByLabel('Nombre').fill(unique('PersistenteA'))
  await page.getByLabel('Teléfono').fill('3001234567')
  await page.getByRole('button', { name: 'Crear cliente y asignar' }).click()
  const dialogo = page.getByRole('alertdialog')
  await expect(dialogo).toBeVisible()
  return { dialogo, ticket, numbers }
}

/** Espera de verdad, y comprueba que sigue ahí a lo largo del camino. */
async function sigueAbiertoTras(page: Page, dialogo: Locator, segundos: number) {
  for (let t = 0; t < segundos; t += 3) {
    await page.waitForTimeout(3000)
    await expect(dialogo, `se cerró solo a los ${t + 3} s`).toBeVisible()
  }
}

test.describe('Caso 1 — «Mis clientes»', () => {
  test('sigue abierto a los 15 s, y ni el clic fuera ni ESC lo cierran', async ({ page }) => {
    const dialogo = await crearDesdeClientes(page)

    await sigueAbiertoTras(page, dialogo, 15)

    // La esquina más lejana de la caja del diálogo.
    await page.mouse.click(3, 3)
    await expect(dialogo).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialogo).toBeVisible()

    // Y «Cerrar» sí lo cierra: la otra mitad de la regla.
    await dialogo.getByRole('button', { name: 'Cerrar' }).click()
    await expect(dialogo).toBeHidden()
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)
  })
})

test.describe('Caso 3 y 4 — desde una boleta, con su refresco de por medio', () => {
  /**
   * ESTE es el caso que fallaba, y de paso es el Caso 4 del encargo: no hace
   * falta provocar un refetch, porque la propia venta lo dispara. `router.refresh()`
   * vuelve a pedir la página, la boleta ya no está `available` y la sección que
   * contenía el diálogo desaparece. Si el modal sigue en pantalla después de
   * eso, es que ya no depende de ella.
   */
  test('sobrevive al refresco que provoca la propia venta', async ({ page }) => {
    const { dialogo, numbers } = await venderConClienteNuevo(page)

    await sigueAbiertoTras(page, dialogo, 15)

    await page.mouse.click(3, 3)
    await expect(dialogo).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialogo).toBeVisible()

    // El diálogo nombra la boleta por sus DOS números (BR-N11).
    await expect(dialogo).toContainText(`${numbers.daily} / ${numbers.weekly}`)

    await dialogo.getByRole('button', { name: 'Cerrar' }).click()
    await expect(dialogo).toBeHidden()

    // Y detrás la venta SÍ ocurrió: el refresco llegó, sencillamente no se
    // llevó el diálogo por delante.
    await expect(page.getByText('Asignada').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Asignar a un cliente' })).toHaveCount(0)
  })
})

test.describe('Caso 2 — invitar después de esperar', () => {
  test('«Invitar al grupo» sigue funcionando tras 15 s de espera', async ({ page }) => {
    // Se espía `window.open`: abrir `wa.me` de verdad sacaría la prueba de la
    // aplicación y dependería de una web de terceros.
    await page.addInitScript(() => {
      const w = window as unknown as { __url?: string; open: unknown }
      w.open = (url?: string | URL) => {
        w.__url = String(url ?? '')
        return {} as Window
      }
    })

    const dialogo = await crearDesdeClientes(page)
    await sigueAbiertoTras(page, dialogo, 15)

    await dialogo.getByRole('button', { name: 'Invitar al grupo' }).click()

    const url = await page.evaluate(() => (window as unknown as { __url?: string }).__url ?? null)
    expect(url).not.toBeNull()
    expect(url!.startsWith('https://wa.me/573001234567?text=')).toBe(true)
    expect(decodeURIComponent(url!.split('?text=')[1]!)).toContain(GRUPO)

    // Invitar sí puede cerrarlo: es una de las dos acciones permitidas.
    await expect(dialogo).toBeHidden()
  })
})
