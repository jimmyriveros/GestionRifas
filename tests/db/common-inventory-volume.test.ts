/**
 * VOLUMEN del inventario comun (D-257): una generacion de 100.000 boletas,
 * interrumpida y continuada, y las lecturas que la usan con ese tamano.
 *
 * QUE DEMUESTRA. No es un banco de rendimiento —una portatil con Docker no da
 * medidas comparables con el proyecto alojado—: es la prueba de que el diseño
 * aguanta el tamano que pide el encargo, con SESIONES REALES y sus topes reales
 * (`statement_timeout = 8 s` de `authenticated`):
 *
 *   1. 100.000 combinaciones se crean en bloques que caben en ese tope;
 *   2. una interrupcion conserva lo confirmado, la continuacion no duplica y un
 *      bloque repetido no hace nada;
 *   3. lo que ya existia se reconoce y no se toca;
 *   4. el catalogo interno y la lista del personal buscan y paginan sobre las
 *      100.000 sin traerlas;
 *   5. un lote de 1.000 se asigna y se recupera;
 *   6. JUSTO DESPUES de generar, lotes de 10 a 1.000 se entregan a un vendedor
 *      CON EQUIPO, sin esperar al analisis automatico de PostgreSQL (I-214,
 *      D-260); un lote cortado no deja nada a medias y repetir uno no duplica.
 *
 * LA ESTADISTICA, CONTROLADA (I-214). Antes de generar, `tickets` se analiza —en
 * produccion siempre tiene estadistica— y su analisis automatico se APAGA hasta
 * terminar: lo unico que puede ponerla al dia es el propio generador, que es
 * justo lo que se prueba. Con el `autovacuum` encendido, el codigo de antes de
 * D-260 pasaba a veces, segun cayera el analisis automatico; asi falla siempre.
 * El `afterAll` lo vuelve a encender antes de limpiar. Si el proceso muere a
 * medias, queda apagado en la base local hasta el siguiente `db:reset`.
 *
 * Los tiempos y el crecimiento en disco se escriben en
 * `build/inventario-volumen/informe.md`, fuera de Git, y se copian a
 * `docs/TEST_RESULTS.md`. Las aserciones de tiempo son TECHOS amplios, no metas.
 *
 * LIMPIA LO QUE CREA, al empezar y al terminar: cien mil boletas sin borrar
 * frenarian a las suites que recorren `tickets`. El borrado va por `pg` con los
 * disparadores apagados SOLO en esa transaccion.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, SEED_PASSWORD, signInAs, USERS, type Client } from './helpers'

const RIFA = 'Rifa Volumen Inventario Comun'
const TOTAL = 100_000
/** Combinaciones del vendedor1 que ya existen dentro de los rangos. */
const PREVIAS = 300
/** Techo de UN bloque: el `statement_timeout` de `authenticated`. */
const TOPE_SESION_MS = 8_000
/**
 * Los lotes que se entregan nada mas terminar (I-214). Con la estadistica vieja,
 * a un vendedor con equipo, ~23 ms por boleta: 200 en 4,8 s y, desde unas 350,
 * por encima de los 8 s. Sin vendedor con equipo no se veia: el seed no tiene.
 */
const LOTES = [10, 50, 100, 200, 350, 500, 1000]

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client
let seller1: Client
let seller2: Client
let raffleId: string
/** Vendedor directo CON equipo: el unico al que la cuenta del equipo le cuesta (D-260). */
let jefeId: string
let integranteId: string

const informe: string[] = []
const medidas: Record<string, number> = {}

function anotar(nombre: string, ms: number) {
  medidas[nombre] = Math.round(ms)
}

async function medir<T>(nombre: string, accion: () => PromiseLike<T>): Promise<T> {
  const inicio = performance.now()
  const resultado = await accion()
  anotar(nombre, performance.now() - inicio)
  return resultado
}

async function tamano(): Promise<{ tickets: number; audit: number }> {
  const { rows } = await db.query(
    `select pg_total_relation_size('tickets')::bigint as tickets,
            pg_total_relation_size('audit_logs')::bigint as audit`,
  )
  return { tickets: Number(rows[0].tickets), audit: Number(rows[0].audit) }
}

async function limpiar() {
  const { rows } = await db.query(
    'select id from raffles where name = $1 and organization_id = $2',
    [RIFA, ctx.demoOrg.id],
  )
  if (rows.length === 0) return
  const id = rows[0].id as string
  await db.query('begin')
  try {
    // Cien mil filas: sin disparadores de auditoria, comision ni guarda, que en
    // un borrado de limpieza solo cuestan tiempo. Solo en esta transaccion.
    await db.query('set local session_replication_role = replica')
    // Su bitacora (D-233): la de la rifa, sus generaciones y sus boletas, y los
    // lotes de mil, que se anotan sin entidad y nombran sus boletas. Antes de
    // borrar las boletas, porque es contra ellas como se reconocen; y sin
    // disparadores, el borrado de abajo ya no escribe ninguna fila nueva.
    await db.query(
      `delete from audit_logs a
        where a.entity_id = $1
           or a.entity_id in (select g.id from ticket_generation_runs g where g.raffle_id = $1)
           or (a.entity_type = 'ticket'
               and a.entity_id in (select t.id from tickets t where t.raffle_id = $1))
           or (a.entity_id is null
               and a.new_values ? 'ticket_ids'
               and exists (select 1
                             from jsonb_array_elements_text(a.new_values -> 'ticket_ids') e(v)
                             join tickets t on t.id = e.v::uuid
                            where t.raffle_id = $1))`,
      [id],
    )
    await db.query('delete from ticket_holds where raffle_id = $1', [id])
    await db.query('delete from tickets where raffle_id = $1', [id])
    await db.query('delete from ticket_generation_runs where raffle_id = $1', [id])
    await db.query('delete from raffle_hold_settings where raffle_id = $1', [id])
    await db.query('delete from commission_ledger where raffle_id = $1', [id])
    await db.query('delete from seller_commissions where raffle_id = $1', [id])
    await db.query('delete from raffles where id = $1', [id])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

/**
 * Un vendedor directo con UN integrante, como el vendedor principal de
 * produccion. Con equipo, `recalc_seller_commission` cuenta las boletas pagadas
 * de su equipo en la rifa en cada boleta que recibe; sin equipo esa cuenta no
 * tiene por donde empezar y no cuesta nada.
 */
async function crearEquipo() {
  const stamp = Date.now().toString(36)
  const crear = async (email: string, nombre: string) => {
    const { data, error } = await ctx.svc.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: nombre, phone: '3001234567' },
    })
    if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
    return data.user.id
  }
  jefeId = await crear(`jefe-volumen-${stamp}@demo.test`, 'Jefe Volumen Inventario')
  const jefe = await ctx.svc
    .from('memberships')
    .insert({ organization_id: ctx.demoOrg.id, profile_id: jefeId, role: 'seller' })
  if (jefe.error) throw jefe.error
  integranteId = await crear(`integrante-volumen-${stamp}@demo.test`, 'Integrante Volumen')
  const integrante = await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: integranteId,
    role: 'seller',
    parent_seller_id: jefeId,
  })
  if (integrante.error) throw integrante.error
}

async function borrarEquipo() {
  for (const id of [integranteId, jefeId]) {
    if (!id) continue
    await ctx.svc.from('commission_ledger').delete().eq('seller_id', id)
    await ctx.svc.from('seller_commissions').delete().eq('seller_id', id)
    await ctx.svc.from('notifications').delete().eq('recipient_profile_id', id)
    // El integrante primero: la FK del vendedor padre es `on delete restrict`.
    await ctx.svc.from('memberships').delete().eq('profile_id', id)
    await ctx.svc.auth.admin.deleteUser(id)
  }
}

/** Lo que el planificador sabe hoy de `tickets` y de la rifa de esta suite. */
async function estadistica(): Promise<{
  filas: number
  conoceLaRifa: boolean
  sinVendedor: number
}> {
  const { rows } = await db.query(
    `select c.reltuples::bigint as filas,
            coalesce((select $1::uuid = any ((s.most_common_vals::text)::uuid[])
                        from pg_stats s
                       where s.schemaname = 'public' and s.tablename = 'tickets'
                         and s.attname = 'raffle_id'), false) as conoce,
            coalesce((select s.null_frac from pg_stats s
                       where s.schemaname = 'public' and s.tablename = 'tickets'
                         and s.attname = 'seller_id'), 0) as nulos
       from pg_class c
      where c.oid = 'public.tickets'::regclass`,
    [raffleId],
  )
  return {
    filas: Number(rows[0].filas),
    conoceLaRifa: rows[0].conoce as boolean,
    sinVendedor: Number(rows[0].nulos),
  }
}

/** Boletas libres del inventario comun de la rifa, en el orden del catalogo. */
async function libres(cuantas: number, desde = 0): Promise<string[]> {
  const { rows } = await db.query(
    `select id from tickets
      where raffle_id = $1 and seller_id is null and inventory_status = 'available'
      order by daily_number, weekly_number limit $2 offset $3`,
    [raffleId, cuantas, desde],
  )
  return rows.map((r) => r.id as string)
}

/** Lo que dejo la bitacora sobre unas boletas: entregas en lote y cambios de cada una. */
async function bitacora(ids: string[]): Promise<{ lotes: number; cambios: number }> {
  const { rows } = await db.query(
    `select
       (select count(*) from audit_logs a
         where a.action = 'ticket.inventory_assign'
           and (a.new_values -> 'ticket_ids') ?| $1::text[])::int as lotes,
       (select count(*) from audit_logs a
         where a.action = 'ticket.update' and a.entity_id = any ($2::uuid[]))::int as cambios`,
    [ids, ids],
  )
  return { lotes: rows[0].lotes as number, cambios: rows[0].cambios as number }
}

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  await limpiar()
  await crearEquipo()
  // D-261: dos números, el diario de cuatro cifras y el semanal de dos —el
  // «Mayor + Seco» del encargo—: 10.000 × 10 son las 100.000 de siempre.
  const { rows } = await db.query(
    `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date, created_by,
                          number_group_count, first_group_name, first_group_digits,
                          second_group_name, second_group_digits)
     values ($1, $2, 120000, 'active', '2026-01-01', '2026-12-31', $3, 2, 'Diario', 4, 'Semanal', 2)
     returning id`,
    [ctx.demoOrg.id, RIFA, ctx.ids.owner],
  )
  raffleId = rows[0].id as string
  // Como produccion: estadistica de antes de generar, que no conoce esta rifa.
  // Y sin analisis automatico hasta el final (ver la cabecera).
  await db.query('analyze tickets')
  await db.query('alter table tickets set (autovacuum_enabled = false)')
}, 120_000)

afterAll(async () => {
  try {
    await db.query('alter table tickets reset (autovacuum_enabled)')
    mkdirSync('build/inventario-volumen', { recursive: true })
    writeFileSync(
      'build/inventario-volumen/informe.md',
      [
        `# Volumen del inventario común — ${new Date().toISOString()}`,
        '',
        ...informe,
        '',
        '| Medida | ms |',
        '|---|---:|',
        ...Object.entries(medidas).map(([nombre, ms]) => `| ${nombre} | ${ms} |`),
        '',
      ].join('\n'),
      'utf8',
    )
  } finally {
    await limpiar()
    await borrarEquipo()
    await db.end()
  }
}, 300_000)

type Run = {
  outcome: string
  run_id: string
  total_count: number
  processed_count: number
  created_count: number
  existing_count: number
  existing_generated_count: number
  status: string
}

describe(`generacion de ${TOTAL.toLocaleString('es-CO')} boletas`, () => {
  it('se crea por bloques bajo el tope de la sesion, interrumpida y continuada, sin duplicar', async () => {
    // Lo que ya existia: 300 combinaciones del vendedor1 dentro de los rangos.
    const previas = Array.from({ length: PREVIAS }, (_, i) => ({
      daily_number: String(i).padStart(4, '0'),
      weekly_number: '05',
    }))
    const creadas = await owner.rpc('bulk_create_tickets', {
      p_raffle_id: raffleId,
      p_seller_id: ctx.ids.seller1,
      p_rows: previas,
    })
    expect(creadas.error).toBeNull()

    const antes = await tamano()

    // 10.000 diarios x 10 semanales.
    const inicio = await medir('empezar', () =>
      owner.rpc('admin_start_ticket_generation', {
        p_raffle_id: raffleId,
        p_daily_from: '0000',
        p_daily_to: '9999',
        p_weekly_from: '00',
        p_weekly_to: '09',
        p_request_id: crypto.randomUUID(),
      }),
    )
    expect(inicio.error).toBeNull()
    let run = inicio.data![0] as Run
    expect(run.total_count).toBe(TOTAL)

    const bloques: number[] = []
    async function bloque(): Promise<Run> {
      const t0 = performance.now()
      const { data, error } = await owner.rpc('admin_process_ticket_generation', {
        p_run_id: run.run_id,
        p_processed_count: run.processed_count,
      })
      bloques.push(performance.now() - t0)
      if (error) throw new Error(`Bloque fallido en ${run.processed_count}: ${error.message}`)
      return data![0] as Run
    }

    // Cuatro bloques y la pestaña se cierra.
    for (let i = 0; i < 4; i += 1) run = await bloque()
    expect(run).toMatchObject({
      processed_count: 20_000,
      existing_count: PREVIAS,
      status: 'in_progress',
    })
    const confirmadas = await db.query(
      'select count(*)::int as n from tickets where generation_run_id = $1',
      [run.run_id],
    )
    expect(confirmadas.rows[0].n).toBe(20_000 - PREVIAS)

    // I-214: el PRIMER bloque ya puso la rifa en la estadistica, aunque la
    // generacion se interrumpa aqui. Sin el, el planificador seguiria creyendo
    // que la rifa tiene una fila y que toda boleta tiene vendedor.
    const aMedias = await estadistica()
    expect(aMedias.conoceLaRifa, 'la estadistica conoce la rifa tras el primer bloque').toBe(true)
    expect(aMedias.sinVendedor).toBeGreaterThan(0.5)

    // Se vuelve con OTRA solicitud: se continua la misma generacion.
    const vuelta = await owner.rpc('admin_start_ticket_generation', {
      p_raffle_id: raffleId,
      p_daily_from: '0000',
      p_daily_to: '9999',
      p_weekly_from: '00',
      p_weekly_to: '09',
      p_request_id: crypto.randomUUID(),
    })
    expect(vuelta.data![0]).toMatchObject({
      outcome: 'resumed',
      run_id: run.run_id,
      processed_count: 20_000,
    })

    // Y una respuesta perdida: la pantalla repite el ultimo bloque.
    const repetido = await owner.rpc('admin_process_ticket_generation', {
      p_run_id: run.run_id,
      p_processed_count: 15_000,
    })
    expect(repetido.data![0]).toMatchObject({
      outcome: 'already_processed',
      processed_count: 20_000,
    })

    const t0 = performance.now()
    while (run.status !== 'completed') run = await bloque()
    anotar('resto de la generacion', performance.now() - t0)
    anotar(
      'generacion completa (suma de bloques)',
      bloques.reduce((a, b) => a + b, 0),
    )
    anotar('bloque mas lento', Math.max(...bloques))
    anotar('bloque mediano', [...bloques].sort((a, b) => a - b)[Math.floor(bloques.length / 2)]!)

    expect(run).toMatchObject({
      status: 'completed',
      processed_count: TOTAL,
      created_count: TOTAL - PREVIAS,
      existing_count: PREVIAS,
      existing_generated_count: 0,
    })
    expect(bloques).toHaveLength(20)
    expect(Math.max(...bloques)).toBeLessThan(TOPE_SESION_MS)

    // I-214: el ULTIMO bloque la deja con el tamano real de la tabla. Con el
    // analisis automatico apagado, nada mas pudo ponerla al dia.
    const alTerminar = await estadistica()
    expect(alTerminar.filas, 'la estadistica cuenta las 100.000').toBeGreaterThanOrEqual(TOTAL)
    expect(alTerminar.conoceLaRifa).toBe(true)

    // Una respuesta perdida en el ULTIMO bloque: repetirlo no crea nada ni
    // escribe otro bloque en la bitacora.
    const generadasAntes = await db.query(
      `select (select count(*) from tickets where raffle_id = $1)::int as boletas,
              (select count(*) from audit_logs where action = 'ticket.generate' and entity_id = $2)::int as bloques`,
      [raffleId, run.run_id],
    )
    for (const avance of [TOTAL - 5_000, TOTAL]) {
      const otraVez = await owner.rpc('admin_process_ticket_generation', {
        p_run_id: run.run_id,
        p_processed_count: avance,
      })
      expect(otraVez.error).toBeNull()
      expect(otraVez.data![0]).toMatchObject({
        outcome: 'completed',
        processed_count: TOTAL,
        created_count: TOTAL - PREVIAS,
      })
    }
    const generadasDespues = await db.query(
      `select (select count(*) from tickets where raffle_id = $1)::int as boletas,
              (select count(*) from audit_logs where action = 'ticket.generate' and entity_id = $2)::int as bloques`,
      [raffleId, run.run_id],
    )
    expect(generadasDespues.rows[0]).toEqual(generadasAntes.rows[0])

    const { rows } = await db.query(
      `select count(*)::int as total,
                count(*) filter (where generation_run_id = $2)::int as generadas,
                count(distinct internal_code)::int as codigos,
                count(*) filter (where seller_id is null)::int as comunes
           from tickets where raffle_id = $1`,
      [raffleId, run.run_id],
    )
    expect(rows[0]).toEqual({
      total: TOTAL,
      generadas: TOTAL - PREVIAS,
      codigos: TOTAL,
      comunes: TOTAL - PREVIAS,
    })

    const despues = await tamano()
    const porBoleta = (despues.tickets - antes.tickets) / (TOTAL - PREVIAS)
    informe.push(
      `- Bloques: ${bloques.length}; el mas lento ${Math.round(Math.max(...bloques))} ms (tope de la sesión: ${TOPE_SESION_MS} ms).`,
      `- \`tickets\` creció ${((despues.tickets - antes.tickets) / 1024 / 1024).toFixed(1)} MB (≈${Math.round(porBoleta)} bytes por boleta, con sus índices).`,
      `- \`audit_logs\` creció ${((despues.audit - antes.audit) / 1024).toFixed(1)} kB: una fila por bloque, no una por boleta.`,
    )
    // La bitacora no crece por boleta: veinte bloques son kilobytes.
    expect(despues.audit - antes.audit).toBeLessThan(5 * 1024 * 1024)
  }, 600_000)
})

/**
 * I-214 (D-260): lo primero que hace el dueño al terminar de generar es entregar
 * lotes. Estas pruebas corren JUSTO despues de la generacion, con el analisis
 * automatico apagado: si el generador no dejo la estadistica al dia, la cuenta
 * del equipo del vendedor recorre las 100.000 boletas por cada boleta entregada.
 */
describe('entregar lotes justo despues de generar (I-214)', () => {
  /** Lo entregado por estas pruebas, para devolverlo al inventario comun al final. */
  const entregadas: string[][] = []

  it(`lotes de ${LOTES.join(', ')} a un vendedor con equipo, uno detras de otro`, async () => {
    const tiempos: string[] = []
    for (const tamano of LOTES) {
      const ids = await libres(tamano)
      const inicio = performance.now()
      const lote = await owner.rpc('admin_assign_inventory_tickets', {
        p_ticket_ids: ids,
        p_seller_id: jefeId,
      })
      const ms = Math.round(performance.now() - inicio)
      anotar(`entregar un lote de ${tamano} a un vendedor con equipo`, ms)
      tiempos.push(`${tamano}: ${ms} ms`)
      // Con la estadistica vieja, el de 350 caia aqui: «canceling statement due
      // to statement timeout» (57014), y no se guardaba ninguna.
      expect(lote.error, `lote de ${tamano}`).toBeNull()
      expect(lote.data).toEqual({ requested: tamano, assigned: tamano, already: 0 })
      expect(ms, `lote de ${tamano}`).toBeLessThan(TOPE_SESION_MS)
      entregadas.push(ids)
    }

    const { rows } = await db.query(
      'select count(*)::int as n from tickets where raffle_id = $1 and seller_id = $2',
      [raffleId, jefeId],
    )
    expect(rows[0].n).toBe(LOTES.reduce((a, b) => a + b, 0))
    informe.push(`- Lotes a un vendedor con equipo, justo después de generar: ${tiempos.join(' · ')}.`)
  })

  it('un lote cortado no deja nada a medias; el reintento entrega una vez y repetirlo no duplica', async () => {
    const ids = await libres(1000)
    expect(await bitacora(ids)).toEqual({ lotes: 0, cambios: 0 })
    const contarDelJefe = async () =>
      (
        await db.query('select count(*)::int as n from tickets where id = any ($1) and seller_id = $2', [
          ids,
          jefeId,
        ])
      ).rows[0].n as number
    const movimientos = async () =>
      (
        await db.query(
          'select count(*)::int as n from commission_ledger where raffle_id = $1 and seller_id = $2',
          [raffleId, jefeId],
        )
      ).rows[0].n as number
    const movimientosAntes = await movimientos()

    // La peticion se corta a mitad, como una respuesta que no llega a tiempo:
    // la misma sesion del dueño, con un tope de 50 ms en vez de 8 s.
    const cortada = new PgClient({ connectionString: DB_URL })
    await cortada.connect()
    let codigo: string | undefined
    try {
      await cortada.query('begin')
      await cortada.query('set local role authenticated')
      await cortada.query(`set local statement_timeout = '50ms'`)
      await cortada.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: ctx.ids.owner, role: 'authenticated' }),
      ])
      await cortada.query('select admin_assign_inventory_tickets($1::uuid[], $2)', [ids, jefeId])
      await cortada.query('commit')
    } catch (error) {
      codigo = (error as { code?: string }).code
      await cortada.query('rollback')
    } finally {
      await cortada.end()
    }
    expect(codigo, 'el lote se corto por el tope').toBe('57014')
    expect(await contarDelJefe(), 'ninguna quedo entregada').toBe(0)
    expect(await bitacora(ids)).toEqual({ lotes: 0, cambios: 0 })

    // El reintento, por la API: las 1.000, una sola vez.
    const reintento = await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: ids,
      p_seller_id: jefeId,
    })
    expect(reintento.error).toBeNull()
    expect(reintento.data).toEqual({ requested: 1000, assigned: 1000, already: 0 })
    expect(await contarDelJefe()).toBe(1000)
    expect(await bitacora(ids)).toEqual({ lotes: 1, cambios: 1000 })

    // Y otra vez, como un doble clic o una respuesta perdida: cuentan como hechas.
    const repetido = await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: ids,
      p_seller_id: jefeId,
    })
    expect(repetido.error).toBeNull()
    expect(repetido.data).toEqual({ requested: 1000, assigned: 0, already: 1000 })
    // La bitacora anota el intento —«0 asignadas»—, y ninguna boleta cambia otra vez.
    expect(await bitacora(ids)).toEqual({ lotes: 2, cambios: 1000 })
    expect(await movimientos(), 'sin boletas pagadas no hay movimientos de ganancia').toBe(
      movimientosAntes,
    )
    entregadas.push(ids)
  })

  it('un lote con una boleta apartada no entrega ninguna', async () => {
    const ids = await libres(1000)
    const apartado = await seller2.rpc('take_ticket_hold', {
      p_ticket_id: ids[500]!,
      p_request_id: crypto.randomUUID(),
    })
    expect(apartado.error).toBeNull()

    const lote = await owner.rpc('admin_assign_inventory_tickets', {
      p_ticket_ids: ids,
      p_seller_id: jefeId,
    })
    expect(lote.error?.message).toContain(
      'No se realizó ningún cambio: 1 de las 1000 boletas seleccionadas ya no están libres',
    )
    const { rows } = await db.query(
      'select count(*)::int as n from tickets where id = any ($1) and seller_id is not null',
      [ids],
    )
    expect(rows[0].n).toBe(0)
    expect(await bitacora(ids)).toEqual({ lotes: 0, cambios: 0 })

    const devuelto = await seller2.rpc('return_ticket_hold', {
      p_hold_id: apartado.data![0]!.hold_id,
    })
    expect(devuelto.error).toBeNull()
  })

  it('lo entregado vuelve al inventario comun, para las lecturas que siguen', async () => {
    for (const ids of entregadas) {
      const recuperar = await owner.rpc('admin_recover_inventory_tickets', { p_ticket_ids: ids })
      expect(recuperar.error).toBeNull()
      expect(recuperar.data).toMatchObject({ requested: ids.length, recovered: ids.length })
    }
    const { rows } = await db.query(
      'select count(*)::int as n from tickets where raffle_id = $1 and seller_id is null',
      [raffleId],
    )
    expect(rows[0].n).toBe(TOTAL - PREVIAS)
  })
})

describe('lecturas sobre 100.000 boletas', () => {
  it('el catalogo interno busca y pagina sin traerlas', async () => {
    const primera = await medir('catalogo: primera pagina de libres', () =>
      seller2.rpc('seller_inventory_tickets', { p_raffle_id: raffleId, p_limit: 25, p_offset: 0 }),
    )
    expect(primera.data).toHaveLength(25)
    expect(Number(primera.data![0]!.total_count)).toBe(TOTAL - PREVIAS)

    const profunda = await medir('catalogo: pagina 3.980 de libres', () =>
      seller2.rpc('seller_inventory_tickets', {
        p_raffle_id: raffleId,
        p_limit: 25,
        p_offset: 99_475,
      }),
    )
    expect(profunda.data).toHaveLength(25)

    const diario = await medir('catalogo: un numero diario', () =>
      seller2.rpc('seller_inventory_tickets', { p_raffle_id: raffleId, p_daily: '1234' }),
    )
    expect(diario.data!.map((r) => `${r.daily_number}/${r.weekly_number}`)).toEqual(
      Array.from({ length: 10 }, (_, i) => `1234/0${i}`),
    )

    const semanal = await medir('catalogo: un numero semanal (10.000)', () =>
      seller2.rpc('seller_inventory_tickets', {
        p_raffle_id: raffleId,
        p_weekly: '07',
        p_limit: 25,
      }),
    )
    expect(Number(semanal.data![0]!.total_count)).toBe(10_000)

    const combinacion = await medir('catalogo: una combinacion', () =>
      seller2.rpc('seller_inventory_tickets', {
        p_raffle_id: raffleId,
        p_daily: '0123',
        p_weekly: '05',
        p_only_free: false,
      }),
    )
    // Es una de las 300 del vendedor1: para el vendedor2, solo «no disponible».
    expect(combinacion.data).toEqual([
      expect.objectContaining({
        daily_number: '0123',
        weekly_number: '05',
        availability: 'unavailable',
        ticket_id: null,
      }),
    ])

    const resumen = await medir('catalogo: resumen del vendedor', () =>
      seller2.rpc('seller_inventory_summary'),
    )
    expect(Number(resumen.data!.find((r) => r.raffle_id === raffleId)!.free_count)).toBe(
      TOTAL - PREVIAS,
    )

    for (const [nombre, ms] of Object.entries(medidas).filter(([n]) => n.startsWith('catalogo'))) {
      expect(ms, nombre).toBeLessThan(TOPE_SESION_MS)
    }
  })

  it('la lista del personal pagina el inventario comun', async () => {
    const primera = await medir('personal: primera pagina del inventario comun', () =>
      owner.rpc('admin_list_tickets', { p_raffle_id: raffleId, p_custody: 'common', p_limit: 25 }),
    )
    expect(primera.data).toHaveLength(25)
    expect(Number(primera.data![0]!.total_count)).toBe(TOTAL - PREVIAS)

    const profunda = await medir('personal: pagina 3.980 del inventario comun', () =>
      owner.rpc('admin_list_tickets', {
        p_raffle_id: raffleId,
        p_custody: 'common',
        p_limit: 25,
        p_offset: 99_475,
      }),
    )
    expect(profunda.data).toHaveLength(25)

    const busqueda = await medir('personal: buscar 4321', () =>
      owner.rpc('admin_list_tickets', { p_raffle_id: raffleId, p_search: '4321', p_limit: 25 }),
    )
    expect(busqueda.data!.length).toBeGreaterThan(0)

    const inventario = await medir('personal: recuentos de la rifa', () =>
      owner.rpc('admin_ticket_inventory', { p_raffle_id: raffleId }),
    )
    const comun = inventario.data!.find((r) => r.seller_id === null)!
    expect(Number(comun.tickets_available)).toBe(TOTAL - PREVIAS)

    for (const [nombre, ms] of Object.entries(medidas).filter(([n]) => n.startsWith('personal'))) {
      expect(ms, nombre).toBeLessThan(TOPE_SESION_MS)
    }
  })

  it('apartar, asignar 1.000 y recuperarlas con 100.000 en la rifa', async () => {
    const { rows } = await db.query(
      `select id from tickets
        where raffle_id = $1 and seller_id is null and inventory_status = 'available'
        order by daily_number, weekly_number limit 1001`,
      [raffleId],
    )
    const [unaParaApartar, ...lote] = rows.map((r) => r.id as string)

    const hold = await medir('apartar una boleta', () =>
      seller1.rpc('take_ticket_hold', {
        p_ticket_id: unaParaApartar!,
        p_request_id: crypto.randomUUID(),
      }),
    )
    expect(hold.error).toBeNull()

    const asignar = await medir('asignar 1.000 a un vendedor', () =>
      owner.rpc('admin_assign_inventory_tickets', {
        p_ticket_ids: lote,
        p_seller_id: ctx.ids.seller2,
      }),
    )
    expect(asignar.data).toEqual({ requested: 1000, assigned: 1000, already: 0 })

    const recuperar = await medir('recuperar 1.000 al inventario comun', () =>
      owner.rpc('admin_recover_inventory_tickets', { p_ticket_ids: lote }),
    )
    expect(recuperar.data).toEqual({ requested: 1000, recovered: 1000, already: 0 })

    for (const nombre of [
      'apartar una boleta',
      'asignar 1.000 a un vendedor',
      'recuperar 1.000 al inventario comun',
    ]) {
      expect(medidas[nombre], nombre).toBeLessThan(TOPE_SESION_MS)
    }
    informe.push(
      `- Asignar 1.000: ${medidas['asignar 1.000 a un vendedor']} ms; recuperarlas: ${medidas['recuperar 1.000 al inventario comun']} ms.`,
    )
  })
})
