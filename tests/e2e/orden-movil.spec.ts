import { expect, test, type Page } from '@playwright/test'

import { loadSeedRefs, serviceClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * EN EL TELEFONO no hay tabla: hay tarjetas (D-107), asi que no hay cabecera
 * que pulsar. El orden llega por la direccion —compartida, pegada o guardada—
 * y lo que hay que comprobar es que las tarjetas salen en el orden que dio la
 * base, no en el que tenian antes.
 *
 * Que el telefono no OFREZCA ordenar es anterior a este bloque y queda
 * anotado (I-155): la lista de tarjetas nunca tuvo ese control.
 */
test.describe('En el telefono el orden llega por la direccion', () => {
  const STAMP = Date.now().toString(36).slice(-5)
  const PRECIOS = [60_000, 80_000, 100_000, 120_000, 150_000]
  let raffleId = ''

  test.beforeAll(async () => {
    const svc = serviceClient()
    const refs = await loadSeedRefs()
    const { data: raffle } = await svc
      .from('raffles')
      .insert({
        organization_id: refs.organizationId,
        name: `Rifa orden movil ${STAMP}`,
        ticket_price: 120_000,
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        created_by: refs.ownerId,
      })
      .select('id')
      .single()
    raffleId = raffle!.id

    await svc.from('tickets').insert(
      Array.from({ length: 60 }, (_, i) => ({
        organization_id: refs.organizationId,
        raffle_id: raffleId,
        seller_id: refs.sellerId,
        created_by: refs.ownerId,
        daily_number: String(i).padStart(4, '0'),
        weekly_number: String(7000 + i),
        inventory_status: 'available' as const,
        sale_price: PRECIOS[i % PRECIOS.length],
      })),
    )
  })

  test.afterAll(async () => {
    if (!raffleId) return
    const svc = serviceClient()
    await svc.from('tickets').delete().eq('raffle_id', raffleId)
    await svc.from('raffles').delete().eq('id', raffleId)
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  /** Los precios de las tarjetas, en el orden en que se ven. */
  async function preciosDeTarjetas(page: Page): Promise<number[]> {
    return page.evaluate(() =>
      [...document.querySelectorAll('li')]
        .map((li) => li.textContent ?? '')
        .map((texto) => texto.match(/\$[\d.]+/)?.[0] ?? '')
        .filter((precio) => precio !== '')
        .map((precio) => Number(precio.replace(/[^0-9]/g, ''))),
    )
  }

  test('las tarjetas salen en el orden que dio la base, y la pagina 2 no lo rompe', async ({
    page,
  }) => {
    const base = `/seller/tickets?raffleId=${raffleId}&sort=salePrice&dir=desc`

    await page.goto(base)
    await expect(page.getByText(/1–25 de 60 boletas/)).toBeVisible()
    const primera = await preciosDeTarjetas(page)
    expect(primera.length).toBeGreaterThan(0)
    expect(primera[0]).toBe(150_000)
    expect([...primera].sort((a, b) => b - a)).toEqual(primera)

    await page.goto(`${base}&page=2`)
    const segunda = await preciosDeTarjetas(page)
    expect(Math.max(...segunda)).toBeLessThanOrEqual(Math.min(...primera))
  })

  test('la paginacion del telefono dice que esta contando', async ({ page }) => {
    await page.goto(`/seller/tickets?raffleId=${raffleId}`)
    // En movil el indicador central dice «1 de 3», y el recuento sigue estando
    // para quien escucha la pantalla (D-111).
    await expect(page.getByText(/1–25 de 60 boletas/)).toBeVisible()
  })
})
