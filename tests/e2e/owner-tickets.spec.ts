import { expect, test } from '@playwright/test'

import { createTicket, loadSeedRefs, type SeedRefs } from './db-setup'
import { ACCOUNTS, expectToast, loginAs, randomTicketNumbers, toggleCheckbox } from './fixtures'

/**
 * Pruebas 6, 7, 8, 12, 13 y 14 de la Fase 3: creacion individual, limites de
 * los numeros, duplicados, aprobacion, anulacion y proteccion por rol.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.describe('Boletas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('crea una boleta válida y queda disponible (prueba 6)', async ({ page }) => {
    const numbers = randomTicketNumbers()

    await page.goto('/owner/tickets/new')
    await page.getByLabel('Número diario').fill(numbers.daily)
    await page.getByLabel('Número semanal').fill(numbers.weekly)
    await page.getByRole('button', { name: 'Crear boleta' }).click()

    await page.waitForURL(/\/owner\/tickets\/[0-9a-f-]+$/)
    await expect(page.getByText('Disponible').first()).toBeVisible()
    await expect(page.getByText(numbers.daily).first()).toBeVisible()
    await expect(page.getByText(numbers.weekly).first()).toBeVisible()
  })

  test('el campo no admite mas de 4 dígitos (prueba 7, BR-N02)', async ({ page }) => {
    await page.goto('/owner/tickets/new')

    const daily = page.getByLabel('Número diario')
    await daily.fill('')
    await daily.pressSequentially('12345')
    await expect(daily).toHaveValue('1234')

    // Pegar tampoco lo salta: el componente descarta lo que no sean digitos.
    const weekly = page.getByLabel('Número semanal')
    await weekly.fill('12A4')
    await expect(weekly).toHaveValue('124')
  })

  test('conserva los ceros iniciales (BR-N03)', async ({ page }) => {
    await page.goto('/owner/tickets/new')
    const daily = page.getByLabel('Número diario')
    await daily.fill('0007')
    await expect(daily).toHaveValue('0007')
  })

  test('rechaza una combinación ya usada en la rifa (prueba 8, BR-N04)', async ({ page }) => {
    const numbers = randomTicketNumbers()

    await page.goto('/owner/tickets/new')
    await page.getByLabel('Número diario').fill(numbers.daily)
    await page.getByLabel('Número semanal').fill(numbers.weekly)
    await page.getByRole('button', { name: 'Crear boleta' }).click()
    await page.waitForURL(/\/owner\/tickets\/[0-9a-f-]+$/)

    await page.goto('/owner/tickets/new')
    await page.getByLabel('Número diario').fill(numbers.daily)
    await page.getByLabel('Número semanal').fill(numbers.weekly)
    await page.getByRole('button', { name: 'Crear boleta' }).click()

    await expect(
      page.getByText(
        'Ya existe una boleta con esa combinación de número diario y semanal en esta rifa.',
      ),
    ).toBeVisible()
  })

  test('rechaza el duplicado también cuando es de otro vendedor (prueba 9, BR-N05)', async ({
    page,
  }) => {
    const numbers = randomTicketNumbers()
    await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })

    await page.goto('/owner/tickets/new')
    // La combinacion existe en la rifa del seed y pertenece a "Julian Vargas";
    // se intenta crear la misma para OTRO vendedor, en LA MISMA rifa (la
    // unicidad es por rifa, BR-N06, asi que hay que seleccionarla).
    await page.getByLabel('Rifa').click()
    await page.getByRole('option', { name: /Rifa Navidad 2026/ }).click()
    await page.getByLabel('Vendedor').click()
    await page.getByRole('option', { name: 'Laura Moreno' }).click()
    await page.getByLabel('Número diario').fill(numbers.daily)
    await page.getByLabel('Número semanal').fill(numbers.weekly)
    await page.getByRole('button', { name: 'Crear boleta' }).click()

    await expect(page.getByText(/Ya existe una boleta con esa combinación/)).toBeVisible()
  })

  test('la misma combinación SI se permite en otra rifa (BR-N06)', async ({ page }) => {
    const numbers = randomTicketNumbers()
    await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })

    // Una rifa distinta de la del seed, creada para esta prueba.
    const raffleName = `Rifa otra ${Date.now().toString(36)}`
    await page.goto('/owner/raffles/new')
    await page.getByLabel('Nombre de la rifa').fill(raffleName)
    await page.getByLabel('Fecha de inicio').fill('2026-01-01')
    await page.getByLabel('Fecha de fin').fill('2026-12-31')
    await page.getByRole('button', { name: 'Crear rifa' }).click()
    await page.waitForURL(/\/owner\/raffles\/[0-9a-f-]+$/)

    await page.goto('/owner/tickets/new')
    await page.getByLabel('Rifa').click()
    await page.getByRole('option', { name: new RegExp(raffleName) }).click()
    await page.getByLabel('Número diario').fill(numbers.daily)
    await page.getByLabel('Número semanal').fill(numbers.weekly)
    await page.getByRole('button', { name: 'Crear boleta' }).click()

    await page.waitForURL(/\/owner\/tickets\/[0-9a-f-]+$/)
    await expect(page.getByText('Disponible').first()).toBeVisible()
  })

  test('aprueba una boleta pendiente (prueba 12, BR-I09)', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'pending_approval',
    })

    await page.goto(`/owner/tickets/${ticket.id}`)
    await expect(page.getByText('Pendiente de aprobación').first()).toBeVisible()

    await page.getByRole('button', { name: 'Aprobar boleta' }).click()
    await expectToast(page, /aprobada/i)
    await expect(page.getByText('Disponible').first()).toBeVisible()
  })

  test('aprueba en lote desde la tabla filtrada (BR-I09)', async ({ page }) => {
    const first = randomTicketNumbers()
    const second = randomTicketNumbers()
    await createTicket(refs, {
      dailyNumber: first.daily,
      weeklyNumber: first.weekly,
      inventoryStatus: 'pending_approval',
    })
    await createTicket(refs, {
      dailyNumber: second.daily,
      weeklyNumber: second.weekly,
      inventoryStatus: 'pending_approval',
    })

    await page.goto('/owner/tickets?inventoryStatus=pending_approval')
    await expect(page.getByRole('checkbox').first()).toBeVisible()

    // La casilla del encabezado marca las boletas visibles: todas las de este
    // filtro estan pendientes de aprobacion (seccion 16 del encargo).
    await toggleCheckbox(
      page.getByRole('checkbox', { name: 'Seleccionar las boletas de esta página' }),
      true,
    )

    await page.getByRole('button', { name: /^Aprobar boletas/ }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Aprobar \d+ boleta/ })
      .click()
    await expectToast(page, /Se aprobaron \d+ boletas/)
  })

  test('anula una boleta exigiendo motivo (prueba 13, BR-I10)', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })

    await page.goto(`/owner/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Anular boleta' }).click()

    // Motivo demasiado corto: la accion no avanza.
    await page.getByLabel('Motivo (obligatorio)').fill('ups')
    await page.getByRole('button', { name: 'Anular', exact: true }).click()
    await expect(page.getByText('Explica el motivo con al menos 5 caracteres.')).toBeVisible()

    await page.getByLabel('Motivo (obligatorio)').fill('Números mal digitados en la papeleta')
    await page.getByRole('button', { name: 'Anular', exact: true }).click()

    await expectToast(page, /anulada/i)
    await expect(page.getByText('Anulada').first()).toBeVisible()
    await expect(page.getByText('Números mal digitados en la papeleta')).toBeVisible()

    // Una boleta anulada ya no ofrece editar ni anular de nuevo.
    await expect(page.getByRole('button', { name: 'Editar números' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Anular boleta' })).toHaveCount(0)
  })

  test('edita los números de una boleta disponible', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const replacement = randomTicketNumbers()
    const ticket = await createTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      inventoryStatus: 'available',
    })

    await page.goto(`/owner/tickets/${ticket.id}`)
    await page.getByRole('button', { name: 'Editar números' }).click()
    await page.getByLabel('Número diario').fill(replacement.daily)
    await page.getByLabel('Número semanal').fill(replacement.weekly)
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expectToast(page, /actualizados/i)
    await expect(page.getByText(replacement.daily).first()).toBeVisible()
  })

  test('busca por número conservando los ceros iniciales (BR-N03)', async ({ page }) => {
    // Dos boletas que solo se distinguen por los ceros iniciales del diario.
    const paddedWeekly = randomTicketNumbers().weekly
    const bareWeekly = randomTicketNumbers().weekly
    await createTicket(refs, {
      dailyNumber: '0007',
      weeklyNumber: paddedWeekly,
      inventoryStatus: 'available',
    })
    await createTicket(refs, {
      dailyNumber: '7',
      weeklyNumber: bareWeekly,
      inventoryStatus: 'available',
    })

    await page.goto('/owner/tickets')
    await page.getByPlaceholder('Número de boleta o cliente').fill('0007')
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.waitForURL(/q=0007/)

    await expect(
      page.getByRole('link', { name: `Ver la boleta 0007 / ${paddedWeekly}` }),
    ).toBeVisible()
    // Los numeros se comparan como TEXTO, nunca convertidos a entero: «0007» no
    // esta dentro de «7», asi que la boleta sin ceros no aparece aqui.
    await expect(page.getByRole('link', { name: `Ver la boleta 7 / ${bareWeekly}` })).toHaveCount(0)
  })

  test('el código interno ya no encuentra la boleta, y se explica (BR-N11)', async ({ page }) => {
    const numeros = randomTicketNumbers()
    const { internalCode } = await createTicket(refs, {
      dailyNumber: numeros.daily,
      weeklyNumber: numeros.weekly,
      inventoryStatus: 'available',
    })

    await page.goto('/owner/tickets')
    await page.getByPlaceholder('Número de boleta o cliente').fill(internalCode)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.waitForURL(/q=/)

    await expect(page.getByText('Ninguna boleta coincide con los filtros')).toBeVisible()
    // Una lista vacia sin motivo se lee como «la aplicacion no funciona».
    await expect(page.getByText(/El código interno no sirve para buscar/)).toBeVisible()
  })

  test('las coincidencias del número diario van antes que las del semanal (BR-N11)', async ({
    page,
  }) => {
    // El MISMO numero en posiciones distintas: manda el diario. Los tres
    // numeros son aleatorios porque esta suite no borra lo que crea, y una
    // combinacion fija chocaria con la restriccion de unicidad al repetir.
    const buscado = randomTicketNumbers().daily
    const acompañaAlDiario = randomTicketNumbers().weekly
    const acompañaAlSemanal = randomTicketNumbers().daily

    await createTicket(refs, {
      dailyNumber: buscado,
      weeklyNumber: acompañaAlDiario,
      inventoryStatus: 'available',
    })
    await createTicket(refs, {
      dailyNumber: acompañaAlSemanal,
      weeklyNumber: buscado,
      inventoryStatus: 'available',
    })

    await page.goto(`/owner/tickets?q=${buscado}`)

    const filas = page.locator('tbody tr')
    // `allInnerTexts` no auto-espera (TESTING 3.1): hay que anclar antes.
    await expect(filas.first()).toBeVisible()
    const textos = await filas.allInnerTexts()

    const posicionDiario = textos.findIndex((fila) => fila.includes(acompañaAlDiario))
    const posicionSemanal = textos.findIndex((fila) => fila.includes(acompañaAlSemanal))

    // Ambas aparecen; la que coincide por el semanal va despues, no se descarta.
    expect(posicionDiario).toBeGreaterThanOrEqual(0)
    expect(posicionSemanal).toBeGreaterThan(posicionDiario)
  })

  test('los filtros se limpian y vuelven a mostrarlo todo', async ({ page }) => {
    await page.goto('/owner/tickets?inventoryStatus=cancelled&q=0100')
    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(page).toHaveURL('/owner/tickets')
  })
})

test.describe('Proteccion por rol (prueba 14)', () => {
  test('un vendedor no puede entrar al portal administrativo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    for (const path of [
      '/owner/dashboard',
      '/owner/tickets',
      '/owner/raffles',
      '/owner/users',
      '/owner/tickets/bulk',
    ]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/denied/)
    }
  })

  test('sin sesión, el portal administrativo redirige al login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/owner/tickets')
    await expect(page).toHaveURL(/\/login/)
  })
})
