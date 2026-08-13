import { expect, test } from '@playwright/test'

import { serviceClient } from './db-setup'
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

  // Los avisos que provocaron estas altas quedan en la bandeja del personal:
  // se borran por la entidad, no por el destinatario (I-035).
  const { data: membresias } = await svc.from('memberships').select('id').in('profile_id', ids)
  const entidades = (membresias ?? []).map((fila) => fila.id)
  if (entidades.length > 0) {
    await svc.from('notifications').delete().in('entity_id', entidades)
  }
  await svc.from('notifications').delete().in('recipient_profile_id', ids)
  await svc.from('seller_commissions').delete().in('seller_id', ids)

  // Primero los INTEGRANTES y despues sus jefes: `memberships_parent_seller_fk`
  // es `on delete restrict`, asi que borrar al jefe con equipo vivo falla.
  await svc.from('memberships').delete().in('profile_id', ids).not('parent_seller_id', 'is', null)
  await svc.from('memberships').delete().in('profile_id', ids)

  for (const id of ids) {
    await svc.auth.admin.deleteUser(id)
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

    await page.goto(`/owner/sellers/${integranteId}`)
    await expect(page.getByRole('link', { name: jefeNombre }).first()).toBeVisible()
  })
})

test.describe('Mi ganancia', () => {
  test('el panel muestra lo ganado y separa la proyección de lo que ya es suyo', async ({
    page,
  }) => {
    // Las cifras se leen de la BASE, no se escriben a mano: otras suites venden
    // y cobran boletas de este vendedor, asi que un importe fijo aqui aguanta
    // hasta que alguien reordena los archivos. Lo que se comprueba es que la
    // pantalla dice EXACTAMENTE lo que el motor calculo.
    const esperado = await comisionDe(ACCOUNTS.seller)
    expect(esperado, 'el seed debe dejar boletas cobradas a este vendedor').not.toBeNull()

    await loginAs(page, ACCOUNTS.seller)

    // Se acota a la tarjeta: el importe tambien aparece en «Pagos recientes», y
    // sin acotar la prueba pasaria mirando el numero equivocado.
    const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: 'Tu ganancia' })

    await expect(tarjeta.getByText(formatCOP(esperado!.earned), { exact: true })).toBeVisible()
    await expect(tarjeta.getByText(new RegExp(`${esperado!.ticketsPaid} boletas? cobradas?`))).toBeVisible()

    // El siguiente nivel, con su barra y su cuenta atras.
    const faltan = esperado!.nextMin! - esperado!.ticketsPaid
    await expect(
      tarjeta.getByText(
        faltan === 1
          ? 'Te falta 1 boleta para subir de nivel'
          : `Te faltan ${faltan} boletas para subir de nivel`,
      ),
    ).toBeVisible()
    await expect(tarjeta.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      `${esperado!.ticketsPaid} de ${esperado!.nextMin} boletas cobradas`,
    )

    // Y lo que mas importa: la proyeccion NO se confunde con lo ganado.
    await expect(tarjeta.getByText(/tu ganancia sería de/)).toBeVisible()
    await expect(
      tarjeta.getByText('Esa cifra todavía no es tuya: es lo que ganarías si llegas.'),
    ).toBeVisible()
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
      .select('id')
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
        sale_price: 100000,
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
