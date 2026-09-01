import { expect, test, type Page } from '@playwright/test'

import { serviceClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Reporte «Ventas por fecha» del portal del vendedor (D-151).
 *
 * Las cifras se comprueban contra la BASE, no contra numeros escritos a mano:
 * el seed puede cambiar y una prueba que fija «$960.000» se rompe sin que nada
 * este mal. Lo que se verifica son invariantes —los indicadores cuadran con la
 * suma real, el CSV dice lo mismo que la pantalla, el vendedor no ve nada
 * ajeno—, que siguen siendo ciertas con cualquier dato.
 *
 * LAS VENTAS DE PRUEBA SE CREAN AQUI, en junio de 2019: una ventana muy
 * anterior a cualquier dato del seed y que ninguna otra suite toca. El seed SI
 * vende boletas con fecha de hoy —`assign_ticket` fecha con `today_bogota()`—,
 * asi que no sirve para comprobar el dia elegido, el rango, la segunda pagina
 * ni el estado vacio, que es justamente lo que el encargo pide. Lo que si se
 * comprueba contra el seed es el estado INICIAL: el indicador tiene que decir
 * las ventas de hoy que hay en la base, ni una mas.
 */

const DIA_A = '2019-06-10'
const DIA_B = '2019-06-11'
/** Un dia de la misma ventana en el que nadie vendio: el estado vacio. */
const DIA_VACIO = '2019-06-25'
/** Mas de una pagina de 25 filas, para que el CSV pueda salirse de la primera. */
const VENTAS_DIA_A = 26
const VENTAS_DIA_B = 3

const PRECIO_ESPERADO_TOTAL = { valor: 0 }

/** Ids de todo lo creado, para borrarlo al terminar. */
const creadas: string[] = []
let clienteId = ''
let clienteNombre = ''
let sellerId = ''
let precio = 0

/** El dia de hoy en Bogota, tal como lo calcula la aplicacion. */
function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

/** Descarga el CSV reutilizando la sesion del navegador. */
async function fetchCsv(page: Page, query: string): Promise<{ status: number; body: string }> {
  return page.evaluate(async (q) => {
    const response = await fetch(`/api/reports/export?${q}`)
    return { status: response.status, body: await response.text() }
  }, query)
}

function csvRows(body: string): string[] {
  return body.replace(/^﻿/, '').trim().split('\r\n')
}

/**
 * La tarjeta de un indicador, por su rotulo EXACTO.
 *
 * `getByText('Boletas vendidas')` no vale: busca por subcadena y tambien
 * encuentra el `caption` de la tabla, que dice «boletas vendidas el 10 de jun».
 */
function indicador(page: Page, rotulo: string) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByText(rotulo, { exact: true }) })
}

/** El valor de esa tarjeta, ya en numero: «$120.000» → 120000. */
async function valorIndicador(page: Page, rotulo: string): Promise<number> {
  const texto = await indicador(page, rotulo).locator('p').first().innerText()
  return Number(texto.replace(/[^0-9]/g, '') || '0')
}

/** Cuantas ventas tiene el vendedor de la prueba en un dia concreto. */
async function ventasEnLaBase(dia: string): Promise<number> {
  const { count } = await serviceClient()
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .eq('inventory_status', 'assigned')
    .eq('sale_date', dia)
  return count ?? 0
}

test.beforeAll(async () => {
  const svc = serviceClient()

  const { data: orgs } = await svc.from('organizations').select('id, name')
  const org = orgs!.find((o) => o.name === 'Rifas Demo')!

  const { data: raffles } = await svc
    .from('raffles')
    .select('id, name, organization_id, ticket_price')
  const raffle = raffles!.find((r) => r.name === 'Rifa Navidad 2026')!
  precio = raffle.ticket_price

  const { data: profiles } = await svc.from('profiles').select('id, email')
  sellerId = profiles!.find((p) => p.email === ACCOUNTS.seller)!.id
  const ownerId = profiles!.find((p) => p.email === ACCOUNTS.owner)!.id

  const { data: clients } = await svc.from('clients').select('id, name').eq('seller_id', sellerId)
  clienteId = clients![0]!.id
  clienteNombre = clients![0]!.name

  // Se insertan YA vendidas, con service role: es preparacion de datos, no lo
  // que se esta probando. `assigned_at` se fija tambien en la ventana para que
  // el orden de la tabla sea estable y reproducible.
  const total = VENTAS_DIA_A + VENTAS_DIA_B
  const filas = Array.from({ length: total }, (_, i) => {
    const dia = i < VENTAS_DIA_A ? DIA_A : DIA_B
    return {
      organization_id: org.id,
      raffle_id: raffle.id,
      seller_id: sellerId,
      created_by: ownerId,
      // 9000+ no colisiona con el seed ni con las demas suites.
      daily_number: String(9000 + i).padStart(4, '0'),
      weekly_number: String(9500 + i).padStart(4, '0'),
      inventory_status: 'assigned' as const,
      client_id: clienteId,
      sale_price: precio,
      sale_date: dia,
      assigned_at: `${dia}T12:00:00Z`,
    }
  })

  const { data, error } = await svc.from('tickets').insert(filas).select('id')
  if (error) throw new Error(`No se pudieron crear las ventas de prueba: ${error.message}`)
  creadas.push(...(data ?? []).map((row) => row.id))

  PRECIO_ESPERADO_TOTAL.valor = precio * VENTAS_DIA_A
})

test.afterAll(async () => {
  const svc = serviceClient()
  if (creadas.length === 0) return
  await svc.from('notifications').delete().in('entity_id', creadas)
  await svc.from('commission_ledger').delete().in('ticket_id', creadas)
  await svc.from('tickets').delete().in('id', creadas)
})

// ===========================================================================

test.describe('Ventas por fecha — portal del vendedor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('entrar a Reportes abre «Ventas por fecha» sin pasos ni redirección', async ({ page }) => {
    await page.goto('/seller/reports')

    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Reportes disponibles' })
    await expect(nav.getByRole('link', { name: 'Ventas por fecha' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // No hay redireccion que escriba las fechas en la URL (§3 del encargo).
    expect(new URL(page.url()).search).toBe('')
  })

  test('muestra inicialmente las ventas de HOY, y la cifra coincide con la base', async ({
    page,
  }) => {
    // Lo que se comprueba es que el dia por defecto es hoy y no «todo»: el
    // indicador tiene que decir exactamente las ventas de hoy que hay en la
    // base. Se lee de la base y no se escribe a mano, porque el seed vende
    // boletas con fecha de hoy y ese numero cambia con el seed.
    const hoy = hoyBogota()
    const esperado = await ventasEnLaBase(hoy)

    await page.goto('/seller/reports')

    if (esperado === 0) {
      await expect(page.getByText('No vendiste boletas en este período')).toBeVisible()
      await expect(page.getByRole('table')).toHaveCount(0)
    } else {
      await expect(indicador(page, 'Boletas vendidas')).toContainText(String(esperado))
      // Y no son TODAS las ventas del vendedor: las de 2019 quedan fuera.
      expect(esperado).toBeLessThan(VENTAS_DIA_A)
    }
  })

  test('los dos campos de fecha muestran el día que se está consultando', async ({ page }) => {
    await page.goto('/seller/reports')

    await expect(page.getByLabel('Desde')).toHaveValue(hoyBogota())
    await expect(page.getByLabel('Hasta')).toHaveValue(hoyBogota())
  })

  test('elegir otro día actualiza la URL, los indicadores y la tabla', async ({ page }) => {
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA_A}&dateTo=${DIA_A}`)
    await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()

    await expect(indicador(page, 'Boletas vendidas')).toContainText(String(VENTAS_DIA_A))

    // La paginacion dice el total del rango, no las filas de la pagina.
    await expect(page.getByText(`1–25 de ${VENTAS_DIA_A} boletas`)).toBeVisible()
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(25)
  })

  test('los indicadores cuadran: vendido − abonado = saldo', async ({ page }) => {
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA_A}&dateTo=${DIA_A}`)
    await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()

    const vendido = await valorIndicador(page, 'Total vendido')
    const abonado = await valorIndicador(page, 'Abonado')
    const saldo = await valorIndicador(page, 'Saldo pendiente')

    expect(vendido).toBe(PRECIO_ESPERADO_TOTAL.valor)
    expect(vendido - abonado).toBe(saldo)
  })

  test('un rango de varios días suma los dos días', async ({ page }) => {
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA_A}&dateTo=${DIA_B}`)
    await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()

    await expect(page.getByText(`1–25 de ${VENTAS_DIA_A + VENTAS_DIA_B} boletas`)).toBeVisible()
  })

  test('la fila enlaza a la boleta y al cliente', async ({ page }) => {
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA_B}&dateTo=${DIA_B}`)
    const tabla = page.getByRole('table')
    await expect(tabla.locator('tbody tr').first()).toBeVisible()

    // El cliente lleva a SU ficha dentro del portal del vendedor.
    await tabla.getByRole('link', { name: clienteNombre }).first().click()
    await expect(page).toHaveURL(new RegExp(`/seller/clients/${clienteId}`))

    await page.goBack()
    const boleta = tabla.getByRole('link', { name: /^Ver la boleta / }).first()
    await boleta.click()
    await expect(page).toHaveURL(/\/seller\/tickets\/[0-9a-f-]{36}/)
    await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
  })

  test('un día sin ventas muestra el estado vacío, no una tabla vacía', async ({ page }) => {
    await page.goto(
      `/seller/reports?report=sales-by-date&dateFrom=${DIA_VACIO}&dateTo=${DIA_VACIO}`,
    )

    await expect(page.getByText('No vendiste boletas en este período')).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
  })

  test('«Desde» posterior a «Hasta» avisa en vez de consultar', async ({ page }) => {
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA_B}&dateTo=${DIA_A}`)

    await expect(page.getByText('Las fechas están al revés')).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    // Las dos fechas siguen a la vista para poder corregirlas.
    await expect(page.getByLabel('Desde')).toHaveValue(DIA_B)
    await expect(page.getByLabel('Hasta')).toHaveValue(DIA_A)
  })

  test('«Limpiar filtros» vuelve al estado inicial de hoy', async ({ page }) => {
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA_A}&dateTo=${DIA_A}`)

    await page.getByRole('button', { name: 'Limpiar filtros' }).click()

    // Las fechas salen de la URL y los dos campos vuelven a hoy: el estado
    // inicial no es «sin filtro», es el dia de hoy (D-151).
    await expect(page).toHaveURL(/\/seller\/reports\?report=sales-by-date$/)
    await expect(page.getByLabel('Desde')).toHaveValue(hoyBogota())
    await expect(page.getByLabel('Hasta')).toHaveValue(hoyBogota())
    // Y el boton desaparece: sin filtros en la URL no hay nada que limpiar.
    await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toHaveCount(0)
  })

  test('el CSV trae el mismo rango y filas de fuera de la primera página', async ({ page }) => {
    await page.goto(`/seller/reports?report=sales-by-date&dateFrom=${DIA_A}&dateTo=${DIA_A}`)
    await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()

    const { status, body } = await fetchCsv(
      page,
      `report=sales-by-date&dateFrom=${DIA_A}&dateTo=${DIA_A}`,
    )
    expect(status).toBe(200)

    const filas = csvRows(body)
    expect(filas[0]).toContain('Fecha de venta')
    expect(filas[0]).toContain('Saldo pendiente')
    // Encabezado + 26 ventas: el archivo NO se limita a la pagina visible.
    expect(filas).toHaveLength(VENTAS_DIA_A + 1)

    // Formato de D-056: separador `;` y fecha DD/MM/AAAA. El BOM NO se puede
    // comprobar aqui: `response.text()` lo consume al decodificar UTF-8 y
    // llegaria siempre la 'F' de «Fecha». Lo cubre `unit/csv.test.ts`, que mira
    // la cadena que genera `toCsv` antes de viajar.
    expect(filas[1]).toContain('10/06/2019')
    expect(filas[1]!.split(';').length).toBe(filas[0]!.split(';').length)
  })

  test('el CSV sin fechas trae el mismo día que muestra la pantalla', async ({ page }) => {
    await page.goto('/seller/reports')
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()

    const href = await page.getByRole('link', { name: 'Exportar CSV' }).getAttribute('href')

    // El enlace lleva las fechas YA resueltas, no las crudas de la URL —que
    // aqui no trae ninguna—, para que el archivo no dependa de que el dia haya
    // cambiado desde que se abrio la pantalla.
    expect(href).toContain(`dateFrom=${hoyBogota()}`)
    expect(href).toContain(`dateTo=${hoyBogota()}`)
  })

  test('el CSV no contiene ventas de otro vendedor', async ({ page }) => {
    const svc = serviceClient()
    const { data: profiles } = await svc.from('profiles').select('id, email')
    const miId = profiles!.find((p) => p.email === ACCOUNTS.seller)!.id

    // Boletas vendidas que NO son de vendedor1: ninguno de sus números puede
    // aparecer en el archivo, por amplio que sea el rango que se pida.
    const { data: ajenas } = await svc
      .from('tickets')
      .select('daily_number, weekly_number')
      .eq('inventory_status', 'assigned')
      .neq('seller_id', miId)
      .limit(200)

    const { body } = await fetchCsv(
      page,
      'report=sales-by-date&dateFrom=2019-01-01&dateTo=2030-12-31',
    )
    for (const boleta of ajenas ?? []) {
      if (boleta.daily_number && boleta.weekly_number) {
        expect(body).not.toContain(`${boleta.daily_number} / ${boleta.weekly_number}`)
      }
    }
  })
})

// ===========================================================================

test.describe('El reporte no se cuela en el portal administrativo', () => {
  test('«Por vendedor» sigue siendo el reporte inicial del Dueño', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/reports')

    const nav = page.getByRole('navigation', { name: 'Reportes disponibles' })
    await expect(nav.getByRole('link', { name: 'Por vendedor' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(nav.getByRole('link', { name: 'Ventas por fecha' })).toHaveCount(0)
  })

  test('pedirlo por URL desde el portal administrativo cae en «Por vendedor»', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/reports?report=sales-by-date')

    const nav = page.getByRole('navigation', { name: 'Reportes disponibles' })
    await expect(nav.getByRole('link', { name: 'Por vendedor' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('los demás reportes del vendedor siguen accesibles por su enlace', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    for (const [report, etiqueta] of [
      ['payments', 'Pagos por fecha'],
      ['ticket-status', 'Boletas por estado'],
      ['raffles', 'Boletas por rifa'],
      ['client-balances', 'Clientes con saldo'],
    ] as const) {
      await page.goto(`/seller/reports?report=${report}`)
      await expect(
        page
          .getByRole('navigation', { name: 'Reportes disponibles' })
          .getByRole('link', { name: etiqueta }),
      ).toHaveAttribute('aria-current', 'page')
    }
  })

  test('un vendedor no puede exportar «Por vendedor»', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports')
    expect((await fetchCsv(page, 'report=sellers')).status).toBe(403)
  })

  test('el Dueño no puede exportar «Ventas por fecha», que no es de su portal', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/reports')
    expect((await fetchCsv(page, 'report=sales-by-date')).status).toBe(403)
  })
})
