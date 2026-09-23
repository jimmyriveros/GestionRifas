import { expect, test, type Page } from '@playwright/test'

import {
  createClientFor,
  createPaymentsInBulk,
  loadSeedRefs,
  purgeTestRaffles,
  serviceClient,
} from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * EL HISTORIAL DE ABONOS DE LA FICHA DEL CLIENTE, ENTERO (I-156, D-219).
 *
 * Hasta aqui la ficha pedia los 100 pagos mas recientes y los pintaba todos: un
 * cliente con 130 ensenaba 100 y nada decia que faltaran 30. Ahora pagina en la
 * base, con la misma barra y los mismos parametros que «Mis pagos».
 *
 * 130 abonos de UNA boleta, con importes distintos —1.000 + i— para poder
 * reconocer cada uno, repartidos en 10 fechas para que haya empates que el
 * orden tenga que deshacer, y todos con el mismo `created_at`.
 */

const TOTAL = 130
const AMOUNTS = Array.from({ length: TOTAL }, (_, i) => 1_000 + i)
// 13 abonos por dia, del 1 al 10 de septiembre.
const DATES = AMOUNTS.map((_, i) => `2026-09-${String((i % 10) + 1).padStart(2, '0')}`)
const SUMA = AMOUNTS.reduce((a, b) => a + b, 0)

test.describe('Historial de abonos de la ficha del cliente', () => {
  const STAMP = Date.now().toString(36).slice(-5)
  let raffleId = ''
  let clientId = ''
  let ticketId = ''
  let emptyClientId = ''

  test.beforeAll(async () => {
    const svc = serviceClient()
    const refs = await loadSeedRefs()
    clientId = (await createClientFor(refs, `Historial Largo ${STAMP}`)).id
    emptyClientId = (await createClientFor(refs, `Historial Vacio ${STAMP}`)).id

    const { data: raffle, error } = await svc
      .from('raffles')
      .insert({
        organization_id: refs.organizationId,
        name: `Rifa historial ${STAMP}`,
        ticket_price: 200_000,
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: refs.ownerId,
      })
      .select('id')
      .single()
    if (error) throw error
    raffleId = raffle.id

    const { data: ticket, error: ticketError } = await svc
      .from('tickets')
      .insert({
        organization_id: refs.organizationId,
        raffle_id: raffleId,
        seller_id: refs.sellerId,
        created_by: refs.ownerId,
        client_id: clientId,
        daily_number: '6601',
        weekly_number: '6602',
        inventory_status: 'assigned',
        sale_price: 200_000,
        sale_date: '2026-09-01',
        assigned_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (ticketError) throw ticketError
    ticketId = ticket.id

    await createPaymentsInBulk(refs, { clientId, ticketId, amounts: AMOUNTS, dates: DATES })
  })

  test.afterAll(async () => {
    // Lanza si no puede borrar: un error de limpieza se ve, no se traga.
    await purgeTestRaffles({ raffleIds: [raffleId], clientIds: [clientId, emptyClientId] })
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  const seccion = (page: Page) =>
    page.locator('[data-slot="card"]', {
      has: page.getByRole('heading', { name: 'Historial de abonos' }),
    })

  /** Los importes de la tabla del historial, en el orden en que se ven. */
  async function importes(page: Page): Promise<number[]> {
    const celdas = await seccion(page).locator('table tbody tr td:nth-child(2)').allInnerTexts()
    return celdas.map((texto) => Number(texto.replace(/[^0-9]/g, '')))
  }

  /** Las fechas de la tabla, como texto «dd mmm yyyy». Solo para contar cambios. */
  async function fechas(page: Page): Promise<string[]> {
    return seccion(page).locator('table tbody tr td:nth-child(1)').allInnerTexts()
  }

  test('se recorre el historial COMPLETO, sin omisiones ni duplicados', async ({ page }) => {
    await page.goto(`/seller/clients/${clientId}`)
    await expect(seccion(page).getByText(`1–25 de ${TOTAL} abonos`)).toBeVisible()

    const vistos: number[] = []
    const dias: string[] = []
    for (let pagina = 1; pagina <= Math.ceil(TOTAL / 25); pagina += 1) {
      if (pagina > 1) {
        await seccion(page).getByRole('button', { name: 'Siguiente' }).click()
        await expect(page).toHaveURL(new RegExp(`page=${pagina}`))
        const desde = (pagina - 1) * 25 + 1
        await expect(seccion(page).getByText(new RegExp(`^${desde}–`))).toBeVisible()
      }
      vistos.push(...(await importes(page)))
      dias.push(...(await fechas(page)))
    }

    expect(vistos).toHaveLength(TOTAL)
    expect(new Set(vistos).size).toBe(TOTAL)
    expect([...vistos].sort((a, b) => a - b)).toEqual(AMOUNTS)
    // Orden por fecha, de la mas reciente a la mas antigua: la fecha solo cambia
    // 9 veces a lo largo de las 130 filas. Si una pagina se ordenara por su
    // cuenta, las fechas se repetirian en bloques.
    const cambios = dias.filter((dia, i) => i > 0 && dia !== dias[i - 1]).length
    expect(cambios).toBe(9)
    await expect(seccion(page).getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  test('el orden por defecto es estable: dos lecturas de la misma pagina coinciden', async ({
    page,
  }) => {
    await page.goto(`/seller/clients/${clientId}?page=3`)
    const primera = await importes(page)
    await page.reload()
    expect(await importes(page)).toEqual(primera)
  })

  test('ordenar por valor es del conjunto entero, no de la pagina', async ({ page }) => {
    await page.goto(`/seller/clients/${clientId}?sort=totalAmount&dir=desc`)
    const pagina1 = await importes(page)
    // El mayor de TODOS los abonos, no el mayor de 25.
    expect(pagina1[0]).toBe(Math.max(...AMOUNTS))
    expect(pagina1).toEqual([...AMOUNTS].sort((a, b) => b - a).slice(0, 25))
  })

  test('pulsar una cabecera ordena en la base y vuelve a la pagina 1', async ({ page }) => {
    await page.goto(`/seller/clients/${clientId}?page=4`)
    await seccion(page).getByRole('button', { name: /Valor/ }).click()
    await expect(page).toHaveURL(/sort=totalAmount/)
    await expect(page).not.toHaveURL(/page=/)
    const pagina1 = await importes(page)
    expect(pagina1[0]).toBe(Math.min(...AMOUNTS))
  })

  test('atras, adelante y recargar conservan la pagina y los demas parametros', async ({
    page,
  }) => {
    await page.goto(`/seller/clients/${clientId}?sort=totalAmount`)
    await seccion(page).getByRole('button', { name: 'Siguiente' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page).toHaveURL(/sort=totalAmount/)
    const pagina2 = await importes(page)

    await page.goBack()
    await expect(page).not.toHaveURL(/page=/)
    await expect(seccion(page).getByText(`1–25 de ${TOTAL} abonos`)).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(/page=2/)
    expect(await importes(page)).toEqual(pagina2)

    await page.reload()
    expect(await importes(page)).toEqual(pagina2)
  })

  test('los totales del cliente son del historial entero, no de la pagina', async ({ page }) => {
    await page.goto(`/seller/clients/${clientId}?page=6`)
    // `ClientTotals` sale de la ficha, no de las filas pintadas: la pagina 6
    // tiene 5 abonos y el total pagado sigue siendo el de los 130.
    const pagado = `$${SUMA.toLocaleString('es-CO')}`
    await expect(page.getByText(pagado).first()).toBeVisible()
    expect(await importes(page)).toHaveLength(TOTAL - 125)
  })

  test('una pagina fuera de rango no se confunde con un historial vacio', async ({ page }) => {
    await page.goto(`/seller/clients/${clientId}?page=99`)
    await expect(seccion(page).getByText('Esa página no existe')).toBeVisible()
    await expect(
      seccion(page).getByText(`El historial tiene ${TOTAL} abonos en 6 páginas.`),
    ).toBeVisible()
    await expect(seccion(page).getByText('Todavía no le has registrado ningún abono.')).toHaveCount(
      0,
    )

    await seccion(page).getByRole('link', { name: 'Ir a la primera página' }).click()
    await expect(page).not.toHaveURL(/page=/)
    await expect(seccion(page).getByText(`1–25 de ${TOTAL} abonos`)).toBeVisible()
  })

  test('un cliente sin abonos sigue diciendo que no hay ninguno', async ({ page }) => {
    await page.goto(`/seller/clients/${emptyClientId}`)
    await expect(
      seccion(page).getByText('Todavía no le has registrado ningún abono.'),
    ).toBeVisible()
    await expect(seccion(page).getByText('Esa página no existe')).toHaveCount(0)
    // Y en una pagina que no existe, tampoco finge tener historial.
    await page.goto(`/seller/clients/${emptyClientId}?page=3`)
    await expect(
      seccion(page).getByText('Todavía no le has registrado ningún abono.'),
    ).toBeVisible()
  })

  test('el detalle de la boleta ve TODOS sus abonos, no los 100 mas recientes', async ({
    page,
  }) => {
    await page.goto(`/seller/tickets/${ticketId}`)
    const tarjeta = page.locator('[data-slot="card"]', {
      has: page.getByRole('heading', { name: 'Abonos de esta boleta' }),
    })
    // Cada abono del historial de la boleta nombra su importe.
    for (const importe of [Math.min(...AMOUNTS), Math.max(...AMOUNTS)]) {
      await expect(tarjeta.getByText(`$${importe.toLocaleString('es-CO')}`).first()).toBeVisible()
    }
  })
})
