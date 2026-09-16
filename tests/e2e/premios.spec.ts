import { expect, test, type Page } from '@playwright/test'

import { loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, addPrize, createRaffleWithPrize, expectToast, loginAs, unique } from './fixtures'

/**
 * El panel de premios configurables (Entrega 2, D-202).
 *
 * TODO EL RECORRIDO ES POR LA INTERFAZ, con la sesión real del Dueño o del
 * Administrador. Las rifas se crean con el proceso de tres pasos, que es la
 * única forma de crear una rifa desde la Entrega 2.
 *
 * Las rifas de esta suite son suyas: llevan nombre propio y se quedan en
 * borrador salvo donde la prueba las activa a propósito.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/**
 * La TABLA de premios. El listado tiene dos caras —tabla desde `md`, tarjetas
 * debajo— y las dos están en el DOM: en el proyecto de escritorio la tarjeta
 * existe pero está oculta, así que una aserción por texto suelto resolvería a
 * un elemento invisible. Aquí se mira siempre la que se ve.
 */
function prizesTable(page: Page) {
  return page.getByRole('table').first()
}

/** Abre el formulario de un premio y devuelve su diálogo. */
function prizeDialog(page: Page) {
  return page.getByRole('dialog')
}

async function openNewPrize(page: Page) {
  await page.getByRole('button', { name: 'Agregar premio' }).first().click()
  return prizeDialog(page)
}

test.describe('Premios configurables', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('crea una rifa configurable que queda en borrador con su primer premio', async ({
    page,
  }) => {
    const name = unique('Rifa premios')

    await page.goto('/owner/raffles/new')
    await expect(page.getByText('1.')).toBeVisible()
    await page.getByLabel('Nombre de la rifa').fill(name)
    await page.getByLabel('Fecha de inicio').fill('2026-01-01')
    await page.getByLabel('Fecha de fin').fill('2026-12-31')
    await page.getByRole('button', { name: 'Crear rifa' }).click()

    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+\/prizes$/)
    await expect(page.getByText('Todavía no hay premios')).toBeVisible()

    await addPrize(page, { title: 'Premio diario', amount: '500000', date: '2026-01-01' })

    await expect(prizesTable(page)).toContainText('Premio diario')
    await expect(prizesTable(page)).toContainText('$500.000')
    await expect(prizesTable(page)).toContainText('Vigente')

    // Sigue en borrador: guardar un premio no activa nada.
    const raffleId = page.url().split('/owner/raffles/')[1]?.split('/')[0]
    await page.goto(`/owner/raffles/${raffleId}`)
    await expect(page.getByText('Borrador').first()).toBeVisible()
  })

  test('crea un premio en especie, uno mixto y el premio mayor con cuatro alternativas', async ({
    page,
  }) => {
    const name = unique('Rifa alternativas')
    const raffleId = await createRaffleWithPrize(page, { name, prizeTitle: 'Premio base' })

    // En especie: sin dinero.
    let dialog = await openNewPrize(page)
    await dialog.getByLabel('Nombre del premio').fill('Premio en especie')
    await dialog.getByLabel('Qué se entrega').fill('Camioneta KIA')
    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-02')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()
    await expect(prizesTable(page)).toContainText('Camioneta KIA')

    // Mixto: una cosa Y dinero, en la MISMA alternativa.
    dialog = await openNewPrize(page)
    await dialog.getByLabel('Nombre del premio').fill('Premio mixto')
    await dialog.getByLabel('Qué se entrega').fill('Renault Alaskan 2023')
    await dialog.getByLabel('Dinero').fill('20000000')
    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-05')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()
    await expect(prizesTable(page)).toContainText('Renault Alaskan 2023 y $20.000.000')

    // El premio mayor: CUATRO alternativas excluyentes.
    dialog = await openNewPrize(page)
    await dialog.getByLabel('Nombre del premio').fill('Premio mayor')
    await dialog.getByLabel('Forma del premio').click()
    await page.getByRole('option', { name: 'Alternativas a elegir' }).click()

    await dialog.getByRole('button', { name: 'Agregar alternativa' }).click()
    await dialog.getByRole('button', { name: 'Agregar alternativa' }).click()

    const descriptions = dialog.getByLabel('Qué se entrega')
    const amounts = dialog.getByLabel('Dinero')
    await expect(descriptions).toHaveCount(4)

    await descriptions.nth(0).fill('Camioneta KIA')
    await descriptions.nth(1).fill('Renault Alaskan 2023')
    await amounts.nth(1).fill('20000000')
    await amounts.nth(2).fill('120000000')
    await descriptions.nth(3).fill('Renault Logan Zen público 2023')
    await amounts.nth(3).fill('70000000')

    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-06')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()

    await expect(prizesTable(page)).toContainText(
      'una de estas alternativas: Camioneta KIA, Renault Alaskan 2023 y $20.000.000, $120.000.000 o Renault Logan Zen público 2023 y $70.000.000',
    )

    expect(raffleId).toMatch(/[0-9a-f-]+/)
  })

  test('editar un premio publica una versión nueva y el historial la muestra', async ({ page }) => {
    const name = unique('Rifa historial')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio con historia' })

    await page.getByRole('button', { name: 'Editar' }).first().click()
    const dialog = prizeDialog(page)
    await dialog.getByLabel('Dinero').fill('900000')
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(dialog).toBeHidden()
    await expectToast(page, /cambios quedaron guardados/i)
    await expect(prizesTable(page)).toContainText('$900.000')

    await page.getByRole('button', { name: 'Historial' }).first().click()
    const history = prizeDialog(page)
    await expect(history.getByText('Versión 2')).toBeVisible()
    await expect(history.getByText('Versión 1')).toBeVisible()
    await expect(history.getByText('Versión vigente')).toBeVisible()
    await expect(history.getByText('Condiciones cambiadas')).toBeVisible()
  })

  test('archiva y restaura un premio sin perder su historial', async ({ page }) => {
    const name = unique('Rifa archivo')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio que se archiva' })

    // Hace falta un segundo premio: una rifa activa conserva al menos uno, y
    // aquí además se comprueba que archivar no borra nada.
    await addPrize(page, { title: 'Premio que se queda', amount: '300000', date: '2026-01-02' })

    await page.getByRole('button', { name: 'Archivar' }).first().click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar premio' }).click()
    await expectToast(page, /ya no aplica para los próximos sorteos/i)

    await expect(page.getByText('Premios archivados')).toBeVisible()
    await expect(page.getByText('Archivado').first()).toBeVisible()

    await page.getByRole('button', { name: 'Restaurar' }).first().click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restaurar premio' }).click()
    await expectToast(page, /vuelve a aplicar/i)
    await expect(page.getByText('Premios archivados')).toHaveCount(0)
  })

  test('cambia el orden de los premios con «Subir» y «Bajar»', async ({ page }) => {
    const name = unique('Rifa orden')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio A' })
    await addPrize(page, { title: 'Premio B', amount: '300000', date: '2026-01-02' })

    const rows = page.getByRole('row')
    await expect(rows.nth(1)).toContainText('Premio A')

    await page.getByRole('button', { name: /^Subir: Premio B/ }).click()
    await expectToast(page, /orden quedó guardado/i)
    await expect(page.getByRole('row').nth(1)).toContainText('Premio B')
  })

  test('dos premios que juegan el mismo día con la misma regla se rechazan', async ({ page }) => {
    const name = unique('Rifa conflicto')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio del lunes' })

    // El mismo día, el mismo número y las mismas cifras: es un conflicto.
    const dialog = await openNewPrize(page)
    await dialog.getByLabel('Nombre del premio').fill('Premio que choca')
    await dialog.getByLabel('Dinero').fill('700000')
    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-01')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()

    await expect(dialog.getByRole('alert')).toContainText('Premio del lunes')
    await expect(dialog.getByRole('alert')).toContainText('01/01/2026')

    // Con las últimas tres cifras, el mismo día SÍ se puede (BR-J07).
    await dialog.getByLabel('Cifras').click()
    await page.getByRole('option', { name: 'Últimas tres cifras' }).click()
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()
    await expect(prizesTable(page)).toContainText('Premio que choca')
  })

  test('la revisión impide activar sin premios y activa cuando la configuración es válida', async ({
    page,
  }) => {
    const name = unique('Rifa revision')

    await page.goto('/owner/raffles/new')
    await page.getByLabel('Nombre de la rifa').fill(name)
    await page.getByLabel('Fecha de inicio').fill('2026-01-01')
    await page.getByLabel('Fecha de fin').fill('2026-12-31')
    await page.getByRole('button', { name: 'Crear rifa' }).click()
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+\/prizes$/)

    // Sin premios: la revisión lo dice y no ofrece activar.
    await page.getByRole('link', { name: 'Continuar a revisar' }).click()
    await page.waitForURL(/\/review$/)
    await expect(page.getByText('Todavía no se puede activar')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Activar rifa' })).toBeDisabled()

    await page.getByRole('link', { name: 'Volver a los premios' }).click()
    await addPrize(page, { title: 'Premio de revisión', amount: '500000', date: '2026-01-01' })

    await page.getByRole('link', { name: 'Continuar a revisar' }).click()
    await page.waitForURL(/\/review$/)
    await expect(page.getByText('Todavía no se puede activar')).toHaveCount(0)

    await page.getByRole('button', { name: 'Activar rifa' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Activar rifa' }).click()
    await expectToast(page, /activa/i)
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)
    await expect(page.getByText('Activa').first()).toBeVisible()
  })

  test('una rifa cerrada deja sus premios en solo lectura', async ({ page }) => {
    const name = unique('Rifa cerrada premios')
    const raffleId = await createRaffleWithPrize(page, { name, activate: true })

    await page.getByRole('button', { name: 'Cerrar rifa' }).click()
    await page.getByRole('button', { name: 'Cerrar rifa' }).last().click()
    await expectToast(page, /cerrada/i)

    await page.goto(`/owner/raffles/${raffleId}/prizes`)
    await expect(page.getByText('La rifa está cerrada o anulada')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar premio' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Editar' })).toBeDisabled()
  })

  test('una rifa heredada no ofrece configuración de premios', async ({ page }) => {
    // Las rifas del seed siguen en `legacy` (BR-J13).
    await page.goto(`/owner/raffles/${refs.raffleId}`)
    await expect(page.getByRole('link', { name: 'Configurar premios' })).toHaveCount(0)

    await page.goto(`/owner/raffles/${refs.raffleId}/prizes`)
    await expect(page.getByText('Esta rifa usa el sistema de premios de siempre')).toBeVisible()
  })
})

/** Crea una rifa por el primer paso del proceso, sin premios, y devuelve su id. */
async function createDraftRaffle(page: Page, name: string): Promise<string> {
  await page.goto('/owner/raffles/new')
  await page.getByLabel('Nombre de la rifa').fill(name)
  await page.getByLabel('Fecha de inicio').fill('2026-01-01')
  await page.getByLabel('Fecha de fin').fill('2026-12-31')
  await page.getByRole('button', { name: 'Crear rifa' }).click()
  await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+\/prizes$/)
  return page.url().split('/owner/raffles/')[1]?.split('/')[0] ?? ''
}

test.describe('Activar una rifa configurable pasa por la revisión (D-202)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('borrador configurable: el detalle no activa directo y ofrece «Revisar y activar»', async ({
    page,
  }) => {
    const name = unique('Rifa sin activar directo')
    const raffleId = await createDraftRaffle(page, name)

    await page.goto(`/owner/raffles/${raffleId}`)
    await expect(page.getByRole('heading', { name })).toBeVisible()

    // Sin activación directa, y con el camino a la revisión en su lugar.
    await expect(page.getByRole('button', { name: 'Activar rifa' })).toHaveCount(0)
    const revisar = page.getByRole('link', { name: 'Revisar y activar' })
    await expect(revisar).toHaveAttribute('href', `/owner/raffles/${raffleId}/review`)
    // Las demás transiciones de un borrador siguen donde estaban.
    await expect(page.getByRole('button', { name: 'Anular rifa' })).toBeVisible()

    await revisar.click()
    await page.waitForURL(new RegExp(`/owner/raffles/${raffleId}/review$`))

    // Y la revisión, sin premios, dice qué falta y no deja activar.
    await expect(page.getByText('Todavía no se puede activar')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Activar rifa' })).toBeDisabled()
  })

  test('borrador heredado: conserva «Activar rifa», con su confirmación', async ({ page }) => {
    // Una rifa heredada ya no se crea por la interfaz (D-202): se prepara con la
    // service role, como las del seed. Fechas de 2019, para que no se cruce con
    // ninguna rifa ni ningún sorteo de otra suite.
    const name = unique('Rifa heredada borrador')
    const { data: raffle, error } = await serviceClient()
      .from('raffles')
      .insert({
        organization_id: refs.organizationId,
        name,
        ticket_price: 120_000,
        start_date: '2019-01-01',
        end_date: '2019-12-31',
        created_by: refs.ownerId,
      })
      .select('id, prize_mode, status')
      .single()
    if (error) throw error
    expect(raffle.prize_mode).toBe('legacy')
    expect(raffle.status).toBe('draft')

    await page.goto(`/owner/raffles/${raffle.id}`)
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Revisar y activar' })).toHaveCount(0)

    // Reintento deliberado: el primer clic puede caer antes de que React hidrate
    // la página recién cargada (TESTING §5.3). Abrir la confirmación es inocuo.
    await expect(async () => {
      await page.getByRole('button', { name: 'Activar rifa' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 20_000 })
    await page.getByRole('alertdialog').getByRole('button', { name: 'Activar rifa' }).click()
    await expectToast(page, /estado activa/i)
    await expect(page.getByRole('button', { name: 'Cerrar rifa' })).toBeVisible()

    // Las demás transiciones siguen igual; se anula para dejarla inerte.
    await page.getByRole('button', { name: 'Anular rifa' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Anular rifa' }).click()
    await expectToast(page, /estado anulada/i)
  })
})

test.describe('Corregir los datos de la rifa sin salir del proceso (D-202)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('desde los premios, guardar vuelve a los premios', async ({ page }) => {
    const name = unique('Rifa datos desde premios')
    const raffleId = await createRaffleWithPrize(page, { name, prizeTitle: 'Premio del proceso' })

    await page.getByRole('link', { name: 'Volver a los datos de la rifa' }).click()
    await page.waitForURL(new RegExp(`/owner/raffles/${raffleId}/edit\\?from=prizes$`))

    const corrected = `${name} corregida`
    await page.getByLabel('Nombre de la rifa').fill(corrected)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await page.waitForURL(new RegExp(`/owner/raffles/${raffleId}/prizes$`))
    await expectToast(page, 'Rifa actualizada.')
    // Sigue en el paso 2, con el nombre corregido y su premio.
    await expect(page.getByText(corrected).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continuar a revisar' })).toBeVisible()
    await expect(prizesTable(page)).toContainText('Premio del proceso')
  })

  test('desde los premios, cancelar vuelve a los premios sin guardar', async ({ page }) => {
    const name = unique('Rifa cancelar desde premios')
    const raffleId = await createRaffleWithPrize(page, { name })

    await page.getByRole('link', { name: 'Volver a los datos de la rifa' }).click()
    await page.waitForURL(new RegExp(`/owner/raffles/${raffleId}/edit\\?from=prizes$`))
    await page.getByLabel('Nombre de la rifa').fill(`${name} sin guardar`)
    await page.getByRole('button', { name: 'Cancelar' }).click()

    await page.waitForURL(new RegExp(`/owner/raffles/${raffleId}/prizes$`))
    await expect(page.getByRole('link', { name: 'Continuar a revisar' })).toBeVisible()
    await expect(page.getByText(`${name} sin guardar`)).toHaveCount(0)

    // Sin historial dentro de la aplicación —el enlace pegado en otra pestaña, o
    // después de pasar por el detalle— manda el origen, no la página anterior.
    await page.goto(`/owner/raffles/${raffleId}`)
    await page.goto(`/owner/raffles/${raffleId}/edit?from=prizes`)
    await expect(async () => {
      await page.getByRole('button', { name: 'Cancelar' }).click()
      await page.waitForURL(new RegExp(`/owner/raffles/${raffleId}/prizes$`), { timeout: 3_000 })
    }).toPass({ timeout: 20_000 })
  })

  test('desde el detalle, cancelar y guardar vuelven al detalle', async ({ page }) => {
    const name = unique('Rifa datos desde detalle')
    const raffleId = await createRaffleWithPrize(page, { name })
    const detail = new RegExp(`/owner/raffles/${raffleId}$`)
    const edit = new RegExp(`/owner/raffles/${raffleId}/edit$`)

    await page.goto(`/owner/raffles/${raffleId}`)
    await page.getByRole('link', { name: 'Editar' }).click()
    await page.waitForURL(edit)

    // Cancelar es inocuo: se reintenta por si cae antes de la hidratación (§5.3).
    await expect(async () => {
      await page.getByRole('button', { name: 'Cancelar' }).click()
      await page.waitForURL(detail, { timeout: 3_000 })
    }).toPass({ timeout: 20_000 })

    await page.getByRole('link', { name: 'Editar' }).click()
    await page.waitForURL(edit)
    await page.getByLabel('Precio de la boleta').fill('50000')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await page.waitForURL(detail)
    await expectToast(page, 'Rifa actualizada.')
    await expect(page.getByText('$50.000').first()).toBeVisible()
  })

  test('un origen escrito a mano no decide el destino: se vuelve al detalle', async ({ page }) => {
    const name = unique('Rifa origen escrito')
    const raffleId = await createRaffleWithPrize(page, { name })
    const detail = `/owner/raffles/${raffleId}`

    for (const forged of ['https://evil.example', '//evil.example/owner', 'javascript:alert(1)']) {
      // Carga dura, sin historial dentro de la aplicación: cancelar va al destino
      // que compuso la página, que no puede ser lo que trae la URL.
      await page.goto(`${detail}/edit?from=${encodeURIComponent(forged)}`)
      await expect(page.getByLabel('Nombre de la rifa')).toHaveValue(name)
      // El texto SÍ aparece en el HTML: Next guarda ahí la URL de la propia página.
      // Lo que no puede pasar es que un destino lo use.
      await expect(page.locator('a[href*="evil.example"], a[href^="javascript:"]')).toHaveCount(0)

      await expect(async () => {
        await page.getByRole('button', { name: 'Cancelar' }).click()
        await page.waitForURL(new RegExp(`${detail}$`), { timeout: 3_000 })
      }).toPass({ timeout: 20_000 })
      expect(new URL(page.url()).host).toBe('localhost:3000')
    }
  })
})

test.describe('Premios: control de acceso', () => {
  test('un Administrador también configura premios (por capacidad, no por rol)', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.admin)
    const name = unique('Rifa admin premios')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio del administrador' })
    await expect(prizesTable(page)).toContainText('Premio del administrador')
  })

  test('un vendedor no llega al panel de premios', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/owner/raffles')
    await expect(page).toHaveURL(/\/denied|\/seller/)
  })
})
