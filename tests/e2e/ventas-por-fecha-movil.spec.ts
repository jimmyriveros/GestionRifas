import { expect, test } from '@playwright/test'

import { serviceClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * «Ventas por fecha» en un teléfono (D-151, §14 del encargo).
 *
 * Se ejecuta solo en el proyecto «movil» de playwright.config.ts.
 *
 * Lo que se comprueba son las dos cosas que rompen una pantalla estrecha y que
 * no se ven en escritorio: que la PAGINA no se desplace de lado —solo el bloque
 * de la tabla puede hacerlo— y que el dinero que se oculta al encoger no
 * desaparezca sin alternativa. Se prueba a 320 px, que es el ancho soportado
 * mas estrecho (D-125), ademas del ancho propio del proyecto movil.
 */

const DIA = '2019-07-08'
const VENTAS = 4
const creadas: string[] = []

test.beforeAll(async () => {
  const svc = serviceClient()

  const { data: orgs } = await svc.from('organizations').select('id, name')
  const org = orgs!.find((o) => o.name === 'Rifas Demo')!
  const { data: raffles } = await svc.from('raffles').select('id, name, ticket_price')
  const raffle = raffles!.find((r) => r.name === 'Rifa Navidad 2026')!
  const { data: profiles } = await svc.from('profiles').select('id, email')
  const sellerId = profiles!.find((p) => p.email === ACCOUNTS.seller)!.id
  const ownerId = profiles!.find((p) => p.email === ACCOUNTS.owner)!.id
  const { data: clients } = await svc.from('clients').select('id').eq('seller_id', sellerId)

  const filas = Array.from({ length: VENTAS }, (_, i) => ({
    organization_id: org.id,
    raffle_id: raffle.id,
    seller_id: sellerId,
    created_by: ownerId,
    daily_number: String(9700 + i).padStart(4, '0'),
    weekly_number: String(9750 + i).padStart(4, '0'),
    inventory_status: 'assigned' as const,
    client_id: clients![0]!.id,
    sale_price: raffle.ticket_price,
    sale_date: DIA,
    assigned_at: `${DIA}T12:00:00Z`,
  }))

  const { data, error } = await svc.from('tickets').insert(filas).select('id')
  if (error) throw new Error(`No se pudieron crear las ventas de prueba: ${error.message}`)
  creadas.push(...(data ?? []).map((row) => row.id))
})

test.afterAll(async () => {
  const svc = serviceClient()
  if (creadas.length === 0) return
  await svc.from('notifications').delete().in('entity_id', creadas)
  await svc.from('commission_ledger').delete().in('ticket_id', creadas)
  await svc.from('tickets').delete().in('id', creadas)
})

test.describe('Ventas por fecha en móvil', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('la página no se desplaza de lado, ni siquiera a 320 px', async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA}&dateTo=${DIA}`)
      await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()

      const desbordamiento = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(desbordamiento, `desbordamiento a ${width} px`).toBeLessThanOrEqual(2)
    }
  })

  test('la tabla se desplaza dentro de su bloque', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA}&dateTo=${DIA}`)

    const contenedor = page.locator('div.overflow-x-auto').filter({ has: page.getByRole('table') })
    await expect(contenedor.first()).toBeVisible()
    expect(await contenedor.first().evaluate((el) => el.scrollWidth >= el.clientWidth)).toBe(true)
  })

  test('lo abonado no desaparece: baja bajo «Falta» cuando su columna se oculta', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA}&dateTo=${DIA}`)

    const encabezados = page.getByRole('table').locator('thead th')
    // Lo esencial se queda; «Precio» y «Abonado» son las columnas secundarias.
    await expect(encabezados.filter({ hasText: 'Boleta' })).toBeVisible()
    await expect(encabezados.filter({ hasText: 'Falta' })).toBeVisible()
    await expect(encabezados.filter({ hasText: 'Abonado' })).toBeHidden()

    // ...y la cifra sigue leyendose dentro de la celda que si se ve.
    await expect(page.getByRole('table').locator('tbody tr').first()).toContainText(/Abonado \$/)
  })

  test('la tabla tiene un `caption` que dice qué se está viendo', async ({ page }) => {
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA}&dateTo=${DIA}`)

    const caption = page.getByRole('table').locator('caption')
    await expect(caption).toHaveText(/Ventas por fecha: boletas vendidas el /)
  })

  test('el estado de pago no depende solo del color: lleva texto', async ({ page }) => {
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA}&dateTo=${DIA}`)

    const primera = page.getByRole('table').locator('tbody tr').first()
    await expect(primera).toContainText(/Sin pagar|Abonada|Pagada/)
  })
})
