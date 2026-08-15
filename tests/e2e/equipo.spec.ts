import { expect, test, type Page } from '@playwright/test'

import { purgeSellers, serviceClient, signedInClient } from './db-setup'
import { ACCOUNTS, expectToast, loginAs, logout } from './fixtures'
import { formatCOP } from '../../src/lib/money'

/**
 * Equipos de vendedores — menu «Mi equipo» y alta de integrantes (BR-E01,
 * BR-E03, BR-E04).
 *
 * El alta ocurre por la interfaz, con la sesion real del vendedor: es lo unico
 * que demuestra que la politica `memberships_insert_seller` deja pasar al
 * vendedor de verdad, y no solo a la service role.
 *
 * Cada prueba que crea un integrante lo borra al terminar. Sin eso, la cuenta
 * quedaria en el seed y las siguientes ejecuciones contarian vendedores de mas
 * (I-035).
 */

/** Correos creados por esta suite, para dejar la base como estaba. */
const created: string[] = []

function uniqueEmail(prefix: string): string {
  const email = `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@demo.test`
  created.push(email)
  return email
}

test.afterAll(async () => {
  const svc = serviceClient()

  const { data: perfiles } = await svc.from('profiles').select('id').in('email', created)
  const ids = (perfiles ?? []).map((fila) => fila.id)
  if (ids.length === 0) return

  // Todo lo que cuelga de estas personas, en UNA transacción: pagos y sus
  // asignaciones no se pueden separar sin romper el cuadre diferido, y PostgREST
  // no puede agruparlos. Los errores se propagan a propósito: una limpieza que
  // falla en silencio deja cuentas acumulándose y acaba rompiendo otra suite.
  await purgeSellers(ids)

  for (const id of ids) {
    const { error } = await svc.auth.admin.deleteUser(id)
    if (error) throw new Error(`No se pudo borrar la cuenta ${id}: ${error.message}`)
  }
})

/**
 * La comision que el motor tiene calculada AHORA para ese vendedor, en la rifa
 * que la pantalla va a mostrar.
 *
 * Existe para que las pruebas no fijen importes a mano: otras suites venden y
 * cobran boletas de las cuentas del seed, asi que un `$40.000` escrito aqui
 * depende del orden en que se ejecuten los archivos. Leyendo el valor real se
 * comprueba lo que de verdad importa —que la pantalla dice lo mismo que el
 * motor— y la prueba deja de ser fragil.
 */
async function comisionDe(email: string) {
  const svc = serviceClient()

  const { data: perfil } = await svc.from('profiles').select('id').eq('email', email).single()
  const { data: filas } = await svc
    .from('seller_commissions')
    .select('tickets_paid, rate, earned, raffle_id, raffles!inner(status)')
    .eq('seller_id', perfil!.id)
    .eq('raffles.status', 'active')
    .order('tickets_paid', { ascending: false })

  const fila = filas?.[0]
  if (!fila) return null

  const { data: tramo } = await svc
    .from('commission_tiers')
    .select('min_tickets')
    .gt('min_tickets', fila.tickets_paid)
    .order('min_tickets', { ascending: true })
    .limit(1)
    .maybeSingle()

  return {
    ticketsPaid: Number(fila.tickets_paid),
    rate: Number(fila.rate),
    earned: Number(fila.earned),
    nextMin: tramo?.min_tickets ?? null,
  }
}

test.describe('El portal administrativo ve la estructura comercial', () => {
  test('distingue quién tiene equipo, quién pertenece a uno y quién no (BR-E08)', async ({
    page,
  }) => {
    const svc = serviceClient()
    const marca = Date.now().toString(36)

    const { data: refSeller } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.seller)
      .single()
    const { data: pm } = await svc
      .from('memberships')
      .select('organization_id')
      .eq('profile_id', refSeller!.id)
      .single()

    /**
     * Las TRES cuentas son de esta prueba, no del seed.
     *
     * Afirmar «Julian Vargas tiene 1 vendedor» dependía de que ninguna otra
     * prueba le agregara gente — y otra de este mismo archivo lo hace. Con
     * cuentas propias el resultado no depende del orden de ejecución (I-035).
     */
    const alta = async (nombre: string, padre: string | null) => {
      const email = uniqueEmail(nombre.toLowerCase().replace(/\s+/g, '-'))
      const { data: created } = await svc.auth.admin.createUser({
        email,
        password: 'DesarrolloLocal2026',
        email_confirm: true,
        user_metadata: { full_name: nombre, phone: '3002223344' },
      })
      await svc.from('memberships').insert({
        organization_id: pm!.organization_id,
        profile_id: created!.user!.id,
        role: 'seller',
        parent_seller_id: padre,
      })
      return created!.user!.id
    }

    const jefeNombre = `Jefe ${marca}`
    const integranteNombre = `Integrante ${marca}`
    const sueltoNombre = `Suelto ${marca}`

    const jefeId = await alta(jefeNombre, null)
    const integranteId = await alta(integranteNombre, jefeId)
    await alta(sueltoNombre, null)

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/sellers')

    const filaConEquipo = page.getByRole('row').filter({ hasText: jefeNombre })
    await expect(filaConEquipo.getByText('1 vendedor', { exact: true })).toBeVisible()

    const filaIntegrante = page.getByRole('row').filter({ hasText: integranteNombre })
    await expect(filaIntegrante.getByText(`Con ${jefeNombre}`)).toBeVisible()

    const filaSuelta = page.getByRole('row').filter({ hasText: sueltoNombre })
    await expect(filaSuelta.getByText('Sin equipo')).toBeVisible()

    // Y el detalle enlaza la jerarquía en las dos direcciones.
    await page.goto(`/owner/sellers/${jefeId}`)
    await expect(page.getByText('Equipo y comisión')).toBeVisible()
    await expect(page.getByRole('link', { name: integranteNombre })).toBeVisible()

    // BR-G13: la ficha dice CON QUÉ REGLA se le paga a cada quien, para que el
    // Dueño no tenga que deducirlo del número.
    await expect(
      page.getByText('La mitad del precio de cada boleta que cobre completa'),
    ).toBeVisible()

    await page.goto(`/owner/sellers/${integranteId}`)
    await expect(page.getByRole('link', { name: jefeNombre }).first()).toBeVisible()
    await expect(
      page.getByText('Por niveles, según el total de boletas que lleve cobradas'),
    ).toBeVisible()
  })
})

test.describe('Mi ganancia', () => {
  /**
   * Un vendedor SIN equipo cobra la mitad del precio (BR-G13), y por tanto NO
   * ve niveles. Es el caso que reportó el dueño del producto al ver la pantalla
   * en producción: a `vendedor1`, que no pertenece a ningún equipo, le salía
   * «Te faltan 19 boletas para subir de nivel».
   */
  test('sin equipo: cobra la mitad del precio y NO se le habla de niveles', async ({ page }) => {
    // Las cifras se leen de la BASE, no se escriben a mano: otras suites cobran
    // boletas de esta cuenta, así que un importe fijo dependería del orden de
    // los archivos. Se comprueba que la pantalla dice lo que el motor calculó.
    const esperado = await comisionDe(ACCOUNTS.seller)
    expect(esperado, 'el seed debe dejar boletas cobradas a este vendedor').not.toBeNull()

    await loginAs(page, ACCOUNTS.seller)

    // Se acota a la tarjeta: el importe también aparece en «Pagos recientes».
    const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: 'Tu ganancia' })

    await expect(tarjeta.getByText(formatCOP(esperado!.earned), { exact: true })).toBeVisible()
    await expect(
      tarjeta.getByText(new RegExp(`${esperado!.ticketsPaid} boletas? cobradas?`)),
    ).toBeVisible()
    await expect(tarjeta.getByText(/Ganas la mitad del precio/)).toBeVisible()

    // Y lo que motivó la corrección: ni niveles, ni barra, ni proyección.
    await expect(tarjeta.getByText(/subir de nivel/)).toHaveCount(0)
    await expect(tarjeta.getByRole('progressbar')).toHaveCount(0)
    await expect(tarjeta.getByText(/tu ganancia sería de/)).toHaveCount(0)
  })

  test('en un equipo: cobra por niveles, con proyección separada de lo ganado', async ({
    page,
  }) => {
    const svc = serviceClient()
    const stamp = Date.now().toString(36)

    const { data: refSeller } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.seller)
      .single()
    const { data: pm } = await svc
      .from('memberships')
      .select('organization_id')
      .eq('profile_id', refSeller!.id)
      .single()
    const { data: raffle } = await svc
      .from('raffles')
      .select('id, ticket_price')
      .eq('name', 'Rifa Navidad 2026')
      .single()

    const alta = async (nombre: string, padre: string | null) => {
      const email = uniqueEmail(nombre)
      const { data } = await svc.auth.admin.createUser({
        email,
        password: 'DesarrolloLocal2026',
        email_confirm: true,
        user_metadata: { full_name: `${nombre} ${stamp}`, phone: '3001234567' },
      })
      await svc.auth.admin.updateUserById(data!.user!.id, { password: 'DesarrolloLocal2026' })
      await svc.from('memberships').insert({
        organization_id: pm!.organization_id,
        profile_id: data!.user!.id,
        role: 'seller',
        parent_seller_id: padre,
      })
      return { id: data!.user!.id, email }
    }

    const jefe = await alta('jefe-nivel', null)
    const integrante = await alta('integrante-nivel', jefe.id)

    // Tres boletas cobradas por el camino real: el Dueño registra el pago.
    const precio = raffle!.ticket_price
    const { data: cliente } = await svc
      .from('clients')
      .insert({
        organization_id: pm!.organization_id,
        seller_id: integrante.id,
        name: `Cliente nivel ${stamp}`,
        phone: '3005552222',
      })
      .select('id')
      .single()

    const base = 30 + Math.floor(Math.random() * 50)
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const numero = `${base}${String(i).padStart(2, '0')}`
      const { data: t } = await svc
        .from('tickets')
        .insert({
          organization_id: pm!.organization_id,
          raffle_id: raffle!.id,
          seller_id: integrante.id,
          created_by: refSeller!.id,
          daily_number: numero,
          weekly_number: numero,
          inventory_status: 'assigned',
          client_id: cliente!.id,
          sale_price: precio,
          sale_date: '2026-08-13',
          assigned_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (t) ids.push(t.id)
    }

    const owner = await signedInClient(ACCOUNTS.owner)
    const { error } = await owner.rpc('create_payment', {
      p_client_id: cliente!.id,
      p_total_amount: ids.length * precio,
      p_allocations: ids.map((id) => ({ ticket_id: id, amount: precio })),
      p_payment_date: '2026-08-13',
      p_payment_method: 'cash',
    })
    expect(error, 'no se pudo cobrar el escenario').toBeNull()

    await loginAs(page, integrante.email)
    const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: 'Tu ganancia' })

    // 3 boletas en el primer tramo: 3 × $20.000.
    await expect(tarjeta.getByText(formatCOP(60_000), { exact: true })).toBeVisible()
    await expect(tarjeta.getByText(/3 boletas cobradas/)).toBeVisible()
    await expect(tarjeta.getByText('Te faltan 18 boletas para subir de nivel')).toBeVisible()
    await expect(tarjeta.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '3 de 21 boletas cobradas',
    )

    // Y lo que más importa: la proyección NO se confunde con lo ganado.
    await expect(tarjeta.getByText(/tu ganancia sería de/)).toBeVisible()
    await expect(
      tarjeta.getByText('Esa cifra todavía no es tuya: es lo que ganarías si llegas.'),
    ).toBeVisible()

    // La limpieza la hace  en el afterAll, en una transaccion.
  })

  test('un vendedor no ve la ganancia de otro', async ({ page }) => {
    const ajena = await comisionDe(ACCOUNTS.seller)

    // vendedor2 no tiene boletas cobradas: su tarjeta explica la regla y no
    // muestra el dinero de nadie mas.
    await loginAs(page, ACCOUNTS.otherSeller)

    const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: 'Tu ganancia' })
    await expect(tarjeta.getByText(/Ganas .* por cada boleta/)).toBeVisible()
    await expect(page.getByText(formatCOP(ajena!.earned), { exact: true })).toHaveCount(0)
  })
})

test.describe('Mi equipo', () => {
  test('todo vendedor tiene el menú, aunque no tenga equipo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.otherSeller)

    const link = page.getByRole('link', { name: 'Mi equipo' }).first()
    await expect(link).toBeVisible()

    // Reintento deliberado: el primer clic puede caer entre que el HTML del
    // servidor esta pintado y que React lo hidrata, y entonces no navega
    // (TESTING.md 5.3, mismo motivo que `toggleCheckbox`).
    await expect(async () => {
      await link.click()
      await page.waitForURL(/\/seller\/team/, { timeout: 3000 })
    }).toPass({ timeout: 20_000 })

    await expect(page.getByRole('heading', { name: 'Mi equipo' })).toBeVisible()
  })

  test('sin integrantes explica qué es y ofrece agregar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.otherSeller)
    await page.goto('/seller/team')

    await expect(page.getByText('Todavía no tienes vendedores en tu equipo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar vendedor' })).toBeVisible()
  })

  test('el vendedor agrega un integrante y aparece en su equipo', async ({ page }) => {
    const email = uniqueEmail('equipo-e2e')

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/team')

    await page.getByRole('button', { name: 'Agregar vendedor' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Agregar vendedor a tu equipo')).toBeVisible()

    await dialog.getByLabel('Nombre completo').fill('Pedro Martínez E2E')
    await dialog.getByLabel('Teléfono').fill('3001234567')
    await dialog.getByLabel('Correo electrónico').fill(email)
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click()

    await expectToast(page, /Ya está en tu equipo/i)
    await expect(page.getByText('Pedro Martínez E2E')).toBeVisible()

    // Y sigue siendo invisible para un vendedor ajeno (BR-E05, BR-U07).
    await logout(page)
    await loginAs(page, ACCOUNTS.otherSeller)
    await page.goto('/seller/team')
    await expect(page.getByText('Pedro Martínez E2E')).toHaveCount(0)
  })

  test('el panel resume el equipo y se entra al detalle de un integrante', async ({ page }) => {
    const svc = serviceClient()
    const email = uniqueEmail('detalle-e2e')

    const { data: parent } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.seller)
      .single()
    const { data: parentMembership } = await svc
      .from('memberships')
      .select('organization_id')
      .eq('profile_id', parent!.id)
      .single()

    const { data: created } = await svc.auth.admin.createUser({
      email,
      password: 'DesarrolloLocal2026',
      email_confirm: true,
      user_metadata: { full_name: 'Andrea Rojas E2E', phone: '3009998877' },
    })
    const member = created?.user
    expect(member, 'no se pudo crear la cuenta del integrante').toBeTruthy()
    await svc.from('memberships').insert({
      organization_id: parentMembership!.organization_id,
      profile_id: member!.id,
      role: 'seller',
      parent_seller_id: parent!.id,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/team')

    // El resumen del equipo aparece con los integrantes, no antes.
    await expect(page.getByText('Vendedores', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: /Andrea Rojas E2E/ }).click()
    await expect(page.getByRole('heading', { name: 'Andrea Rojas E2E' })).toBeVisible()
    await expect(page.getByText('Todavía no ha vendido boletas')).toBeVisible()
  })

  test('no se puede ver a un vendedor de otro equipo por la URL (BR-E05)', async ({ page }) => {
    const svc = serviceClient()
    const { data: otro } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.otherSeller)
      .single()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/team/${otro!.id}`)

    // «No encontrada», no «acceso denegado»: un vendedor de otro equipo no debe
    // distinguirse de un id inexistente.
    //
    // El codigo HTTP es 200 y no 404 porque el segmento tiene `loading.tsx` y la
    // respuesta ya iba en streaming cuando se decidio el 404 (I-014). No filtra
    // nada: lo que se pinta es la pagina de no encontrada, y eso es lo que se
    // comprueba, igual que en seller-clients.spec.ts.
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  })

  test('el aviso de la venta de un integrante llega a la campanita del padre', async ({ page }) => {
    const svc = serviceClient()
    const email = uniqueEmail('aviso-e2e')

    const { data: parent } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.seller)
      .single()
    const { data: pm } = await svc
      .from('memberships')
      .select('organization_id')
      .eq('profile_id', parent!.id)
      .single()
    const { data: raffle } = await svc
      .from('raffles')
      .select('id, ticket_price')
      .eq('name', 'Rifa Navidad 2026')
      .single()

    const { data: created } = await svc.auth.admin.createUser({
      email,
      password: 'DesarrolloLocal2026',
      email_confirm: true,
      user_metadata: { full_name: 'Sofía Aviso E2E', phone: '3001112233' },
    })
    const member = created?.user
    expect(member, 'no se pudo crear la cuenta del integrante').toBeTruthy()
    await svc.from('memberships').insert({
      organization_id: pm!.organization_id,
      profile_id: member!.id,
      role: 'seller',
      parent_seller_id: parent!.id,
    })

    const { data: cliente } = await svc
      .from('clients')
      .insert({
        organization_id: pm!.organization_id,
        seller_id: member!.id,
        name: 'Cliente de Sofía',
        phone: '3004445555',
      })
      .select('id')
      .single()

    const { data: ticket } = await svc
      .from('tickets')
      .insert({
        organization_id: pm!.organization_id,
        raffle_id: raffle!.id,
        seller_id: member!.id,
        created_by: parent!.id,
        daily_number: '4321',
        weekly_number: '8765',
        inventory_status: 'available',
      })
      .select('id')
      .single()

    await svc
      .from('tickets')
      .update({
        client_id: cliente!.id,
        inventory_status: 'assigned',
        // El precio vigente de la rifa, no una cifra escrita a mano (D-098).
        sale_price: raffle!.ticket_price,
        sale_date: '2026-08-12',
        assigned_at: new Date().toISOString(),
      })
      .eq('id', ticket!.id)

    await loginAs(page, ACCOUNTS.seller)

    await page.getByRole('button', { name: /Novedades:/ }).click()
    await expect(page.getByText('Sofía Aviso E2E vendió la boleta 4321 / 8765.')).toBeVisible()

    // Y se pueden marcar como leídas. Se comprueba que la acción desaparece, no
    // el nombre del botón de la campanita: mientras el menú está abierto, Radix
    // deja el resto de la página fuera del árbol de accesibilidad.
    await page.getByRole('button', { name: 'Marcar como leídas' }).click()
    await expect(page.getByRole('button', { name: 'Marcar como leídas' })).toHaveCount(0)

    // El aviso llegó también al personal: se limpia por la boleta, no por el
    // destinatario, para no dejar ninguna copia detrás (I-035).
    await svc.from('notifications').delete().eq('entity_id', ticket!.id)
    await svc.from('tickets').delete().eq('id', ticket!.id)
    await svc.from('clients').delete().eq('id', cliente!.id)
  })

  test('un integrante no puede formar su propio equipo (BR-E03)', async ({ page }) => {
    // Se prepara el escenario con la service role: quien se prueba es la
    // PANTALLA del integrante, no el alta que ya cubre la prueba anterior.
    const svc = serviceClient()
    const email = uniqueEmail('integrante-e2e')

    const { data: parent } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.seller)
      .single()
    const { data: parentMembership } = await svc
      .from('memberships')
      .select('organization_id')
      .eq('profile_id', parent!.id)
      .single()

    const { data: created } = await svc.auth.admin.createUser({
      email,
      password: 'DesarrolloLocal2026',
      email_confirm: true,
      user_metadata: { full_name: 'Integrante E2E', phone: '3007654321' },
    })
    const newUser = created?.user
    expect(newUser, 'no se pudo crear la cuenta del integrante').toBeTruthy()

    // I-007: `createUser` no deja la contrasena usable hasta que se actualiza.
    await svc.auth.admin.updateUserById(newUser!.id, { password: 'DesarrolloLocal2026' })
    await svc.from('memberships').insert({
      organization_id: parentMembership!.organization_id,
      profile_id: newUser!.id,
      role: 'seller',
      parent_seller_id: parent!.id,
    })

    await loginAs(page, email)
    await page.goto('/seller/team')

    await expect(page.getByText('Formas parte del equipo de otro vendedor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar vendedor' })).toHaveCount(0)
  })
})

/**
 * Corregir un alta equivocada (BR-E14..BR-E18).
 *
 * Lo que se prueba aqui es lo que ve el vendedor padre: que la pantalla
 * distinga «Invitación pendiente» de «Cuenta activa», y que ofrezca exactamente
 * las acciones que corresponden a cada estado. Que la invitacion anterior quede
 * invalidada de verdad se prueba contra Auth en
 * `tests/db/team-member-lifecycle.test.ts` (BD E2-10): eso no se puede ver en
 * una pantalla.
 */
test.describe('Corregir a un integrante', () => {
  /** Agrega un integrante por la interfaz y entra a su detalle. */
  async function agregarYAbrir(page: Page, nombre: string, email: string): Promise<void> {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/team')

    await page.getByRole('button', { name: 'Agregar vendedor' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nombre completo').fill(nombre)
    await dialog.getByLabel('Teléfono').fill('3001234567')
    await dialog.getByLabel('Correo electrónico').fill(email)
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click()

    await expectToast(page, /Ya está en tu equipo/i)
    await page.getByRole('link', { name: new RegExp(nombre) }).click()
    await expect(page.getByRole('heading', { name: nombre })).toBeVisible()
  }

  test('quien no ha ingresado aparece como invitación pendiente, y se puede corregir', async ({
    page,
  }) => {
    const email = uniqueEmail('pendiente-e2e')
    await agregarYAbrir(page, 'Sofía Pendiente E2E', email)

    await expect(page.getByText('Invitación pendiente').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Editar datos' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Eliminar vendedor' })).toBeVisible()

    // El correo se puede corregir, y la pantalla avisa de la consecuencia justo
    // cuando deja de ser el de siempre.
    const nuevo = uniqueEmail('corregido-e2e')
    await page.getByRole('button', { name: 'Editar datos' }).click()

    const dialog = page.getByRole('dialog')
    const campo = dialog.getByLabel('Correo electrónico')
    await expect(campo).toBeEditable()
    await expect(dialog.getByText(/el enlace anterior dejará de funcionar/i)).toHaveCount(0)

    await campo.fill(nuevo)
    await expect(dialog.getByText(/el enlace anterior dejará de funcionar/i)).toBeVisible()

    await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, /Enviamos una invitación nueva/i)

    // El de la ficha de contacto: el correo tambien aparece dentro del aviso de
    // invitacion pendiente y del toast, y ahi va acompañado de mas texto.
    await expect(page.getByText(nuevo, { exact: true })).toBeVisible()
  })

  test('quien ya ingresó tiene cuenta activa, correo bloqueado y sin eliminar', async ({
    page,
  }) => {
    const svc = serviceClient()
    const email = uniqueEmail('activo-e2e')

    const { data: parent } = await svc
      .from('profiles')
      .select('id')
      .eq('email', ACCOUNTS.seller)
      .single()
    const { data: parentMembership } = await svc
      .from('memberships')
      .select('organization_id')
      .eq('profile_id', parent!.id)
      .single()

    // Creada CON contraseña: nace activada, como quien ya terminó de configurarse.
    const { data: created } = await svc.auth.admin.createUser({
      email,
      password: 'DesarrolloLocal2026',
      email_confirm: true,
      user_metadata: { full_name: 'Marcos Activo E2E', phone: '3005551234' },
    })
    expect(created?.user, 'no se pudo crear la cuenta del integrante').toBeTruthy()
    await svc.from('memberships').insert({
      organization_id: parentMembership!.organization_id,
      profile_id: created!.user!.id,
      role: 'seller',
      parent_seller_id: parent!.id,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/team/${created!.user!.id}`)

    await expect(page.getByText('Cuenta activa').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Eliminar vendedor' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Editar datos' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Correo electrónico')).not.toBeEditable()

    // Nombre, alias y celular siguen siendo suyos para corregir.
    await dialog.getByLabel('Nombre completo').fill('Marcos Corregido E2E')
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, /Datos actualizados/i)
    await expect(page.getByRole('heading', { name: 'Marcos Corregido E2E' })).toBeVisible()
  })

  test('eliminar a un integrante pendiente lo saca del equipo', async ({ page }) => {
    const email = uniqueEmail('eliminar-e2e')
    await agregarYAbrir(page, 'Error de Dedo E2E', email)

    await page.getByRole('button', { name: 'Eliminar vendedor' }).click()

    const confirm = page.getByRole('alertdialog')
    await expect(confirm.getByText(/dejará de funcionar/i)).toBeVisible()
    await confirm.getByRole('button', { name: 'Eliminar vendedor' }).click()

    await expectToast(page, /ya no está en tu equipo/i)
    await page.waitForURL(/\/seller\/team$/)
    await expect(page.getByText('Error de Dedo E2E')).toHaveCount(0)
  })
})
