import { Client as PgClient } from 'pg'

import { loadSeedRefs, serviceClient, signedInClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, SEED_PASSWORD } from './fixtures'

/**
 * El escenario del cierre de cuentas (D-241): el ejemplo de la propuesta de
 * Figma, con sus mismas cifras, en una rifa propia de «Rifas Demo».
 *
 *   Carlos Ruiz   vendedor directo, cobra por tramos (20.000 / 25.000 desde 21 /
 *                 30.000 desde 31 / 40.000 desde 51); 20 pagadas propias.
 *   Ana Gómez     su integrante, $20.000 por boleta; 15 pagadas y 1 sin pagar.
 *   Luis Pérez    su integrante, $15.000 por boleta; 10 pagadas.
 *   Marta, Jorge y Diana: vendedores directos a $30.000; 8, 12 y 10 pagadas.
 *
 * Premios: Ana adelantó $150.000 (lo registra Carlos), Carlos $100.000 y el
 * dueño pagó $200.000 (los registra el personal). Ya se recibió: Jorge
 * $1.080.000, Diana $900.000 y Carlos $1.500.000; Ana le entregó $850.000 a
 * Carlos y Luis $1.050.000.
 *
 * LOS HECHOS VAN POR LOS CAMINOS REALES: altas por la RPC del personal y del
 * vendedor a cargo, ventas y cobros por las sesiones de cada vendedor, y
 * premios pagados y entregas por las RPC del cierre con quien las confirma. Lo
 * unico que se escribe a mano es el premio ganado —la fotografia del sorteo y
 * su enlace—, igual que la suite de la base: el motor solo premia sorteos
 * futuros y un premio pagado exige un sorteo ya jugado.
 *
 * SOLO LOCAL. Todo se limpia por prefijo al empezar y al terminar.
 */

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export const CIERRE_PREFIJO = 'E2E cierre'
const SORTEO_PREFIJO = 'E2EC-'
const CORREO_PREFIJO = 'e2e-cierre-'
const PRECIO = 120_000

const TRAMOS = [
  { min_tickets: 1, rate: 20_000 },
  { min_tickets: 21, rate: 25_000 },
  { min_tickets: 31, rate: 30_000 },
  { min_tickets: 51, rate: 40_000 },
]

export type CierrePersona = { id: string; nombre: string; correo: string }

export type CierreEscenario = {
  refs: SeedRefs
  marca: string
  rifa: { id: string; nombre: string }
  personas: Record<'carlos' | 'ana' | 'luis' | 'marta' | 'jorge' | 'diana', CierrePersona>
  /** El cliente de Ana que ganó el premio: solo lo ve Ana (BR-Z13). */
  clienteAna: string
}

/** Lo que las pantallas tienen que decir, escrito a mano (la aritmética en la propuesta). */
export const CIERRE_ESPERADO = {
  recibidoAntes: '$3.480.000',
  faltaAntes: '$3.020.000',
  cerradasAntes: '2 de 4',
  recibidoDespues: '$5.780.000',
  faltaDespues: '$720.000',
  cerradasDespues: '3 de 4',
  carlos: {
    valor: '$5.400.000',
    ganancias: '$1.350.000',
    parte: '$4.050.000',
    premios: '$250.000',
    total: '$3.800.000',
    recibido: '$1.500.000',
    falta: '$2.300.000',
    gananciaDueno: '$3.600.000',
  },
  ana: { total: '$1.350.000', entregado: '$850.000', falta: '$500.000' },
} as const

async function conectar(): Promise<PgClient> {
  const db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  return db
}

/** Borra todo lo del escenario, de esta corrida y de cualquiera anterior. */
export async function borrarEscenarioCierre(): Promise<void> {
  const db = await conectar()
  try {
    const rifas = `${CIERRE_PREFIJO}%`
    const { rows: personas } = await db.query<{ id: string }>(
      `select id from profiles where email like $1`,
      [`${CORREO_PREFIJO}%`],
    )
    const ids = personas.map((p) => p.id)

    await db.query('begin')
    await db.query('set local session_replication_role = replica')
    for (const tabla of [
      'settlement_closings',
      'settlement_prize_payments',
      'settlement_transfers',
      'lottery_ticket_match_prizes',
      'lottery_ticket_matches',
      'commission_ledger',
      'seller_commissions',
    ]) {
      await db.query(
        `delete from ${tabla} where raffle_id in (select id from raffles where name like $1)`,
        [rifas],
      )
    }
    await db.query(
      `delete from lottery_results where schedule_id in
         (select id from lottery_draw_schedules where draw_number like $1)`,
      [`${SORTEO_PREFIJO}%`],
    )
    await db.query(`delete from lottery_draw_schedules where draw_number like $1`, [
      `${SORTEO_PREFIJO}%`,
    ])
    if (ids.length > 0) {
      await db.query(
        `delete from payment_allocations where payment_id in (select id from payments where seller_id = any($1))`,
        [ids],
      )
      await db.query(`delete from payments where seller_id = any($1)`, [ids])
    }
    await db.query(
      `delete from tickets where raffle_id in (select id from raffles where name like $1)`,
      [rifas],
    )
    for (const tabla of ['raffle_prize_schedule_rules', 'raffle_prize_reward_options']) {
      await db.query(
        `delete from ${tabla} where version_id in
           (select v.id from raffle_prize_versions v join raffles r on r.id = v.raffle_id where r.name like $1)`,
        [rifas],
      )
    }
    for (const tabla of ['raffle_prizes', 'raffle_prize_versions', 'raffle_prize_transitions']) {
      await db.query(
        `delete from ${tabla} where raffle_id in (select id from raffles where name like $1)`,
        [rifas],
      )
    }
    await db.query(
      `delete from notifications where entity_id in (select id from raffles where name like $1)`,
      [rifas],
    )
    await db.query(
      `delete from audit_logs where action like 'settlement.%'
                      and organization_id in (select organization_id from raffles where name like $1)`,
      [rifas],
    )
    await db.query(`delete from raffles where name like $1`, [rifas])
    if (ids.length > 0) {
      await db.query(
        `delete from notifications where recipient_profile_id = any($1) or actor_profile_id = any($1)`,
        [ids],
      )
      await db.query(`delete from audit_logs where actor_profile_id = any($1)`, [ids])
      await db.query(`delete from clients where seller_id = any($1)`, [ids])
      await db.query(
        `delete from commission_tier_list_items where list_id in
                        (select id from commission_tier_lists where owner_profile_id = any($1))`,
        [ids],
      )
      await db.query(`delete from commission_tier_lists where owner_profile_id = any($1)`, [ids])
      await db.query(`delete from memberships where profile_id = any($1)`, [ids])
    }
    await db.query('commit')
  } catch (error) {
    await db.query('rollback').catch(() => {})
    throw error
  } finally {
    await db.end()
  }

  const svc = serviceClient()
  const { data: cuentas } = await svc
    .from('profiles')
    .select('id')
    .like('email', `${CORREO_PREFIJO}%`)
  for (const cuenta of cuentas ?? []) {
    const { error } = await svc.auth.admin.deleteUser(cuenta.id)
    if (error) throw new Error(`No se pudo borrar la cuenta ${cuenta.id}: ${error.message}`)
  }
}

export async function crearEscenarioCierre(): Promise<CierreEscenario> {
  await borrarEscenarioCierre()

  const refs = await loadSeedRefs()
  const svc = serviceClient()
  const dueno = await signedInClient(ACCOUNTS.owner)
  const marca = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
  const db = await conectar()
  let secuencia = 0
  const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows

  const exito = <T>(r: { data: T | null; error: { message: string } | null }, que: string): T => {
    if (r.error) throw new Error(`${que}: ${r.error.message}`)
    return r.data as T
  }

  try {
    // --- Personas --------------------------------------------------------------
    const cuenta = async (clave: string, nombre: string): Promise<CierrePersona> => {
      const correo = `${CORREO_PREFIJO}${clave}-${marca}@demo.test`
      const { data, error } = await svc.auth.admin.createUser({
        email: correo,
        password: SEED_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: nombre, phone: '3001112233' },
      })
      if (error || !data.user) throw error ?? new Error('No se pudo crear la cuenta')
      await svc.auth.admin.updateUserById(data.user.id, { password: SEED_PASSWORD })
      await q(`update profiles set full_name = $2, activated_at = now() where id = $1`, [
        data.user.id,
        nombre,
      ])
      return { id: data.user.id, nombre, correo }
    }

    const carlos = await cuenta('carlos', 'Carlos Ruiz')
    const marta = await cuenta('marta', 'Marta Sierra')
    const jorge = await cuenta('jorge', 'Jorge León')
    const diana = await cuenta('diana', 'Diana Rojas')
    exito(
      await dueno.rpc('staff_create_seller_membership', {
        p_organization_id: refs.organizationId,
        p_profile_id: carlos.id,
        p_mode: 'tiered',
        p_tiers: TRAMOS,
      }),
      'Alta de Carlos',
    )
    for (const persona of [marta, jorge, diana]) {
      exito(
        await dueno.rpc('staff_create_seller_membership', {
          p_organization_id: refs.organizationId,
          p_profile_id: persona.id,
          p_mode: 'fixed_per_ticket',
          p_fixed_amount: 30_000,
        }),
        `Alta de ${persona.nombre}`,
      )
    }

    const sesionCarlos = await signedInClient(carlos.correo)
    const ana = await cuenta('ana', 'Ana Gómez')
    const luis = await cuenta('luis', 'Luis Pérez')
    for (const [persona, monto] of [
      [ana, 20_000],
      [luis, 15_000],
    ] as const) {
      const { error } = await sesionCarlos.from('memberships').insert({
        organization_id: refs.organizationId,
        profile_id: persona.id,
        role: 'seller',
        parent_seller_id: carlos.id,
        commission_model: 'fixed_per_ticket',
        fixed_commission_amount: monto,
      })
      if (error) throw new Error(`Alta de ${persona.nombre}: ${error.message}`)
    }

    const clienteAna = `María Torres ${marca}`
    const clientes = new Map<string, string>()
    for (const persona of [carlos, ana, luis, marta, jorge, diana]) {
      const [fila] = await q<{ id: string }>(
        `insert into clients (organization_id, seller_id, name, phone)
         values ($1, $2, $3, '3007654321') returning id`,
        [
          refs.organizationId,
          persona.id,
          persona.id === ana.id ? clienteAna : `Cliente de ${persona.nombre} ${marca}`,
        ],
      )
      clientes.set(persona.id, fila!.id)
    }

    // --- La rifa y sus premios -------------------------------------------------
    const rifaNombre = `${CIERRE_PREFIJO} Rifa de septiembre ${marca}`
    const [rifa] = await q<{ id: string }>(
      `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date,
                            created_by, prize_mode)
       values ($1, $2, $3, 'draft', '2026-01-01', '2088-12-31', $4, 'configurable') returning id`,
      [refs.organizationId, rifaNombre, PRECIO, refs.ownerId],
    )
    const raffleId = rifa!.id
    const premios = new Map<string, { prizeId: string; versionId: string }>()
    for (const [clave, titulo, monto, mes] of [
      ['diario150', 'Premio diario', 150_000, '03'],
      ['semanal100', 'Premio semanal', 100_000, '04'],
      ['diario200', 'Premio diario mayor', 200_000, '05'],
    ] as const) {
      const data = exito(
        await dueno.rpc('create_raffle_prize', {
          p_raffle_id: raffleId,
          p_title: titulo,
          p_category: 'daily',
          p_reward_mode: 'fixed',
          p_reward_options: [{ description: null, amount: monto }],
          p_number_field: 'daily_number',
          p_digits: 'four',
          p_rules: [
            {
              start_date: `2088-${mes}-03`,
              end_date: `2088-${mes}-28`,
              weekdays: [1, 2, 3, 4, 5],
              lottery_mode: 'corresponding',
              lottery_code: null,
            },
          ],
        }),
        `Premio ${titulo}`,
      ) as unknown as Array<{ prize_id: string; version_id: string }>
      premios.set(clave, { prizeId: data[0]!.prize_id, versionId: data[0]!.version_id })
    }
    await q(`update raffles set status = 'active' where id = $1`, [raffleId])

    // --- Ventas y cobros -------------------------------------------------------
    let contador = 0
    const vender = async (
      persona: CierrePersona,
      total: number,
      vendidas: number,
      pagadas: number,
    ) => {
      const ids = (
        await q<{ id: string }>(
          `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                                weekly_number, inventory_status)
           select $1, $2, $3, $4, lpad((($5::int + g) % 10000)::text, 4, '0'),
                  lpad((($5::int + g) / 10000 + 7)::text, 4, '0'), 'available'
             from generate_series(1, $6::int) g
           returning id`,
          [refs.organizationId, raffleId, persona.id, refs.ownerId, 3000 + contador, total],
        )
      ).map((r) => r.id)
      contador += total
      const sesion = await signedInClient(persona.correo)
      const venta = ids.slice(0, vendidas)
      exito(
        await sesion.rpc('bulk_assign_tickets', {
          p_ticket_ids: venta,
          p_client_id: clientes.get(persona.id)!,
        }),
        `Venta de ${persona.nombre}`,
      )
      const cobro = venta.slice(0, pagadas)
      if (cobro.length > 0) {
        exito(
          await sesion.rpc('create_payment', {
            p_client_id: clientes.get(persona.id)!,
            p_total_amount: cobro.length * PRECIO,
            p_allocations: cobro.map((id) => ({ ticket_id: id, amount: PRECIO })),
          }),
          `Cobro de ${persona.nombre}`,
        )
      }
      return venta
    }

    const vCarlos = await vender(carlos, 25, 22, 20)
    const vAna = await vender(ana, 25, 16, 15)
    const vLuis = await vender(luis, 10, 10, 10)
    await vender(marta, 8, 8, 8)
    await vender(jorge, 12, 12, 12)
    await vender(diana, 10, 10, 10)

    // --- Premios ganados (fotografia + enlace, como el motor) ------------------
    const premiar = async (ticketId: string, clave: string) => {
      const premio = premios.get(clave)!
      secuencia += 1
      await db.query('begin')
      try {
        await db.query('set local session_replication_role = replica')
        const [libre] = await q<{ code: string; fecha: string }>(
          `with c as (
             select l.code as code, d::date as fecha
               from unnest(enum_range(null::lottery_code)) as l(code)
              cross join generate_series(date '2026-08-10', today_bogota() - 1, interval '1 day') as d
           )
           select c.code::text as code, c.fecha::text as fecha from c
            where not exists (select 1 from lottery_draw_schedules s
                               where s.lottery_code = c.code and s.reference_date = c.fecha)
            order by c.fecha desc, c.code limit 1`,
        )
        const [prog] = await q<{ id: string }>(
          `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                               original_scheduled_at, official_scheduled_at, schedule_status)
           values ($1, $2, $3, ($3::date + time '22:30') at time zone 'America/Bogota',
                   ($3::date + time '22:30') at time zone 'America/Bogota', 'scheduled') returning id`,
          [libre!.code, `${SORTEO_PREFIJO}${marca}-${secuencia}`, libre!.fecha],
        )
        const [res] = await q<{ id: string }>(
          `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
           select $1, t.daily_number, 'confirmed', 'official_page', now() from tickets t where t.id = $2
           returning id`,
          [prog!.id, ticketId],
        )
        const [foto] = await q<{ id: string }>(
          `insert into lottery_ticket_matches
             (result_id, ticket_id, organization_id, raffle_id, seller_id, client_id, match_field,
              matched_number, assignment_status, inventory_status_at_draw, assigned_at, ticket_created_at)
           select $1, t.id, t.organization_id, t.raffle_id, t.seller_id, t.client_id, 'daily_number',
                  t.daily_number, 'sold', 'assigned', t.assigned_at, t.created_at
             from tickets t where t.id = $2
           returning id`,
          [res!.id, ticketId],
        )
        await q(
          `insert into lottery_ticket_match_prizes (organization_id, raffle_id, result_id, match_id,
                                                    match_field, prize_id, prize_version_id)
           values ($1, $2, $3, $4, 'daily_number', $5, $6)`,
          [refs.organizationId, raffleId, res!.id, foto!.id, premio.prizeId, premio.versionId],
        )
        await db.query('commit')
        return { matchId: foto!.id, prizeId: premio.prizeId, fecha: libre!.fecha }
      } catch (error) {
        await db.query('rollback')
        throw error
      }
    }

    const pAna = await premiar(vAna[0]!, 'diario150')
    const pCarlos = await premiar(vCarlos[0]!, 'semanal100')
    const pLuis = await premiar(vLuis[0]!, 'diario200')
    const [{ hoy }] = (await q<{ hoy: string }>(`select today_bogota()::text as hoy`)) as [
      { hoy: string },
    ]

    const pagar = async (
      actor: typeof dueno,
      premio: { matchId: string; prizeId: string },
      pagador: string | null,
    ) =>
      exito(
        await actor.rpc('settlement_record_prize_payment', {
          p_raffle_id: raffleId,
          p_match_id: premio.matchId,
          p_prize_id: premio.prizeId,
          p_payer: pagador === null ? 'organization' : 'seller',
          p_payer_id: pagador ?? undefined,
          p_paid_on: hoy,
          p_request_id: crypto.randomUUID(),
        }),
        'Pago de premio',
      )
    await pagar(sesionCarlos, pAna, ana.id)
    await pagar(dueno, pCarlos, carlos.id)
    await pagar(dueno, pLuis, null)

    // --- Lo que ya se entregó --------------------------------------------------
    const saldo = async (titular: string, contraparte: string | null) => {
      const [fila] = await q<{ balance: string }>(
        `select balance from settlement_account_rows($1, $2)
          where holder_id = $3 and counterpart_id is not distinct from $4`,
        [refs.organizationId, raffleId, titular, contraparte],
      )
      return Number(fila!.balance)
    }
    const entregar = async (
      actor: typeof dueno,
      titular: CierrePersona,
      monto: number,
      contraparte: string | null,
    ) =>
      exito(
        await actor.rpc('settlement_record_transfer', {
          p_raffle_id: raffleId,
          p_seller_id: titular.id,
          p_kind: 'delivery',
          p_amount: monto,
          p_received_on: hoy,
          p_expected_balance: await saldo(titular.id, contraparte),
          p_request_id: crypto.randomUUID(),
        }),
        `Entrega de ${titular.nombre}`,
      )
    await entregar(dueno, jorge, 1_080_000, null)
    await entregar(dueno, diana, 900_000, null)
    await entregar(dueno, carlos, 1_500_000, null)
    await entregar(sesionCarlos, ana, 850_000, carlos.id)
    await entregar(sesionCarlos, luis, 1_050_000, carlos.id)

    return {
      refs,
      marca,
      rifa: { id: raffleId, nombre: rifaNombre },
      personas: { carlos, ana, luis, marta, jorge, diana },
      clienteAna,
    }
  } finally {
    await db.end()
  }
}
