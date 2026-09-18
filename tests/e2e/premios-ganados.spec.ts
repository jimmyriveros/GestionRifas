import { expect, test, type Page } from '@playwright/test'

import { signedInClient } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'
import {
  borrarEscenarioPremios,
  crearEscenarioPremios,
  ESPERADO,
  secretosDeClientes,
  type PremiosEscenario,
} from './premios-ganados-escenario'
import { registrarRespuestas } from './privacidad-escenario'
import { coverageNotice } from '../../src/features/prize-awards/copy'
import { TOURS } from '../../src/features/tour/tours'
import { formatCOP } from '../../src/lib/money'

/**
 * «Premios ganados» en escritorio (D-208, Etapa 2; BR-J17..BR-J23).
 *
 * El escenario —`premios-ganados-escenario.ts`— pasa por el motor, la
 * transición y el cargador de verdad, y sus cifras están calculadas a mano en
 * `ESPERADO`: si la base o la pantalla sumaran distinto, estas pruebas lo dicen.
 * Lo que se comprueba aquí es lo que se VE y lo que LLEGA al navegador; las
 * reglas SQL las prueba `tests/db/prize-award-history.test.ts`, y el teléfono,
 * `premios-ganados-movil.spec.ts`.
 */

let esc: PremiosEscenario

test.beforeAll(async () => {
  test.setTimeout(180_000)
  esc = await crearEscenarioPremios()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await borrarEscenarioPremios()
})

type Totales = { prizes: number; clients: number; knownAmount: number; valuePending: number }

/** Los cuatro indicadores, tal como se leen en la pantalla. */
async function expectResumen(page: Page, esperado: Totales): Promise<void> {
  const resumen = page.locator('[data-slot="prize-awards-summary"]')
  const tarjeta = (rotulo: string) => resumen.locator(':scope > *').filter({ hasText: rotulo })
  await expect(tarjeta('Premios').first()).toContainText(String(esperado.prizes))
  await expect(tarjeta('Clientes con premio')).toContainText(String(esperado.clients))
  await expect(tarjeta('Total conocido en dinero')).toContainText(formatCOP(esperado.knownAmount))
  await expect(tarjeta('Con valor pendiente')).toContainText(String(esperado.valuePending))
}

function fila(page: Page, texto: string) {
  return page.getByRole('row').filter({ hasText: texto })
}

test.describe('el vendedor', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('llega por el menú, y la pantalla dice desde cuándo y qué falta', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    const lateral = page.locator('[data-tour="nav-sidebar"]')
    await lateral.getByRole('link', { name: 'Premios ganados', exact: true }).click()
    await page.waitForURL('**/seller/prizes')

    await expect(page.getByRole('heading', { name: 'Premios ganados', level: 1 })).toBeVisible()
    await expect(lateral.locator('a[aria-current="page"]')).toHaveText(/Premios ganados/)
    // El inicio sale de la base (BR-J22), no de una constante de la pantalla.
    await expect(page.getByText(/desde el 9 de agosto de 2026\./)).toBeVisible()
    await expect(page.getByText('La entrega de los premios no se registra aquí.')).toBeVisible()

    // El aviso dice exactamente lo que la base puede afirmar ahora mismo.
    const vendedor = await signedInClient(ACCOUNTS.seller)
    const { data } = await vendedor.rpc('prize_award_coverage')
    const c = data![0]!
    await expect(page.locator('[data-slot="prize-coverage-notice"]')).toHaveText(
      coverageNotice(
        {
          historyStart: c.history_start,
          pendingDraws: c.pending_draws,
          pendingFrom: c.pending_from,
          pendingTo: c.pending_to,
        },
        false,
      ),
    )

    await expectResumen(page, ESPERADO.vendedorTodo)
    // Premios ganados, nunca «ganador»: tampoco en la pantalla entera.
    await expect(page.locator('main')).not.toContainText(/ganador|ganadora|premiad/i)
  })

  test('los totales son del conjunto: ni la página 2 ni una página que no existe los cambian', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/prizes?raffleId=${esc.rifaMotor.id}`)
    await expectResumen(page, ESPERADO.vendedorMotor)
    await expect(page.getByText('1–25 de 38 premios')).toBeVisible()

    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.waitForURL(/page=2/)
    await expect(page.getByText('26–38 de 38 premios')).toBeVisible()
    await expectResumen(page, ESPERADO.vendedorMotor)

    // Atrás vuelve a la página 1, y recargar conserva lo que se está viendo.
    await page.goBack()
    await expect(page).not.toHaveURL(/page=2/)
    await expect(page.getByText('1–25 de 38 premios')).toBeVisible()
    await page.reload()
    await expect(page.getByText('1–25 de 38 premios')).toBeVisible()

    await page.goto(`/seller/prizes?raffleId=${esc.rifaMotor.id}&page=9`)
    await expect(page.getByText('Esa página no existe')).toBeVisible()
    await expect(page.getByText('Con estos filtros hay 38 premios en 2 páginas.')).toBeVisible()
    await expectResumen(page, ESPERADO.vendedorMotor)
    await page.getByRole('link', { name: 'Ir a la primera página' }).click()
    await expect(page.getByText('1–25 de 38 premios')).toBeVisible()
  })

  test('cambiar un filtro vuelve a la primera página; recargar y Atrás lo conservan', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/prizes?page=2')
    await expect(page.getByText('26–40 de 40 premios')).toBeVisible()

    await page.getByRole('combobox', { name: 'Rifa' }).click()
    await page.getByRole('option', { name: new RegExp(esc.rifaHistorica.nombre) }).click()
    await page.waitForURL(new RegExp(`raffleId=${esc.rifaHistorica.id}`))
    await expect(page).not.toHaveURL(/page=/)
    await expectResumen(page, ESPERADO.vendedorHistorica)

    await page.reload()
    await expectResumen(page, ESPERADO.vendedorHistorica)

    await page.goBack()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText('26–40 de 40 premios')).toBeVisible()
  })

  test('alternativas, especie, dinero y especie, tres cifras y ceros a la izquierda se leen tal cual', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/prizes?raffleId=${esc.rifaMotor.id}`)

    const principal = fila(page, 'Premio principal')
    await expect(principal).toContainText(
      'Una de estas alternativas: Camioneta KIA, $120.000.000 o Renault Logan y $70.000.000',
    )
    await expect(principal).toContainText('Valor pendiente')
    await expect(principal).toContainText('Se elige una de las alternativas.')

    const moto = fila(page, 'Premio fin de semana')
    await expect(moto).toContainText('Moto AKT 125 y $2.000.000')
    await expect(moto).toContainText('$2.000.000 en dinero')
    await expect(moto).toContainText('Valor pendiente: también incluye un premio en especie.')

    const especie = fila(page, 'Premio sorpresa')
    await expect(especie).toContainText('Televisor de 55 pulgadas')
    await expect(especie).toContainText('Es un premio en especie.')
    await expect(especie).not.toContainText('$0')

    // El 1046 coincide en las tres últimas con el 0046; el 0046, entero.
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.waitForURL(/page=2/)
    const tres = fila(page, 'Premio especial de tres cifras')
    await expect(tres).toContainText('1046 / 5555')
    await expect(tres).toContainText('número diario 1046 · últimas tres cifras')
    await expect(tres).toContainText('Número mayor 0046')
    await expect(tres).toContainText('$1.000.000')
    await expect(fila(page, '0046 / 1111')).toContainText('número diario 0046 · cuatro cifras')
  })

  test('un resultado en conflicto y un número cambiado se quedan, con su importe, y se señalan', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/prizes?raffleId=${esc.rifaMotor.id}&page=2`)

    const conflicto = fila(page, esc.clientes.camila.nombre)
    await expect(conflicto).toContainText(
      'La fuente oficial publicó otro número. Requiere verificación.',
    )
    await expect(conflicto).toContainText('$500.000')
    // Conserva el número confirmado, no el de la fuente posterior.
    await expect(conflicto).toContainText('Número mayor 5151')

    const cambiado = fila(page, esc.clientes.dona.nombre).filter({ hasText: '6263 / 8888' })
    await expect(cambiado).toContainText('número diario 6262')
    await expect(cambiado).toContainText(
      'El número de esta boleta ya no es el que jugó en este sorteo. Requiere verificación.',
    )
    await expect(cambiado).toContainText('$500.000')
  })

  test('los dos premios reconocidos suman $1.000.000, sin categoría ni cifras inventadas', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/prizes?raffleId=${esc.rifaHistorica.id}`)
    await expectResumen(page, ESPERADO.vendedorHistorica)

    for (const [cliente, numeros, jugado] of [
      [esc.clientes.fabio, '3427 / 7702', 'número diario 3427'],
      [esc.clientes.gloria, '9019 / 3294', 'número diario 9019'],
    ] as const) {
      const reconocido = fila(page, cliente.nombre)
      await expect(reconocido).toContainText(numeros)
      await expect(reconocido).toContainText('Reconocido por la organización')
      await expect(reconocido).toContainText('$500.000')
      await expect(reconocido).toContainText(jugado)
      // Sin versión aplicada no hay cifras que decir (BR-J23).
      await expect(reconocido).not.toContainText('cifras')
    }
  })

  test('la ficha del cliente resume y lleva a su historial filtrado; uno archivado conserva lo suyo', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${esc.clientes.aurora.id}`)

    const resumen = page.locator('[data-slot="client-prize-summary"]')
    await expect(resumen).toContainText('Premios ganados')
    await expect(resumen).toContainText(
      /3 premios\s·\s\$3\.000\.000 en dinero\s·\s1 con valor pendiente/,
    )
    await resumen
      .getByRole('link', { name: `Ver premios de ${esc.clientes.aurora.nombre}` })
      .click()
    await page.waitForURL(new RegExp(`/seller/prizes\\?clientId=${esc.clientes.aurora.id}`))
    await expect(page.getByText(`Solo los premios de ${esc.clientes.aurora.nombre}.`)).toBeVisible()
    await expectResumen(page, ESPERADO.aurora)

    await page.getByRole('link', { name: 'Ver todos los premios' }).click()
    await page.waitForURL(/\/seller\/prizes$/)
    await expectResumen(page, ESPERADO.vendedorTodo)

    // Camila está archivada: su ficha y su premio siguen ahí.
    await page.goto(`/seller/clients/${esc.clientes.camila.id}`)
    await expect(page.getByText('Archivado', { exact: true }).first()).toBeVisible()
    await expect(page.locator('[data-slot="client-prize-summary"]')).toContainText(
      /1 premio\s·\s\$500\.000 en dinero/,
    )
    await page.goto(`/seller/prizes?clientId=${esc.clientes.camila.id}`)
    await expect(fila(page, esc.clientes.camila.nombre)).toHaveCount(1)
  })

  test('unas fechas al revés se explican y un filtro sin premios lo dice', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/prizes?dateFrom=2026-09-30&dateTo=2026-09-01')
    await expect(page.getByText('Las fechas están al revés')).toBeVisible()
    await expect(page.locator('[data-slot="prize-awards-summary"]')).toHaveCount(0)

    await page.goto('/seller/prizes?dateFrom=2030-01-01&dateTo=2030-01-31')
    await expect(page.getByText('No hay premios con estos filtros')).toBeVisible()
    // Ningún sorteo pendiente cae en esas fechas: el aviso se calla.
    await expect(page.locator('[data-slot="prize-coverage-notice"]')).toHaveCount(0)
  })
})

test.describe('lo ajeno no se ve', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('otro vendedor no ve nada de esto, ni pidiendo un cliente ajeno; y no entra al portal del personal', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.otherSeller)
    const red = registrarRespuestas(page)
    await page.goto('/seller/prizes')
    await expect(page.getByText('Todavía no hay premios registrados')).toBeVisible()
    // Sin premios no es «sin información»: el aviso de lo pendiente sigue.
    await expect(page.locator('[data-slot="prize-coverage-notice"]')).toBeVisible()

    await page.goto(`/seller/prizes?clientId=${esc.clientes.aurora.id}`)
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()

    const recibido = (await red.texto()) + (await page.content())
    for (const secreto of secretosDeClientes(esc)) {
      // El identificador que escribió la prueba vuelve en la dirección; nada más.
      if (secreto === esc.clientes.aurora.id) continue
      expect(recibido, `«${secreto}» llegó a otro vendedor`).not.toContain(secreto)
    }

    await page.goto('/owner/prizes')
    await page.waitForURL('**/denied')
  })
})

test.describe('el personal', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const { rol, email } of [
    { rol: 'Dueño', email: ACCOUNTS.owner },
    { rol: 'Administrador', email: ACCOUNTS.admin },
  ] as const) {
    test(`${rol}: el historial de la organización llega sin un solo dato de cliente`, async ({
      page,
    }) => {
      await loginAs(page, email)
      const red = registrarRespuestas(page)

      await page.locator('[data-tour="nav-sidebar"]').getByRole('link', { name: 'Premios ganados' }).click()
      await page.waitForURL('**/owner/prizes')
      await expectResumen(page, {
        prizes: 42,
        clients: 9,
        knownAmount: 22_000_000,
        valuePending: 3,
      })
      const encabezados = (await page.getByRole('columnheader').allInnerTexts()).join('|')
      expect(encabezados).toContain('Vendedor')
      expect(encabezados).not.toMatch(/Cliente/)

      await page.goto(`/owner/prizes?raffleId=${esc.rifaMotor.id}`)
      await expectResumen(page, ESPERADO.personalMotor)
      await expect(fila(page, 'Premio principal').first()).toContainText(esc.vendedor1Nombre)
      await page.goto(`/owner/prizes?raffleId=${esc.rifaMotor.id}&page=2`)
      await expect(page.getByText('26–40 de 40 premios')).toBeVisible()

      // Un `clientId` en la dirección del personal se descarta: no filtra.
      await page.goto(`/owner/prizes?clientId=${esc.clientes.aurora.id}`)
      await expectResumen(page, { prizes: 42, clients: 9, knownAmount: 22_000_000, valuePending: 3 })

      await page.goto(`/owner/sellers/${esc.refs.sellerId}`)
      await expect(page.locator('[data-slot="seller-prize-summary"]')).toBeVisible()

      const recibido = (await red.texto()) + (await page.content())
      for (const secreto of secretosDeClientes(esc)) {
        if (secreto === esc.clientes.aurora.id) continue
        expect(recibido, `«${secreto}» llegó al ${rol}`).not.toContain(secreto)
      }
    })
  }

  test('un vendedor desactivado conserva sus premios: filtro, lista y ficha', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/prizes')

    await page.getByRole('combobox', { name: 'Vendedor' }).click()
    await page.getByRole('option', { name: `${esc.inactivo.nombre} (inactivo)` }).click()
    await page.waitForURL(new RegExp(`sellerId=${esc.inactivo.id}`))
    await expectResumen(page, { prizes: 1, clients: 1, knownAmount: 500_000, valuePending: 0 })
    const suya = fila(page, '3131 / 1313')
    await expect(suya).toContainText(esc.inactivo.nombre)

    await suya.getByRole('link', { name: esc.inactivo.nombre }).click()
    await page.waitForURL(`**/owner/sellers/${esc.inactivo.id}`)
    await expect(page.getByText('Inactivo', { exact: true }).first()).toBeVisible()
    const resumen = page.locator('[data-slot="seller-prize-summary"]')
    await expect(resumen).toContainText('Premios ganados')
    await expect(resumen).toContainText('$500.000')
    await resumen.getByRole('link', { name: 'Ver sus premios' }).click()
    await page.waitForURL(new RegExp(`/owner/prizes\\?sellerId=${esc.inactivo.id}`))
    await expectResumen(page, { prizes: 1, clients: 1, knownAmount: 500_000, valuePending: 0 })
  })

  test('quien vendía y pasó a Administrador ve lo suyo por el portal del personal, sin cliente', async ({
    page,
  }) => {
    // El recorrido guiado no se abre sobre la pantalla: su clave, como la del seed.
    await page.addInitScript(
      ({ id, ids }) => {
        for (const tour of ids) window.localStorage.setItem(`rifas.tour.${id}.${tour}`, 'e2e')
      },
      { id: esc.ascendido.id, ids: TOURS.map((tour) => tour.id) },
    )
    await loginAs(page, esc.ascendido.correo)
    await expect(page).toHaveURL(/\/owner\/dashboard/)

    await page.goto('/seller/prizes')
    await page.waitForURL('**/denied')

    const red = registrarRespuestas(page)
    await page.goto(`/owner/prizes?sellerId=${esc.ascendido.id}`)
    await expectResumen(page, { prizes: 1, clients: 1, knownAmount: 500_000, valuePending: 0 })
    const suya = fila(page, '4141 / 1414')
    await expect(suya).toContainText(esc.ascendido.nombre)
    // Ya no tiene ficha de vendedor: su nombre no se enlaza.
    await expect(suya.getByRole('link', { name: esc.ascendido.nombre })).toHaveCount(0)

    const recibido = (await red.texto()) + (await page.content())
    expect(recibido).not.toContain(esc.clientes.yago.nombre)
    expect(recibido).not.toContain(esc.clientes.yago.id)
  })
})
