import { expect, test, type Page } from '@playwright/test'

import { signedInClient } from './db-setup'
import {
  CIERRE_ESPERADO as ESPERADO,
  borrarEscenarioCierre,
  crearEscenarioCierre,
  type CierreEscenario,
} from './cierre-escenario'
import { ACCOUNTS, expectToast, loginAs, logout } from './fixtures'
import { TOURS } from '../../src/features/tour/tours'

/**
 * «Cierre de cuentas» en escritorio (D-241, BR-Z01..BR-Z18).
 *
 * El escenario es el ejemplo de la propuesta de Figma, con sus mismas cifras
 * (`cierre-escenario.ts`). Aqui se comprueba lo que se VE y lo que se hace por la
 * interfaz: el dueño que revisa y recibe, una cuenta que cambia mientras se
 * revisa, el vendedor a cargo que recibe de su integrante y registra su premio,
 * y la integrante que ve su cuenta. Las reglas de dinero las prueba la suite de
 * la base (`tests/db/settlements.test.ts`).
 *
 * Las pruebas van EN ORDEN: cada una parte de lo que dejo la anterior, igual que
 * el dinero de verdad.
 */

test.describe.configure({ mode: 'serial' })

let esc: CierreEscenario

test.beforeAll(async () => {
  test.setTimeout(180_000)
  esc = await crearEscenarioCierre()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await borrarEscenarioCierre()
})

/**
 * Las cuentas del escenario nacen despues de que `fixtures.ts` guardara los
 * perfiles del seed: su recorrido guiado se da por visto aqui.
 */
async function silenciarRecorridos(page: Page) {
  const claves = Object.values(esc.personas).flatMap((persona) =>
    TOURS.map((tour) => `rifas.tour.${persona.id}.${tour.id}`),
  )
  await page.addInitScript((keys: string[]) => {
    for (const key of keys) window.localStorage.setItem(key, 'e2e')
  }, claves)
}

async function entrarComo(page: Page, correo: string) {
  await silenciarRecorridos(page)
  await loginAs(page, correo)
}

const lista = () => `/owner/settlements?raffleId=${esc.rifa.id}`
const cuentaDe = (clave: keyof CierreEscenario['personas']) =>
  `/owner/settlements/${esc.personas[clave].id}?raffleId=${esc.rifa.id}`

/** Una de las tres cifras de arriba del listado, por su rotulo. */
function metrica(page: Page, rotulo: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText(rotulo, { exact: true }) })
    .first()
}

test('el dueño ve las cuentas del ejemplo: recibido, lo que falta y las cerradas', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(lista())

  await expect(page.getByRole('heading', { level: 1, name: 'Cierre de cuentas' })).toBeVisible()
  await expect(metrica(page, 'Recibido')).toContainText(ESPERADO.recibidoAntes)
  await expect(metrica(page, 'Falta recibir')).toContainText(ESPERADO.faltaAntes)
  await expect(metrica(page, 'Falta recibir')).toContainText('De 2 vendedores')
  await expect(metrica(page, 'Cuentas cerradas')).toContainText(ESPERADO.cerradasAntes)

  const tabla = page.getByRole('table')
  const fila = (nombre: string) => tabla.getByRole('row').filter({ hasText: nombre })
  await expect(fila('Carlos Ruiz')).toContainText('Sus ventas y las de 2 integrantes')
  await expect(fila('Carlos Ruiz')).toContainText('$2.300.000')
  await expect(fila('Carlos Ruiz')).toContainText('Entrega parcial')
  await expect(fila('Marta Sierra')).toContainText('$720.000')
  await expect(fila('Marta Sierra')).toContainText('Pendiente')
  await expect(fila('Jorge León')).toContainText('Cerrada')
  await expect(fila('Diana Rojas')).toContainText('Cerrada')
  // Los integrantes no tienen cuenta con el dueño: van dentro de la de Carlos.
  await expect(tabla).not.toContainText('Ana Gómez')
  await expect(
    page.getByText('Lo que un integrante entrega a su vendedor a cargo no se suma a «Recibido».'),
  ).toBeVisible()

  // El filtro se resuelve en la base: «Cerradas» deja solo a Jorge y a Diana.
  await page.getByLabel('Estado de la cuenta').click()
  await page.getByRole('option', { name: 'Cerradas' }).click()
  await expect(page).toHaveURL(/status=closed/)
  await expect(tabla.getByRole('row')).toHaveCount(3)
  await expect(tabla).not.toContainText('Carlos Ruiz')
})

test('la cuenta de Carlos explica la entrega línea a línea, sin un solo cliente', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(cuentaDe('carlos'))

  await expect(page.getByRole('heading', { level: 1, name: 'Cuenta de Carlos Ruiz' })).toBeVisible()
  const calculo = page
    .locator('[data-slot="card"]')
    .filter({ hasText: 'Así se calcula la entrega' })
  await expect(calculo).toContainText(ESPERADO.carlos.valor)
  await expect(calculo).toContainText(`− ${ESPERADO.carlos.ganancias}`)
  await expect(calculo).toContainText('Carlos: $900.000 · Integrantes: $450.000')
  await expect(calculo).toContainText(ESPERADO.carlos.parte)
  await expect(calculo).toContainText(`− ${ESPERADO.carlos.premios}`)
  await expect(calculo).toContainText(ESPERADO.carlos.total)

  const saldo = page.locator('[data-slot="settlement-hero"]')
  await expect(saldo).toContainText('Falta recibir de Carlos')
  await expect(saldo).toContainText(ESPERADO.carlos.falta)
  await expect(saldo).toContainText(ESPERADO.carlos.recibido)

  const premios = page.locator('[data-slot="card"]').filter({ hasText: 'Premios de esta cuenta' })
  await expect(premios).toContainText('3 premios · $450.000')
  await expect(premios).toContainText('Ana pagó el')
  await expect(premios).toContainText('Ya lo pagó el dueño')
  await expect(premios).toContainText(
    'Los $200.000 que pagó el dueño reducen su ganancia, pero no se descuentan otra vez de la entrega.',
  )
  await expect(premios).toContainText(ESPERADO.carlos.gananciaDueno)

  // BR-Z13: ni el nombre del cliente ni la palabra «Cliente» llegan al personal.
  const html = await page.content()
  expect(html).not.toContain(esc.clienteAna)
  await expect(page.getByText(/^Cliente:/)).toHaveCount(0)
})

test('si la cuenta cambió mientras se revisaba, no se guarda nada y se enseña la diferencia', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(cuentaDe('carlos'))
  await page.getByRole('button', { name: 'Registrar lo que recibiste de Carlos' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByRole('heading', { name: 'Confirmar dinero recibido' })).toBeVisible()
  await expect(dialogo.getByLabel('Dinero recibido')).toHaveValue(ESPERADO.carlos.falta)
  await expect(dialogo).toContainText(
    'Se guardará esta entrega y la cuenta quedará cerrada con los valores de hoy.',
  )

  // Mientras tanto, el Administrador confirma $300.000 que Carlos le entregó.
  const administrador = await signedInClient(ACCOUNTS.admin)
  const { error } = await administrador.rpc('settlement_record_transfer', {
    p_raffle_id: esc.rifa.id,
    p_seller_id: esc.personas.carlos.id,
    p_kind: 'delivery',
    p_amount: 300_000,
    p_received_on: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
    p_expected_balance: 2_300_000,
    p_request_id: crypto.randomUUID(),
  })
  expect(error).toBeNull()

  await dialogo.getByRole('button', { name: 'Confirmar recibido' }).click()
  await expect(dialogo.getByRole('heading', { name: 'La cuenta cambió' })).toBeVisible()
  await expect(dialogo).toContainText('Antes')
  await expect(dialogo).toContainText('$2.300.000')
  await expect(dialogo).toContainText('Ahora')
  await expect(dialogo).toContainText('$2.000.000')
  await expect(dialogo).toContainText('No se ha guardado nada.')

  await dialogo.getByRole('button', { name: 'Revisar cuenta' }).click()
  await expect(dialogo.getByLabel('Dinero recibido')).toHaveValue('$2.000.000')
  await dialogo.getByRole('button', { name: 'Confirmar recibido' }).click()
  await expectToast(page, 'Recibiste $2.000.000. La cuenta quedó cerrada.')

  const saldo = page.locator('[data-slot="settlement-hero"]')
  await expect(saldo).toContainText('Cerrada')
  await expect(saldo).toContainText('Cerrar una cuenta no cierra la rifa.')

  await page.goto(lista())
  await expect(metrica(page, 'Recibido')).toContainText(ESPERADO.recibidoDespues)
  await expect(metrica(page, 'Falta recibir')).toContainText(ESPERADO.faltaDespues)
  await expect(metrica(page, 'Cuentas cerradas')).toContainText(ESPERADO.cerradasDespues)
})

test('un vendedor directo no confirma lo que entrega: ve su saldo, no el botón', async ({
  page,
}) => {
  await entrarComo(page, esc.personas.marta.correo)
  await page.goto(`/seller/settlement?raffleId=${esc.rifa.id}`)
  const saldo = page.locator('[data-slot="settlement-hero"]')
  await expect(saldo).toContainText('Para entregar al dueño')
  await expect(saldo).toContainText('$720.000')
  await expect(
    page.getByRole('button', { name: /Registrar recibido|Registrar lo que recibiste/ }),
  ).toHaveCount(0)
  // Y el personal no existe para ella: su portal no tiene la pantalla del dueño.
  await page.goto(lista())
  await expect(page).not.toHaveURL(/\/owner\/settlements/)
})

test('Ana ve lo que le entrega a Carlos, y su premio con su cliente', async ({ page }) => {
  await entrarComo(page, esc.personas.ana.correo)
  await page.goto(`/seller/settlement?raffleId=${esc.rifa.id}`)

  const saldo = page.locator('[data-slot="settlement-hero"]')
  await expect(saldo).toContainText('Para entregar a Carlos Ruiz')
  await expect(saldo).toContainText(ESPERADO.ana.falta)
  await expect(saldo).toContainText('Carlos es tu vendedor a cargo.')

  const cuenta = page.locator('[data-slot="card"]').filter({ hasText: 'Así queda tu cuenta' })
  await expect(cuenta).toContainText('$20.000 por cada boleta pagada.')
  await expect(cuenta).toContainText('Premio que pagaste')
  await expect(cuenta).toContainText(ESPERADO.ana.total)

  await expect(page.getByText(`Cliente: ${esc.clienteAna}`)).toBeVisible()
  await expect(page.getByText('Carlos confirmó que recibió este dinero.')).toBeVisible()
  // Una integrante no confirma nada: no tiene a quién.
  await expect(page.getByRole('button', { name: /Registrar/ })).toHaveCount(0)
})

test('Carlos confirma lo que le entrega Ana; eso no suma a lo recibido por el dueño', async ({
  page,
}) => {
  await entrarComo(page, esc.personas.carlos.correo)
  await page.goto(`/seller/settlement?raffleId=${esc.rifa.id}`)

  await expect(
    page.getByText('Los $500.000 pendientes de Ana ya están incluidos en tu entrega al dueño.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Registrar lo que recibiste de Ana' }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toContainText('Confirma que ya recibiste este dinero de Ana Gómez.')
  await expect(dialogo.getByLabel('Dinero recibido')).toHaveValue(ESPERADO.ana.falta)
  await dialogo.getByRole('button', { name: 'Confirmar recibido' }).click()
  await expectToast(page, 'Recibiste $500.000. La cuenta quedó cerrada.')

  const equipo = page.locator('[data-slot="card"]').filter({ hasText: 'Cuentas con tu equipo' })
  await expect(equipo).toContainText('2 de 2 cuentas cerradas')

  await logout(page)
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(lista())
  await expect(metrica(page, 'Recibido')).toContainText(ESPERADO.recibidoDespues)
})

test('Carlos anula el pago del premio de Ana y lo vuelve a registrar', async ({ page }) => {
  await entrarComo(page, esc.personas.carlos.correo)
  await page.goto(`/seller/settlement/team/${esc.personas.ana.id}?raffleId=${esc.rifa.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Cuenta de Ana Gómez' })).toBeVisible()

  await page.getByRole('button', { name: /^Anular pago:/ }).click()
  const anular = page.getByRole('alertdialog')
  await expect(anular).toContainText('El pago de $150.000 deja de contar')
  await anular.getByLabel('Motivo de la anulación').fill('Lo pagó el dueño')
  await anular.getByRole('button', { name: 'Anular pago' }).click()
  await expectToast(page, 'El pago del premio quedó anulado.')

  const premios = page.locator('[data-slot="card"]').filter({ hasText: 'Premios de Ana' })
  await expect(premios).toContainText('Falta registrar quién lo pagó')
  // Sin su pago, la cuenta de Ana ya no está saldada: vuelve a deber $150.000.
  await expect(page.locator('[data-slot="settlement-hero"]')).toContainText('$150.000')

  await premios.getByRole('button', { name: /^Registrar quién pagó/ }).click()
  const dialogo = page.getByRole('dialog')
  await expect(dialogo.getByRole('heading', { name: 'Registrar premio pagado' })).toBeVisible()
  await expect(dialogo).toContainText('$150.000')
  await expect(dialogo).toContainText(
    'Este valor se descontará de lo que Ana te entrega. Su ganancia no cambia.',
  )
  await dialogo.getByRole('button', { name: 'Confirmar premio pagado' }).click()
  await expectToast(page, /El pago del premio quedó registrado/)
  await expect(premios).toContainText('Se descuenta de la entrega')
})
