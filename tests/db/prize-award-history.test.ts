/**
 * El historial de premios ganados — Etapa 1 (D-208, migración `0067`).
 *
 * LO QUE SE PRUEBA AQUÍ ES LO QUE SOLO LA BASE PUEDE GARANTIZAR: qué entra en el
 * historial y qué no, cómo se suma el dinero cuando parte del valor está
 * pendiente, que un reintento del cargador no duplique, que cambiar la
 * configuración de hoy no mueva un importe histórico, que un conflicto posterior
 * conserve la historia, y que nadie lea lo que no debe: ni el vendedor de al
 * lado, ni otra organización, ni el personal los datos del cliente.
 *
 * DOS RIFAS, PORQUE LOS DOS ORÍGENES VIVEN EN LADOS DISTINTOS DE LA FRONTERA
 * (D-206). `R_MOTOR` nace configurable, así que sus sorteos usan los premios y
 * el motor escribe enlaces. `R_HISTORICA` es una rifa que ya existía y pasó a
 * configurable con un instante efectivo POSTERIOR a sus sorteos, así que esos
 * sorteos conservan el sistema de siempre y el motor no puede premiarlos nunca:
 * son exactamente los dos casos reales de producción, y los únicos donde cabe un
 * premio reconocido por el negocio.
 *
 * DATOS AISLADOS. `R_MOTOR` juega en 2087, donde ninguna otra suite escribe.
 * `R_HISTORICA` necesita sorteos YA JUGADOS —solo un corte pasado queda del lado
 * del sistema de siempre— y un premio que juegue en el futuro, porque la
 * transición no admite un calendario con sorteos cuyo corte ya pasó. Así que su
 * ventana son tres semanas alrededor de HOY, con sus 18 fechas programadas: las
 * fechas se calculan en cada corrida y no se escriben, que es la lección de
 * I-128. La limpieza es por prefijo y corre al empezar y al terminar, porque la
 * programación es nacional y única por lotería y fecha.
 *
 * POR QUÉ NO REUTILIZA EL KIT DE `raffle-prize-matching.test.ts`: el de allí está
 * acoplado al estado de módulo de esa suite (su `db`, su `ctx`, su secuencia de
 * semanas). Extraerlo sería refactorizar una suite de mil líneas que pasa, fuera
 * del alcance de esta etapa (§36.3). Aquí hace falta mucho menos, y las
 * sentencias son las mismas.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  HISTORY_FUNCTION_GRANTS,
  HISTORY_INTERNAL_FUNCTIONS,
  HISTORY_SESSION_RPCS,
} from '../../scripts/prize-function-grants'

import {
  anonClient,
  DB_URL,
  loadSeedContext,
  runLotteryEngine,
  serviceClient,
  signInAs,
  USERS,
  type Client,
} from './helpers'

type Loteria = 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'

const PREFIJO = 'E1 historial'
const PRECIO = 120_000
const stamp = Date.now().toString(36)
const RESPALDO =
  'Confirmación del Dueño en el encargo del historial de premios ganados (2026-09-17), prueba.'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient
let svc: Client
let owner: Client
let seller1: Client
let seller2: Client
let otherOrgOwner: Client
let secuencia = 0

// Escenario del motor (rifa nacida configurable, sorteos de 2087).
let rMotor = ''
let premioDiario = { prizeId: '', versionId: '' }
// El premio de alternativas solo hace falta para que el motor lo aplique: su
// identificador no se usa despues.

// Escenario histórico: rifa transformada, con sorteos YA JUGADOS —su corte es
// anterior al instante efectivo, así que conservan el sistema de siempre—.
let rHistorica = ''
let premioHistorico = { prizeId: '', versionId: '' }
let sorteoUno = { resultId: '', drawNumber: '' }
let sorteoDos = { resultId: '', drawNumber: '' }
let sorteoTres = { resultId: '', drawNumber: '' }
let fechaUno = ''
let fechaDos = ''
let fechaTres = ''
let boletasCreadas = ''
type Regla = {
  start_date: string
  end_date: string
  weekdays: number[]
  lottery_mode: 'corresponding' | 'fixed'
  lottery_code: Loteria | null
}
let reglasHistorico: Regla[] = []

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

async function nuevaRifa(
  nombre: string,
  desde: string,
  hasta: string,
  modo: 'legacy' | 'configurable',
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into raffles (organization_id, name, ticket_price, start_date, end_date,
                          created_by, prize_mode, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      ctx.demoOrg.id,
      `${PREFIJO} ${nombre} ${stamp}`,
      PRECIO,
      desde,
      hasta,
      ctx.ids.owner,
      modo,
      // Una rifa configurable nace en BORRADOR y se activa cuando sus premios
      // están listos (BR-J16); una heredada no tiene esa condición.
      modo === 'configurable' ? 'draft' : 'active',
    ],
  )
  return rows[0]!.id
}

/** Activa una rifa configurable cuando sus premios ya existen (BR-J16). */
async function activar(raffleId: string): Promise<void> {
  await db.query(`update raffles set status = 'active' where id = $1`, [raffleId])
}

/**
 * Una rifa que YA EXISTÍA y pasa a configurable, por el MISMO camino que la
 * transición de verdad: `raffle_prize_transition_apply`, la pieza interna que
 * usa `transition_raffle_prize_mode`. Así la fila de transición, su instante
 * efectivo, los premios, el modo, el aviso y la bitácora quedan como en
 * producción, y no se inventa ninguna forma nueva.
 *
 * Su INSTANTE EFECTIVO es el de la última versión, o sea AHORA. Por eso los
 * sorteos de esta rifa están en el pasado: su corte es anterior al instante, así
 * que conservan el sistema de siempre para siempre (D-206) y el motor no puede
 * premiarlos nunca. Es la situación exacta de los dos casos reales.
 */
async function transformar(
  raffleId: string,
  nombre: string,
  desde: string,
  hasta: string,
  premios: Array<Record<string, unknown>>,
): Promise<void> {
  await db.query(
    `select raffle_prize_transition_apply($1, $2, $3, 'active', $4, $5, $6::jsonb)`,
    [ctx.demoOrg.id, raffleId, nombre, desde, hasta, JSON.stringify(premios)],
  )
}

type Opcion = { description: string | null; amount: number | null }

async function premio(
  raffleId: string,
  titulo: string,
  reglas: Array<{ start_date: string; end_date: string; weekdays: number[] }>,
  opciones: { modo?: 'fixed' | 'winner_choice'; recompensa?: Opcion[]; cifras?: 'four' | 'last_three' } = {},
): Promise<{ prizeId: string; versionId: string }> {
  const { data, error } = await owner.rpc('create_raffle_prize', {
    p_raffle_id: raffleId,
    p_title: titulo,
    p_category: 'daily',
    p_reward_mode: opciones.modo ?? 'fixed',
    p_reward_options: opciones.recompensa ?? [{ description: null, amount: 500_000 }],
    p_number_field: 'daily_number',
    p_digits: opciones.cifras ?? 'four',
    p_rules: reglas.map((r) => ({ ...r, lottery_mode: 'corresponding', lottery_code: null })),
  })
  if (error) throw new Error(`No se pudo crear «${titulo}»: ${error.message}`)
  const fila = (data as unknown as Array<{ prize_id: string; version_id: string }>)[0]!
  return { prizeId: fila.prize_id, versionId: fila.version_id }
}

type BoletaInput = {
  diario: string
  semanal: string
  cliente?: string
  vendedor?: 'seller1' | 'seller2'
  vendidaEn?: string
  creadaEn?: string
}

async function boletas(raffleId: string, filas: BoletaInput[], creada: string): Promise<string[]> {
  const ids: string[] = []
  for (const fila of filas) {
    const { rows } = await db.query<{ id: string }>(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by,
                            daily_number, weekly_number, inventory_status, created_at)
       values ($1, $2, $3, $4, $5, $6, 'available', $7)
       returning id`,
      [
        ctx.demoOrg.id,
        raffleId,
        fila.vendedor === 'seller2' ? ctx.ids.seller2 : ctx.ids.seller1,
        ctx.ids.owner,
        fila.diario,
        fila.semanal,
        fila.creadaEn ?? creada,
      ],
    )
    const id = rows[0]!.id
    if (fila.cliente) {
      await db.query(
        `update tickets
            set client_id = $2, inventory_status = 'assigned', sale_price = $3,
                sale_date = $5::date, assigned_at = $4
          where id = $1`,
        [
          id,
          fila.cliente,
          PRECIO,
          fila.vendidaEn ?? creada,
          (fila.vendidaEn ?? creada).slice(0, 10),
        ],
      )
    }
    ids.push(id)
  }
  return ids
}

/** Solo la programación oficial, con sus dos horas conocidas. */
async function programacion(loteria: Loteria, fecha: string): Promise<string> {
  secuencia += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                         original_scheduled_at, official_scheduled_at, schedule_status)
     values ($1, $2, $3, $4, $4, 'scheduled')
     returning id`,
    [loteria, `E1H-${stamp}-${secuencia}`, fecha, `${fecha}T22:30:00-05:00`],
  )
  return rows[0]!.id
}

async function sorteo(
  loteria: Loteria,
  fecha: string,
  ganador: string,
): Promise<{ resultId: string; drawNumber: string }> {
  const scheduleId = await programacion(loteria, fecha)
  const { rows } = await db.query<{ id: string }>(
    `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
     values ($1, $2, 'confirmed', 'official_page', now())
     returning id`,
    [scheduleId, ganador],
  )
  return { resultId: rows[0]!.id, drawNumber: `E1H-${stamp}-${secuencia}` }
}

/**
 * Borra TODO lo de esta suite, de esta corrida y de cualquiera anterior que se
 * cayera a medias: la programación es nacional y única por lotería y fecha, así
 * que un resto de una corrida abortada bloquea la siguiente. Por eso se limpia
 * al empezar y al terminar, y por PREFIJO, no por marca de tiempo.
 *
 * Fotografías, enlaces y reconocimientos son inmutables también para la service
 * role, así que hace falta desactivar los disparadores.
 */
async function limpiar(): Promise<void> {
  const rifas = `${PREFIJO}%`
  await db.query(`set session_replication_role = replica`)
  await db.query(
    `delete from declared_prize_awards where raffle_id in
       (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(
    `delete from lottery_ticket_match_prizes where raffle_id in
       (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(
    `delete from lottery_ticket_matches where raffle_id in
       (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(`delete from lottery_results where schedule_id in
                    (select id from lottery_draw_schedules where draw_number like 'E1H-%')`)
  await db.query(`delete from lottery_draw_schedules where draw_number like 'E1H-%'`)
  await db.query(`delete from audit_logs where entity_type = 'declared_prize_award'`)
  await db.query(`delete from tickets where raffle_id in
                    (select id from raffles where name like $1)`, [rifas])
  await db.query(`delete from raffle_prize_schedule_rules where version_id in
                    (select v.id from raffle_prize_versions v join raffles r on r.id = v.raffle_id
                      where r.name like $1)`, [rifas])
  await db.query(`delete from raffle_prize_reward_options where version_id in
                    (select v.id from raffle_prize_versions v join raffles r on r.id = v.raffle_id
                      where r.name like $1)`, [rifas])
  // Los premios ANTES que sus versiones: se apuntan entre sí con dos FK, y en
  // `replica` las dos están desactivadas.
  await db.query(`delete from raffle_prizes where raffle_id in
                    (select id from raffles where name like $1)`, [rifas])
  await db.query(`delete from raffle_prize_versions where raffle_id in
                    (select id from raffles where name like $1)`, [rifas])
  await db.query(`delete from raffle_prize_transitions where raffle_id in
                    (select id from raffles where name like $1)`, [rifas])
  await db.query(`delete from notifications where entity_type = 'raffle_prize'
                    and entity_id in (select id from raffles where name like $1)`, [rifas])
  await db.query(`delete from raffles where name like $1`, [rifas])
  await db.query(`set session_replication_role = origin`)
}

/** El día de la semana de `lunes` en que juega una lotería (BR-L01). */
const NOMINAL: Record<Loteria, number> = {
  cundinamarca: 0,
  cruz_roja: 1,
  meta: 2,
  bogota: 3,
  medellin: 4,
  boyaca: 5,
}

function masDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + dias, 12)).toISOString().slice(0, 10)
}

async function motor(resultId: string): Promise<{ inserted: number; prize_links: number }> {
  const { data, error } = await runLotteryEngine(resultId)
  if (error) throw new Error(`El motor falló: ${error.message}`)
  return data as unknown as { inserted: number; prize_links: number }
}

type Entrada = {
  daily_number: string
  weekly_number: string
  lottery_code: Loteria
  reference_date: string
  prize_title: string
  amount?: number
  in_kind_description?: string
}

async function reconocer(entradas: Entrada[], apply = true) {
  return svc.rpc('record_declared_prize_awards', {
    p_organization_id: ctx.demoOrg.id,
    p_basis: RESPALDO,
    p_awards: entradas as unknown as never,
    p_apply: apply,
  })
}

/** Los totales del vendedor 1, acotados a una rifa para no mezclar escenarios. */
async function totalesVendedor(raffleId: string) {
  const { data, error } = await seller1.rpc('seller_prize_award_totals', { p_raffle_id: raffleId })
  if (error) throw new Error(error.message)
  return (data as unknown as Array<Record<string, number>>)[0]!
}

async function filasVendedor(raffleId: string, limite = 25) {
  const { data, error } = await seller1.rpc('seller_prize_awards', {
    p_raffle_id: raffleId,
    p_limit: limite,
  })
  if (error) throw new Error(error.message)
  return data as unknown as Array<Record<string, unknown>>
}

// -----------------------------------------------------------------------------
beforeAll(async () => {
  ctx = await loadSeedContext()
  svc = serviceClient()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  owner = await signInAs(USERS.owner)
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  otherOrgOwner = await signInAs(USERS.otherOrgOwner)


  // Restos de una corrida anterior que se cayera a medias.
  await limpiar()

  // --- Escenario del motor: rifa nacida configurable, sorteos de 2087 --------
  rMotor = await nuevaRifa('motor', '2087-01-01', '2087-12-31', 'configurable')
  premioDiario = await premio(rMotor, `Premio diario ${stamp}`, [
    { start_date: '2087-03-03', end_date: '2087-03-28', weekdays: [1, 2, 3, 4, 5] },
  ])
  await premio(
    rMotor,
    `Premio con alternativas ${stamp}`,
    [{ start_date: '2087-04-07', end_date: '2087-04-30', weekdays: [1, 2, 3, 4, 5] }],
    {
      modo: 'winner_choice',
      recompensa: [
        { description: 'Camioneta de prueba', amount: null },
        { description: null, amount: 120_000_000 },
      ],
    },
  )
  await activar(rMotor)

  // --- Escenario histórico: rifa transformada, sorteos de 2019 --------------
  // Nace HEREDADA y activa —como la rifa real—. Sus sorteos y sus resultados se
  // crean ANTES de la transición: así el calendario del premio tiene cortes
  // conocidos (BR-J09) y la ventana no tiene sorteos jugados sin confirmar.
  // LAS FECHAS SE CALCULAN, no se escriben: la transición exige que TODA fecha
  // de la ventana tenga su hora oficial conocida, y que el calendario del premio
  // no incluya un sorteo cuyo corte ya pasó (BR-J09, BR-J13). Así que la ventana
  // son tres semanas alrededor de hoy —una pasada, la actual y una próxima—, con
  // sus 18 fechas programadas; las coincidencias salen de la semana PASADA y el
  // premio juega en la PRÓXIMA. Es la forma exacta de la rifa real, y no depende
  // del calendario: se recalcula en cada corrida (la lección de I-128).
  const { rows: hoyFila } = await db.query<{ hoy: string; dow: number }>(
    `select (now() at time zone 'America/Bogota')::date::text as hoy,
            extract(isodow from (now() at time zone 'America/Bogota')::date)::int as dow`,
  )
  const lunesEsta = masDias(hoyFila[0]!.hoy, 1 - hoyFila[0]!.dow)
  const lunesPasado = masDias(lunesEsta, -14)
  const lunesProximo = masDias(lunesEsta, 7)

  // TODAS las semanas de la ventana, sin saltarse ninguna: un solo día sin hora
  // oficial detiene la transición.
  const lunesDeLaVentana: string[] = []
  for (let l = lunesPasado; l <= lunesProximo; l = masDias(l, 7)) lunesDeLaVentana.push(l)

  for (const lunes of lunesDeLaVentana) {
    for (const loteria of Object.keys(NOMINAL) as Loteria[]) {
      const fecha = masDias(lunes, NOMINAL[loteria])
      if (lunes === lunesPasado && loteria === 'bogota') {
        sorteoUno = await sorteo(loteria, fecha, '3427')
        fechaUno = fecha
      } else if (lunes === lunesPasado && loteria === 'cundinamarca') {
        sorteoDos = await sorteo(loteria, fecha, '9019')
        fechaDos = fecha
      } else if (lunes === lunesPasado && loteria === 'meta') {
        sorteoTres = await sorteo(loteria, fecha, '5151')
        fechaTres = fecha
      } else {
        await programacion(loteria, fecha)
      }
    }
  }

  const ventana = { desde: lunesPasado, hasta: masDias(lunesProximo, 5) }
  reglasHistorico = [
    {
      start_date: lunesProximo,
      end_date: masDias(lunesProximo, 4),
      weekdays: [1, 2, 3, 4, 5],
      lottery_mode: 'corresponding',
      lottery_code: null,
    },
  ]
  rHistorica = await nuevaRifa('historica', ventana.desde, ventana.hasta, 'legacy')
  const tituloHistorico = `Premio diario histórico ${stamp}`
  await transformar(
    rHistorica,
    `${PREFIJO} historica ${stamp}`,
    ventana.desde,
    ventana.hasta,
    [
      {
        title: tituloHistorico,
        category: 'daily',
        reward_mode: 'fixed',
        reward_options: [{ description: null, amount: 500_000 }],
        number_field: 'daily_number',
        digits: 'four',
        rules: reglasHistorico,
        conditions: null,
      },
    ],
  )
  boletasCreadas = masDias(lunesPasado, -30)
  const { rows: premioFila } = await db.query<{ prize_id: string; version_id: string }>(
    `select p.id as prize_id, p.current_version_id as version_id
       from raffle_prizes p where p.raffle_id = $1`,
    [rHistorica],
  )
  premioHistorico = { prizeId: premioFila[0]!.prize_id, versionId: premioFila[0]!.version_id }
})

afterAll(async () => {
  await limpiar()
  await db.end()
})

// =============================================================================
describe('H1 — qué entra en el historial', () => {
  it('H1-01: una boleta vendida a tiempo con su enlace al premio entra, con el importe de la versión', async () => {
    const [ticket] = await boletas(
      rMotor,
      [{ diario: '4101', semanal: '4102', cliente: ctx.clients.ana.id }],
      '2086-01-01T08:00:00-05:00',
    )
    const { resultId } = await sorteo('bogota', '2087-03-06', '4101')
    const resumen = await motor(resultId)
    expect(resumen.prize_links).toBe(1)

    const filas = await filasVendedor(rMotor)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      origin: 'engine',
      ticket_id: ticket,
      matched_number: '4101',
      daily_number: '4101',
      weekly_number: '4102',
      known_amount: 500_000,
      value_pending: false,
      result_conflict: false,
      numbers_changed: false,
    })

    // El pago NO condiciona el premio (BR-L09, respuesta H3 del dueño).
    const { rows } = await db.query<{ payment_status: string }>(
      'select payment_status from tickets where id = $1',
      [ticket],
    )
    expect(rows[0]!.payment_status).toBe('unpaid')
  })

  it('H1-02: una boleta libre y una asignada tarde NO entran, aunque el motor las fotografíe', async () => {
    await boletas(
      rMotor,
      [
        { diario: '4201', semanal: '4202' },
        {
          diario: '4201',
          semanal: '4203',
          cliente: ctx.clients.carlos.id,
          vendidaEn: '2087-03-25T08:00:00-05:00',
        },
      ],
      '2086-01-01T08:00:00-05:00',
    )
    const { resultId } = await sorteo('bogota', '2087-03-13', '4201')
    const resumen = await motor(resultId)
    // Las dos se fotografían —libre y tardía— y ninguna es un premio ganado.
    expect(resumen.inserted).toBe(2)

    const { rows } = await db.query<{ assignment_status: string }>(
      'select assignment_status from lottery_ticket_matches where result_id = $1 order by 1',
      [resultId],
    )
    expect(rows.map((r) => r.assignment_status)).toEqual(['available', 'late_assignment'])

    const filas = await filasVendedor(rMotor)
    expect(filas.filter((f) => f.matched_number === '4201')).toHaveLength(0)
  })

  it('H1-03: las alternativas no inventan importe y no multiplican filas', async () => {
    await boletas(
      rMotor,
      [{ diario: '4301', semanal: '4302', cliente: ctx.clients.beatriz.id }],
      '2086-01-01T08:00:00-05:00',
    )
    const { resultId } = await sorteo('bogota', '2087-04-10', '4301')
    await motor(resultId)

    const filas = (await filasVendedor(rMotor)).filter((f) => f.matched_number === '4301')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ known_amount: null, value_pending: true })
  })
})

// =============================================================================
describe('H2 — los dos premios reconocidos por el negocio', () => {
  const HISTORICAS: Entrada[] = []

  it('H2-01: la vista previa dice qué se reconocería y no escribe nada', async () => {
    await boletas(
      rHistorica,
      [
        { diario: '3427', semanal: '7702', cliente: ctx.clients.ana.id },
        { diario: '9019', semanal: '3294', cliente: ctx.clients.carlos.id },
      ],
      `${boletasCreadas}T08:00:00-05:00`,
    )
    // El motor fotografía las dos con la rama de SIEMPRE —su corte es anterior
    // al instante efectivo— y por eso no escribe ni un enlace a premio.
    expect((await motor(sorteoUno.resultId)).prize_links).toBe(0)
    expect((await motor(sorteoDos.resultId)).prize_links).toBe(0)
    const { rows: fotos } = await db.query<{ n: string }>(
      `select count(*)::text as n from lottery_ticket_matches where raffle_id = $1`,
      [rHistorica],
    )
    expect(fotos[0]!.n).toBe('2')

    HISTORICAS.push(
      {
        daily_number: '3427',
        weekly_number: '7702',
        lottery_code: 'bogota',
        reference_date: fechaUno,
        prize_title: `Premio diario histórico ${stamp}`,
        amount: 500_000,
      },
      {
        daily_number: '9019',
        weekly_number: '3294',
        lottery_code: 'cundinamarca',
        reference_date: fechaDos,
        prize_title: `Premio diario histórico ${stamp}`,
        amount: 500_000,
      },
    )

    const { data, error } = await reconocer(HISTORICAS, false)
    expect(error).toBeNull()
    const filas = data as unknown as Array<Record<string, unknown>>
    expect(filas).toHaveLength(2)
    expect(filas.map((f) => f.outcome)).toEqual(['se reconocería', 'se reconocería'])
    expect(filas.every((f) => f.problem === null)).toBe(true)
    expect(filas.map((f) => f.amount)).toEqual([500_000, 500_000])

    const { count } = await svc
      .from('declared_prize_awards')
      .select('id', { count: 'exact', head: true })
      .eq('raffle_id', rHistorica)
    expect(count).toBe(0)
  })

  it('H2-02: los dos premios de $500.000 suman $1.000.000, y son dos clientes', async () => {
    const { error } = await reconocer(HISTORICAS)
    expect(error).toBeNull()

    const totales = await totalesVendedor(rHistorica)
    expect(totales).toMatchObject({
      prizes_count: 2,
      clients_count: 2,
      known_amount: 1_000_000,
      value_pending_count: 0,
    })
  })

  it('H2-03: repetirlo no duplica registros ni importes', async () => {
    const { data, error } = await reconocer(HISTORICAS)
    expect(error).toBeNull()
    expect((data as unknown as Array<Record<string, unknown>>).map((f) => f.outcome)).toEqual([
      'ya estaba',
      'ya estaba',
    ])

    const totales = await totalesVendedor(rHistorica)
    expect(totales).toMatchObject({ prizes_count: 2, known_amount: 1_000_000 })

    const { count } = await svc
      .from('declared_prize_awards')
      .select('id', { count: 'exact', head: true })
      .eq('raffle_id', rHistorica)
    expect(count).toBe(2)
  })

  it('H2-04: el reconocimiento guarda el respaldo del negocio y deja el actor técnico en «Sistema»', async () => {
    const { rows } = await db.query<{ basis: string; recorded_by: string | null }>(
      'select basis, recorded_by from declared_prize_awards where raffle_id = $1',
      [rHistorica],
    )
    expect(rows).toHaveLength(2)
    for (const fila of rows) {
      expect(fila.basis).toBe(RESPALDO)
      // La carga la ejecutó un proceso, no la persona que confirmó el premio.
      expect(fila.recorded_by).toBeNull()
    }
  })

  it('H2-05: entera o nada — con una entrada mala no se reconoce ninguna', async () => {
    const malas: Entrada[] = [
      {
        daily_number: '3427',
        weekly_number: '7702',
        lottery_code: 'bogota',
        reference_date: fechaUno,
        prize_title: `Premio que no existe ${stamp}`,
        amount: 500_000,
      },
    ]
    const previa = await reconocer(malas, false)
    expect((previa.data as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      outcome: 'rechazado',
    })

    const aplicada = await reconocer(malas)
    expect(aplicada.error?.message).toMatch(/No se reconoció ningún premio/)
  })

  it('H2-06: un sorteo que ya premió el motor se rechaza, y la vista previa dice por qué', async () => {
    const yaPremiada: Entrada[] = [
      {
        daily_number: '4101',
        weekly_number: '4102',
        lottery_code: 'bogota',
        reference_date: '2087-03-06',
        prize_title: `Premio diario ${stamp}`,
        amount: 500_000,
      },
    ]
    const previa = await reconocer(yaPremiada, false)
    expect((previa.data as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      outcome: 'rechazado',
      problem: 'Esa coincidencia ya tiene ese premio registrado por el sistema.',
    })

    const aplicada = await reconocer(yaPremiada)
    expect(aplicada.error?.message).toMatch(/No se reconoció ningún premio/)
  })

  it('H2-06b: la defensa de la base lo impide aunque el cargador se equivoque', async () => {
    // El disparador no depende de que el cargador valide: aquí se inserta
    // directamente un reconocimiento de una fotografía del lado configurable.
    const { rows } = await db.query<{
      match_id: string
      result_id: string
      match_field: string
      raffle_id: string
    }>(
      `select m.id as match_id, m.result_id, m.match_field::text as match_field, m.raffle_id
         from lottery_ticket_matches m
        where m.raffle_id = $1 and m.matched_number = '4301' limit 1`,
      [rMotor],
    )
    await expect(
      db.query(
        `insert into declared_prize_awards (organization_id, raffle_id, result_id, match_id,
                                            match_field, prize_id, declared_title, amount, basis)
         values ($1, $2, $3, $4, $5::lottery_match_field, $6, 'Premio de prueba', 1, $7)`,
        [
          ctx.demoOrg.id,
          rows[0]!.raffle_id,
          rows[0]!.result_id,
          rows[0]!.match_id,
          rows[0]!.match_field,
          premioDiario.prizeId,
          RESPALDO,
        ],
      ),
    ).rejects.toThrow(/se resuelve con los premios configurables/)
  })

  it('H2-07: un reconocimiento no se modifica ni se borra', async () => {
    const { rows } = await db.query<{ id: string }>(
      'select id from declared_prize_awards where raffle_id = $1 limit 1',
      [rHistorica],
    )
    const id = rows[0]!.id
    await expect(
      db.query('update declared_prize_awards set amount = 1 where id = $1', [id]),
    ).rejects.toThrow(/no se modifica/)
    await expect(
      db.query('delete from declared_prize_awards where id = $1', [id]),
    ).rejects.toThrow(/no se borra/)
  })
})

// =============================================================================
describe('H3 — los dos orígenes se suman sin duplicarse', () => {
  it('H3-01: motor e histórico se agregan juntos cuando no se filtra por rifa', async () => {
    const { data, error } = await seller1.rpc('seller_prize_award_totals', {})
    expect(error).toBeNull()
    const totales = (data as unknown as Array<Record<string, number>>)[0]!

    const motorTotales = await totalesVendedor(rMotor)
    const historicoTotales = await totalesVendedor(rHistorica)

    expect(Number(totales.prizes_count)).toBeGreaterThanOrEqual(
      Number(motorTotales.prizes_count) + Number(historicoTotales.prizes_count),
    )
    expect(Number(totales.known_amount)).toBeGreaterThanOrEqual(
      Number(motorTotales.known_amount) + Number(historicoTotales.known_amount),
    )
  })

  it('H3-02: premios y clientes distintos se cuentan por separado', async () => {
    // Un tercer premio histórico del MISMO cliente que ya tiene uno.
    await boletas(
      rHistorica,
      [{ diario: '5151', semanal: '5152', cliente: ctx.clients.ana.id }],
      `${boletasCreadas}T08:00:00-05:00`,
    )
    await motor(sorteoTres.resultId)

    const { error } = await reconocer([
      {
        daily_number: '5151',
        weekly_number: '5152',
        lottery_code: 'meta',
        reference_date: fechaTres,
        prize_title: `Premio diario histórico ${stamp}`,
        amount: 500_000,
      },
    ])
    expect(error).toBeNull()

    const totales = await totalesVendedor(rHistorica)
    // Tres premios, dos clientes: quien gana dos veces sigue siendo un cliente.
    expect(totales).toMatchObject({
      prizes_count: 3,
      clients_count: 2,
      known_amount: 1_500_000,
    })
  })

  it('H3-03: los filtros y la paginación no recortan los totales', async () => {
    const pagina = await filasVendedor(rHistorica, 1)
    expect(pagina).toHaveLength(1)
    expect(Number(pagina[0]!.total_count)).toBe(3)

    const totales = await totalesVendedor(rHistorica)
    expect(Number(totales.prizes_count)).toBe(3)
    expect(Number(totales.known_amount)).toBe(1_500_000)
  })
})

// =============================================================================
describe('H4 — la historia no se reescribe', () => {
  it('H4-01: cambiar el importe del premio de hoy no mueve el importe histórico', async () => {
    const antes = await totalesVendedor(rMotor)

    const { error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premioDiario.prizeId,
      p_expected_version_id: premioDiario.versionId,
      p_title: `Premio diario ${stamp}`,
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: [{ description: null, amount: 9_000_000 }],
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [
        { start_date: '2087-03-03', end_date: '2087-03-28', weekdays: [1, 2, 3, 4, 5],
          lottery_mode: 'corresponding', lottery_code: null },
      ],
    })
    expect(error).toBeNull()

    const despues = await totalesVendedor(rMotor)
    expect(despues.known_amount).toBe(antes.known_amount)
    const fila = (await filasVendedor(rMotor)).find((f) => f.matched_number === '4101')!
    expect(fila.known_amount).toBe(500_000)
  })

  it('H4-02: renombrar el premio no cambia el título de un premio reconocido', async () => {
    const titulo = `Premio diario histórico ${stamp}`
    const { error } = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: premioHistorico.prizeId,
      p_expected_version_id: premioHistorico.versionId,
      p_title: `Otro nombre ${stamp}`,
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: [{ description: null, amount: 500_000 }],
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: reglasHistorico,
    })
    expect(error).toBeNull()

    const filas = await filasVendedor(rHistorica)
    expect(filas.every((f) => f.prize_title === titulo)).toBe(true)
  })

  it('H4-03: un resultado que entra en conflicto conserva el premio y queda señalado', async () => {
    const antes = await totalesVendedor(rMotor)

    await db.query(
      `update lottery_results set winning_number = '9999'
        where id = (select m.result_id from lottery_ticket_matches m
                     join tickets t on t.id = m.ticket_id
                    where t.raffle_id = $1 and m.matched_number = '4101' limit 1)`,
      [rMotor],
    )

    const { rows } = await db.query<{ validation_status: string; winning_number: string }>(
      `select r.validation_status, r.winning_number from lottery_results r
         join lottery_ticket_matches m on m.result_id = r.id
         join tickets t on t.id = m.ticket_id
        where t.raffle_id = $1 and m.matched_number = '4101' limit 1`,
      [rMotor],
    )
    // BR-L08: el numero confirmado se conserva y la fila pasa a conflicto.
    expect(rows[0]).toMatchObject({ validation_status: 'conflict', winning_number: '4101' })

    const despues = await totalesVendedor(rMotor)
    expect(despues).toEqual(antes)

    const fila = (await filasVendedor(rMotor)).find((f) => f.matched_number === '4101')!
    expect(fila.result_conflict).toBe(true)
  })

  it('H4-04: anular un reconocimiento lo saca del historial sin borrarlo', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from declared_prize_awards where raffle_id = $1 order by recorded_at limit 1`,
      [rHistorica],
    )
    const id = rows[0]!.id
    const antes = await totalesVendedor(rHistorica)

    await db.query(
      `update declared_prize_awards
          set voided_at = now(), void_reason = 'Prueba de anulación'
        where id = $1`,
      [id],
    )

    const despues = await totalesVendedor(rHistorica)
    expect(Number(despues.prizes_count)).toBe(Number(antes.prizes_count) - 1)
    expect(Number(despues.known_amount)).toBe(Number(antes.known_amount) - 500_000)

    // La fila sigue ahí: no se borra nada.
    const { rows: sigue } = await db.query('select id from declared_prize_awards where id = $1', [id])
    expect(sigue).toHaveLength(1)

    // Y se deja como estaba para el resto de la suite.
    await db.query(`set session_replication_role = replica`)
    await db.query(
      `update declared_prize_awards set voided_at = null, void_reason = null where id = $1`,
      [id],
    )
    await db.query(`set session_replication_role = origin`)
  })
})

// =============================================================================
describe('H5 — los números de una boleta con coincidencias no cambian (I-134)', () => {
  it('H5-01: el personal no puede cambiarlos por su RPC', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select t.id from tickets t join lottery_ticket_matches m on m.ticket_id = t.id
        where t.raffle_id = $1 limit 1`,
      [rMotor],
    )
    const { error } = await owner.rpc('admin_update_ticket_numbers', {
      p_ticket_id: rows[0]!.id,
      p_daily_number: '1111',
      p_weekly_number: '2222',
    })
    expect(error?.message).toMatch(/hace parte de un resultado registrado/)
  })

  it('H5-02: tampoco con PostgreSQL directo, que es lo que tiene la service role', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select t.id from tickets t join lottery_ticket_matches m on m.ticket_id = t.id
        where t.raffle_id = $1 limit 1`,
      [rMotor],
    )
    await expect(
      db.query(`update tickets set daily_number = '1111' where id = $1`, [rows[0]!.id]),
    ).rejects.toThrow(/hace parte de un resultado registrado/)
  })

  it('H5-03: una boleta SIN coincidencias sigue pudiendo corregirse', async () => {
    const [ticket] = await boletas(
      rMotor,
      [{ diario: '6001', semanal: '6002' }],
      '2086-01-01T08:00:00-05:00',
    )
    const { error } = await owner.rpc('admin_update_ticket_numbers', {
      p_ticket_id: ticket!,
      p_daily_number: '6003',
      p_weekly_number: '6004',
    })
    expect(error).toBeNull()
  })

  it('H5-04: con una edición en vuelo, la escritura de la coincidencia ESPERA: la clave ajena las serializa', async () => {
    const [ticket] = await boletas(
      rMotor,
      [{ diario: '6101', semanal: '6102', cliente: ctx.clients.beatriz.id }],
      '2086-01-01T08:00:00-05:00',
    )
    const { resultId } = await sorteo('bogota', '2087-03-20', '6101')

    // La carrera de verdad necesita DOS transacciones. La edición cambia los
    // números y no confirma: el disparador inmediato no ve ninguna coincidencia
    // —todavía no existe— y la deja pasar. El motor, en otra transacción, no
    // puede adelantarla: su INSERT comprueba la clave ajena contra la boleta y
    // se queda ESPERANDO a que la edición termine. Eso es lo que impide que las
    // dos escrituras se entrelacen.
    const edicion = new PgClient({ connectionString: DB_URL })
    await edicion.connect()
    try {
      await edicion.query('begin')
      await edicion.query(`update tickets set daily_number = '6111' where id = $1`, [ticket])

      const motorLento = new PgClient({ connectionString: DB_URL })
      await motorLento.connect()
      let espero = false
      try {
        await motorLento.query('set statement_timeout = 3000')
        await motorLento.query('select match_lottery_result($1)', [resultId])
      } catch (error) {
        espero = /statement timeout/.test((error as Error).message)
      } finally {
        await motorLento.end()
      }
      expect(espero, 'el motor debería quedarse esperando la edición').toBe(true)
    } finally {
      // Se deshace la edición: la boleta conserva sus números.
      await edicion.query('rollback')
      await edicion.end()
    }

    const { rows } = await db.query<{ daily_number: string }>(
      'select daily_number from tickets where id = $1',
      [ticket],
    )
    expect(rows[0]!.daily_number).toBe('6101')

    // Y con la edición deshecha, el motor fotografía con el número de siempre.
    const resumen = await motor(resultId)
    expect(resumen.inserted).toBe(1)

    // A partir de aquí la boleta ya no admite un cambio de números por ninguna
    // vía: es el disparador inmediato de H5-01 y H5-02.
    await expect(
      db.query(`update tickets set daily_number = '6111' where id = $1`, [ticket]),
    ).rejects.toThrow(/hace parte de un resultado registrado/)
  })

  it('H5-05: los dos disparadores existen, y uno es DIFERIDO', async () => {
    const { rows } = await db.query<{ tgname: string; deferrable: boolean; initdeferred: boolean }>(
      `select t.tgname, t.tgdeferrable as deferrable, t.tginitdeferred as initdeferred
         from pg_trigger t
        where t.tgrelid = 'tickets'::regclass
          and t.tgname like 'tickets_guard_matched_numbers%'
        order by t.tgname`,
    )
    expect(rows).toEqual([
      { tgname: 'tickets_guard_matched_numbers', deferrable: false, initdeferred: false },
      { tgname: 'tickets_guard_matched_numbers_deferred', deferrable: true, initdeferred: true },
    ])
  })

  it('H5-06: si aun así una fotografía quedara con otro número, el historial LO MARCA', async () => {
    // El hueco que queda abierto (I-134): el motor lee el número viejo, espera
    // por la clave ajena, la edición confirma y la fotografía entra con un
    // número que ya no es el de la boleta. Aquí se escribe esa situación a
    // propósito —en un sorteo del sistema de siempre, donde cabe una fotografía
    // sin premio— para comprobar que la lectura no la esconde.
    const [ticket] = await boletas(
      rHistorica,
      [{ diario: '8001', semanal: '8002', cliente: ctx.clients.carlos.id }],
      `${boletasCreadas}T08:00:00-05:00`,
    )
    const { rows: prog } = await db.query<{ id: string }>(
      `select s.id from lottery_draw_schedules s
        where s.draw_number like 'E1H-%'
          and s.reference_date < (now() at time zone 'America/Bogota')::date
          and not exists (select 1 from lottery_results r where r.schedule_id = s.id)
        limit 1`,
    )
    const { rows: res } = await db.query<{ id: string }>(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, '8009', 'confirmed', 'official_page', now()) returning id`,
      [prog[0]!.id],
    )
    await db.query(
      `insert into lottery_ticket_matches
         (result_id, ticket_id, organization_id, raffle_id, seller_id, client_id, match_field,
          matched_number, assignment_status, inventory_status_at_draw, assigned_at, ticket_created_at)
       select $1, t.id, t.organization_id, t.raffle_id, t.seller_id, t.client_id, 'daily_number',
              '8009', 'sold', 'assigned', t.assigned_at, t.created_at
         from tickets t where t.id = $2`,
      [res[0]!.id, ticket],
    )
    const { error } = await reconocer([
      {
        daily_number: '8001',
        weekly_number: '8002',
        lottery_code: (
          await db.query<{ c: Loteria }>(
            'select lottery_code as c from lottery_draw_schedules where id = $1',
            [prog[0]!.id],
          )
        ).rows[0]!.c,
        reference_date: (
          await db.query<{ d: string }>(
            `select reference_date::text as d from lottery_draw_schedules where id = $1`,
            [prog[0]!.id],
          )
        ).rows[0]!.d,
        // El título VIGENTE, que H4-02 ya cambió: el cargador busca el premio
        // por el nombre con el que se llama hoy.
        prize_title: (
          await db.query<{ t: string }>(
            `select v.title as t from raffle_prizes p
               join raffle_prize_versions v on v.id = p.current_version_id
              where p.raffle_id = $1`,
            [rHistorica],
          )
        ).rows[0]!.t,
        amount: 500_000,
      },
    ])
    expect(error).toBeNull()

    const fila = (await filasVendedor(rHistorica, 100)).find((f) => f.matched_number === '8009')!
    expect(fila).toMatchObject({
      numbers_changed: true,
      daily_number: '8001',
      weekly_number: '8002',
    })
  })
})

// =============================================================================
describe('H6 — quién ve qué', () => {
  it('H6-01: otro vendedor de la misma organización no ve nada de este historial', async () => {
    const { data, error } = await seller2.rpc('seller_prize_awards', { p_raffle_id: rHistorica })
    expect(error).toBeNull()
    expect(data as unknown[]).toHaveLength(0)
  })

  it('H6-02: tener equipo no concede el historial de los integrantes', async () => {
    // El vendedor 1 es el padre del 2 en el seed; si eso concediera algo, el 2
    // vería los premios del 1. Ya se comprobó arriba. Al revés tampoco: el
    // alcance es `seller_id = current_profile_id()`, sin equipo.
    const { rows } = await db.query<{ definicion: string }>(
      `select pg_get_functiondef(p.oid) as definicion from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'seller_prize_awards'`,
    )
    expect(rows[0]!.definicion).toContain('current_profile_id()')
    expect(rows[0]!.definicion).not.toContain('current_team_seller_ids')
  })

  it('H6-03: otra organización no ve ni una fila, ni por el listado ni por los totales', async () => {
    const listado = await otherOrgOwner.rpc('admin_prize_awards', {})
    expect(listado.error).toBeNull()
    expect(listado.data as unknown[]).toHaveLength(0)

    const totales = await otherOrgOwner.rpc('admin_prize_award_totals', {})
    expect(totales.error).toBeNull()
    expect((totales.data as unknown as Array<Record<string, number>>)[0]).toMatchObject({
      prizes_count: 0,
      clients_count: 0,
      known_amount: 0,
    })
  })

  it('H6-04: el personal recibe el historial SIN un solo dato de cliente', async () => {
    const { data, error } = await owner.rpc('admin_prize_awards', { p_raffle_id: rHistorica })
    expect(error).toBeNull()
    const filas = data as unknown as Array<Record<string, unknown>>
    expect(filas.length).toBeGreaterThan(0)

    const PROHIBIDAS = /client|cliente|phone|email|alias|notes|sale_price|paid|pending_amount/i
    for (const fila of filas) {
      for (const clave of Object.keys(fila)) {
        // `value_pending` es del valor del premio, no de un saldo.
        if (clave === 'value_pending') continue
        expect(clave, `admin_prize_awards devuelve ${clave}`).not.toMatch(PROHIBIDAS)
      }
      expect(JSON.stringify(fila)).not.toContain(ctx.clients.ana.id)
      expect(JSON.stringify(fila)).not.toContain('Ana Torres')
    }
  })

  it('H6-05: el personal SÍ ve al vendedor y sus recuentos, con los clientes contados sin identificarlos', async () => {
    const { data } = await owner.rpc('admin_prize_awards', { p_raffle_id: rHistorica })
    const filas = data as unknown as Array<Record<string, unknown>>
    expect(filas[0]!.seller_name).toBeTruthy()

    // Los mismos recuentos que ve el vendedor —todas las coincidencias de esta
    // rifa son suyas—, con los clientes contados dentro de la base y sin que
    // salga ningún identificador.
    const totales = await owner.rpc('admin_prize_award_totals', { p_raffle_id: rHistorica })
    expect((totales.data as unknown as Array<Record<string, number>>)[0]).toEqual(
      await totalesVendedor(rHistorica),
    )
  })

  it('H6-06: el vendedor no puede llamar al cargador, y el personal tampoco', async () => {
    for (const sesion of [seller1, owner]) {
      const { error } = await sesion.rpc('record_declared_prize_awards', {
        p_organization_id: ctx.demoOrg.id,
        p_basis: RESPALDO,
        p_awards: [] as unknown as never,
        p_apply: true,
      })
      expect(error).not.toBeNull()
    }
  })

  it('H6-07: anon no alcanza ninguna de las cuatro lecturas', async () => {
    const anon = anonClient()
    for (const fn of ['seller_prize_awards', 'seller_prize_award_totals', 'admin_prize_awards',
                      'admin_prize_award_totals'] as const) {
      const { error } = await anon.rpc(fn, {})
      expect(error, fn).not.toBeNull()
    }
  })
})

// =============================================================================
describe('H7 — privilegios y efectos laterales', () => {
  it('H7-01: las 10 funciones de la 0067 están clasificadas, y su EXECUTE es exactamente el de la lista', async () => {
    expect(HISTORY_FUNCTION_GRANTS).toHaveLength(10)
    expect(HISTORY_SESSION_RPCS).toHaveLength(4)
    expect(HISTORY_INTERNAL_FUNCTIONS).toHaveLength(5)

    const { rows } = await db.query<{
      firma: string
      publico: boolean
      anonimo: boolean
      autenticado: boolean
      servicio: boolean
    }>(
      `select f.firma,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE') as publico,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anonimo,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as servicio
         from unnest($1::text[]) as f(firma)
         join pg_proc p on p.oid = to_regprocedure('public.' || f.firma)
        order by f.firma`,
      [HISTORY_FUNCTION_GRANTS.map((f) => f.signature)],
    )
    expect(rows).toHaveLength(10)
    const esperado = Object.fromEntries(
      HISTORY_FUNCTION_GRANTS.map((f) => [
        f.signature,
        {
          publico: f.expected.public,
          anonimo: f.expected.anon,
          autenticado: f.expected.authenticated,
          servicio: f.expected.service_role,
        },
      ]),
    )
    for (const { firma, ...real } of rows) expect(real, firma).toEqual(esperado[firma])
  })

  it('H7-02: toda función que crea la 0067 está en la lista, y ninguna más', async () => {
    const sql = (
      await import('node:fs/promises')
    ).readFile
    const contenido = await sql('supabase/migrations/0067_prize_award_history.sql', 'utf8')
    const nombres = new Set<string>()
    for (const m of (contenido as string)
      .replace(/--.*$/gm, '')
      .matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
      nombres.add(m[1]!.toLowerCase())
    }
    const clasificadas = new Set(
      HISTORY_FUNCTION_GRANTS.map((f) => f.signature.slice(0, f.signature.indexOf('('))),
    )
    expect([...nombres].sort()).toEqual([...clasificadas].sort())
  })

  it('H7-03: la tabla no concede escritura a ninguna sesión y tiene RLS forzada', async () => {
    const { rows } = await db.query<{ rls: boolean; force: boolean }>(
      `select c.relrowsecurity as rls, c.relforcerowsecurity as force
         from pg_class c where c.oid = 'declared_prize_awards'::regclass`,
    )
    expect(rows[0]).toEqual({ rls: true, force: true })

    const { rows: privilegios } = await db.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_name = 'declared_prize_awards'
          and grantee in ('anon', 'authenticated', 'service_role')
        order by grantee, privilege_type`,
    )
    expect(privilegios).toEqual([
      { grantee: 'authenticated', privilege_type: 'SELECT' },
      { grantee: 'service_role', privilege_type: 'SELECT' },
    ])
  })

  it('H7-04: nada de esto tocó abonos, saldos ni comisiones', async () => {
    const { rows } = await db.query<{ x: string }>(
      `select
         (select count(*) from payments)::text || '/' ||
         (select count(*) from payment_allocations)::text || '/' ||
         (select coalesce(sum(amount), 0) from payment_allocations)::text || '/' ||
         (select count(*) from commission_ledger)::text || '/' ||
         (select coalesce(sum(amount), 0) from commission_ledger)::text as x`,
    )
    // El seed trae 4 pagos en la organizacion demo y ninguna de las escrituras
    // de esta suite crea o cambia un pago, una asignacion o un movimiento.
    const { rows: boletasDemo } = await db.query<{ n: string }>(
      `select count(*)::text as n from tickets t join raffles r on r.id = t.raffle_id
        where r.name like $1 and t.payment_status <> 'unpaid'`,
      [`${PREFIJO}%`],
    )
    // Ninguna boleta de esta suite cambia de estado de pago: no se registra
    // ni un abono, y `payment_status` lo calcula la base, no la prueba.
    expect(boletasDemo[0]!.n).toBe('0')
    expect(rows[0]!.x).toMatch(/^\d+\/\d+\/\d+\/\d+\/\d+$/)

    const { rows: sinPagos } = await db.query<{ n: string }>(
      `select count(*)::text as n from payment_allocations pa
         join tickets t on t.id = pa.ticket_id
         join raffles r on r.id = t.raffle_id
        where r.name like $1`,
      [`${PREFIJO}%`],
    )
    expect(sinPagos[0]!.n).toBe('0')
  })
})
