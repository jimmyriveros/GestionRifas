/**
 * EL ENSAYO LOCAL DEL CARGADOR, con el script de verdad (Etapa 4 de D-208, `RUNBOOK` §9.4).
 *
 * `scripts/record-prize-awards.ts` se ejecuta aquí como un proceso aparte, con
 * `--local` y la lista confirmada por el dueño (`CONFIRMED_PRIZE_AWARDS`), contra
 * una reproducción de la situación de producción: una rifa que ya existía, pasada a
 * premios configurables con un instante efectivo POSTERIOR a sus dos sorteos, con
 * las dos boletas reales vendidas antes de jugarse y las dos fotografías que deja el
 * motor. Es el MISMO flujo que la puerta 2 —vista previa, huella, aplicar y
 * conciliar—; lo único que cambia es el destino, y el modo de producción se prueba
 * por separado, sin red, en `tests/unit/record-prize-awards-guard.test.ts`.
 *
 * EL PROCESO NUNCA VE UNA CREDENCIAL DE PRODUCCIÓN: su entorno fija las variables de
 * Supabase a la base local y `dotenv` no sobrescribe las que ya existen, así que ni
 * `--production` puede salir de 127.0.0.1 (S1 lo demuestra).
 *
 * Demuestra, en este orden: las negativas de la puerta, que la vista previa no
 * escribe, que una huella distinta no escribe, la aplicación completa, la repetición
 * sin duplicados ni bitácora de más, la discrepancia de importe sin cambios y el
 * cambio entre dos vistas previas cuando otra ejecución se adelanta.
 *
 * Limpia por PREFIJO al empezar y al terminar: la programación es nacional y una
 * corrida abortada no puede bloquear la siguiente (I-035).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  CONFIRMED_AWARDS_BASIS,
  CONFIRMED_PRIZE_AWARDS,
} from '../../src/features/prize-awards/declared'

import {
  DB_URL,
  loadSeedContext,
  localScriptEnv,
  runLotteryEngine,
  serviceClient,
  signInAs,
  USERS,
  type Client,
} from './helpers'

const PREFIJO = 'E4 cargador'
const SORTEO = 'E4C-'
const stamp = Date.now().toString(36)
const RAIZ = path.resolve(import.meta.dirname, '../..')
const TSX = path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const HUELLA_RE = /Huella de la vista previa: ([0-9a-f]{64})/

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient
let svc: Client
let org = ''
let rifa = ''

/** El entorno del proceso: SOLO la base local, pase lo que pase con `.env.local`. */
const entorno = localScriptEnv

type Corrida = { code: number | null; salida: string }

/** Ejecuta el cargador de verdad, como lo haría quien opera. */
function cargador(args: string[], extra: Record<string, string> = {}): Corrida {
  const r = spawnSync(process.execPath, [TSX, 'scripts/record-prize-awards.ts', ...args], {
    cwd: RAIZ,
    env: entorno(extra),
    encoding: 'utf8',
    timeout: 120_000,
  })
  return { code: r.status, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

type Sonda = {
  coincidencias_confirmadas: Array<Record<string, unknown>>
  premio_por_titulo: Array<Record<string, unknown>>
  historial_actual: {
    fuente: string
    totales: Record<string, unknown>
    filas: Array<Record<string, unknown>>
  }
  coincidencias_vendidas_del_sistema_de_siempre: Array<Record<string, unknown>>
  totales_esperados_tras_la_carga: Record<string, unknown>
}

/**
 * La sonda de solo lectura de la puerta (`scripts/prize-awards-probe.ts`), de
 * verdad y contra la base local: así sus consultas quedan validadas sobre el mismo
 * escenario antes de leer producción con ellas.
 */
function sonda(etiqueta: string): Sonda {
  const r = spawnSync(
    process.execPath,
    [TSX, 'scripts/prize-awards-probe.ts', etiqueta, '--local', '--organization', org],
    { cwd: RAIZ, env: entorno(), encoding: 'utf8', timeout: 120_000 },
  )
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  expect(r.status, salida).toBe(0)
  const archivo = salida.match(/Guardada en (.+\.json)/)?.[1]
  if (!archivo) throw new Error(`La sonda no dijo dónde guardó su informe:\n${salida}`)
  const ruta = path.join(RAIZ, archivo.trim())
  const informe = JSON.parse(readFileSync(ruta, 'utf8')) as Sonda
  rmSync(ruta)
  return informe
}

/** Una foto por fila de la base local, con la herramienta de la puerta. Devuelve su ruta. */
function foto(etiqueta: string): string {
  const r = spawnSync(process.execPath, [TSX, 'scripts/gate-snapshot.ts', etiqueta, '--local'], {
    cwd: RAIZ,
    env: entorno(),
    encoding: 'utf8',
    timeout: 120_000,
  })
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  expect(r.status, salida).toBe(0)
  const archivo = salida.match(/Guardada en (.+\.json)/)?.[1]
  if (!archivo) throw new Error(`La foto no dijo dónde se guardó:\n${salida}`)
  return path.join(RAIZ, archivo.trim())
}

type Informe = {
  veredicto: 'CONTINUAR' | 'DETENER'
  motivos_para_detener: string[]
  operaciones: Array<Record<string, unknown>>
  filas_tocadas: Record<string, { nuevas: number; modificadas: number; borradas: number }>
}

/** La comparación de la puerta entre dos fotos locales. */
function comparar(
  antes: string,
  despues: string,
  extras: string[],
): { code: number | null; informe: Informe; salida: string } {
  const r = spawnSync(
    process.execPath,
    [TSX, 'scripts/gate-compare.ts', antes, despues, '--local', ...extras],
    { cwd: RAIZ, env: entorno(), encoding: 'utf8', timeout: 120_000 },
  )
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  let informe: Informe
  try {
    informe = JSON.parse(r.stdout ?? '') as Informe
  } catch {
    throw new Error(`La comparación no devolvió un informe:\n${salida}`)
  }
  return { code: r.status, informe, salida }
}

const conOrg = (...extras: string[]) => [
  ...extras,
  '--organization',
  org,
  '--confirm-organization',
  org,
]

function huella(corrida: Corrida): string {
  const m = corrida.salida.match(HUELLA_RE)
  if (!m) throw new Error(`La vista previa no imprimió su huella:\n${corrida.salida}`)
  return m[1]!
}

/**
 * Todo lo que el cargador podría tocar, y lo que tiene alrededor: si esta huella no
 * cambia, no se escribió nada. Los reconocimientos y la bitácora de la
 * organización enteros; las fotografías, las boletas y los premios de la rifa del
 * ensayo; los enlaces del motor, y los avisos de la organización.
 */
async function estado() {
  const { rows } = await db.query<Record<string, string>>(
    `select
       (select count(*)::text from declared_prize_awards) as reconocimientos,
       (select count(*)::text from declared_prize_awards where voided_at is null) as vigentes,
       (select coalesce(sum(amount), 0)::text from declared_prize_awards where voided_at is null) as dinero,
       (select count(*)::text from audit_logs where organization_id = $1) as bitacora,
       (select md5(coalesce(string_agg(to_jsonb(d)::text, ',' order by d.id), '')) from declared_prize_awards d) as h_reconocimientos,
       (select md5(coalesce(string_agg(to_jsonb(a)::text, ',' order by a.id), '')) from audit_logs a where a.organization_id = $1) as h_bitacora,
       (select md5(coalesce(string_agg(to_jsonb(m)::text, ',' order by m.id), '')) from lottery_ticket_matches m where m.raffle_id = $2) as h_fotografias,
       (select md5(coalesce(string_agg(to_jsonb(lp)::text, ',' order by lp.id), '')) from lottery_ticket_match_prizes lp) as h_enlaces,
       (select md5(coalesce(string_agg(to_jsonb(t)::text, ',' order by t.id), '')) from tickets t where t.raffle_id = $2) as h_boletas,
       (select md5(coalesce(string_agg(to_jsonb(p)::text, ',' order by p.id), '')) from raffle_prizes p where p.raffle_id = $2) as h_premios,
       (select md5(coalesce(string_agg(to_jsonb(n)::text, ',' order by n.id), '')) from notifications n where n.organization_id = $1) as h_avisos`,
    [org, rifa],
  )
  return rows[0]!
}

/** Lo que otra ejecución —otra persona, otra terminal— reconocería por su cuenta. */
async function otraEjecucion(indices: number[], importe?: number) {
  const entradas = indices.map((i) => ({
    ...CONFIRMED_PRIZE_AWARDS[i]!,
    ...(importe ? { amount: importe } : {}),
  }))
  const { error } = await svc.rpc('record_declared_prize_awards', {
    p_organization_id: org,
    p_basis: CONFIRMED_AWARDS_BASIS,
    p_awards: entradas as unknown as never,
    p_apply: true,
  })
  if (error) throw new Error(`La otra ejecución falló: ${error.message}`)
}

/** Deja los reconocimientos del ensayo como al principio. Son inmutables: hace falta `replica`. */
async function sinReconocimientos(): Promise<void> {
  await db.query(`set session_replication_role = replica`)
  await db.query(
    `delete from declared_prize_awards where raffle_id in (select id from raffles where name like $1)`,
    [`${PREFIJO}%`],
  )
  await db.query(
    `delete from audit_logs where entity_type = 'declared_prize_award' and organization_id = $1`,
    [org],
  )
  await db.query(`set session_replication_role = origin`)
}

async function limpiar(): Promise<void> {
  const rifas = `${PREFIJO}%`
  await db.query(`set session_replication_role = replica`)
  const resultados = `(select r.id from lottery_results r join lottery_draw_schedules s on s.id = r.schedule_id
                        where s.draw_number like '${SORTEO}%')`
  await db.query(
    `delete from declared_prize_awards where raffle_id in (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(
    `delete from audit_logs where entity_type = 'declared_prize_award' and organization_id = $1`,
    [ctx.demoOrg.id],
  )
  // Por RESULTADO y no por rifa: el motor pudo fotografiar también una boleta de
  // otra rifa con el mismo número, y esa fila no puede quedar huérfana.
  await db.query(`delete from lottery_ticket_match_prizes where match_id in
                    (select id from lottery_ticket_matches where result_id in ${resultados})`)
  await db.query(`delete from lottery_ticket_matches where result_id in ${resultados}`)
  await db.query(
    `delete from notifications where kind = 'lottery.result' and entity_id in ${resultados}`,
  )
  await db.query(`delete from lottery_results where id in ${resultados}`)
  await db.query(`delete from lottery_draw_schedules where draw_number like '${SORTEO}%'`)
  await db.query(
    `delete from notifications where kind = 'raffle_prize.changed'
        and data ->> 'raffle_id' in (select id::text from raffles where name like $1)`,
    [rifas],
  )
  await db.query(
    `delete from audit_logs where entity_id in (select id from raffles where name like $1)`,
    [rifas],
  )
  // S8: la venta y el abono de ensayo, con todo lo que dejan.
  const boletas = `(select id from tickets where raffle_id in (select id from raffles where name like $1))`
  const pagos = `(select pa.payment_id from payment_allocations pa where pa.ticket_id in ${boletas})`
  await db.query(`delete from audit_logs where entity_id in ${pagos}`, [rifas])
  await db.query(`delete from payments where id in ${pagos}`, [rifas])
  await db.query(`delete from payment_allocations where ticket_id in ${boletas}`, [rifas])
  await db.query(`delete from commission_ledger where ticket_id in ${boletas}`, [rifas])
  await db.query(
    `delete from seller_commissions where raffle_id in (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(`delete from notifications where kind = 'team.sale' and entity_id in ${boletas}`, [
    rifas,
  ])
  await db.query(`delete from audit_logs where entity_id in ${boletas}`, [rifas])
  await db.query(
    `delete from audit_logs where entity_id in (select id from clients where name like $1)`,
    [rifas],
  )
  await db.query(`delete from clients where name like $1`, [rifas])
  await db.query(
    `delete from tickets where raffle_id in (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(
    `delete from raffle_prize_schedule_rules where version_id in
                    (select v.id from raffle_prize_versions v join raffles r on r.id = v.raffle_id
                      where r.name like $1)`,
    [rifas],
  )
  await db.query(
    `delete from raffle_prize_reward_options where version_id in
                    (select v.id from raffle_prize_versions v join raffles r on r.id = v.raffle_id
                      where r.name like $1)`,
    [rifas],
  )
  await db.query(
    `delete from raffle_prizes where raffle_id in (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(
    `delete from raffle_prize_versions where raffle_id in (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(
    `delete from raffle_prize_transitions where raffle_id in (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(`delete from raffles where name like $1`, [rifas])
  await db.query(`set session_replication_role = origin`)
}

/** El día de la semana, contado desde el lunes, en que juega cada lotería (BR-L01). */
const NOMINAL = { cundinamarca: 0, cruz_roja: 1, meta: 2, bogota: 3, medellin: 4, boyaca: 5 }

function masDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + dias, 12)).toISOString().slice(0, 10)
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  svc = serviceClient()
  org = ctx.demoOrg.id
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  await limpiar()

  // La semana próxima, para el calendario del premio: como el Premio diario real,
  // que se publicó DESPUÉS de los dos sorteos.
  const { rows: hoy } = await db.query<{ hoy: string; dow: number }>(
    `select (now() at time zone 'America/Bogota')::date::text as hoy,
            extract(isodow from (now() at time zone 'America/Bogota')::date)::int as dow`,
  )
  const lunesProximo = masDias(hoy[0]!.hoy, 8 - hoy[0]!.dow)
  const desde = '2026-08-31'
  const hasta = masDias(lunesProximo, 5)

  const { rows: r } = await db.query<{ id: string }>(
    `insert into raffles (organization_id, name, ticket_price, start_date, end_date, created_by, prize_mode, status)
     values ($1, $2, 120000, $3, $4, $5, 'legacy', 'active') returning id`,
    [org, `${PREFIJO} KIA ${stamp}`, desde, hasta, ctx.ids.owner],
  )
  rifa = r[0]!.id

  // Las dos boletas REALES, vendidas antes de los sorteos a clientes del vendedor 1.
  const { rows: clientes } = await db.query<{ id: string }>(
    `select id from clients where organization_id = $1 and seller_id = $2 order by created_at limit 2`,
    [org, ctx.ids.seller1],
  )
  for (const [i, entrada] of CONFIRMED_PRIZE_AWARDS.entries()) {
    const { rows: t } = await db.query<{ id: string }>(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, weekly_number,
                            inventory_status, created_at)
       values ($1, $2, $3, $4, $5, $6, 'available', '2026-08-01T08:00:00-05:00') returning id`,
      [org, rifa, ctx.ids.seller1, ctx.ids.owner, entrada.daily_number, entrada.weekly_number],
    )
    await db.query(
      `update tickets set client_id = $2, inventory_status = 'assigned', sale_price = 120000,
              sale_date = '2026-08-02', assigned_at = '2026-08-02T08:00:00-05:00'
        where id = $1`,
      [t[0]!.id, clientes[i % clientes.length]!.id],
    )
  }

  // La programación oficial de TODA la ventana de la rifa —la transición se niega
  // si no conoce la hora de un sorteo (D-206)—, y el número mayor confirmado de
  // los dos sorteos reales, que caen en su día nominal: Bogotá jueves y
  // Cundinamarca lunes.
  const resultados: string[] = []
  let secuencia = 0
  for (let lunes = desde; lunes <= lunesProximo; lunes = masDias(lunes, 7)) {
    for (const [loteria, dia] of Object.entries(NOMINAL)) {
      const fecha = masDias(lunes, dia)
      if (fecha > hasta) continue
      secuencia += 1
      const { rows: s } = await db.query<{ id: string }>(
        `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                             original_scheduled_at, official_scheduled_at, schedule_status)
         values ($1, $2, $3, $4, $4, 'scheduled') returning id`,
        [loteria, `${SORTEO}${stamp}-${secuencia}`, fecha, `${fecha}T22:30:00-05:00`],
      )
      const real = CONFIRMED_PRIZE_AWARDS.find(
        (e) => e.lottery_code === loteria && e.reference_date === fecha,
      )
      if (!real) continue
      const { rows: res } = await db.query<{ id: string }>(
        `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
         values ($1, $2, 'confirmed', 'official_page', now()) returning id`,
        [s[0]!.id, real.daily_number],
      )
      resultados.push(res[0]!.id)
    }
  }
  expect(resultados).toHaveLength(CONFIRMED_PRIZE_AWARDS.length)

  // La transición, por el mismo camino interno que la de verdad (D-204): su
  // instante efectivo es AHORA, así que los dos sorteos conservan el sistema de siempre.
  await db.query(`select raffle_prize_transition_apply($1, $2, $3, 'active', $4, $5, $6::jsonb)`, [
    org,
    rifa,
    `${PREFIJO} KIA ${stamp}`,
    desde,
    hasta,
    JSON.stringify([
      {
        title: CONFIRMED_PRIZE_AWARDS[0]!.prize_title,
        category: 'daily',
        reward_mode: 'fixed',
        reward_options: [{ description: null, amount: 500_000 }],
        number_field: 'daily_number',
        digits: 'four',
        rules: [
          {
            start_date: lunesProximo,
            end_date: masDias(lunesProximo, 4),
            weekdays: [1, 2, 3, 4, 5],
            lottery_mode: 'corresponding',
            lottery_code: null,
          },
        ],
        conditions: null,
      },
    ]),
  ])

  // El motor fotografía las dos coincidencias con el sistema de siempre.
  for (const id of resultados) {
    const { error } = await runLotteryEngine(id)
    if (error) throw new Error(`El motor falló: ${error.message}`)
  }
  const { rows: fotos } = await db.query<{ n: number; vendidas: number; enlaces: number }>(
    `select count(*)::int as n, count(*) filter (where assignment_status = 'sold')::int as vendidas,
            (select count(*)::int from lottery_ticket_match_prizes lp
               join lottery_ticket_matches m2 on m2.id = lp.match_id where m2.raffle_id = $1) as enlaces
       from lottery_ticket_matches where raffle_id = $1`,
    [rifa],
  )
  expect(fotos[0]).toEqual({ n: 2, vendidas: 2, enlaces: 0 })
}, 120_000)

afterAll(async () => {
  await limpiar()
  await db.end()
})

describe('S1 — la puerta, desde fuera: ninguna negativa escribe nada', () => {
  it('S1-01: sin destino, sin huella, con la confirmación distinta o con --production contra la base local', async () => {
    const antes = await estado()
    const otra = 'ffffffff-2222-4333-8444-555555555555'
    const casos: Array<{ args: string[]; extra?: Record<string, string>; dice: RegExp }> = [
      { args: conOrg(), dice: /Indica el destino/ },
      { args: conOrg('--local', '--apply'), dice: /vista previa anterior/ },
      {
        args: ['--local', '--organization', org, '--confirm-organization', otra],
        dice: /no coincide con --organization/,
      },
      { args: conOrg('--local', '--aply'), dice: /No reconozco «--aply»/ },
      {
        // El entorno apunta a 127.0.0.1: --production no sale de ahí.
        args: conOrg('--production', '--project-ref', 'proyectoficticioabcd'),
        dice: /no es un proyecto remoto de Supabase/,
      },
      {
        args: conOrg('--production', '--project-ref', 'proyectoficticioabcd'),
        extra: { SUPABASE_TARGET: 'local' },
        dice: /el destino resuelto es la base local/,
      },
    ]
    for (const caso of casos) {
      const corrida = cargador(caso.args, caso.extra)
      expect(corrida.code, corrida.salida).toBe(1)
      expect(corrida.salida).toMatch(caso.dice)
      expect(corrida.salida).not.toMatch(/Huella de la vista previa/)
    }
    expect(await estado()).toEqual(antes)
  }, 120_000)

  it('S1-02: una organización que no existe en el destino se rechaza antes de la vista previa', async () => {
    const antes = await estado()
    const inexistente = 'ffffffff-2222-4333-8444-555555555555'
    const corrida = cargador([
      '--local',
      '--organization',
      inexistente,
      '--confirm-organization',
      inexistente,
    ])
    expect(corrida.code, corrida.salida).toBe(1)
    expect(corrida.salida).toMatch(/Esa organización no existe en el destino/)
    expect(await estado()).toEqual(antes)
  }, 120_000)
})

describe('S2 a S6 — vista previa, huella, aplicación, repetición y discrepancia', () => {
  let h1 = ''

  it('S2: la vista previa informa lo que haría, imprime su huella y NO escribe nada', async () => {
    const antes = await estado()
    const corrida = cargador(conOrg('--local'))
    expect(corrida.code, corrida.salida).toBe(0)
    expect(corrida.salida).toMatch(/VISTA PREVIA \(no escribe nada\)/)
    expect(corrida.salida).toMatch(
      /se reconocería\s+3427 \/ 7702\s+bogota 2026-09-03\s+Premio diario\s+\$500\.000/,
    )
    expect(corrida.salida).toMatch(
      /se reconocería\s+9019 \/ 3294\s+cundinamarca 2026-09-14\s+Premio diario\s+\$500\.000/,
    )
    expect(corrida.salida).toMatch(/Se reconocerían: 2 · Ya estaban: 0 · Rechazadas: 0/)
    expect(corrida.salida).toMatch(/Dinero de estas entradas: \$1\.000\.000/)
    h1 = huella(corrida)
    expect(await estado()).toEqual(antes)

    // Otra vista previa del mismo estado da la MISMA huella.
    expect(huella(cargador(conOrg('--local')))).toBe(h1)
    expect(await estado()).toEqual(antes)
  }, 120_000)

  let antesDeCargar: Sonda

  it('S2b: la sonda de la puerta ve las dos coincidencias, el premio del título y los totales esperados, sin escribir ni un dato de cliente', async () => {
    const antes = await estado()
    const s = sonda('e4-ensayo-antes')
    antesDeCargar = s

    const mias = s.coincidencias_confirmadas.filter((c) => c.raffle_id === rifa)
    expect(mias).toHaveLength(2)
    for (const [i, c] of mias.entries()) {
      const e = CONFIRMED_PRIZE_AWARDS[i]!
      expect(c).toMatchObject({
        pos: i + 1,
        loteria: e.lottery_code,
        fecha: e.reference_date,
        diario: e.daily_number,
        semanal: e.weekly_number,
        hay_coincidencia: true,
        campo: 'daily_number',
        numero_fotografiado: e.daily_number,
        asignacion: 'sold',
        asignada_antes_del_sorteo: true,
        modo: 'legacy',
        estado_resultado: 'confirmed',
        con_numero_en_conflicto: false,
        enlaces_del_motor: 0,
        reconocidos_vigentes: 0,
        boleta_hoy: 'assigned',
        boleta_con_cliente_hoy: true,
        mismo_cliente_que_la_foto: true,
        numero_igual_a_la_boleta: true,
        modo_rifa: 'configurable',
      })
    }
    expect(
      s.premio_por_titulo.filter((p) => p.raffle_id === rifa).map((p) => p.vigentes_con_ese_titulo),
    ).toEqual([1, 1])

    const delDueno = s.coincidencias_vendidas_del_sistema_de_siempre.filter(
      (c) => c.confirmada_por_el_dueno,
    )
    expect(delDueno).toHaveLength(2)
    expect(delDueno.every((c) => c.ya_reconocida === false)).toBe(true)

    // Los totales esperados: dos premios y $1.000.000 más; los clientes, recalculados.
    const t = s.historial_actual.totales
    const x = s.totales_esperados_tras_la_carga
    expect(s.historial_actual.fuente).toMatch(/prize_award_rows/)
    expect(x).toMatchObject({ entradas_por_reconocer: 2, dinero_por_reconocer: '1000000' })
    expect(x.premios).toBe(Number(t.premios) + 2)
    expect(BigInt(x.dinero_conocido as string)).toBe(
      BigInt(t.dinero_conocido as string) + 1_000_000n,
    )
    expect(x.con_valor_pendiente).toBe(t.con_valor_pendiente)

    // Ni una escritura, y ni un identificador de cliente en el informe.
    expect(await estado()).toEqual(antes)
    const texto = JSON.stringify(s)
    const { rows: clientes } = await db.query<{ id: string }>(
      `select distinct client_id::text as id from tickets where raffle_id = $1`,
      [rifa],
    )
    expect(clientes).toHaveLength(2)
    for (const c of clientes) expect(texto).not.toContain(c.id)
    expect(texto).not.toMatch(/"(client_id|seller_id|phone|email|telefono|correo)"\s*:/)
  }, 120_000)

  it('S3: aplicar con una huella que no es la de esta vista previa no escribe nada', async () => {
    const antes = await estado()
    const corrida = cargador(conOrg('--local', '--apply', '--preview-hash', '0'.repeat(64)))
    expect(corrida.code, corrida.salida).toBe(1)
    expect(corrida.salida).toMatch(/La vista previa cambió desde la que revisaste/)
    expect(corrida.salida).not.toMatch(/reconocido\s/)
    expect(await estado()).toEqual(antes)
  }, 120_000)

  it('S4: aplicar con la huella revisada reconoce los dos, una fila de bitácora, y concilia $1.000.000', async () => {
    const antes = await estado()
    const corrida = cargador(conOrg('--local', '--apply', '--preview-hash', h1))
    expect(corrida.code, corrida.salida).toBe(0)
    expect(corrida.salida).toMatch(/reconocido\s+3427 \/ 7702\s+bogota 2026-09-03/)
    expect(corrida.salida).toMatch(/reconocido\s+9019 \/ 3294\s+cundinamarca 2026-09-14/)
    expect(corrida.salida).toMatch(/Reconocidos ahora: 2 · Ya estaban: 0 · Rechazadas: 0/)
    expect(corrida.salida).toMatch(
      /Conciliación: 2 de 2 entradas almacenadas con su importe · \$1\.000\.000/,
    )

    const despues = await estado()
    expect(despues).toMatchObject({ reconocimientos: '2', vigentes: '2', dinero: '1000000' })
    expect(Number(despues.bitacora) - Number(antes.bitacora)).toBe(1)
    // Lo demás, intacto: ni fotografías, ni boletas, ni premios, ni enlaces, ni avisos.
    for (const k of ['h_fotografias', 'h_boletas', 'h_premios', 'h_enlaces', 'h_avisos']) {
      expect(despues[k], k).toBe(antes[k])
    }

    const { rows } = await db.query(
      `select d.declared_title, d.amount::int as amount, d.in_kind_description, d.basis,
              d.recorded_by, d.voided_at, d.prize_id is not null as con_premio
         from declared_prize_awards d where d.raffle_id = $1 order by d.amount, d.id`,
      [rifa],
    )
    expect(rows).toEqual([
      {
        declared_title: 'Premio diario',
        amount: 500_000,
        in_kind_description: null,
        basis: CONFIRMED_AWARDS_BASIS,
        recorded_by: null,
        voided_at: null,
        con_premio: true,
      },
      {
        declared_title: 'Premio diario',
        amount: 500_000,
        in_kind_description: null,
        basis: CONFIRMED_AWARDS_BASIS,
        recorded_by: null,
        voided_at: null,
        con_premio: true,
      },
    ])
    const { rows: bitacora } = await db.query(
      `select action, actor_profile_id, new_values ->> 'entradas' as entradas
         from audit_logs where organization_id = $1 and entity_type = 'declared_prize_award'`,
      [org],
    )
    expect(bitacora).toEqual([
      { action: 'prize_award.record', actor_profile_id: null, entradas: '2' },
    ])
  }, 120_000)

  it('S4b: después, la definición única lee los dos reconocidos y los totales son los que la sonda esperaba', async () => {
    const s = sonda('e4-ensayo-despues')
    expect(
      s.coincidencias_confirmadas
        .filter((c) => c.raffle_id === rifa)
        .map((c) => c.reconocidos_vigentes),
    ).toEqual([1, 1])
    const x = antesDeCargar.totales_esperados_tras_la_carga
    expect(s.historial_actual.totales).toEqual({
      premios: x.premios,
      clientes: x.clientes,
      dinero_conocido: x.dinero_conocido,
      con_valor_pendiente: x.con_valor_pendiente,
    })
    expect(s.totales_esperados_tras_la_carga).toMatchObject({
      entradas_por_reconocer: 0,
      dinero_por_reconocer: '0',
    })
    const declaradas = s.historial_actual.filas.filter(
      (f) =>
        f.origen === 'declared' &&
        CONFIRMED_PRIZE_AWARDS.some(
          (e) => e.lottery_code === f.loteria && e.reference_date === f.reference_date,
        ),
    )
    expect(declaradas.map((f) => [f.daily_number, f.prize_title, f.known_amount])).toEqual([
      ['3427', 'Premio diario', '500000'],
      ['9019', 'Premio diario', '500000'],
    ])
  }, 120_000)

  it('S5: repetirlo —vista previa o aplicar con la huella de antes— no duplica ni escribe bitácora de más', async () => {
    const antes = await estado()

    const previa = cargador(conOrg('--local'))
    expect(previa.code, previa.salida).toBe(0)
    expect(previa.salida).toMatch(/ya estaba\s+3427 \/ 7702/)
    expect(previa.salida).toMatch(/ya estaba\s+9019 \/ 3294/)
    expect(previa.salida).toMatch(/Se reconocerían: 0 · Ya estaban: 2 · Rechazadas: 0/)
    expect(previa.salida).toMatch(/Nada que escribir: las 2 entradas ya estaban reconocidas/)
    expect(previa.salida).not.toMatch(/Huella de la vista previa/)

    // Quien no supo si su aplicación llegó y la repite: nada que escribir, sin error.
    const repetida = cargador(conOrg('--local', '--apply', '--preview-hash', h1))
    expect(repetida.code, repetida.salida).toBe(0)
    expect(repetida.salida).toMatch(/Nada que escribir/)
    expect(repetida.salida).not.toMatch(/Reconocidos ahora/)

    expect(await estado()).toEqual(antes)
  }, 120_000)

  it('S6: con otro importe vigente, la vista previa lo rechaza nombrando las dos cifras y nada cambia', async () => {
    // Se anula el de Bogotá y otra ejecución lo reconoce por $400.000.
    await db.query(
      `update declared_prize_awards d set voided_at = now(), voided_by = $2,
              void_reason = 'Ensayo de la Etapa 4: importe distinto'
         from lottery_ticket_matches m join tickets t on t.id = m.ticket_id
        where m.id = d.match_id and d.raffle_id = $1 and t.daily_number = '3427'`,
      [rifa, ctx.ids.owner],
    )
    await otraEjecucion([0], 400_000)

    const antes = await estado()
    expect(antes).toMatchObject({ reconocimientos: '3', vigentes: '2', dinero: '900000' })

    const previa = cargador(conOrg('--local'))
    expect(previa.code, previa.salida).toBe(1)
    expect(previa.salida).toMatch(/rechazado\s+3427 \/ 7702/)
    expect(previa.salida).toMatch(
      // El separador de miles lo pone la configuración regional de PostgreSQL
      // (`to_char` con `G`): en la pila local sale «$400,000».
      /Ese premio ya está reconocido con \$400[.,]000 y la petición trae \$500[.,]000/,
    )
    expect(previa.salida).toMatch(/Esta vista previa no se puede aplicar/)
    expect(previa.salida).not.toMatch(/Huella de la vista previa/)

    const aplicar = cargador(conOrg('--local', '--apply', '--preview-hash', h1))
    expect(aplicar.code, aplicar.salida).toBe(1)
    expect(aplicar.salida).toMatch(/Esta vista previa no se puede aplicar/)

    expect(await estado()).toEqual(antes)
  }, 120_000)
})

describe('S7 — si otra ejecución se adelanta entre la vista previa y aplicar', () => {
  it('S7: la huella cambia, no se escribe nada, y la vista previa nueva distingue «ya estaba» de lo que falta', async () => {
    await sinReconocimientos()
    const vacio = await estado()
    expect(vacio).toMatchObject({ reconocimientos: '0', vigentes: '0' })

    const primera = cargador(conOrg('--local'))
    expect(primera.code, primera.salida).toBe(0)
    const ha = huella(primera)

    // Otra ejecución reconoce el de Cundinamarca por su cuenta.
    await otraEjecucion([1])
    const conUno = await estado()
    expect(conUno).toMatchObject({ reconocimientos: '1', vigentes: '1', dinero: '500000' })

    const rechazada = cargador(conOrg('--local', '--apply', '--preview-hash', ha))
    expect(rechazada.code, rechazada.salida).toBe(1)
    expect(rechazada.salida).toMatch(/La vista previa cambió desde la que revisaste/)
    expect(await estado()).toEqual(conUno)

    const segunda = cargador(conOrg('--local'))
    expect(segunda.code, segunda.salida).toBe(0)
    expect(segunda.salida).toMatch(/se reconocería\s+3427 \/ 7702/)
    expect(segunda.salida).toMatch(/ya estaba\s+9019 \/ 3294/)
    const hb = huella(segunda)
    expect(hb).not.toBe(ha)

    const aplicada = cargador(conOrg('--local', '--apply', '--preview-hash', hb))
    expect(aplicada.code, aplicada.salida).toBe(0)
    expect(aplicada.salida).toMatch(/reconocido\s+3427 \/ 7702/)
    expect(aplicada.salida).toMatch(/ya estaba\s+9019 \/ 3294/)
    expect(aplicada.salida).toMatch(/Reconocidos ahora: 1 · Ya estaban: 1 · Rechazadas: 0/)
    expect(aplicada.salida).toMatch(
      /Conciliación: 2 de 2 entradas almacenadas con su importe · \$1\.000\.000/,
    )
    expect(await estado()).toMatchObject({ reconocimientos: '2', vigentes: '2', dinero: '1000000' })
  }, 180_000)
})

describe('S8 — la comparación por fila de la puerta (Opción A)', () => {
  it('S8: la carga autorizada y una venta con su abono son CONTINUAR; sin autorizar la carga, o con algo prohibido, DETENER', async () => {
    await sinReconocimientos()
    const fotos: string[] = []
    try {
      // Una boleta disponible del vendedor 1 en la rifa del ensayo, para la venta normal.
      const { rows: nueva } = await db.query<{ id: string }>(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                              weekly_number, inventory_status)
         values ($1, $2, $3, $4, '4242', '2424', 'available') returning id`,
        [org, rifa, ctx.ids.seller1, ctx.ids.owner],
      )
      const boleta = nueva[0]!.id
      const a = foto('e4-ensayo-a')
      fotos.push(a)

      // LA OPERACIÓN AUTORIZADA, por el flujo de verdad.
      const previa = cargador(conOrg('--local'))
      expect(previa.code, previa.salida).toBe(0)
      const aplicada = cargador(conOrg('--local', '--apply', '--preview-hash', huella(previa)))
      expect(aplicada.code, aplicada.salida).toBe(0)

      // ACTIVIDAD NORMAL, con la sesión real del vendedor y las mismas RPC de la aplicación:
      // crea un cliente, le vende la boleta y registra su abono completo.
      const vendedor = await signInAs(USERS.seller1)
      const telefono = `300${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
      const { data: cliente, error: e1 } = await vendedor
        .from('clients')
        .insert({
          organization_id: org,
          seller_id: ctx.ids.seller1,
          name: `${PREFIJO} cliente ${stamp}`,
          phone: telefono,
        })
        .select('id')
        .single()
      if (e1) throw new Error(e1.message)
      const { rows: hoy } = await db.query<{ d: string }>(
        `select (now() at time zone 'America/Bogota')::date::text as d`,
      )
      const { error: e2 } = await vendedor.rpc('bulk_assign_tickets', {
        p_ticket_ids: [boleta],
        p_client_id: cliente.id,
        p_sale_date: hoy[0]!.d,
        p_sale_price: 120_000,
      })
      if (e2) throw new Error(e2.message)
      const { error: e3 } = await vendedor.rpc('create_payment', {
        p_client_id: cliente.id,
        p_total_amount: 120_000,
        p_allocations: [{ ticket_id: boleta, amount: 120_000 }],
        p_payment_date: hoy[0]!.d,
        p_payment_method: 'cash',
      })
      if (e3) throw new Error(e3.message)
      const b = foto('e4-ensayo-b')
      fotos.push(b)

      const permitido = comparar(a, b, ['--operation', 'awards', '--organization', org])
      expect(permitido.informe.motivos_para_detener, permitido.salida).toEqual([])
      expect(permitido.informe.veredicto).toBe('CONTINUAR')
      expect(permitido.code).toBe(0)
      const tipos = permitido.informe.operaciones.map((o) => o.tipo)
      expect(tipos).toContain('puerta 2: premios reconocidos')
      expect(tipos).toContain('venta de boleta')
      expect(tipos).toContain('pago registrado')
      expect(
        permitido.informe.operaciones.find((o) => o.tipo === 'puerta 2: premios reconocidos'),
      ).toMatchObject({ reconocidos: 2 })
      expect(permitido.informe.filas_tocadas.declared_prize_awards).toEqual({
        nuevas: 2,
        modificadas: 0,
        borradas: 0,
      })

      // La MISMA diferencia, en una puerta que no reconoce premios, se detiene.
      const sinAutorizar = comparar(a, b, ['--operation', 'none'])
      expect(sinAutorizar.code).toBe(2)
      expect(sinAutorizar.informe.motivos_para_detener.join('\n')).toMatch(
        /declared_prize_awards cambió y esta puerta no reconoce premios/,
      )

      // LO PROHIBIDO: renombrar la rifa y marcar un aviso como leído.
      await db.query(`update raffles set name = name || ' (renombrada)' where id = $1`, [rifa])
      await db.query(
        `update notifications set read_at = now()
          where id = (select id from notifications where organization_id = $1 and read_at is null
                       order by created_at, id limit 1)`,
        [org],
      )
      const c = foto('e4-ensayo-c')
      fotos.push(c)
      const prohibido = comparar(b, c, ['--operation', 'none'])
      expect(prohibido.code).toBe(2)
      const motivos = prohibido.informe.motivos_para_detener.join('\n')
      expect(motivos).toMatch(/raffles: 0 nueva\(s\) y 1 modificada\(s\)/)
      expect(motivos).toMatch(/marcado como leído: fuera de la lista de la Opción A/)
      await db.query(`update raffles set name = replace(name, ' (renombrada)', '') where id = $1`, [
        rifa,
      ])

      // Ningún informe lleva el identificador de un cliente.
      const { rows: clientes } = await db.query<{ id: string }>(
        `select id::text from clients where name like $1`,
        [`${PREFIJO}%`],
      )
      for (const informe of [permitido.salida, sinAutorizar.salida, prohibido.salida]) {
        for (const c2 of clientes) expect(informe).not.toContain(c2.id)
      }
    } finally {
      for (const f of fotos) rmSync(f, { force: true })
    }
  }, 300_000)
})
