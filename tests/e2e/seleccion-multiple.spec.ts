import { expect, test, type Page } from '@playwright/test'

import {
  createAssignedTicket,
  createClientFor,
  createTicket,
  loadSeedRefs,
  raffleTicketPrice,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import {
  ACCOUNTS,
  expectToast,
  loginAs,
  randomTicketNumbers,
  toggleCheckbox,
  unique,
} from './fixtures'
import { formatCOP } from '../../src/lib/money'

/**
 * Seleccion multiple y acciones masivas en la lista de boletas (BR-B01..BR-B08).
 *
 * Estas pruebas recorren lo que ninguna prueba de base de datos puede ver: que
 * la seleccion sobrevive a buscar y filtrar, que «Limpiar filtros» y «Limpiar
 * selección» son cosas distintas, que la fila no se mueve al marcarla, y que un
 * lote con una boleta incompatible se explica en vez de ejecutarse a medias.
 *
 * La variante tactil —modo seleccion, fila entera como diana, barra pegada
 * abajo— vive en `seleccion-movil.spec.ts`, que corre con viewport de telefono.
 */

let refs: SeedRefs

/** Boletas y clientes creados por esta suite. Se borran al terminar (I-035). */
const creadas: string[] = []
const clientesCreados: string[] = []

async function nuevaBoleta(
  estado: 'draft' | 'pending_approval' | 'available' = 'available',
): Promise<{ id: string; daily: string; weekly: string }> {
  const numbers = randomTicketNumbers()
  const ticket = await createTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    inventoryStatus: estado,
  })
  creadas.push(ticket.id)
  return { id: ticket.id, daily: numbers.daily, weekly: numbers.weekly }
}

type Boleta = { daily: string; weekly: string }

/**
 * La casilla de una boleta, localizada por su nombre accesible.
 *
 * Se usa la COMBINACION completa y no solo el numero diario: el diario puede
 * repetirse entre boletas —lo unico unico es la pareja (BR-N04)— y buscar por
 * uno solo acaba encontrando dos filas.
 */
function casilla(page: Page, boleta: Boleta) {
  return page.getByRole('checkbox', {
    name: `Seleccionar la boleta ${boleta.daily} / ${boleta.weekly}`,
  })
}

async function marcar(page: Page, boleta: Boleta) {
  await toggleCheckbox(casilla(page, boleta), true)
}

async function desmarcar(page: Page, boleta: Boleta) {
  await toggleCheckbox(casilla(page, boleta), false)
}

/** El recuento de la barra de selección: «3 seleccionadas». */
function recuento(page: Page) {
  return page.getByRole('status')
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  const svc = serviceClient()
  if (creadas.length > 0) await svc.from('tickets').delete().in('id', creadas)
  if (clientesCreados.length > 0) await svc.from('clients').delete().in('id', clientesCreados)
})

test.describe('Selección en escritorio', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('marca, desmarca y limpia la selección', async ({ page }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()

    await page.goto('/owner/tickets')
    await expect(page.getByRole('columnheader', { name: 'Boleta', exact: true })).toBeVisible()

    await marcar(page, a)
    await expect(recuento(page)).toHaveText('1 seleccionada')

    await marcar(page, b)
    await expect(recuento(page)).toHaveText('2 seleccionadas')

    await desmarcar(page, b)
    await expect(recuento(page)).toHaveText('1 seleccionada')

    await page.getByRole('button', { name: 'Limpiar selección' }).click()
    await expect(recuento(page)).toHaveText('')
  })

  test('la selección sobrevive a buscar: se acumulan boletas de dos búsquedas', async ({
    page,
  }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()

    await page.goto(`/owner/tickets?q=${a.daily}`)
    await marcar(page, a)
    await expect(recuento(page)).toHaveText('1 seleccionada')

    // Segunda busqueda: la boleta anterior ya no esta en pantalla, pero sigue
    // seleccionada (seccion 11 del encargo).
    await page.goto(`/owner/tickets?q=${b.daily}`)
    await expect(recuento(page)).toHaveText('1 seleccionada')
    await marcar(page, b)
    await expect(recuento(page)).toHaveText('2 seleccionadas')
  })

  test('la selección sobrevive a filtrar y a cambiar de página', async ({ page }) => {
    const a = await nuevaBoleta()

    await page.goto(`/owner/tickets?q=${a.daily}`)
    await marcar(page, a)
    await expect(recuento(page)).toHaveText('1 seleccionada')

    await page.goto('/owner/tickets?inventoryStatus=assigned')
    await expect(recuento(page)).toHaveText('1 seleccionada')

    await page.goto('/owner/tickets?page=2')
    await expect(recuento(page)).toHaveText('1 seleccionada')
  })

  test('«Limpiar filtros» no borra la selección', async ({ page }) => {
    const a = await nuevaBoleta()

    await page.goto(`/owner/tickets?q=${a.daily}`)
    await marcar(page, a)

    await page.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(page).toHaveURL('/owner/tickets')
    await expect(recuento(page)).toHaveText('1 seleccionada')
  })

  test('marcar una fila no la mueve de sitio', async ({ page }) => {
    await page.goto('/owner/tickets')
    await expect(page.getByRole('columnheader', { name: 'Boleta', exact: true })).toBeVisible()

    const antes = await page.getByRole('link', { name: /Ver la boleta/ }).allInnerTexts()
    // Se marca una del medio: si la lista reordenara, seria la primera despues.
    await toggleCheckbox(page.getByRole('row').nth(3).getByRole('checkbox'), true)
    await expect(recuento(page)).toHaveText(/seleccionada/)

    const despues = await page.getByRole('link', { name: /Ver la boleta/ }).allInnerTexts()
    expect(despues).toEqual(antes)
  })

  test('la casilla del encabezado marca las boletas visibles y ofrece el resto', async ({
    page,
  }) => {
    await page.goto('/owner/tickets')
    await expect(page.getByRole('columnheader', { name: 'Boleta', exact: true })).toBeVisible()

    const visibles = await page.getByRole('link', { name: /Ver la boleta/ }).count()
    await toggleCheckbox(
      page.getByRole('checkbox', { name: 'Seleccionar las boletas de esta página' }),
      true,
    )
    await expect(recuento(page)).toHaveText(`${visibles} seleccionadas`)

    // Segundo paso explicito: hasta aqui solo estaban marcadas las visibles
    // (seccion 16 del encargo).
    const ampliar = page.getByRole('button', { name: /Seleccionar las \d+ boletas del filtro/ })
    await expect(ampliar).toBeVisible()
    await ampliar.click()
    await expect(recuento(page)).not.toHaveText(`${visibles} seleccionadas`)
  })

  test('«Ver seleccionadas» muestra solo las marcadas y conserva los filtros', async ({ page }) => {
    const a = await nuevaBoleta()

    await page.goto(`/owner/tickets?q=${a.daily}`)
    await marcar(page, a)

    await page.getByRole('button', { name: 'Ver seleccionadas' }).click()
    await expect(page.getByText('Estás viendo solo las boletas seleccionadas.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Ver la boleta/ })).toHaveCount(1)

    await page.getByRole('button', { name: 'Volver a los resultados' }).click()
    // El filtro sigue en la URL y en el campo de busqueda.
    await expect(page).toHaveURL(new RegExp(`q=${a.daily}`))
  })
})

test.describe('Acciones masivas de Dueño y Administrador', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('anula varias boletas con un solo motivo', async ({ page }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()

    await page.goto('/owner/tickets')
    await marcar(page, a)
    await marcar(page, b)

    await page.getByRole('button', { name: /^Anular boletas/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('2 seleccionadas', { exact: false })).toBeVisible()

    // Sin motivo no se puede continuar.
    await expect(dialog.getByRole('button', { name: 'Anular 2 boletas' })).toBeDisabled()

    await dialog.getByLabel('Motivo (obligatorio)').fill('Se cargaron por error')
    await dialog.getByRole('button', { name: 'Anular 2 boletas' }).click()

    await expectToast(page, /Se anularon 2 boletas/)
    await expect(recuento(page)).toHaveText('')
  })

  test('TODO O NADA: una boleta anulada dentro del grupo bloquea la anulación', async ({ page }) => {
    const buena = await nuevaBoleta()
    const anulada = await nuevaBoleta()
    // Preparacion del estado de partida con la service role: `cancel_ticket`
    // necesita `auth.uid()`, que la clave de servicio no tiene (D-043).
    await serviceClient()
      .from('tickets')
      .update({
        inventory_status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'Anulada antes de la prueba',
      })
      .eq('id', anulada.id)

    await page.goto('/owner/tickets')
    await marcar(page, buena)
    await marcar(page, anulada)

    await page.getByRole('button', { name: /^Anular boletas/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('No se puede continuar todavía.')).toBeVisible()
    await expect(dialog.getByText('Ya está anulada.')).toBeVisible()

    await dialog.getByLabel('Motivo (obligatorio)').fill('Intento con una anulada')
    await expect(dialog.getByRole('button', { name: 'Anular 2 boletas' })).toBeDisabled()
  })

  test('cambia el vendedor de varias boletas a la vez', async ({ page }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()

    await page.goto('/owner/tickets')
    await marcar(page, a)
    await marcar(page, b)

    await page.getByRole('button', { name: /^Cambiar vendedor/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Cambiar 2 boletas' })).toBeDisabled()

    await dialog.getByLabel('Nuevo vendedor').click()
    await page.getByRole('option').nth(1).click()
    await dialog.getByRole('button', { name: 'Cambiar 2 boletas' }).click()

    await expectToast(page, /2 boletas cambiaron de vendedor/)
  })

  test('elimina boletas cargadas por error, con motivo', async ({ page }) => {
    const a = await nuevaBoleta()

    await page.goto(`/owner/tickets?q=${a.daily}`)
    await marcar(page, a)

    await page.getByRole('button', { name: /^Eliminar boletas/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByText('Solo se pueden eliminar boletas que todavía no se vendieron', {
        exact: false,
      }),
    ).toBeVisible()

    await dialog.getByLabel('Motivo (obligatorio)').fill('Importación equivocada')
    await dialog.getByRole('button', { name: 'Eliminar 1 boleta' }).click()

    await expectToast(page, /Se eliminaron 1 boleta/)

    const { count } = await serviceClient()
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('id', a.id)
    expect(count).toBe(0)
  })

  test('no deja eliminar una boleta con cliente', async ({ page }) => {
    const numbers = randomTicketNumbers()
    const cliente = await createClientFor(refs, unique('Cliente selección'))
    clientesCreados.push(cliente.id)
    const vendida = await createAssignedTicket(refs, {
      dailyNumber: numbers.daily,
      weeklyNumber: numbers.weekly,
      clientId: cliente.id,
      salePrice: await raffleTicketPrice(refs),
    })
    creadas.push(vendida.id)

    await page.goto(`/owner/tickets?q=${numbers.daily}`)
    await marcar(page, numbers)

    await page.getByRole('button', { name: /^Eliminar boletas/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('No se puede continuar todavía.')).toBeVisible()
    await expect(dialog.getByText('Ya está vendida a un cliente.')).toBeVisible()

    await dialog.getByLabel('Motivo (obligatorio)').fill('Intento sobre una vendida')
    await expect(dialog.getByRole('button', { name: 'Eliminar 1 boleta' })).toBeDisabled()
  })

  test('aprueba en lote desde la selección compartida (BR-I09)', async ({ page }) => {
    const a = await nuevaBoleta('pending_approval')
    const b = await nuevaBoleta('pending_approval')

    await page.goto('/owner/tickets?inventoryStatus=pending_approval')
    await marcar(page, a)
    await marcar(page, b)

    await page.getByRole('button', { name: /^Aprobar boletas/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Aprobar 2 boletas' }).click()

    await expectToast(page, /Se aprobaron 2 boletas/)
  })
})

test.describe('Asignación múltiple del vendedor', () => {
  test('vende varias boletas al mismo cliente en una sola operación', async ({ page }) => {
    const a = await nuevaBoleta()
    const b = await nuevaBoleta()
    const c = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets?inventoryStatus=available')
    await expect(page.getByRole('columnheader', { name: 'Boleta', exact: true })).toBeVisible()

    await marcar(page, a)
    await marcar(page, b)
    await marcar(page, c)
    await expect(recuento(page)).toHaveText('3 seleccionadas')

    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('3 boletas', { exact: true })).toBeVisible()
    // El total sale del precio vigente de la rifa, no de una cifra fija. Estaba
    // escrito a mano («$300.000») y la corrección de precio lo delató (D-098).
    const total = formatCOP(3 * (await raffleTicketPrice(refs)))
    await expect(dialog.getByText(total)).toBeVisible()
    // El resumen inferior duplicado ya no existe: el texto combinado de antes
    // ya no aparece como un solo nodo.
    await expect(dialog.getByText('3 boletas seleccionadas')).toHaveCount(0)

    await dialog.getByRole('option').first().click()
    await dialog.getByRole('button', { name: 'Asignar 3 boletas' }).click()

    await expectToast(page, /Se asignaron 3 boletas/)
  })

  test('el vendedor no ve las acciones de administración', async ({ page }) => {
    const a = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${a.daily}`)
    await marcar(page, a)

    await expect(page.getByRole('button', { name: /^Anular boletas/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Eliminar boletas/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Cambiar vendedor/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Asignar a un cliente' })).toBeVisible()
  })

  test('no vende ninguna si una de las seleccionadas dejó de estar disponible', async ({
    page,
  }) => {
    const buena = await nuevaBoleta()
    const pendiente = await nuevaBoleta('pending_approval')

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/tickets')
    await marcar(page, buena)
    await marcar(page, pendiente)

    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('No se puede continuar todavía.')).toBeVisible()
    await expect(dialog.getByText('Falta que un administrador la apruebe.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Asignar/ })).toHaveCount(0)
  })
})

/**
 * El frontend no es la frontera (secciones 37 y 38 del encargo).
 *
 * Estas pruebas se saltan la interfaz por completo: toman el token real que el
 * navegador guarda tras iniciar sesión y llaman a las funciones directamente,
 * que es lo que haría alguien con las herramientas de desarrollo abiertas y los
 * identificadores a la vista.
 */
test.describe('Acciones masivas llamadas a mano, sin pasar por la pantalla', () => {
  const ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

  /** Llama una función de PostgreSQL con la sesión real del navegador. */
  async function llamar(page: Page, funcion: string, cuerpo: Record<string, unknown>) {
    return page.evaluate(
      async ({ funcion, cuerpo, anon }) => {
        const cookie = document.cookie
          .split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith('sb-') && c.includes('-auth-token='))
        if (!cookie) return { status: 0, body: 'sin cookie de sesión' }

        const raw = decodeURIComponent(cookie.split('=').slice(1).join('='))
        const json = raw.startsWith('base64-') ? atob(raw.slice('base64-'.length)) : raw
        const token = JSON.parse(json).access_token as string

        const respuesta = await fetch(`http://127.0.0.1:54321/rest/v1/rpc/${funcion}`, {
          method: 'POST',
          headers: {
            apikey: anon,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cuerpo),
        })
        return { status: respuesta.status, body: await respuesta.text() }
      },
      { funcion, cuerpo, anon: ANON },
    )
  }

  test('un vendedor no puede asignarse las boletas de otro vendedor', async ({ page }) => {
    const ajena = await nuevaBoleta()
    await serviceClient()
      .from('tickets')
      .update({ seller_id: refs.otherSellerId })
      .eq('id', ajena.id)

    await loginAs(page, ACCOUNTS.seller)
    const respuesta = await llamar(page, 'bulk_assign_tickets', {
      p_ticket_ids: [ajena.id],
      p_client_id: null,
      p_sale_date: '2026-08-08',
    })

    expect(respuesta.status).toBeGreaterThanOrEqual(400)
    const { data } = await serviceClient()
      .from('tickets')
      .select('inventory_status, client_id')
      .eq('id', ajena.id)
      .single()
    expect(data!.inventory_status).toBe('available')
    expect(data!.client_id).toBeNull()
  })

  test('un vendedor no puede anular ni eliminar aunque conozca los identificadores', async ({
    page,
  }) => {
    const propia = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.seller)

    const anular = await llamar(page, 'bulk_cancel_tickets', {
      p_ticket_ids: [propia.id],
      p_reason: 'Intento directo del vendedor',
    })
    const eliminar = await llamar(page, 'bulk_delete_tickets', {
      p_ticket_ids: [propia.id],
      p_reason: 'Intento directo del vendedor',
    })

    expect(anular.status).toBeGreaterThanOrEqual(400)
    expect(eliminar.status).toBeGreaterThanOrEqual(400)

    const { data } = await serviceClient()
      .from('tickets')
      .select('inventory_status')
      .eq('id', propia.id)
      .single()
    expect(data!.inventory_status).toBe('available')
  })

  test('un vendedor no puede repartirse boletas cambiándoles el vendedor', async ({ page }) => {
    const boleta = await nuevaBoleta()

    await loginAs(page, ACCOUNTS.otherSeller)
    const respuesta = await llamar(page, 'bulk_change_ticket_seller', {
      p_ticket_ids: [boleta.id],
      p_seller_id: refs.otherSellerId,
    })

    expect(respuesta.status).toBeGreaterThanOrEqual(400)
    const { data } = await serviceClient()
      .from('tickets')
      .select('seller_id')
      .eq('id', boleta.id)
      .single()
    expect(data!.seller_id).toBe(refs.sellerId)
  })
})
