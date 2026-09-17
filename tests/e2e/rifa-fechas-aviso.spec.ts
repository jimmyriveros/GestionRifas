import { expect, test, type Page } from '@playwright/test'
import { Client as PgClient } from 'pg'

import { RAFFLE_DATE_CHANGE_NOTICE } from '../../src/features/raffles/date-change'
import { loadSeedRefs, purgeSellers, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, expectToast, loginAs, unique } from './fixtures'

/**
 * Cambiar las fechas de una rifa ACTIVA avisa a TODAS las personas de la
 * organización, también a quien guarda (BR-R12, D-206, migraciones `0064` y
 * `0065`).
 *
 * Es el camino de la extensión real: el DUEÑO, con su sesión, por la pantalla de
 * editar. Por eso aquí se comprueba de punta a punta: que la pantalla lo
 * anuncia ANTES de guardar —y solo cuando va a pasar—; que después de guardar
 * cada membresía activa tiene exactamente un aviso —el Dueño incluido—, las
 * inactivas y otras organizaciones ninguno, todos del mismo evento y con el Dueño
 * como actor, y la bitácora a su nombre; y que el Dueño, el Administrador y el
 * vendedor lo leen en su campana. La atomicidad y los reintentos los prueba
 * `tests/db/raffle-date-notices.test.ts`.
 *
 * Las rifas viven en 2063 y se borran al final, con sus avisos y su bitácora, y
 * la cuenta inactiva que se crea para comprobar que no recibe nada.
 */

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const KIND = 'raffle.dates_changed'

let refs: SeedRefs
const creadas: string[] = []
const activaName = unique('E2E fechas activa')
const borradorName = unique('E2E fechas borrador')
let activaId = ''
let borradorId = ''
let adminId = ''
let inactivaId = ''

/**
 * Escribe la fecha de fin cuando React ya hidrató el campo.
 *
 * Escrita ANTES, la hidratación repone el valor guardado y la prueba mira un
 * formulario que nunca vio el cambio (el hueco de TESTING §5.3). Lo detectó la
 * primera corrida de la prueba del borrador: «Received: 2063-11-01». React marca
 * cada nodo hidratado con su fibra; hasta que el campo la tiene, no se escribe.
 */
async function escribirFechaDeFin(page: Page, valor: string): Promise<void> {
  const campo = page.getByLabel('Fecha de fin')
  await expect(campo).toBeVisible()
  await page.waitForFunction(() => {
    const input = document.querySelector('input[name="endDate"]')
    return input !== null && Object.keys(input).some((clave) => clave.startsWith('__reactFiber$'))
  })
  await campo.fill(valor)
  await expect(campo).toHaveValue(valor)
}

async function nuevaRifa(name: string, activa: boolean): Promise<string> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('raffles')
    .insert({
      organization_id: refs.organizationId,
      name,
      ticket_price: 120_000,
      start_date: '2063-07-27',
      end_date: '2063-11-01',
      created_by: refs.ownerId,
    })
    .select('id')
    .single()
  if (error) throw error
  creadas.push(data.id)
  if (activa) {
    const activar = await svc.from('raffles').update({ status: 'active' }).eq('id', data.id)
    if (activar.error) throw activar.error
  }
  return data.id
}

/** Lo que la base guardó para la rifa activa, leído con una conexión directa. */
async function consultar<T>(sql: string, params: unknown[]): Promise<T[]> {
  const db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  try {
    const { rows } = await db.query(sql, params)
    return rows as T[]
  } finally {
    await db.end()
  }
}

/** Abre la campana de quien tiene la sesión. */
async function abrirCampana(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^Novedades/ })
    .first()
    .click()
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  const svc = serviceClient()
  activaId = await nuevaRifa(activaName, true)
  borradorId = await nuevaRifa(borradorName, false)

  const { data: admin } = await svc
    .from('profiles')
    .select('id')
    .eq('email', ACCOUNTS.admin)
    .single()
  adminId = admin!.id

  // Una membresía INACTIVA de la misma organización: no puede recibir nada.
  const { data: creada, error } = await svc.auth.admin.createUser({
    email: `e2e-fechas-inactiva-${Date.now().toString(36)}@demo.test`,
    password: 'DesarrolloLocal2026',
    email_confirm: true,
    user_metadata: { full_name: 'Vendedora inactiva de fechas', phone: '3001234567' },
  })
  if (error) throw error
  inactivaId = creada.user.id
  const membresia = await svc.from('memberships').insert({
    organization_id: refs.organizationId,
    profile_id: inactivaId,
    role: 'seller',
    is_active: false,
  })
  if (membresia.error) throw membresia.error
})

test.afterAll(async () => {
  if (creadas.length > 0) {
    const db = new PgClient({ connectionString: DB_URL })
    await db.connect()
    try {
      await db.query('begin')
      await db.query(`set local session_replication_role = replica`)
      await db.query(
        `delete from notifications where kind = $1 and (data ->> 'raffle_id')::uuid = any ($2::uuid[])`,
        [KIND, creadas],
      )
      await db.query(`delete from audit_logs where entity_id = any ($1::uuid[])`, [creadas])
      await db.query(`delete from raffles where id = any ($1::uuid[])`, [creadas])
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    } finally {
      await db.end()
    }
  }
  if (inactivaId) {
    await purgeSellers([inactivaId])
    await serviceClient().auth.admin.deleteUser(inactivaId)
  }
})

test.describe('Las fechas de una rifa activa (BR-R12)', () => {
  test('la pantalla de editar dice que avisará a todas las personas, solo cuando cambia una fecha, y guarda', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${activaId}/edit`)

    const fin = page.getByLabel('Fecha de fin')
    await expect(fin).toHaveValue('2063-11-01')
    // Sin cambiar ninguna fecha no se anuncia nada.
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toHaveCount(0)

    await escribirFechaDeFin(page, '2063-12-21')
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toBeVisible()

    // Volver a la fecha guardada lo retira: ya no va a pasar.
    await escribirFechaDeFin(page, '2063-11-01')
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toHaveCount(0)

    await escribirFechaDeFin(page, '2063-12-21')
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toBeVisible()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, 'Rifa actualizada.')
  })

  test('después de guardar como Dueño: un aviso por membresía activa —él incluido—, ninguno a la inactiva ni a otra organización, un solo evento y el Dueño como actor', async () => {
    const activas = await consultar<{ profile_id: string; role: string }>(
      `select m.profile_id, m.role::text as role
         from memberships m
         join profiles p on p.id = m.profile_id
         join organizations o on o.id = m.organization_id
        where m.organization_id = $1 and m.role in ('owner', 'admin', 'seller')
          and m.is_active and p.is_active and o.is_active
        order by m.profile_id`,
      [refs.organizationId],
    )
    const avisos = await consultar<{
      recipient_profile_id: string
      actor_profile_id: string | null
      entity_id: string
      organization_id: string
    }>(
      `select recipient_profile_id, actor_profile_id, entity_id, organization_id
         from notifications
        where kind = $1 and (data ->> 'raffle_id')::uuid = $2
        order by recipient_profile_id`,
      [KIND, activaId],
    )

    // Exactamente uno por membresía activa, y nadie más.
    const porPersona = new Map<string, number>()
    for (const aviso of avisos) {
      porPersona.set(
        aviso.recipient_profile_id,
        (porPersona.get(aviso.recipient_profile_id) ?? 0) + 1,
      )
    }
    expect([...porPersona.keys()].sort()).toEqual(activas.map((m) => m.profile_id).sort())
    expect([...porPersona.values()].every((cuantos) => cuantos === 1)).toBe(true)

    // El Dueño, el Administrador y los vendedores activos: uno cada uno.
    expect(porPersona.get(refs.ownerId)).toBe(1)
    expect(porPersona.get(adminId)).toBe(1)
    const vendedores = activas.filter((m) => m.role === 'seller').map((m) => m.profile_id)
    expect(vendedores).toEqual(expect.arrayContaining([refs.sellerId, refs.otherSellerId]))
    for (const vendedor of vendedores) expect(porPersona.get(vendedor)).toBe(1)

    // La inactiva y otra organización: ninguno.
    expect(porPersona.has(inactivaId)).toBe(false)
    expect(avisos.every((aviso) => aviso.organization_id === refs.organizationId)).toBe(true)
    const [otraOrganizacion] = await consultar<{ n: number }>(
      `select count(*)::int as n
         from notifications n
         join memberships m on m.profile_id = n.recipient_profile_id
        where n.kind = $1 and (n.data ->> 'raffle_id')::uuid = $2
          and m.organization_id <> $3`,
      [KIND, activaId, refs.organizationId],
    )
    expect(otraOrganizacion!.n).toBe(0)

    // Un solo evento, y el Dueño como actor de todos, también del suyo.
    expect(new Set(avisos.map((aviso) => aviso.entity_id)).size).toBe(1)
    expect(avisos.every((aviso) => aviso.actor_profile_id === refs.ownerId)).toBe(true)

    // La bitácora del cambio, a nombre del Dueño: solo cambió la fecha de fin.
    const bitacora = await consultar<{
      action: string
      actor_profile_id: string | null
      new_values: Record<string, unknown>
    }>(
      `select action, actor_profile_id, new_values from audit_logs
        where entity_id = $1 and action in ('raffle.update', 'raffle.dates_change')
          and actor_profile_id is not null
        order by id`,
      [activaId],
    )
    expect(bitacora.map((fila) => [fila.action, fila.actor_profile_id])).toEqual([
      ['raffle.update', refs.ownerId],
      ['raffle.dates_change', refs.ownerId],
    ])
    expect(bitacora[0]!.new_values).toEqual({ end_date: '2063-12-21' })
    expect(bitacora[1]!.new_values).toMatchObject({
      end_date: '2063-12-21',
      change_id: avisos[0]!.entity_id,
      notified: activas.length,
    })
  })

  test('el Dueño que guardó, el Administrador y el vendedor leen UN aviso cada uno con la fecha nueva', async ({
    page,
  }) => {
    const mensaje = `Cambiaron las fechas de ${activaName}: ahora termina el 21 de diciembre de 2063.`

    for (const cuenta of [ACCOUNTS.owner, ACCOUNTS.admin, ACCOUNTS.seller]) {
      await page.context().clearCookies()
      await loginAs(page, cuenta)
      await abrirCampana(page)
      const aviso = page.getByText(mensaje)
      await expect(aviso).toHaveCount(1)
      await expect(aviso).toBeVisible()
    }
  })

  test('un borrador no anuncia ningún aviso al cambiar sus fechas', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${borradorId}/edit`)
    await escribirFechaDeFin(page, '2063-12-21')
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toHaveCount(0)
    // Y la fecha sigue siendo la nueva: el formulario sí vio el cambio.
    await expect(page.getByLabel('Fecha de fin')).toHaveValue('2063-12-21')
  })
})
