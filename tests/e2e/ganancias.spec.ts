import { expect, test, type Page } from '@playwright/test'

import {
  loadSeedRefs,
  purgeSellers,
  purgeTemplateVersions,
  raffleTicketPrice,
  serviceClient,
  signedInClient,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, logout } from './fixtures'
import { formatCOP } from '../../src/lib/money'

/**
 * Configuracion de ganancias de los vendedores (D-237): la lista general
 * versionada, el alta del personal con su acuerdo, el cambio explicito con su
 * recalculo y lo que ve un jefe de equipo por tramos.
 *
 * EL ACTO SE PRUEBA POR LA INTERFAZ, con la sesion real (D-043). La service role
 * solo PREPARA: cuentas, un equipo, boletas y el acuerdo de partida. Y las
 * cifras que se esperan se calculan de la lista que la base tiene AHORA, no se
 * escriben a mano: otra suite puede haberla cambiado.
 *
 * La lista general que esta suite CAMBIA es la de «Rifas Control», no la de
 * «Rifas Demo»: las demas suites leen los tramos de la demo y verian otros si
 * esta los moviera a mitad de una pasada.
 */

type Tier = { minTickets: number; rate: number }

/** Correos creados por esta suite, para dejar la base como estaba. */
const created: string[] = []
/** Versiones de la lista general a partir de las cuales se limpia. */
const templateMarks: Array<{ organizationId: string; version: number }> = []

function uniqueEmail(prefix: string): string {
  const email = `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@demo.test`
  created.push(email)
  return email
}

test.afterAll(async () => {
  const svc = serviceClient()

  const { data: perfiles } = await svc.from('profiles').select('id').in('email', created)
  const ids = (perfiles ?? []).map((fila) => fila.id)
  if (ids.length > 0) {
    await purgeSellers(ids)
    for (const id of ids) {
      const { error } = await svc.auth.admin.deleteUser(id)
      if (error) throw new Error(`No se pudo borrar la cuenta ${id}: ${error.message}`)
    }
  }

  for (const mark of templateMarks) await purgeTemplateVersions(mark.organizationId, mark.version)
})

async function controlOrganization(): Promise<{ organizationId: string }> {
  const svc = serviceClient()
  const { data: owner } = await svc
    .from('profiles')
    .select('id')
    .eq('email', ACCOUNTS.controlOwner)
    .single()
  const { data: membership } = await svc
    .from('memberships')
    .select('organization_id')
    .eq('profile_id', owner!.id)
    .single()
  return { organizationId: membership!.organization_id }
}

/** La lista general vigente de una organizacion, como la tiene la base. */
async function currentTemplate(
  organizationId: string,
): Promise<{ id: string; version: number; tiers: Tier[] }> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('commission_tier_lists')
    .select('id, template_version, items:commission_tier_list_items ( min_tickets, rate )')
    .eq('organization_id', organizationId)
    .eq('kind', 'template')
    .order('template_version', { ascending: false })
    .limit(1)
    .single()
  if (error) throw error
  return {
    id: data.id,
    version: data.template_version!,
    tiers: data.items
      .map((item) => ({ minTickets: item.min_tickets, rate: Number(item.rate) }))
      .sort((a, b) => a.minTickets - b.minTickets),
  }
}

/** La tarifa de una lista con ese conteo: la del ultimo tramo que ya empezo. */
function rateAt(tiers: Tier[], count: number): number {
  return tiers.filter((tier) => tier.minTickets <= count).at(-1)?.rate ?? 0
}

function agreementCard(page: Page) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: 'Cómo se le paga' }) })
}

test.describe('Lista general de tramos (BR-G29)', () => {
  test('se guarda ENTERA como version nueva, con los errores de la base por fila, y no toca ningun acuerdo', async ({
    page,
  }) => {
    const svc = serviceClient()
    const { organizationId } = await controlOrganization()
    const before = await currentTemplate(organizationId)
    templateMarks.push({ organizationId, version: before.version })

    await loginAs(page, ACCOUNTS.controlOwner)

    // Se llega desde el menu del avatar, como a la «Configuración» del vendedor.
    await page.getByRole('button', { name: /menú de usuario/i }).click()
    await page.getByRole('menuitem', { name: 'Configuración' }).click()
    await page.waitForURL(/\/owner\/settings$/)
    await page.getByRole('link', { name: /Ganancias de vendedores/ }).click()
    await page.waitForURL(/\/owner\/settings\/earnings$/)

    await expect(page.getByRole('heading', { name: 'Ganancias de vendedores', level: 1 })).toBeVisible()
    await expect(page.getByText(`Versión ${before.version} · guardada el`)).toBeVisible()

    const guardar = page.getByRole('button', { name: 'Guardar lista general' })
    // Sin cambios no hay nada que guardar.
    await expect(guardar).toBeDisabled()

    // Un tramo nuevo que paga LO MISMO que el anterior: la base lo rechazaria, y
    // la pantalla lo dice en su fila con la misma frase.
    const n = before.tiers.length
    const last = before.tiers[n - 1]!
    const desde = last.minTickets + 50
    await page.getByRole('button', { name: 'Agregar tramo' }).click()
    await page.getByLabel(`Tramo ${n + 1}: desde cuántas boletas cobradas`).fill(String(desde))
    await page.getByLabel(`Tramo ${n + 1}: ganancia por boleta`).fill(String(last.rate))

    // El «hasta» del tramo anterior se deriva del nuevo, mientras se escribe.
    await expect(page.getByText(`De ${last.minTickets} a ${desde - 1} boletas`)).toBeVisible()
    await expect(page.getByText(`${desde} boletas o más`)).toBeVisible()
    await expect(page.getByText(/Al guardar, esta lista se usará en las próximas altas/)).toBeVisible()

    await guardar.click()
    await expect(
      page.getByText(
        `El tramo que empieza en ${desde} boletas tiene que pagar más que el anterior, que paga ${formatCOP(last.rate)} por boleta.`,
      ),
    ).toBeVisible()
    expect((await currentTemplate(organizationId)).version, 'no debe guardarse nada').toBe(
      before.version,
    )

    // Corregido, se guarda: una version nueva con la lista entera.
    await page.getByLabel(`Tramo ${n + 1}: ganancia por boleta`).fill(String(last.rate + 5_000))
    await guardar.click()
    await expectToast(page, `La lista general quedó guardada como versión ${before.version + 1}.`)
    await expect(page.getByText(`Versión ${before.version + 1} · guardada el`)).toBeVisible()
    await expect(guardar).toBeDisabled()

    const after = await currentTemplate(organizationId)
    expect(after.version).toBe(before.version + 1)
    expect(after.tiers).toEqual([...before.tiers, { minTickets: desde, rate: last.rate + 5_000 }])

    // La version anterior no cambio (BR-G29) y nadie recibio la nueva: guardar
    // la lista general no recalcula ni reasigna a nadie.
    const { data: viejos } = await svc
      .from('commission_tier_list_items')
      .select('min_tickets, rate')
      .eq('list_id', before.id)
      .order('min_tickets')
    expect(viejos!.map((fila) => ({ minTickets: fila.min_tickets, rate: Number(fila.rate) }))).toEqual(
      before.tiers,
    )
    const { count } = await svc
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .or(`direct_tier_list_id.eq.${after.id},team_tier_list_id.eq.${after.id}`)
    expect(count).toBe(0)

    // Y vuelve a la de antes: quitar el tramo y guardar crea OTRA version, con
    // el mismo contenido que la primera.
    await page.getByRole('button', { name: `Quitar el tramo ${n + 1}` }).click()
    await guardar.click()
    await expectToast(page, `La lista general quedó guardada como versión ${before.version + 2}.`)
    expect((await currentTemplate(organizationId)).tiers).toEqual(before.tiers)
  })

  test('un vendedor no entra en la configuracion del personal', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/owner/settings/earnings')
    await page.waitForURL(/\/denied/)
  })
})

test.describe('El personal configura el acuerdo de un vendedor (BR-G30, BR-G31)', () => {
  test('alta con tramos propios, validada antes de invitar, y cambio a un fijo con su bitacora', async ({
    page,
  }) => {
    const svc = serviceClient()
    const { organizationId } = await controlOrganization()
    const template = await currentTemplate(organizationId)
    expect(template.tiers.length, 'la lista general debe tener al menos dos tramos').toBeGreaterThan(1)

    const email = uniqueEmail('tramos-propios')
    const nombre = `Vendedora Tramos ${Date.now().toString(36)}`

    // Un segundo tramo distinto del de la lista general y que siga creciendo.
    const [t1, t2, t3] = template.tiers
    const propio = t3 ? Math.floor((t1!.rate + t3.rate) / 2) : t2!.rate + 1_000
    const propioFinal = propio === t2!.rate ? propio + 1 : propio

    await loginAs(page, ACCOUNTS.controlOwner)
    await page.goto('/owner/sellers')
    await page.getByRole('button', { name: /Nuevo vendedor|Invitar vendedor/ }).first().click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nombre completo').fill(nombre)
    await dialog.getByLabel('Teléfono').fill('3001234567')
    await dialog.getByLabel('Correo electrónico').fill(email)

    // Por tramos, con la lista general, salvo que se personalice. La mitad del
    // precio no se ofrece (BR-G30).
    await expect(dialog.getByRole('radio', { name: 'Ganancia por tramos' })).toBeChecked()
    await expect(dialog.getByText('Lista general', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/mitad del precio/i)).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Personalizar tramos' }).click()
    await expect(dialog.getByText('Solo valen para esta persona. La lista general no cambia.')).toBeVisible()

    // Un tramo sin cifra no se envia, y no se crea ni la cuenta ni el correo.
    await dialog.getByLabel('Tramo 2: ganancia por boleta').fill('')
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click()
    await expect(
      dialog.getByText('Cada tramo necesita desde cuántas boletas aplica y cuánto se gana por boleta.'),
    ).toBeVisible()
    const { data: nadie } = await svc.from('profiles').select('id').eq('email', email)
    expect(nadie).toEqual([])

    await dialog.getByLabel('Tramo 2: ganancia por boleta').fill(String(propioFinal))
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click()
    await expectToast(page, `Invitación enviada a ${email}.`)

    const { data: perfil } = await svc.from('profiles').select('id').eq('email', email).single()
    const { data: membresia } = await svc
      .from('memberships')
      .select('direct_commission_mode, direct_fixed_amount, direct_tier_list_id')
      .eq('profile_id', perfil!.id)
      .single()
    expect(membresia!.direct_commission_mode).toBe('tiered')

    const { data: lista } = await svc
      .from('commission_tier_lists')
      .select('kind, owner_profile_id, items:commission_tier_list_items ( min_tickets, rate )')
      .eq('id', membresia!.direct_tier_list_id!)
      .single()
    expect(lista!.kind).toBe('custom')
    expect(lista!.owner_profile_id).toBe(perfil!.id)
    const esperados = template.tiers.map((tier, index) =>
      index === 1 ? { ...tier, rate: propioFinal } : tier,
    )
    expect(
      lista!.items
        .map((item) => ({ minTickets: item.min_tickets, rate: Number(item.rate) }))
        .sort((a, b) => a.minTickets - b.minTickets),
    ).toEqual(esperados)
    // La lista general sigue siendo la misma.
    expect((await currentTemplate(organizationId)).id).toBe(template.id)

    // La ficha dice la regla, y de donde salen sus tramos.
    await page.goto(`/owner/sellers/${perfil!.id}`)
    const tarjeta = agreementCard(page)
    await expect(tarjeta.getByText('Ganancia por tramos', { exact: true })).toBeVisible()
    await expect(tarjeta.getByText('Con tramos personalizados, solo para esta persona.')).toBeVisible()
    await expect(tarjeta.getByText(formatCOP(propioFinal), { exact: true })).toBeVisible()

    // El cambio es explicito: el dialogo abre con lo guardado y no deja guardar
    // sin cambiar nada.
    await tarjeta.getByRole('button', { name: 'Cambiar' }).click()
    const cambio = page.getByRole('dialog')
    await expect(cambio.getByText('Sus tramos de ahora')).toBeVisible()
    const guardar = cambio.getByRole('button', { name: 'Guardar cambios' })
    await expect(guardar).toBeDisabled()

    await cambio.getByText('Ganancia fija por boleta', { exact: true }).click()
    await cambio.getByLabel('Ganancia por boleta', { exact: true }).fill('15000')
    await expect(
      cambio.getByText(
        `${nombre} todavía no ha cobrado ninguna boleta completa, así que no hay nada que recalcular.`,
      ),
    ).toBeVisible()
    await guardar.click()
    await expectToast(page, `La ganancia de ${nombre} quedó guardada.`)
    await expect(
      tarjeta.getByText(`${formatCOP(15_000)} por cada boleta que cobre completa`),
    ).toBeVisible()

    // Las dos cosas quedaron en la bitacora, con quien las hizo.
    const { data: owner } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.controlOwner)
      .single()
    const { data: bitacora } = await svc
      .from('audit_logs')
      .select('actor_profile_id, new_values')
      .eq('entity_id', perfil!.id)
      .eq('action', 'user.commission_agreement')
      .order('created_at', { ascending: true })
    expect(
      (bitacora ?? []).map((fila) => (fila.new_values as { source?: string } | null)?.source),
    ).toEqual(['create', 'change'])
    expect(new Set((bitacora ?? []).map((fila) => fila.actor_profile_id))).toEqual(
      new Set([owner!.id]),
    )
  })
})

test.describe('Con el teclado', () => {
  test('las dos formas se eligen con las flechas, y personalizar y agregar tramos con Enter', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.controlOwner)
    await page.goto('/owner/sellers')
    await page.getByRole('button', { name: /Nuevo vendedor|Invitar vendedor/ }).first().click()

    const dialog = page.getByRole('dialog')
    const tramos = dialog.getByRole('radio', { name: 'Ganancia por tramos' })
    const fijo = dialog.getByRole('radio', { name: 'Ganancia fija por boleta' })

    // Un radio de verdad: las flechas cambian la elección y el campo de la
    // cifra aparece solo con el fijo.
    await tramos.focus()
    await page.keyboard.press('ArrowRight')
    await expect(fijo).toBeChecked()
    await expect(dialog.getByLabel('Ganancia por boleta', { exact: true })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(tramos).toBeChecked()
    await expect(dialog.getByLabel('Ganancia por boleta', { exact: true })).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Personalizar tramos' }).focus()
    await page.keyboard.press('Enter')
    const cifras = dialog.getByLabel(/^Tramo \d+: ganancia por boleta$/)
    await expect(cifras.first()).toBeVisible()
    const antes = await cifras.count()

    await dialog.getByRole('button', { name: 'Agregar tramo' }).focus()
    await page.keyboard.press('Enter')
    await expect(cifras).toHaveCount(antes + 1)

    // Escape cierra sin guardar nada.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})

test.describe('El alta no arrastra lo que ya no se eligió', () => {
  test('tramos a medio personalizar y luego un fijo: se da de alta con el fijo', async ({
    page,
  }) => {
    const svc = serviceClient()
    const email = uniqueEmail('fijo-tras-tramos')

    await loginAs(page, ACCOUNTS.controlOwner)
    await page.goto('/owner/sellers')
    await page.getByRole('button', { name: /Nuevo vendedor|Invitar vendedor/ }).first().click()

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nombre completo').fill(`Vendedor Fijo ${Date.now().toString(36)}`)
    await dialog.getByLabel('Teléfono').fill('3001234567')
    await dialog.getByLabel('Correo electrónico').fill(email)

    // Empieza a personalizar y deja un tramo sin cifra...
    await dialog.getByRole('button', { name: 'Personalizar tramos' }).click()
    await dialog.getByLabel('Tramo 2: ganancia por boleta').fill('')

    // ...y cambia de idea: fijo.
    await dialog.getByText('Ganancia fija por boleta', { exact: true }).click()
    await dialog.getByLabel('Ganancia por boleta', { exact: true }).fill('18000')
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click()
    await expectToast(page, `Invitación enviada a ${email}.`)

    const { data: perfil } = await svc.from('profiles').select('id').eq('email', email).single()
    const { data: membresia } = await svc
      .from('memberships')
      .select('direct_commission_mode, direct_fixed_amount, direct_tier_list_id')
      .eq('profile_id', perfil!.id)
      .single()
    expect(membresia).toEqual({
      direct_commission_mode: 'fixed_per_ticket',
      direct_fixed_amount: 18_000,
      direct_tier_list_id: null,
    })
    // Y no nacio ninguna lista personalizada suya.
    const { count } = await svc
      .from('commission_tier_lists')
      .select('id', { count: 'exact', head: true })
      .eq('owner_profile_id', perfil!.id)
    expect(count).toBe(0)
  })
})

test.describe('Jefe de equipo por tramos (BR-G27, BR-G20, BR-G28)', () => {
  test('su tramo cuenta lo suyo y lo de su equipo; ve lo propio, lo del equipo y el total; el cambio se recalcula', async ({
    page,
  }) => {
    const svc = serviceClient()
    const refs = await loadSeedRefs()
    const precio = await raffleTicketPrice(refs)
    const template = await currentTemplate(refs.organizationId)
    const stamp = Date.now().toString(36)

    const alta = async (
      prefijo: string,
      padre: string | null,
      acuerdo: { commission_model?: 'fixed_per_ticket'; fixed_commission_amount?: number } = {},
    ) => {
      const email = uniqueEmail(prefijo.toLowerCase().replace(/\s+/g, '-'))
      const { data } = await svc.auth.admin.createUser({
        email,
        password: 'DesarrolloLocal2026',
        email_confirm: true,
        user_metadata: { full_name: `${prefijo} ${stamp}`, phone: '3001234567' },
      })
      const { error } = await svc.from('memberships').insert({
        organization_id: refs.organizationId,
        profile_id: data!.user!.id,
        role: 'seller',
        parent_seller_id: padre,
        ...acuerdo,
      })
      if (error) throw error
      return { id: data!.user!.id, email, name: `${prefijo} ${stamp}` }
    }

    // PREPARACION, en un orden en que el par es compatible en todo momento y con
    // cualquier rifa que otra suite haya dejado (BR-G28): primero el jefe pasa a
    // la lista general, y despues el integrante nace ya con un fijo igual al
    // primer tramo. Con el jefe en la mitad, una rifa mas barata que otra suite
    // dejara en borrador rechazaria al integrante.
    const fijo = template.tiers[0]!.rate
    const jefe = await alta('Jefe Tramos', null)
    await svc
      .from('memberships')
      .update({ direct_commission_mode: 'tiered', direct_tier_list_id: template.id })
      .eq('profile_id', jefe.id)
      .throwOnError()
    const integrante = await alta('Integrante Fijo', jefe.id, {
      commission_model: 'fixed_per_ticket',
      fixed_commission_amount: fijo,
    })

    // Boletas cobradas por el camino real: cada vendedor registra su pago.
    const base = 10 + Math.floor(Math.random() * 80)
    let serie = 0
    const vender = async (vendedor: { id: string; email: string }, cuantas: number) => {
      const { data: cliente } = await svc
        .from('clients')
        .insert({
          organization_id: refs.organizationId,
          seller_id: vendedor.id,
          name: `Cliente ${stamp} ${serie}`,
          phone: '3005552222',
        })
        .select('id')
        .single()
        .throwOnError()
      const ids: string[] = []
      for (let i = 0; i < cuantas; i++) {
        serie += 1
        const diario = String(base * 100 + serie).padStart(4, '0').slice(-4)
        const { data: boleta } = await svc
          .from('tickets')
          .insert({
            organization_id: refs.organizationId,
            raffle_id: refs.raffleId,
            seller_id: vendedor.id,
            created_by: refs.ownerId,
            daily_number: diario,
            weekly_number: stamp.slice(-4).replace(/\D/g, '7').padStart(4, '9'),
            inventory_status: 'assigned',
            client_id: cliente!.id,
            sale_price: precio,
            sale_date: '2026-09-20',
            assigned_at: new Date().toISOString(),
          })
          .select('id')
          .single()
          .throwOnError()
        ids.push(boleta!.id)
      }
      const sesion = await signedInClient(vendedor.email)
      const { error } = await sesion.rpc('create_payment', {
        p_client_id: cliente!.id,
        p_total_amount: ids.length * precio,
        p_allocations: ids.map((id) => ({ ticket_id: id, amount: precio })),
        p_payment_date: '2026-09-20',
        p_payment_method: 'cash',
      })
      expect(error, 'no se pudo cobrar el escenario').toBeNull()
    }

    await vender(jefe, 10)
    await vender(integrante, 15)

    // Lo que tiene que decir la pantalla, con la lista que la base tiene hoy.
    const conteo = 25
    const tarifa = rateAt(template.tiers, conteo)
    const propio = 10 * tarifa
    const equipo = 15 * (tarifa - fijo)
    const siguiente = template.tiers.find((tier) => tier.minTickets > conteo) ?? null

    // El panel del jefe.
    await loginAs(page, jefe.email)
    const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: 'Ganancia por boleta' })
    await expect(tarjeta.locator('[data-slot="card-content"] p').first()).toHaveText(formatCOP(tarifa))
    await expect(tarjeta.getByText(`Llevas ${formatCOP(propio)} ganados por tus boletas`)).toBeVisible()
    await expect(tarjeta.getByText(`Y ${formatCOP(equipo)} por las ventas de tu equipo`)).toBeVisible()
    await expect(tarjeta.getByText(`En total, ${formatCOP(propio + equipo)}`)).toBeVisible()
    await expect(
      tarjeta.getByText('Tu tramo cuenta tus boletas y las de tu equipo: 25 boletas cobradas.'),
    ).toBeVisible()
    if (siguiente) {
      await expect(
        tarjeta.getByText(
          `Te faltan ${siguiente.minTickets - conteo} boletas, tuyas o de tu equipo, para ${formatCOP(siguiente.rate)} por boleta`,
        ),
      ).toBeVisible()
    }

    // «Mi equipo»: lo que le deja el equipo y la nota del tramo.
    await page.goto('/seller/team')
    await expect(
      page.locator('[data-slot="card"]').filter({ hasText: 'Ganas tú' }).getByText(formatCOP(equipo)),
    ).toBeVisible()
    await expect(
      page.getByText('Las boletas que cobra tu equipo también cuentan para tu tramo.'),
    ).toBeVisible()
    await expect(page.getByText(`Lleva ganado ${formatCOP(15 * fijo)}`)).toBeVisible()

    // El personal ve la regla y la cambia, con el recalculo anunciado.
    await logout(page)
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/sellers/${jefe.id}`)
    const acuerdo = agreementCard(page)
    await expect(acuerdo.getByText('Con la lista general vigente.')).toBeVisible()
    await expect(
      acuerdo.getByText(/Tiene equipo: su tramo cuenta sus boletas y las de su equipo/),
    ).toBeVisible()

    await acuerdo.getByRole('button', { name: 'Cambiar' }).click()
    const cambio = page.getByRole('dialog')
    await cambio.getByText('Ganancia fija por boleta', { exact: true }).click()

    // Por debajo de lo que gana su integrante: la base lo rechaza y no cambia nada.
    await cambio.getByLabel('Ganancia por boleta', { exact: true }).fill(String(fijo - 1_000))
    await expect(
      cambio.getByText(
        `Al guardar, volvemos a calcular lo que ${jefe.name} lleva ganado en «Rifa Navidad 2026» (25 boletas cobradas), y lo que gana por las ventas de su equipo. Puede subir o bajar.`,
      ),
    ).toBeVisible()
    await cambio.getByRole('button', { name: 'Guardar y recalcular' }).click()
    await expect(cambio.getByRole('alert')).toContainText(
      'La ganancia de un integrante sale de la de su vendedor a cargo',
    )
    const { data: sigue } = await svc
      .from('memberships')
      .select('direct_commission_mode')
      .eq('profile_id', jefe.id)
      .single()
    expect(sigue!.direct_commission_mode).toBe('tiered')

    // Un fijo que si cabe: se guarda y se recalcula en la misma transaccion.
    const nuevo = fijo + 10_000
    await cambio.getByLabel('Ganancia por boleta', { exact: true }).fill(String(nuevo))
    await cambio.getByRole('button', { name: 'Guardar y recalcular' }).click()
    await expectToast(
      page,
      `La ganancia de ${jefe.name} quedó guardada. Recalculamos lo que lleva ganado en 1 rifa.`,
    )
    await expect(acuerdo.getByText(`${formatCOP(nuevo)} por cada boleta que cobre completa`)).toBeVisible()

    const { data: comision } = await svc
      .from('seller_commissions')
      .select('rate, earned, team_earned, tier_tickets_paid')
      .eq('seller_id', jefe.id)
      .eq('raffle_id', refs.raffleId)
      .single()
    expect(Number(comision!.rate)).toBe(nuevo)
    expect(Number(comision!.earned)).toBe(10 * nuevo)
    expect(Number(comision!.team_earned)).toBe(15 * (nuevo - fijo))
    expect(comision!.tier_tickets_paid).toBe(conteo)
  })
})
