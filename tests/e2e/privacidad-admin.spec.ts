import { expect, test, type Page } from '@playwright/test'

import { serviceClient } from './db-setup'
import { ACCOUNTS, loginAs, toggleCheckbox } from './fixtures'
import {
  ABONO_SECRETO,
  borrarCarteraSecreta,
  crearCarteraSecreta,
  descargarCsv,
  expectSinSecretos,
  PRECIO_SECRETO,
  registrarRespuestas,
  SALDO_SECRETO,
  type CarteraSecreta,
} from './privacidad-escenario'
import { formatCOP } from '../../src/lib/money'

/**
 * La cartera es del vendedor (D-198, BR-Q01..BR-Q10), comprobada donde de
 * verdad se filtraria: en lo que el navegador RECIBE.
 *
 * `toHaveCount(0)` sobre un texto solo prueba que no se pinta. Estas pruebas
 * guardan ademas el HTML, la carga RSC de cada navegacion, las respuestas de red
 * y los CSV, y buscan en ellos los valores del escenario —nombre, alias,
 * telefono, correo, notas e id del cliente, precio rebajado, abono, saldo y la
 * nota del pago—. Si uno llega al Dueño o al Administrador, la prueba falla
 * aunque ninguna pantalla lo enseñe.
 *
 * Las reglas SQL las prueba `tests/db/admin-privacy.test.ts`; la version de
 * telefono vive en `privacidad-admin-movil.spec.ts`.
 */

let cartera: CarteraSecreta

test.beforeAll(async () => {
  cartera = await crearCarteraSecreta()
})

test.afterAll(async () => {
  await borrarCarteraSecreta(cartera)
})

const PERSONAL = [
  { rol: 'Dueño', email: ACCOUNTS.owner },
  { rol: 'Administrador', email: ACCOUNTS.admin },
] as const

/** La fila de la boleta del escenario, en la tabla que se este mirando. */
function filaDeLaBoleta(page: Page) {
  return page.getByRole('row').filter({ has: page.locator(`a[href$="/${cartera.ticketId}"]`) })
}

for (const { rol, email } of PERSONAL) {
  test.describe(`${rol}: la cartera del vendedor no llega al navegador`, () => {
    test('la lista enseña la boleta con dos estados de pago, sin cliente ni dinero', async ({
      page,
    }) => {
      await loginAs(page, email)
      const red = registrarRespuestas(page)
      await page.goto(`/owner/tickets?q=${cartera.numeros.daily}`)

      const fila = filaDeLaBoleta(page)
      await expect(fila).toBeVisible()
      // Tiene un abono parcial: para el personal es «Sin pagar», nunca «Abonada».
      await expect(fila.getByText('Sin pagar', { exact: true })).toBeVisible()
      await expect(fila).not.toContainText('Abonada')
      await expect(fila).toContainText(cartera.sellerName)

      const encabezados = (await page.getByRole('columnheader').allInnerTexts()).join('|')
      expect(encabezados).not.toMatch(/Cliente|Precio|Abonado|Falta|Progreso/)

      expectSinSecretos((await red.texto()) + (await page.content()), cartera, 'lista de boletas')
    })

    test('el detalle no trae cliente, precio, abonos ni saldo, ni acciones de la venta', async ({
      page,
    }) => {
      await loginAs(page, email)
      const red = registrarRespuestas(page)
      await page.goto(`/owner/tickets/${cartera.ticketId}`)

      await expect(page.getByRole('heading', { name: 'Detalle boleta' })).toBeVisible()
      await expect(page.getByText('Sin pagar', { exact: true })).toBeVisible()
      await expect(page.getByText('Abonada')).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: /cliente|abono|precio|liberar|anular/i }),
      ).toHaveCount(0)
      await expect(page.locator('a[href*="/clients"], a[href*="/payments"]')).toHaveCount(0)

      expectSinSecretos(
        (await red.texto()) + (await page.content()),
        cartera,
        'detalle de la boleta',
      )
    })

    test('buscar el nombre, el alias, el correo o el teléfono responde como algo que no existe', async ({
      page,
    }) => {
      await loginAs(page, email)

      const buscar = async (termino: string) => {
        const red = registrarRespuestas(page)
        await page.goto(`/owner/tickets?q=${encodeURIComponent(termino)}`)
        await expect(page.getByText('Ninguna boleta coincide con los filtros')).toBeVisible()
        const pantalla = await page.locator('main').innerText()
        const recibido = (await red.texto()) + (await page.content())
        red.detener()
        return { pantalla, recibido }
      }

      for (const [real, inventado] of [
        [cartera.nombre, 'Zafiro Inexistente zzyzx'],
        [cartera.alias, 'alias-inexistente-zzyzx'],
        [cartera.correo, 'nadie.zzyzx@privado.test'],
        [cartera.telefono, '3999999999'],
      ] as const) {
        const conReal = await buscar(real)
        await expect(filaDeLaBoleta(page)).toHaveCount(0)
        const conInventado = await buscar(inventado)

        expect(conReal.pantalla, `buscar «${real}»`).toBe(conInventado.pantalla)
        // Lo escrito vuelve en el campo y en la dirección; nada MÁS de la cartera.
        expectSinSecretos(conReal.recibido, cartera, `buscar «${real}»`, [real])
      }
    })

    test('el filtro de pago tiene dos estados, cuenta antes de paginar e ignora los parámetros antiguos', async ({
      page,
    }) => {
      await loginAs(page, email)
      const q = cartera.numeros.daily
      const fila = filaDeLaBoleta(page)

      await page.goto(`/owner/tickets?q=${q}&paymentStatus=unpaid`)
      await expect(fila).toBeVisible()

      await page.goto(`/owner/tickets?q=${q}&paymentStatus=paid`)
      await expect(page.getByRole('heading', { name: 'Boletas', exact: true })).toBeVisible()
      await expect(fila).toHaveCount(0)

      // Un `partial` de un enlace antiguo no se aplica ni se nombra.
      await page.goto(`/owner/tickets?q=${q}&paymentStatus=partial`)
      await expect(fila).toBeVisible()
      await expect(page.locator('main')).not.toContainText('Abonada')

      // Un `clientId` antiguo tampoco filtra por el cliente.
      await page.goto(`/owner/tickets?q=${q}&clientId=${cartera.clientId}`)
      await expect(fila).toBeVisible()

      // El desplegable ofrece exactamente los dos estados.
      await page.goto('/owner/tickets')
      await page.getByRole('combobox', { name: 'Estado de pago' }).click()
      await expect(page.getByRole('option')).toHaveText(['Todos los pagos', 'Sin pagar', 'Pagada'])
      await page.keyboard.press('Escape')

      // Y «Sin pagar» se cuenta ANTES de paginar: el total es el de la base.
      const asignadas = () =>
        serviceClient()
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', cartera.refs.organizationId)
          .eq('inventory_status', 'assigned')
      const [{ count: total }, { count: pagadas }] = await Promise.all([
        asignadas(),
        asignadas().eq('payment_status', 'paid'),
      ])

      await page.goto('/owner/tickets?paymentStatus=unpaid')
      await expect(page.getByText(new RegExp(`de ${total! - pagadas!} boletas?$`))).toBeVisible()
      await page.goto('/owner/tickets?paymentStatus=paid')
      await expect(page.getByText(new RegExp(`de ${pagadas} boletas?$`))).toBeVisible()
    })

    test('la selección y «Ver seleccionadas» tampoco traen la cartera', async ({ page }) => {
      await loginAs(page, email)
      const red = registrarRespuestas(page)
      await page.goto(`/owner/tickets?q=${cartera.numeros.daily}`)

      await toggleCheckbox(
        page.getByRole('checkbox', {
          name: `Seleccionar la boleta ${cartera.numeros.daily} / ${cartera.numeros.weekly}`,
        }),
        true,
      )
      await page.getByRole('button', { name: 'Ver seleccionadas' }).click()

      const fila = filaDeLaBoleta(page)
      await expect(fila).toBeVisible()
      await expect(fila.getByText('Sin pagar', { exact: true })).toBeVisible()

      expectSinSecretos(
        (await red.texto()) + (await page.content()),
        cartera,
        'boletas seleccionadas',
      )
    })

    test('el menú no ofrece Clientes ni Pagos, y sus direcciones no existen', async ({ page }) => {
      await loginAs(page, email)

      const lateral = page.locator('[data-tour="nav-sidebar"]')
      await expect(lateral.getByRole('link', { name: 'Boletas', exact: true })).toBeVisible()
      for (const nombre of ['Clientes', 'Pagos']) {
        await expect(lateral.getByRole('link', { name: nombre, exact: true })).toHaveCount(0)
      }
      await expect(
        page.locator('a[href^="/owner/clients"], a[href^="/owner/payments"]'),
      ).toHaveCount(0)

      for (const ruta of [
        '/owner/clients',
        `/owner/clients/${cartera.clientId}`,
        '/owner/payments',
        `/owner/payments?clientId=${cartera.clientId}`,
      ]) {
        const respuesta = await page.goto(ruta)
        expect(respuesta?.status(), ruta).toBe(404)
        await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
        // El id lo escribió la prueba en la dirección: vuelve en ella, y no es una fuga.
        expectSinSecretos(await respuesta!.text(), cartera, ruta, [cartera.clientId])
      }
    })

    test('panel, vendedores, rifas y reportes cuentan boletas sin traer dinero de la cartera', async ({
      page,
    }) => {
      await loginAs(page, email)
      const red = registrarRespuestas(page)

      const sinImportes = [
        '/owner/dashboard',
        '/owner/sellers',
        '/owner/reports',
        '/owner/reports?report=ticket-status',
      ]
      // La rifa dice su precio y la ficha, con qué regla se le paga al vendedor:
      // son configuración, no cartera. Ahí no se busca «$», solo las palabras.
      const conConfiguracion = [
        `/owner/sellers/${cartera.refs.sellerId}`,
        '/owner/raffles',
        `/owner/raffles/${cartera.refs.raffleId}`,
        '/owner/reports?report=raffles',
      ]

      for (const ruta of [...sinImportes, ...conConfiguracion]) {
        await page.goto(ruta)
        await expect(page.locator('main h1').first()).toBeVisible()

        const texto = await page.locator('main').innerText()
        for (const palabra of [
          'Saldo pendiente',
          'Total recaudado',
          'Total vendido',
          'Recaudado',
          'Ganancia',
          'Abonada',
          'Resumen de cobranza',
          'Pagos recientes',
        ]) {
          expect(texto, `${ruta} dice «${palabra}»`).not.toContain(palabra)
        }
        if (sinImportes.includes(ruta)) {
          expect(texto, `${ruta} enseña un importe`).not.toMatch(/\$\s?\d/)
        }
      }

      expectSinSecretos(await red.texto(), cartera, 'pantallas del personal')
    })

    test('sus CSV no traen dinero ni clientes, y los de la cartera responden 403', async ({
      page,
    }) => {
      await loginAs(page, email)
      await page.goto('/owner/reports')

      for (const reporte of ['sellers', 'ticket-status', 'raffles']) {
        const { status, body } = await descargarCsv(page, `report=${reporte}`)
        expect(status, reporte).toBe(200)
        expect(body, reporte).not.toMatch(/Saldo|Recaudado|Total vendido|Abonad|Cliente|Teléfono/)
        expectSinSecretos(body, cartera, `CSV ${reporte}`)
      }

      for (const reporte of ['client-balances', 'payments', 'sales-by-date']) {
        const { status, body } = await descargarCsv(page, `report=${reporte}`)
        expect(status, reporte).toBe(403)
        expectSinSecretos(body, cartera, `CSV ${reporte}`)
      }
    })
  })
}

/**
 * Regresion: nada de lo anterior le quita algo al vendedor. Es la MISMA boleta,
 * y en su portal enseña todo lo que el personal ya no ve.
 */
test.describe('El vendedor conserva su cartera (regresión de D-198)', () => {
  test('ve el cliente, el precio, lo abonado, lo que falta y «Abonada»', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets?q=${cartera.numeros.daily}`)

    const fila = filaDeLaBoleta(page)
    await expect(fila).toBeVisible()
    await expect(fila).toContainText(cartera.nombre)
    await expect(fila.getByText('Abonada', { exact: true })).toBeVisible()
    await expect(fila).toContainText(formatCOP(ABONO_SECRETO))
    await expect(fila).toContainText(formatCOP(SALDO_SECRETO))

    await page.goto(`/seller/tickets/${cartera.ticketId}`)
    await expect(page.getByText(cartera.nombre).first()).toBeVisible()
    await expect(page.getByText(formatCOP(PRECIO_SECRETO)).first()).toBeVisible()
    await expect(page.getByText('Abonada', { exact: true }).first()).toBeVisible()
  })

  test('su cliente, su pago y su reporte de clientes siguen en su portal', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    await page.goto(`/seller/clients/${cartera.clientId}`)
    await expect(page.getByRole('heading', { name: cartera.nombre })).toBeVisible()
    await expect(page.getByText(cartera.telefono).first()).toBeVisible()

    await page.goto(`/seller/payments?clientId=${cartera.clientId}`)
    await expect(
      page.getByRole('button', { name: new RegExp(`Ver el pago de ${cartera.nombre}`) }).first(),
    ).toBeVisible()

    await page.goto('/seller/reports')
    const { status, body } = await descargarCsv(page, 'report=client-balances')
    expect(status).toBe(200)
    expect(body).toContain(cartera.nombre)
  })
})
