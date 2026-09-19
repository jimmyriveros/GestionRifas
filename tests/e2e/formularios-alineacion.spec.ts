import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  raffleTicketPrice,
  signedInClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Alineación de campos que comparten fila (FormItem + composiciones propias).
 *
 * Lo que se mide es la GEOMETRÍA real, no que exista una clase: dos controles
 * equivalentes de la misma fila tienen que compartir `top` (±1 px) aunque uno
 * tenga ayuda o error. Las cajas se leen con `getBoundingClientRect` DESPUÉS de
 * que el diálogo termine `zoom-in-95`; las alturas táctiles, con
 * `getComputedStyle().height` (D-177, D-178).
 */

let refs: SeedRefs
let PRICE: number

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  PRICE = await raffleTicketPrice(refs)
})

type Box = {
  top: number
  bottom: number
  left: number
  right: number
  height: number
}

async function finishedOpening(dialog: Locator) {
  await expect(dialog).toBeVisible()
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))),
  )
}

async function boxOf(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      height: Number.parseFloat(getComputedStyle(el).height),
    }
  })
}

function expectSameTop(a: Box, b: Box, label: string) {
  expect(Math.abs(a.top - b.top), label).toBeLessThanOrEqual(1)
}

/**
 * Fondo de `globals.css`: `:root` `#ffffff`, `.dark` `#0a0a0a`. El portal no
 * enciende `.dark` solo: no hay selector de tema (`manifest.ts`). Emular
 * `prefers-color-scheme` no basta.
 */
const DARK_BACKGROUND_DEFAULT = '#0a0a0a'
const LIGHT_BACKGROUND_DEFAULT = '#ffffff'

type ThemeSnapshot = {
  hasDarkClass: boolean
  backgroundDefault: string
}

async function themeSnapshot(page: Page): Promise<ThemeSnapshot> {
  return page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--ds-background-default')
      .trim()
      .toLowerCase()
    const backgroundDefault =
      raw.length === 4 && raw.startsWith('#')
        ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
        : raw
    return {
      hasDarkClass: document.documentElement.classList.contains('dark'),
      backgroundDefault,
    }
  })
}

/**
 * Enciende `.dark` cuando el documento YA existe. Un `addInitScript` que toca
 * `document.documentElement` al nacer la página lanza
 * `Cannot read properties of null (reading 'classList')` y no añade la clase.
 */
async function activateDarkTheme(page: Page) {
  await page.evaluate(() => {
    const root = document.documentElement
    if (!root) throw new Error('No hay documentElement: el documento todavía no existe.')
    root.classList.add('dark')
  })
}

async function expectDarkTheme(page: Page) {
  const tema = await themeSnapshot(page)
  expect(tema.hasDarkClass, 'html lleva .dark').toBe(true)
  expect(tema.backgroundDefault, 'el token --ds-background-default es el del tema oscuro').toBe(
    DARK_BACKGROUND_DEFAULT,
  )
}

async function openReminderDialog(page: Page): Promise<Locator> {
  await page.goto('/seller/settings/reminders')
  await page.getByRole('button', { name: 'Crear recordatorio' }).click()
  const dialog = page.getByRole('dialog')
  await finishedOpening(dialog)
  return dialog
}

test.describe('Recordatorios: Día y Hora', () => {
  test('los controles alinean, la ayuda queda debajo y un error no mueve al vecino', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    const dialog = await openReminderDialog(page)

    const dia = dialog.getByLabel('Día')
    const hora = dialog.getByLabel('Hora')
    await expect(dia).toBeVisible()
    await expect(hora).toBeVisible()

    expectSameTop(
      await boxOf(dia),
      await boxOf(hora),
      'Día y Hora tienen que compartir el top del control',
    )

    const ayuda = dialog.getByText('Hora de Colombia.')
    const ayudaBox = await boxOf(ayuda)
    const horaBox = await boxOf(hora)
    expect(ayudaBox.top, 'la ayuda queda debajo de Hora').toBeGreaterThan(horaBox.bottom - 1)
    expect(ayudaBox.left, 'la ayuda no se corre a la columna de Día').toBeGreaterThan(
      (await boxOf(dia)).right - 8,
    )

    const etiquetaDia = dialog.getByText('Día', { exact: true })
    const huecoDia = (await boxOf(dia)).top - (await boxOf(etiquetaDia)).bottom

    await hora.fill('')
    await dialog.getByRole('button', { name: 'Crear recordatorio' }).click()
    await expect(dialog.getByText('Elige una hora.')).toBeVisible()

    // El diálogo puede recentrarse o desplazarse hasta el campo inválido: eso
    // mueve el `top` de viewport. Lo que no puede cambiar es el hueco entre la
    // etiqueta de Día y su control, ni la alineación con Hora.
    expect(
      Math.abs((await boxOf(dia)).top - (await boxOf(etiquetaDia)).bottom - huecoDia),
      'el error de Hora no desplaza el control de Día dentro de su campo',
    ).toBeLessThanOrEqual(1)
    expectSameTop(
      await boxOf(dia),
      await boxOf(hora),
      'con el error a la vista, Día y Hora siguen alineados',
    )

    const error = await boxOf(dialog.getByText('Elige una hora.'))
    expect(error.top, 'el error queda debajo de Hora').toBeGreaterThan(
      (await boxOf(hora)).bottom - 1,
    )
  })

  test('el interruptor del mensaje sigue en la misma fila que su etiqueta', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    const dialog = await openReminderDialog(page)

    const etiqueta = dialog.getByText('Usar mi propio mensaje')
    const interruptor = dialog.getByRole('switch')
    const e = await boxOf(etiqueta)
    const i = await boxOf(interruptor)
    expect(i.left, 'el interruptor queda a la derecha de la etiqueta').toBeGreaterThan(e.right)
    expect(
      Math.abs((e.top + e.bottom) / 2 - (i.top + i.bottom) / 2),
      'etiqueta e interruptor comparten la franja vertical',
    ).toBeLessThan(8)
  })

  test('de Día se pasa a Hora con el teclado', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    const dialog = await openReminderDialog(page)

    await dialog.getByLabel('Día').focus()
    await page.keyboard.press('Tab')
    await expect(dialog.getByLabel('Hora')).toBeFocused()
  })

  test('desde sm, Día y Hora siguen en dos columnas y alineados', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 })
    await loginAs(page, ACCOUNTS.seller)
    const dialog = await openReminderDialog(page)
    const dia = await boxOf(dialog.getByLabel('Día'))
    const hora = await boxOf(dialog.getByLabel('Hora'))
    expect(hora.left, 'a 640 px Hora queda a la derecha de Día').toBeGreaterThan(dia.right)
    expectSameTop(dia, hora, 'a 640 px Día y Hora alinean')
  })

  test('en oscuro, Día y Hora siguen alineados', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    const dialog = await openReminderDialog(page)
    await activateDarkTheme(page)
    await expectDarkTheme(page)
    expectSameTop(
      await boxOf(dialog.getByLabel('Día')),
      await boxOf(dialog.getByLabel('Hora')),
      'Día y Hora alinean también en oscuro',
    )
  })

  test('sin activar .dark, la comprobación del tema oscuro no se cumple', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    const dialog = await openReminderDialog(page)
    await expect(dialog).toBeVisible()
    const tema = await themeSnapshot(page)
    expect(tema.hasDarkClass, 'sin activar, html no lleva .dark').toBe(false)
    expect(tema.backgroundDefault, 'sin activar, el token sigue siendo el claro').toBe(
      LIGHT_BACKGROUND_DEFAULT,
    )
    expect(tema.backgroundDefault, 'sin activar, el token no es el oscuro').not.toBe(
      DARK_BACKGROUND_DEFAULT,
    )
  })
})

test.describe('Premios: filas con ayudas distintas', () => {
  test('título/categoría, cifras y alternativas alinean, y un error no mueve al vecino', async ({
    page,
  }) => {
    const owner = await signedInClient(ACCOUNTS.owner)
    const { data: raffle, error } = await owner
      .from('raffles')
      .insert({
        organization_id: refs.organizationId,
        name: unique('Rifa alineación premios'),
        ticket_price: 120_000,
        start_date: '2026-11-02',
        end_date: '2026-12-31',
        created_by: refs.ownerId,
        prize_mode: 'configurable',
      })
      .select('id')
      .single()
    if (error) throw error

    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${raffle.id}/prizes`)
    await page.getByRole('button', { name: 'Agregar premio' }).first().click()
    const dialog = page.getByRole('dialog')
    await finishedOpening(dialog)

    const titulo = dialog.getByLabel('Nombre del premio')
    const categoria = dialog.getByLabel('Categoría')
    await titulo.scrollIntoViewIfNeeded()
    const etiquetaTitulo = dialog.getByText('Nombre del premio', { exact: true })
    const huecoTitulo = (await boxOf(titulo)).top - (await boxOf(etiquetaTitulo)).bottom
    expectSameTop(await boxOf(titulo), await boxOf(categoria), 'Nombre del premio y Categoría')

    const ayudaCategoria = dialog.getByText(
      'Sirve para presentar el premio. No decide con qué número, con cuántas cifras ni con qué lotería juega.',
    )
    expect((await boxOf(ayudaCategoria)).top, 'la ayuda de Categoría queda debajo').toBeGreaterThan(
      (await boxOf(categoria)).bottom - 1,
    )

    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(
      dialog.getByText('El nombre del premio debe tener al menos 2 caracteres.'),
    ).toBeVisible()
    expect(
      Math.abs((await boxOf(titulo)).top - (await boxOf(etiquetaTitulo)).bottom - huecoTitulo),
      'el error del nombre no desplaza su control dentro de su campo',
    ).toBeLessThanOrEqual(1)
    expectSameTop(
      await boxOf(titulo),
      await boxOf(categoria),
      'con el error, título y categoría siguen alineados',
    )

    const que = dialog.getByLabel('Qué se entrega')
    const dinero = dialog.getByLabel('Dinero')
    await que.scrollIntoViewIfNeeded()
    expectSameTop(await boxOf(que), await boxOf(dinero), 'Qué se entrega y Dinero')

    const numero = dialog.getByLabel('Número de la boleta')
    const cifras = dialog.getByLabel('Cifras')
    await numero.scrollIntoViewIfNeeded()
    expectSameTop(await boxOf(numero), await boxOf(cifras), 'Número de la boleta y Cifras')
    const ayudaCifras = dialog.getByText(/Con cuatro cifras/)
    expect((await boxOf(ayudaCifras)).top, 'la ayuda de Cifras queda debajo').toBeGreaterThan(
      (await boxOf(cifras)).bottom - 1,
    )

    const cuando = dialog.getByLabel('Cuándo juega este período')
    const fecha = dialog.getByLabel('Fecha', { exact: true })
    await cuando.scrollIntoViewIfNeeded()
    expectSameTop(await boxOf(cuando), await boxOf(fecha), 'Cuándo juega este período y Fecha')
  })
})

test.describe('Rifas, boletas y abonos', () => {
  test('las fechas de la rifa alinean y un error no mueve a la vecina', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/raffles/new')
    await expect(page.getByLabel('Fecha de inicio')).toBeVisible()

    const inicio = page.getByLabel('Fecha de inicio')
    const fin = page.getByLabel('Fecha de fin')
    expectSameTop(await boxOf(inicio), await boxOf(fin), 'Fecha de inicio y Fecha de fin')

    const etiquetaInicio = page.getByText('Fecha de inicio', { exact: true })
    const huecoInicio = (await boxOf(inicio)).top - (await boxOf(etiquetaInicio)).bottom

    await page.getByLabel('Nombre de la rifa').fill('Rifa')
    await inicio.fill('2026-12-31')
    await fin.fill('2026-01-01')
    await page.getByRole('button', { name: 'Crear rifa' }).click()
    await expect(
      page.getByText('La fecha de fin no puede ser anterior a la de inicio.'),
    ).toBeVisible()

    expect(
      Math.abs((await boxOf(inicio)).top - (await boxOf(etiquetaInicio)).bottom - huecoInicio),
      'el error de fin no desplaza el control de inicio dentro de su campo',
    ).toBeLessThanOrEqual(1)
    expectSameTop(
      await boxOf(inicio),
      await boxOf(fin),
      'con el error, las fechas siguen alineadas',
    )

    const etiqueta = page.getByText('Permitir que los vendedores creen boletas')
    const interruptor = page.getByRole('switch', {
      name: 'Permitir que los vendedores creen boletas',
    })
    const e = await boxOf(etiqueta)
    const i = await boxOf(interruptor)
    expect(i.left, 'el interruptor de la rifa queda a la derecha').toBeGreaterThan(e.right)
  })

  test('número diario y semanal alinean', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets/new')
    const diario = page.getByLabel('Número diario')
    const semanal = page.getByLabel('Número semanal')
    await expect(diario).toBeVisible()
    expectSameTop(await boxOf(diario), await boxOf(semanal), 'Número diario y Número semanal')
  })

  test('en el abono, Fecha y Método alinean (composición propia)', async ({ page }) => {
    const cliente = await createClientFor(refs, unique('Cliente alineación'))
    const numbers = randomTicketNumbers()
    await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: PRICE,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/payments/new?clientId=${cliente.id}`)
    const fecha = page.getByLabel('Fecha')
    const metodo = page.getByLabel('Método')
    await expect(fecha).toBeVisible()
    expectSameTop(await boxOf(fecha), await boxOf(metodo), 'Fecha y Método del abono')
  })

  test('el formulario de cliente apila etiqueta, control y ayuda', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients/new')
    const alias = page.getByLabel('Alias (opcional)')
    const ayuda = page.getByText('Como lo tienes anotado: apodo, negocio, barrio.')
    await expect(alias).toBeVisible()
    expect((await boxOf(ayuda)).top, 'la ayuda del alias queda debajo').toBeGreaterThan(
      (await boxOf(alias)).bottom - 1,
    )
  })

  test('crear boletas del vendedor: Rifa y cantidad alinean desde sm', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets/new')
    const raffle = page.getByLabel('Rifa')
    const cantidad = page.getByLabel(/Cuantas/)
    await expect(raffle).toBeVisible()
    expectSameTop(await boxOf(raffle), await boxOf(cantidad), 'Rifa y cantidad')
  })

  test('creación masiva: Rifa y Vendedor alinean', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets/bulk')
    const raffle = page.getByLabel('Rifa')
    const vendedor = page.getByLabel('Vendedor')
    await expect(raffle).toBeVisible()
    expectSameTop(await boxOf(raffle), await boxOf(vendedor), 'Rifa y Vendedor')
  })

  test('login apila etiqueta y control', async ({ page }) => {
    await page.goto('/login')
    const correo = page.getByLabel('Correo electrónico')
    const etiqueta = page.getByText('Correo electrónico', { exact: true })
    await expect(correo).toBeVisible()
    expect((await boxOf(correo)).top, 'el correo queda debajo de su etiqueta').toBeGreaterThan(
      (await boxOf(etiqueta)).bottom - 1,
    )
  })

  test('cuenta de cobro: la ayuda queda debajo del teléfono', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')
    await page.getByRole('button', { name: 'Agregar cuenta' }).click()
    const dialog = page.getByRole('dialog')
    await finishedOpening(dialog)
    const telefono = dialog.getByLabel('Teléfono')
    const ayuda = dialog.getByText('El número de tu Nequi.')
    expect((await boxOf(ayuda)).top, 'la ayuda del teléfono queda debajo').toBeGreaterThan(
      (await boxOf(telefono)).bottom - 1,
    )
  })

  test('invitar administrador apila nombre y control', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/users')
    await page.getByRole('button', { name: 'Nuevo administrador' }).click()
    const dialog = page.getByRole('dialog')
    await finishedOpening(dialog)
    const nombre = dialog.getByLabel('Nombre completo')
    await expect(nombre).toBeVisible()
    const etiqueta = dialog.getByText('Nombre completo', { exact: true })
    expect((await boxOf(nombre)).top).toBeGreaterThan((await boxOf(etiqueta)).bottom - 1)
  })
})
