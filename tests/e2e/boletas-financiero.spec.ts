import { expect, test, type Page } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  loadSeedRefs,
  serviceClient,
  signedInClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'
import { formatCOP } from '../../src/lib/money'

/**
 * El dinero de una boleta, en las DOS pantallas que lo enseñan.
 *
 * La promesa del rediseño no es que cada pantalla salga bonita por separado,
 * es que la MISMA boleta diga lo mismo en las dos: mismo abonado, mismo saldo,
 * mismo porcentaje y mismo estado, salgan en «Mis boletas» o en la ficha de su
 * cliente. Por eso las dos partes se prueban con la misma boleta preparada una
 * sola vez, y se comparan los textos exactos.
 *
 * Las cifras se preparan por la RPC real (`create_payment`), no escribiendo
 * `paid_amount` a mano: lo que se comprueba es que la interfaz enseña lo que la
 * base de datos calculo, y con un atajo se estaria comprobando el atajo.
 *
 * Corre en el proyecto de escritorio. La version de telefono de «Mis boletas»
 * vive en `boletas-movil.spec.ts`.
 */

let refs: SeedRefs

/** Boletas y clientes creados aqui. Se borran al terminar (I-035). */
const boletas: string[] = []
const clientes: string[] = []

const PRECIO = 120_000

/**
 * Fecha de los abonos de partida, deliberadamente antigua.
 *
 * «Pagos recientes» del panel administrativo enseña CINCO, ordenados por fecha
 * de pago. Cinco abonos de hoy desplazaban el pago anulado del seed y hacían
 * fallar `reports.spec.ts`, que comprueba justo que un anulado se distingue por
 * texto. Aquí la fecha no es lo que se prueba, así que se aparta.
 */
const FECHA_ABONO = '2026-01-05'

type Escenario = {
  clientId: string
  clientName: string
  ticketId: string
  numeros: { daily: string; weekly: string }
}

/** Un cliente con UNA boleta de $120.000 y, si se pide, un abono ya cobrado. */
async function escenario(nombre: string, abono: number, precio = PRECIO): Promise<Escenario> {
  const cliente = await createClientFor(refs, unique(nombre))
  clientes.push(cliente.id)

  const numeros = randomTicketNumbers()
  const ticket = await createAssignedTicket(refs, {
    dailyNumber: numeros.daily,
    weeklyNumber: numeros.weekly,
    clientId: cliente.id,
    salePrice: precio,
  })
  boletas.push(ticket.id)

  if (abono > 0) {
    const owner = await signedInClient(ACCOUNTS.owner)
    const { error } = await owner.rpc('create_payment', {
      p_client_id: cliente.id,
      p_total_amount: abono,
      p_allocations: [{ ticket_id: ticket.id, amount: abono }],
      p_payment_date: FECHA_ABONO,
      p_payment_method: 'cash',
    })
    expect(error, 'no se pudo registrar el abono de partida').toBeNull()
  }

  return { clientId: cliente.id, clientName: cliente.name, ticketId: ticket.id, numeros }
}

/** La fila de esa boleta dentro de la tabla que se este mirando. */
function fila(page: Page, ticketId: string) {
  return page.getByRole('row').filter({ has: page.locator(`a[href$="${ticketId}"]`) })
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  const svc = serviceClient()

  // Orden obligatorio por las FK, el mismo de `importar-boletas.spec.ts`:
  // asignaciones -> pagos -> boletas -> clientes. Sin él, borrar una boleta con
  // abono falla en silencio y los datos se acumulan (I-035).
  if (boletas.length > 0) {
    const { data: allocations } = await svc
      .from('payment_allocations')
      .select('payment_id')
      .in('ticket_id', boletas)
    const pagos = [...new Set((allocations ?? []).map((row) => row.payment_id))]

    if (pagos.length > 0) {
      await svc.from('payment_allocations').delete().in('payment_id', pagos)
      await svc.from('payments').delete().in('id', pagos)
    }
    await svc.from('tickets').delete().in('id', boletas)
  }

  if (clientes.length > 0) await svc.from('clients').delete().in('id', clientes)
})

test.describe('El dinero de cada boleta en «Mis boletas»', () => {
  test('una boleta abonada enseña abonado, falta, avance y precio', async ({ page }) => {
    const caso = await escenario('Abonada financiero', 50_000)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${caso.numeros.daily}`)

    const row = fila(page, caso.ticketId)
    await expect(row).toBeVisible()

    // Los dos numeros van juntos, con la leyenda que dice cual es cual.
    await expect(
      row.getByRole('link', {
        name: `Ver la boleta ${caso.numeros.daily} / ${caso.numeros.weekly}`,
      }),
    ).toBeVisible()
    await expect(row).toContainText('Diario · Semanal')

    await expect(row).toContainText('Abonada')
    await expect(row).toContainText(formatCOP(50_000))
    await expect(row).toContainText(formatCOP(70_000))
    await expect(row).toContainText('42%')
    await expect(row).toContainText(formatCOP(PRECIO))

    // La barra publica su valor: el color nunca es la unica señal (CLAUDE.md §27).
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-label', '42% abonado')
  })

  test('sin pagar: $0 abonados, todo el precio pendiente y 0%', async ({ page }) => {
    const caso = await escenario('Sin pagar financiero', 0)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${caso.numeros.daily}`)

    const row = fila(page, caso.ticketId)
    await expect(row).toContainText('Sin pagar')
    await expect(row).toContainText(formatCOP(0))
    await expect(row).toContainText(formatCOP(PRECIO))
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  test('pagada: no queda saldo y el avance llega al 100%', async ({ page }) => {
    const caso = await escenario('Pagada financiero', PRECIO)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${caso.numeros.daily}`)

    const row = fila(page, caso.ticketId)
    await expect(row).toContainText('Pagada')
    await expect(row).toContainText('100%')
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  test('el precio es el de LA BOLETA, tambien cuando se rebajo (BR-P11)', async ({ page }) => {
    // $60.000 de precio y $30.000 abonados: el 50%, no el 25% que saldria de
    // dividir por los $120.000 de la rifa.
    const caso = await escenario('Rebajada financiero', 30_000, 60_000)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${caso.numeros.daily}`)

    const row = fila(page, caso.ticketId)
    await expect(row).toContainText(formatCOP(60_000))
    await expect(row).toContainText('50%')
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  test('una boleta sin vender no inventa un saldo: escribe «—»', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets?inventoryStatus=available')

    const primera = page.getByRole('row').nth(1)
    await expect(primera).toContainText('Disponible')
    await expect(primera).toContainText('—')
    await expect(primera.getByRole('progressbar')).toHaveCount(0)
  })
})

test.describe('El dinero de cada boleta en la ficha de su cliente', () => {
  test('la misma boleta dice lo mismo en las dos pantallas', async ({ page }) => {
    const caso = await escenario('Consistencia financiero', 50_000)

    await loginAs(page, ACCOUNTS.seller)

    // 1. En «Mis boletas».
    await page.goto(`/seller/tickets?q=${caso.numeros.daily}`)
    const enListado = fila(page, caso.ticketId)
    await expect(enListado).toContainText(formatCOP(50_000))
    await expect(enListado).toContainText(formatCOP(70_000))
    await expect(enListado.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')

    // 2. En la ficha del cliente: mismas cifras, mismo porcentaje, mismo estado.
    await page.goto(`/seller/clients/${caso.clientId}`)
    const enFicha = fila(page, caso.ticketId)
    await expect(enFicha).toContainText('Abonada')
    await expect(enFicha).toContainText(formatCOP(50_000))
    await expect(enFicha).toContainText(formatCOP(70_000))
    await expect(enFicha).toContainText('42%')
    await expect(enFicha.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')

    // Y lo que esta pantalla añade: de cuanto son esas cifras.
    await expect(enFicha).toContainText(`de ${formatCOP(PRECIO)}`)
  })

  test('la fila lleva al detalle de esa boleta', async ({ page }) => {
    const caso = await escenario('Navegable financiero', 20_000)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${caso.clientId}`)

    await fila(page, caso.ticketId).click()
    await page.waitForURL(`**/seller/tickets/${caso.ticketId}`)
    // El detalle, tercera pantalla con las mismas cuentas, coincide.
    await expect(page.getByText(formatCOP(20_000)).first()).toBeVisible()
    await expect(page.getByText(formatCOP(100_000)).first()).toBeVisible()
  })
})
