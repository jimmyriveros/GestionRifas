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
  SEED_PASSWORD,
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

/**
 * Solo la programación oficial, con sus dos horas conocidas. El estado es
 * `scheduled` salvo que la prueba necesite un sorteo cancelado o suspendido.
 */
async function programacion(
  loteria: Loteria,
  fecha: string,
  estado: 'scheduled' | 'cancelled' | 'suspended' = 'scheduled',
): Promise<string> {
  secuencia += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                         original_scheduled_at, official_scheduled_at, schedule_status)
     values ($1, $2, $3, $4, $4, $5)
     returning id`,
    [loteria, `E1H-${stamp}-${secuencia}`, fecha, `${fecha}T22:30:00-05:00`, estado],
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
  // Los vendedores que crea H9 son suyos: se van con su clientela. Ascender a
  // alguien a Administrador tiene efectos irreversibles, así que esta suite no
  // toca a los del seed (ver TEST_RESULTS, corrección de la Etapa 1).
  await db.query(`delete from clients where seller_id in
                    (select id from profiles where email like 'hist-%@demo.test')`)
  await db.query(`delete from memberships where profile_id in
                    (select id from profiles where email like 'hist-%@demo.test')`)
  await db.query(`delete from auth.users where email like 'hist-%@demo.test'`)
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

/** Escribe una fotografía a mano, para reproducir lo que el motor haría. */
async function fotografiar(
  resultId: string,
  ticketId: string,
  campo: 'daily_number' | 'weekly_number',
  numero: string,
): Promise<void> {
  await db.query(
    `insert into lottery_ticket_matches
       (result_id, ticket_id, organization_id, raffle_id, seller_id, client_id, match_field,
        matched_number, assignment_status, inventory_status_at_draw, assigned_at, ticket_created_at)
     select $1, t.id, t.organization_id, t.raffle_id, t.seller_id, t.client_id,
            $3::lottery_match_field, $4, 'sold', 'assigned', t.assigned_at, t.created_at
       from tickets t where t.id = $2`,
    [resultId, ticketId, campo, numero],
  )
}

/** El título con el que se llama HOY el único premio de una rifa. */
async function tituloVigente(raffleId: string): Promise<string> {
  const { rows } = await db.query<{ t: string }>(
    `select v.title as t from raffle_prizes p
       join raffle_prize_versions v on v.id = p.current_version_id
      where p.raffle_id = $1 limit 1`,
    [raffleId],
  )
  return rows[0]!.t
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
    // Desde `0068` la vista previa anticipa el MODO del sorteo, que es una
    // razón anterior y más precisa: ese sorteo lo resuelven los premios
    // configurables, así que su premio no se reconoce a mano. La razón del
    // enlace ya existente sigue en el plan, detrás de esta.
    const previa = await reconocer(yaPremiada, false)
    expect((previa.data as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      outcome: 'rechazado',
      problem:
        'Ese sorteo se resuelve con los premios configurables de la rifa, así que su premio lo registra el sistema y no se puede reconocer a mano.',
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

  it('H5-04: con una edición en vuelo, la escritura de la coincidencia ESPERA: se observa el bloqueo, no se adivina con un tiempo', async () => {
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
    // se queda ESPERANDO a que la edición termine.
    //
    // Etapa 3: antes se DEDUCÍA la espera de un `statement_timeout` de 3 s —la
    // prueba tardaba 3 s por diseño y no miraba ningún bloqueo—. Ahora se
    // OBSERVA con `pg_blocking_pids` (`esperarBloqueo`, el de H10-01) y se deja
    // al motor terminar: su resultado final es parte de lo que se comprueba.
    const edicion = new PgClient({ connectionString: DB_URL })
    const motorConexion = new PgClient({ connectionString: DB_URL })
    await edicion.connect()
    await motorConexion.connect()
    let edicionAbierta = false
    let fin: Error | 'ok' | null = null
    let enMarcha: Promise<{ rows: Array<{ r: { inserted: number } }> }> | null = null
    try {
      const pid = async (c: PgClient) =>
        (await c.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid
      const pidEdicion = await pid(edicion)
      const pidMotor = await pid(motorConexion)

      await edicion.query('begin')
      edicionAbierta = true
      await edicion.query(`update tickets set daily_number = '6111' where id = $1`, [ticket])

      enMarcha = motorConexion
        .query<{ r: { inserted: number } }>('select match_lottery_result($1) as r', [resultId])
        .then(
          (respuesta) => {
            fin = 'ok'
            return respuesta
          },
          (error: unknown) => {
            fin = error as Error
            throw error
          },
        )
      await esperarBloqueo(db, pidMotor, pidEdicion, () => fin)

      // Se deshace la edición: el motor, que la estaba esperando, sigue y
      // fotografía con el número de siempre.
      await edicion.query('rollback')
      edicionAbierta = false
      const salida = await enMarcha
      expect(salida.rows[0]!.r.inserted).toBe(1)
    } finally {
      if (edicionAbierta) await edicion.query('rollback').catch(() => {})
      if (enMarcha) await enMarcha.catch(() => {})
      await edicion.end()
      await motorConexion.end()
    }

    // El estado final de las DOS operaciones: la boleta conserva sus números y
    // la fotografía es coherente con ellos.
    const { rows } = await db.query<{ daily_number: string }>(
      'select daily_number from tickets where id = $1',
      [ticket],
    )
    expect(rows[0]!.daily_number).toBe('6101')
    const { rows: fotos } = await db.query<{ matched_number: string }>(
      'select matched_number from lottery_ticket_matches where result_id = $1',
      [resultId],
    )
    expect(fotos).toEqual([{ matched_number: '6101' }])

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

  it('H5-06: una fotografía INCOHERENTE no se puede escribir (`0068`)', async () => {
    // Antes de `0068` esta escritura entraba y el historial solo podía marcarla.
    // Ahora el disparador de restricción diferido la rechaza al COMMIT: el
    // número fotografiado tiene que ser el de la boleta en su campo.
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
    await expect(
      fotografiar(res[0]!.id, ticket!, 'daily_number', '8009'),
    ).rejects.toThrow(/Los números de la boleta cambiaron/)

    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from lottery_ticket_matches where result_id = $1`,
      [res[0]!.id],
    )
    expect(rows[0]!.n).toBe('0')
  })

  it('H5-07: `numbers_changed` sigue marcando una fotografía HEREDADA incoherente', async () => {
    // `numbers_changed` no sobra: protege lo que se escribió ANTES de `0068`.
    // Para reproducir una fila así hay que desactivar los disparadores, que es
    // exactamente lo que no puede hacer ninguna sesión.
    const [ticket] = await boletas(
      rHistorica,
      [{ diario: '8101', semanal: '8102', cliente: ctx.clients.carlos.id }],
      `${boletasCreadas}T08:00:00-05:00`,
    )
    const { rows: prog } = await db.query<{ id: string; lottery_code: Loteria; d: string }>(
      `select s.id, s.lottery_code, s.reference_date::text as d from lottery_draw_schedules s
        where s.draw_number like 'E1H-%'
          and s.reference_date < (now() at time zone 'America/Bogota')::date
          and not exists (select 1 from lottery_results r where r.schedule_id = s.id)
        limit 1`,
    )
    const { rows: res } = await db.query<{ id: string }>(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, '8109', 'confirmed', 'official_page', now()) returning id`,
      [prog[0]!.id],
    )
    await db.query(`set session_replication_role = replica`)
    await fotografiar(res[0]!.id, ticket!, 'daily_number', '8109')
    await db.query(`set session_replication_role = origin`)

    const { error } = await reconocer([
      {
        daily_number: '8101',
        weekly_number: '8102',
        lottery_code: prog[0]!.lottery_code,
        reference_date: prog[0]!.d,
        prize_title: await tituloVigente(rHistorica),
        amount: 500_000,
      },
    ])
    expect(error).toBeNull()

    const fila = (await filasVendedor(rHistorica, 100)).find((f) => f.matched_number === '8109')!
    expect(fila).toMatchObject({
      numbers_changed: true,
      daily_number: '8101',
      weekly_number: '8102',
      match_field: 'daily_number',
    })
  })

  it('H5-08: el número viejo movido al OTRO campo no esconde la discrepancia', async () => {
    // El caso que el `numbers_changed` de la `0067` no veía: comparaba contra
    // los dos números, así que mover el viejo al otro campo lo silenciaba.
    const { rows } = await db.query<{ ticket_id: string; matched_number: string }>(
      `select m.ticket_id, m.matched_number from lottery_ticket_matches m
        where m.raffle_id = $1 and m.match_field = 'daily_number'
          and m.matched_number = '3427' limit 1`,
      [rHistorica],
    )
    await db.query(`set session_replication_role = replica`)
    await db.query(`update tickets set daily_number = '0001', weekly_number = $2 where id = $1`, [
      rows[0]!.ticket_id,
      rows[0]!.matched_number,
    ])
    await db.query(`set session_replication_role = origin`)

    const fila = (await filasVendedor(rHistorica, 100)).find(
      (f) => f.ticket_id === rows[0]!.ticket_id,
    )!
    expect(fila).toMatchObject({
      match_field: 'daily_number',
      matched_number: '3427',
      daily_number: '0001',
      weekly_number: '3427',
      numbers_changed: true,
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
/** Las migraciones del historial, en orden: H7-02 y H7-05 las leen. */
const MIGRACIONES_HISTORIAL = [
  'supabase/migrations/0067_prize_award_history.sql',
  'supabase/migrations/0068_prize_award_history_fixes.sql',
  'supabase/migrations/0069_prize_award_coverage_participating.sql',
  'supabase/migrations/0070_prize_award_sellers.sql',
  'supabase/migrations/0071_prize_award_history_start_not_folded.sql',
  'supabase/migrations/0072_prize_award_seller_scope_privileges.sql',
]

describe('H7 — privilegios y efectos laterales', () => {
  it('H7-01: las 15 funciones de la 0067, la 0068 y la 0070 están clasificadas, y su EXECUTE es exactamente el de la lista', async () => {
    expect(HISTORY_FUNCTION_GRANTS).toHaveLength(15)
    expect(HISTORY_SESSION_RPCS).toHaveLength(8)
    expect(HISTORY_INTERNAL_FUNCTIONS).toHaveLength(6)

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
    expect(rows).toHaveLength(15)
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

  it('H7-02: toda función que crean la 0067 a la 0072 está en la lista, y ninguna más', async () => {
    const { readFile } = await import('node:fs/promises')
    const nombres = new Set<string>()
    for (const archivo of MIGRACIONES_HISTORIAL) {
      const contenido = await readFile(archivo, 'utf8')
      for (const m of contenido
        .replace(/--.*$/gm, '')
        .matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
        nombres.add(m[1]!.toLowerCase())
      }
    }
    const clasificadas = new Set(
      HISTORY_FUNCTION_GRANTS.map((f) => f.signature.slice(0, f.signature.indexOf('('))),
    )
    expect([...nombres].sort()).toEqual([...clasificadas].sort())
  })

  it('H7-05: ninguna función del historial depende del privilegio por defecto para no ser de `service_role` (I-132)', async () => {
    // En el proyecto alojado toda función NUEVA nace ejecutable por
    // `service_role` (I-132); en la pila local no, así que H7-01 no puede verlo.
    // Lo que sí se comprueba aquí es que cada función que la lista le niega a
    // `service_role` tiene, DESPUÉS de su última creación, un `revoke` explícito
    // que lo nombra. Ensayado en la Etapa 3 con el privilegio de producción:
    // `current_seller_org_ids()` nacía con `service_role=X` (I-143).
    const { readFile } = await import('node:fs/promises')
    const fuentes: string[] = []
    for (const archivo of MIGRACIONES_HISTORIAL) {
      fuentes.push((await readFile(archivo, 'utf8')).replace(/--.*$/gm, ''))
    }

    const sinRevocar: string[] = []
    for (const f of HISTORY_FUNCTION_GRANTS.filter((g) => !g.expected.service_role)) {
      const nombre = f.signature.slice(0, f.signature.indexOf('('))
      const creacion = new RegExp(
        `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${nombre}\\s*\\(`,
        'gi',
      )
      const revocacion = new RegExp(
        `revoke\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${nombre}\\s*\\([^)]*\\)\\s+from\\s+([^;]+);`,
        'gi',
      )

      // La ÚLTIMA creación manda: una función recreada nace otra vez con el
      // privilegio por defecto, y un `revoke` anterior ya no cuenta.
      let ultima: { archivo: number; posicion: number } | undefined
      for (const [i, sql] of fuentes.entries()) {
        for (const m of sql.matchAll(creacion)) ultima = { archivo: i, posicion: m.index ?? -1 }
      }
      expect(ultima, `${f.signature} no se crea en ninguna migración del historial`).toBeDefined()
      if (!ultima) continue

      let revocada = false
      for (const [i, sql] of fuentes.entries()) {
        if (i < ultima.archivo) continue
        for (const m of sql.matchAll(revocacion)) {
          const despues = i > ultima.archivo || (m.index ?? -1) > ultima.posicion
          if (despues && /\bservice_role\b/i.test(m[1]!)) revocada = true
        }
      }
      if (!revocada) sinRevocar.push(f.signature)
    }
    expect(sinRevocar).toEqual([])
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

// =============================================================================
describe('H8 — reconocer, anular y volver a reconocer (`0068`)', () => {
  let entrada: Entrada
  let matchId = ''
  let prizeId = ''

  beforeAll(async () => {
    const [ticket] = await boletas(
      rHistorica,
      [{ diario: '9501', semanal: '9502', cliente: ctx.clients.beatriz.id }],
      `${boletasCreadas}T08:00:00-05:00`,
    )
    const { rows: prog } = await db.query<{ id: string; lottery_code: Loteria; d: string }>(
      `select s.id, s.lottery_code, s.reference_date::text as d from lottery_draw_schedules s
        where s.draw_number like 'E1H-%'
          and s.reference_date < (now() at time zone 'America/Bogota')::date
          and not exists (select 1 from lottery_results r where r.schedule_id = s.id)
        limit 1`,
    )
    const { rows: res } = await db.query<{ id: string }>(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, '9501', 'confirmed', 'official_page', now()) returning id`,
      [prog[0]!.id],
    )
    await fotografiar(res[0]!.id, ticket!, 'daily_number', '9501')
    const { rows } = await db.query<{ id: string }>(
      `select id from lottery_ticket_matches where result_id = $1`,
      [res[0]!.id],
    )
    matchId = rows[0]!.id
    prizeId = premioHistorico.prizeId
    entrada = {
      daily_number: '9501',
      weekly_number: '9502',
      lottery_code: prog[0]!.lottery_code,
      reference_date: prog[0]!.d,
      prize_title: await tituloVigente(rHistorica),
      amount: 300_000,
    }
  })

  it('H8-01: la unicidad es de lo VIGENTE, no de la historia', async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where tablename = 'declared_prize_awards' and indexname = 'declared_prize_awards_live_key'`,
    )
    expect(rows[0]!.indexdef).toMatch(/WHERE \(voided_at IS NULL\)/)
    const { rows: viejas } = await db.query(
      `select conname from pg_constraint
        where conrelid = 'declared_prize_awards'::regclass and contype = 'u'`,
    )
    expect(viejas).toHaveLength(0)
  })

  it('H8-02: se reconoce, se anula y se vuelve a reconocer con otro importe', async () => {
    const primera = await reconocer([entrada])
    expect(primera.error).toBeNull()
    expect((primera.data as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      outcome: 'reconocido',
      amount: 300_000,
    })

    // La anulación, con su motivo. Es lo único que la tabla deja cambiar.
    await db.query(
      `update declared_prize_awards set voided_at = now(), void_reason = 'Importe equivocado'
        where match_id = $1 and prize_id = $2 and voided_at is null`,
      [matchId, prizeId],
    )

    const segunda = await reconocer([{ ...entrada, amount: 450_000 }])
    expect(segunda.error).toBeNull()
    expect((segunda.data as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      outcome: 'reconocido',
      amount: 450_000,
    })

    // La historia entera se conserva: el anulado y el vigente.
    const { rows } = await db.query<{ amount: string; anulado: boolean }>(
      `select amount::text, (voided_at is not null) as anulado
         from declared_prize_awards where match_id = $1 and prize_id = $2
        order by recorded_at`,
      [matchId, prizeId],
    )
    expect(rows).toEqual([
      { amount: '300000', anulado: true },
      { amount: '450000', anulado: false },
    ])

    // Y el historial cuenta UNO, el vigente.
    const fila = (await filasVendedor(rHistorica, 100)).filter((f) => f.matched_number === '9501')
    expect(fila).toHaveLength(1)
    expect(fila[0]!.known_amount).toBe(450_000)
  })

  it('H8-03: dos reconocimientos vigentes del mismo premio son imposibles', async () => {
    await expect(
      db.query(
        `insert into declared_prize_awards (organization_id, raffle_id, result_id, match_id,
                                            match_field, prize_id, declared_title, amount, basis)
         select organization_id, raffle_id, result_id, match_id, match_field, prize_id,
                declared_title, 111111, $2
           from declared_prize_awards
          where match_id = $1 and voided_at is null`,
        [matchId, RESPALDO],
      ),
    ).rejects.toThrow(/declared_prize_awards_live_key/)
  })

  it('H8-04: un reintento idéntico no duplica ni reescribe, y el informe dice «ya estaba»', async () => {
    const { data, error } = await reconocer([{ ...entrada, amount: 450_000 }])
    expect(error).toBeNull()
    expect((data as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      outcome: 'ya estaba',
      amount: 450_000,
    })
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from declared_prize_awards
        where match_id = $1 and voided_at is null`,
      [matchId],
    )
    expect(rows[0]!.n).toBe('1')
  })

  it('H8-05: una petición con OTRO importe se rechaza y dice la discrepancia, sin escribir', async () => {
    const previa = await reconocer([{ ...entrada, amount: 900_000 }], false)
    expect((previa.data as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      outcome: 'rechazado',
      // El informe habla de lo ALMACENADO, no de lo pedido.
      amount: 450_000,
      problem:
        'Ese premio ya está reconocido con $450,000 y la petición trae $900,000. Anúlalo antes de registrar otro.',
    })

    const aplicada = await reconocer([{ ...entrada, amount: 900_000 }])
    expect(aplicada.error?.message).toMatch(/No se reconoció ningún premio/)

    const { rows } = await db.query<{ amount: string }>(
      `select amount::text from declared_prize_awards where match_id = $1 and voided_at is null`,
      [matchId],
    )
    expect(rows[0]!.amount).toBe('450000')
  })

  it('H8-06: un duplicado DENTRO de la petición se rechaza', async () => {
    const otra: Entrada = { ...entrada, amount: 450_000 }
    const { data } = await reconocer([otra, otra], false)
    const filas = data as unknown as Array<Record<string, unknown>>
    expect(filas).toHaveLength(2)
    expect(filas[0]!.outcome).toBe('ya estaba')
    expect(filas[1]).toMatchObject({
      outcome: 'rechazado',
      problem: 'Esa misma boleta, ese sorteo y ese premio ya vienen en otra entrada de esta petición.',
    })
  })

  it('H8-07: la vista previa anticipa importe fuera de límites y ambigüedad por título', async () => {
    const fuera = await reconocer([{ ...entrada, amount: 0 }], false)
    expect((fuera.data as unknown as Array<Record<string, unknown>>)[0]!.problem).toMatch(
      /entre \$1 y \$10\.000\.000\.000/,
    )

    // Un segundo premio con el MISMO título: el cargador no elige.
    const titulo = await tituloVigente(rHistorica)
    const gemelo = await owner.rpc('create_raffle_prize', {
      p_raffle_id: rHistorica,
      p_title: titulo,
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: [{ description: null, amount: 500_000 }],
      p_number_field: 'weekly_number',
      p_digits: 'four',
      p_rules: reglasHistorico,
    })
    expect(gemelo.error).toBeNull()

    const ambigua = await reconocer([{ ...entrada, amount: 450_000 }], false)
    expect((ambigua.data as unknown as Array<Record<string, unknown>>)[0]!.problem).toBe(
      'La rifa tiene más de un premio con ese nombre, así que no se puede saber cuál es.',
    )

    // Se archiva el gemelo para no contaminar lo que sigue.
    const creado = (gemelo.data as unknown as Array<{ prize_id: string; version_id: string }>)[0]!
    const archivado = await owner.rpc('archive_raffle_prize', {
      p_prize_id: creado.prize_id,
      p_expected_version_id: creado.version_id,
    })
    expect(archivado.error).toBeNull()
  })

  it('H8-08: dos ejecuciones a la vez se serializan: la segunda ESPERA a la primera y ve lo escrito', async () => {
    const [ticket] = await boletas(
      rHistorica,
      [{ diario: '9601', semanal: '9602', cliente: ctx.clients.beatriz.id }],
      `${boletasCreadas}T08:00:00-05:00`,
    )
    const { rows: prog } = await db.query<{ id: string; lottery_code: Loteria; d: string }>(
      `select s.id, s.lottery_code, s.reference_date::text as d from lottery_draw_schedules s
        where s.draw_number like 'E1H-%'
          and s.reference_date < (now() at time zone 'America/Bogota')::date
          and not exists (select 1 from lottery_results r where r.schedule_id = s.id)
        limit 1`,
    )
    const { rows: res } = await db.query<{ id: string }>(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, '9601', 'confirmed', 'official_page', now()) returning id`,
      [prog[0]!.id],
    )
    await fotografiar(res[0]!.id, ticket!, 'daily_number', '9601')

    const peticion = [
      {
        daily_number: '9601',
        weekly_number: '9602',
        lottery_code: prog[0]!.lottery_code,
        reference_date: prog[0]!.d,
        prize_title: await tituloVigente(rHistorica),
        amount: 500_000,
      },
    ]

    // Dos conexiones que llaman al cargador. El cerrojo por organización las
    // ordena: la segunda ESPERA a la primera y ve lo que escribió.
    //
    // Etapa 3: antes las dos se lanzaban con `Promise.all` y se confiaba en que
    // coincidieran. Sin el cerrojo fallaba 5 de 5 veces en esta máquina, pero la
    // prueba no MIRABA ningún bloqueo: si una terminaba antes de que empezara la
    // otra, habría pasado igual. Ahora la primera deja su transacción abierta
    // —con el reconocimiento escrito y el cerrojo tomado—, la segunda arranca,
    // se OBSERVA que espera a la primera, y solo entonces la primera confirma.
    const uno = new PgClient({ connectionString: DB_URL })
    const dos = new PgClient({ connectionString: DB_URL })
    await uno.connect()
    await dos.connect()
    let unoAbierta = false
    let fin: Error | 'ok' | null = null
    let enMarcha: Promise<{ rows: Array<{ outcome: string }> }> | null = null
    try {
      const pid = async (c: PgClient) =>
        (await c.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid
      const pidUno = await pid(uno)
      const pidDos = await pid(dos)
      const llamar = (c: PgClient) =>
        c.query<{ outcome: string }>(
          `select outcome from record_declared_prize_awards($1, $2, $3::jsonb, true)`,
          [ctx.demoOrg.id, RESPALDO, JSON.stringify(peticion)],
        )

      await uno.query('begin')
      unoAbierta = true
      const primera = await llamar(uno)
      expect(primera.rows[0]!.outcome).toBe('reconocido')

      enMarcha = llamar(dos).then(
        (respuesta) => {
          fin = 'ok'
          return respuesta
        },
        (error: unknown) => {
          fin = error as Error
          throw error
        },
      )
      await esperarBloqueo(db, pidDos, pidUno, () => fin)

      await uno.query('commit')
      unoAbierta = false
      const segunda = await enMarcha
      expect(segunda.rows[0]!.outcome).toBe('ya estaba')
    } finally {
      if (unoAbierta) await uno.query('rollback').catch(() => {})
      if (enMarcha) await enMarcha.catch(() => {})
      await uno.end()
      await dos.end()
    }

    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from declared_prize_awards
        where match_id in (select id from lottery_ticket_matches where result_id = $1)
          and voided_at is null`,
      [res[0]!.id],
    )
    expect(rows[0]!.n).toBe('1')
  })
})

// =============================================================================
describe('H9 — el rol, no solo el perfil (`0068`, I-137)', () => {
  // SUS PROPIOS VENDEDORES, y no los del seed. Ascender a alguien a
  // Administrador tiene un efecto IRREVERSIBLE: el disparador de D-198 le quita
  // el precio a los avisos que ya tenia, y eso no vuelve. Con un vendedor del
  // seed, esta suite rompia `admin-privacy` en la corrida siguiente, porque la
  // base guarda el estado entre corridas. La lección quedó en TEST_RESULTS.
  let propioId = ''
  let padreId = ''
  let hijoId = ''
  const propioEmail = `hist-propio-${stamp}@demo.test`
  const padreEmail = `hist-padre-${stamp}@demo.test`
  const hijoEmail = `hist-hijo-${stamp}@demo.test`
  let clienteId = ''
  let clienteHijoId = ''

  async function nuevoVendedor(email: string, nombre: string, padre: string | null) {
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: nombre, phone: '3001234567' },
    })
    if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
    const { error: membresia } = await svc.from('memberships').insert({
      organization_id: ctx.demoOrg.id,
      profile_id: data.user.id,
      role: 'seller',
      parent_seller_id: padre,
    })
    if (membresia) throw membresia
    return data.user.id
  }

  /** Un cliente de ese vendedor, con su boleta vendida y su coincidencia. */
  async function conPremio(sellerId: string, clientId: string, diario: string, semanal: string) {
    const { rows: tk } = await db.query<{ id: string }>(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                            weekly_number, inventory_status, created_at)
       values ($1, $2, $3, $4, $5, $6, 'available', $7) returning id`,
      [
        ctx.demoOrg.id,
        rHistorica,
        sellerId,
        ctx.ids.owner,
        diario,
        semanal,
        `${boletasCreadas}T08:00:00-05:00`,
      ],
    )
    await db.query(
      `update tickets set client_id = $2, inventory_status = 'assigned', sale_price = $3,
              sale_date = $4::date, assigned_at = $5 where id = $1`,
      [tk[0]!.id, clientId, PRECIO, boletasCreadas, `${boletasCreadas}T08:00:00-05:00`],
    )
    const { rows: prog } = await db.query<{ id: string; lottery_code: Loteria; d: string }>(
      `select s.id, s.lottery_code, s.reference_date::text as d from lottery_draw_schedules s
        where s.draw_number like 'E1H-%'
          and s.reference_date < (now() at time zone 'America/Bogota')::date
          and not exists (select 1 from lottery_results r where r.schedule_id = s.id)
        limit 1`,
    )
    const { rows: res } = await db.query<{ id: string }>(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, $2, 'confirmed', 'official_page', now()) returning id`,
      [prog[0]!.id, diario],
    )
    await fotografiar(res[0]!.id, tk[0]!.id, 'daily_number', diario)
    return { resultId: res[0]!.id, ticketId: tk[0]!.id }
  }

  beforeAll(async () => {
    propioId = await nuevoVendedor(propioEmail, 'Historial Propio', null)
    padreId = await nuevoVendedor(padreEmail, 'Historial Padre', null)
    hijoId = await nuevoVendedor(hijoEmail, 'Historial Integrante', padreId)

    const { rows: c1 } = await db.query<{ id: string }>(
      `insert into clients (organization_id, seller_id, name, phone)
       values ($1, $2, 'Cliente del propio', '3009990001') returning id`,
      [ctx.demoOrg.id, propioId],
    )
    clienteId = c1[0]!.id
    const { rows: c2 } = await db.query<{ id: string }>(
      `insert into clients (organization_id, seller_id, name, phone)
       values ($1, $2, 'Cliente del integrante', '3009990002') returning id`,
      [ctx.demoOrg.id, hijoId],
    )
    clienteHijoId = c2[0]!.id

    await conPremio(propioId, clienteId, '9801', '9802')
    await conPremio(hijoId, clienteHijoId, '9901', '9902')
  })

  /** Lo que ve una SESIÓN real: pasa por PostgREST y por la RLS. */
  async function comoSesion(email: string) {
    const sesion = await signInAs(email)
    const historial = await sesion.rpc('seller_prize_awards', { p_raffle_id: rHistorica })
    const totales = await sesion.rpc('seller_prize_award_totals', { p_raffle_id: rHistorica })
    const fotos = await sesion.from('lottery_ticket_matches').select('id, client_id')
    const declarados = await sesion
      .from('declared_prize_awards')
      .select('id', { count: 'exact', head: true })
    return {
      historial: (historial.data as unknown as Array<Record<string, unknown>> | null) ?? [],
      totales: (totales.data as unknown as Array<Record<string, number>> | null)?.[0] ?? null,
      fotos: (fotos.data ?? []).length,
      fotosConCliente: (fotos.data ?? []).filter((f) => f.client_id !== null).length,
      declarados: declarados.count ?? 0,
    }
  }

  it('H9-01: el vendedor activo ve lo suyo por la función y por la tabla', async () => {
    const visto = await comoSesion(propioEmail)
    expect(visto.fotos).toBe(1)
    expect(visto.fotosConCliente).toBe(1)
    // Todavía no tiene premio reconocido: la fotografía sola no es un premio.
    expect(visto.historial).toHaveLength(0)

    const { error } = await reconocer([
      {
        daily_number: '9801',
        weekly_number: '9802',
        lottery_code: (
          await db.query<{ c: Loteria }>(
            `select s.lottery_code as c from lottery_draw_schedules s
               join lottery_results r on r.schedule_id = s.id
               join lottery_ticket_matches m on m.result_id = r.id
               join tickets t on t.id = m.ticket_id
              where t.daily_number = '9801' limit 1`,
          )
        ).rows[0]!.c,
        reference_date: (
          await db.query<{ d: string }>(
            `select s.reference_date::text as d from lottery_draw_schedules s
               join lottery_results r on r.schedule_id = s.id
               join lottery_ticket_matches m on m.result_id = r.id
               join tickets t on t.id = m.ticket_id
              where t.daily_number = '9801' limit 1`,
          )
        ).rows[0]!.d,
        prize_title: await tituloVigente(rHistorica),
        amount: 500_000,
      },
    ])
    expect(error).toBeNull()

    const conPremioVisto = await comoSesion(propioEmail)
    expect(conPremioVisto.historial).toHaveLength(1)
    expect(conPremioVisto.historial[0]!.client_name).toBe('Cliente del propio')
    expect(Number(conPremioVisto.totales!.prizes_count)).toBe(1)
  })

  it('H9-02: el MISMO perfil, ya Administrador, no ve NADA por ninguna de las dos vías', async () => {
    await db.query(
      `update memberships set role = 'admin' where profile_id = $1 and organization_id = $2`,
      [propioId, ctx.demoOrg.id],
    )
    const visto = await comoSesion(propioEmail)
    expect(visto.historial).toHaveLength(0)
    expect(Number(visto.totales!.prizes_count)).toBe(0)
    // Lo importante: ni una fotografía, así que tampoco un `client_id` (BR-Q01).
    expect(visto.fotos).toBe(0)
    expect(visto.fotosConCliente).toBe(0)
    expect(visto.declarados).toBe(0)
  })

  it('H9-03: y como Administrador ve el historial por su propia proyección, sin cliente', async () => {
    const sesion = await signInAs(propioEmail)
    const { data, error } = await sesion.rpc('admin_prize_awards', { p_raffle_id: rHistorica })
    expect(error).toBeNull()
    const filas = data as unknown as Array<Record<string, unknown>>
    expect(filas.length).toBeGreaterThan(0)
    for (const fila of filas) {
      expect(Object.keys(fila).join(',')).not.toMatch(/client/i)
      expect(JSON.stringify(fila)).not.toContain('Cliente del propio')
    }
    // Y su premio sigue estando: lo que cambió es por dónde lo lee.
    expect(filas.some((f) => f.matched_number === '9801')).toBe(true)
  })

  it('H9-04: un vendedor DESACTIVADO no ve nada', async () => {
    await db.query(
      `update memberships set is_active = false where profile_id = $1 and organization_id = $2`,
      [hijoId, ctx.demoOrg.id],
    )
    try {
      const visto = await comoSesion(hijoEmail)
      expect(visto.historial).toHaveLength(0)
      expect(visto.fotos).toBe(0)
    } finally {
      await db.query(
        `update memberships set is_active = true where profile_id = $1 and organization_id = $2`,
        [hijoId, ctx.demoOrg.id],
      )
    }
  })

  it('H9-05: el vendedor PADRE no ve el historial de su equipo', async () => {
    const padre = await comoSesion(padreEmail)
    // El integrante tiene su coincidencia; el padre no ve ninguna.
    expect(padre.fotos).toBe(0)
    expect(padre.historial).toHaveLength(0)

    const hijo = await comoSesion(hijoEmail)
    expect(hijo.fotos).toBe(1)
  })

  it('H9-07: el personal puede ELEGIR a quien vendió y hoy es Administrador (`0070`, Etapa 3), y nadie más recibe esa lista', async () => {
    // Después de H9-02, «Historial Propio» es Administrador y conserva su premio
    // reconocido. El rol de hoy no lo delata: la lista sale del historial.
    type Fila = { seller_id: string; seller_name: string | null }
    const lista = async (sesion: Client) => {
      const { data, error } = await sesion.rpc('admin_prize_award_sellers')
      return { filas: (data as unknown as Fila[] | null) ?? [], error }
    }

    for (const email of [USERS.owner, USERS.admin, propioEmail]) {
      const { filas, error } = await lista(await signInAs(email))
      expect(error, email).toBeNull()
      // Solo el vendedor: identificador y nombre, nada del cliente.
      for (const fila of filas)
        expect(Object.keys(fila).sort()).toEqual(['seller_id', 'seller_name'])
      expect(JSON.stringify(filas)).not.toContain('Cliente del')
      // Quien vendió y hoy es Administrador, con su nombre.
      expect(filas).toContainEqual({ seller_id: propioId, seller_name: 'Historial Propio' })
      // Una fotografía SIN premio no pone a nadie en la lista: el integrante
      // tiene su coincidencia y ningún premio reconocido.
      expect(filas.map((f) => f.seller_id)).not.toContain(hijoId)
      // Y un vendedor de verdad con premios también está.
      expect(filas.map((f) => f.seller_id)).toContain(ctx.ids.seller1)
    }

    // Un vendedor, aunque tenga premios, no obtiene la lista del personal.
    const vendedor = await lista(seller1)
    expect(vendedor.error).toBeNull()
    expect(vendedor.filas).toEqual([])

    // Otra organización no ve a nadie de esta.
    const ajena = await lista(otherOrgOwner)
    expect(ajena.error).toBeNull()
    expect(ajena.filas.map((f) => f.seller_id)).not.toContain(propioId)
    expect(ajena.filas.map((f) => f.seller_id)).not.toContain(ctx.ids.seller1)

    // Y `anon` no la alcanza.
    const anonimo = await lista(anonClient())
    expect(anonimo.error).not.toBeNull()
    expect(anonimo.filas).toEqual([])
  })

  it('H9-06: otra organización no ve nada, ni por la función ni por la tabla', async () => {
    const ajena = await signInAs(USERS.otherOrgSeller)
    const { data } = await ajena.rpc('seller_prize_awards', {})
    expect((data as unknown[] | null)?.length ?? 0).toBe(0)
    const declarados = await ajena
      .from('declared_prize_awards')
      .select('id', { count: 'exact', head: true })
    expect(declarados.count ?? 0).toBe(0)
  })
})

/**
 * Espera a que la conexión `pid` esté BLOQUEADA por la conexión `bloqueador`,
 * según `pg_blocking_pids`: es la comprobación de que la carrera llegó
 * exactamente al punto que la prueba necesita, no una pausa a ojo.
 *
 * Tiene PLAZO. Si la conexión termina antes de bloquearse —el motor falló por
 * otra razón—, se dice con su error en vez de esperar a que venza.
 */
async function esperarBloqueo(
  observador: PgClient,
  pid: number,
  bloqueador: number,
  terminado: () => Error | 'ok' | null,
  plazoMs = 10_000,
): Promise<void> {
  const limite = Date.now() + plazoMs
  for (;;) {
    const { rows } = await observador.query<{ bloqueado: boolean }>(
      `select $2::int = any (pg_blocking_pids($1::int)) as bloqueado`,
      [pid, bloqueador],
    )
    if (rows[0]?.bloqueado) return

    const fin = terminado()
    if (fin !== null) {
      throw new Error(
        `La conexión ${pid} terminó sin llegar a esperar a la ${bloqueador}: ${
          fin === 'ok' ? 'respondió sin bloquearse' : fin.message
        }`,
      )
    }
    if (Date.now() > limite) {
      throw new Error(`La conexión ${pid} no quedó esperando a la ${bloqueador} en ${plazoMs} ms`)
    }
    // Un sondeo corto, no una espera: la condición es el bloqueo, no el reloj.
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('H10 — la carrera de los números, determinista (`0068`, I-134)', () => {
  it('H10-01: con la edición confirmada primero, el motor NO deja una fotografía incoherente', async () => {
    const [ticket] = await boletas(
      rMotor,
      [{ diario: '7531', semanal: '7532', cliente: ctx.clients.ana.id }],
      '2086-01-01T08:00:00-05:00',
    )
    const { resultId } = await sorteo('bogota', '2087-03-27', '7531')

    const edicion = new PgClient({ connectionString: DB_URL })
    const motorLento = new PgClient({ connectionString: DB_URL })
    await edicion.connect()
    await motorLento.connect()
    let errorMotor: Error | null = null
    let edicionAbierta = false
    let motorAbierto = false
    // El estado del motor mientras la prueba espera su bloqueo: `null` sigue
    // en marcha; `ok` o un error, ya terminó.
    let finMotor: Error | 'ok' | null = null
    let enMarcha: Promise<unknown> | null = null
    try {
      const [{ rows: pidEdicion }, { rows: pidMotor }] = await Promise.all([
        edicion.query<{ pid: number }>('select pg_backend_pid() as pid'),
        motorLento.query<{ pid: number }>('select pg_backend_pid() as pid'),
      ])

      // T1 cambia el número y NO confirma: el disparador inmediato pasa, porque
      // todavía no hay fotografía.
      await edicion.query('begin')
      edicionAbierta = true
      await edicion.query(`update tickets set daily_number = '8642' where id = $1`, [ticket])

      // T2 arranca el motor, que lee el número VIEJO y se queda esperando por
      // la clave ajena. No se espera su promesa todavía.
      await motorLento.query('begin')
      motorAbierto = true
      enMarcha = motorLento.query('select match_lottery_result($1) as r', [resultId]).then(
        () => {
          finMotor = 'ok'
        },
        (error: Error) => {
          finMotor = error
          errorMotor = error
        },
      )

      // Se sigue SOLO cuando T2 está bloqueada por T1: es el orden que la
      // carrera necesita, comprobado, no supuesto.
      await esperarBloqueo(db, pidMotor[0]!.pid, pidEdicion[0]!.pid, () => finMotor)

      // T1 confirma. La boleta ya tiene el número nuevo.
      await edicion.query('commit')
      edicionAbierta = false
      await enMarcha

      // Y T2 no puede confirmar: al COMMIT, el número fotografiado ya no es el
      // de la boleta.
      if (!errorMotor) {
        // Un COMMIT que falla también cierra la transacción.
        await motorLento.query('commit').catch((error: Error) => {
          errorMotor = error
        })
        motorAbierto = false
      }
    } finally {
      // LIMPIEZA GARANTIZADA, en este orden: soltar la edición desbloquea al
      // motor; esperar su consulta evita cerrar una conexión a mitad; después
      // se deshace lo que el motor tuviera abierto y se cierran las dos.
      if (edicionAbierta) await edicion.query('rollback').catch(() => {})
      if (enMarcha) await enMarcha
      if (motorAbierto) await motorLento.query('rollback').catch(() => {})
      await edicion.end()
      await motorLento.end()
    }

    expect(errorMotor).not.toBeNull()
    expect(errorMotor!.message).toMatch(/Los números de la boleta cambiaron/)

    // El estado final de LAS DOS operaciones: la edición quedó, el motor no
    // escribió nada, y no hay ninguna fotografía incoherente.
    const { rows } = await db.query<{ daily_number: string; fotos: string }>(
      `select t.daily_number,
              (select count(*)::text from lottery_ticket_matches m where m.ticket_id = t.id) as fotos
         from tickets t where t.id = $1`,
      [ticket],
    )
    expect(rows[0]).toEqual({ daily_number: '8642', fotos: '0' })
  })

  it('H10-02: sin edición de por medio, el motor fotografía con normalidad', async () => {
    const [ticket] = await boletas(
      rMotor,
      [{ diario: '7631', semanal: '7632', cliente: ctx.clients.ana.id }],
      '2086-01-01T08:00:00-05:00',
    )
    // Miércoles: ese día la lotería correspondiente es Meta, y el premio diario
    // juega de lunes a viernes con la del día.
    const { resultId } = await sorteo('meta', '2087-03-26', '7631')
    const resumen = await motor(resultId)
    expect(resumen.inserted).toBe(1)
    const { rows } = await db.query<{ matched_number: string }>(
      `select matched_number from lottery_ticket_matches where ticket_id = $1`,
      [ticket],
    )
    expect(rows[0]!.matched_number).toBe('7631')
  })
})

// =============================================================================
describe('H11 — el contrato de lectura de la Etapa 2 (`0068`)', () => {
  it('H11-01: la lectura del vendedor trae todo lo que hay que mostrar, sin condiciones de hoy', async () => {
    const filas = await filasVendedor(rMotor, 100)
    const delMotor = filas.find((f) => f.origin === 'engine')!
    expect(Object.keys(delMotor)).toEqual(
      expect.arrayContaining([
        'match_field',
        'matched_number',
        'prize_title',
        'prize_category',
        'prize_digits',
        'reward_mode',
        'reward_options',
        'known_amount',
        'value_pending',
      ]),
    )
    // El origen del MOTOR sí trae categoría y cifras: son las de su versión.
    expect(delMotor.prize_category).toBeTruthy()
    expect(delMotor.prize_digits).toBeTruthy()
    expect(Array.isArray(delMotor.reward_options)).toBe(true)
  })

  it('H11-02: el origen DECLARADO no presenta las condiciones de hoy como históricas', async () => {
    const declarado = (await filasVendedor(rHistorica, 100)).find((f) => f.origin === 'declared')!
    expect(declarado.prize_category).toBeNull()
    expect(declarado.prize_digits).toBeNull()
    expect(declarado.reward_mode).toBeNull()
    // Lo que SÍ está respaldado: el título declarado y su recompensa.
    expect(declarado.prize_title).toBeTruthy()
    expect(declarado.reward_options).toEqual([
      { position: 1, description: null, amount: declarado.known_amount },
    ])
  })

  it('H11-03: un premio de alternativas trae las suyas y no multiplica filas ni importes', async () => {
    const filas = (await filasVendedor(rMotor, 100)).filter((f) => f.matched_number === '4301')
    expect(filas).toHaveLength(1)
    const opciones = filas[0]!.reward_options as Array<Record<string, unknown>>
    expect(opciones).toHaveLength(2)
    expect(filas[0]!.reward_mode).toBe('winner_choice')
    expect(filas[0]!.known_amount).toBeNull()
    expect(filas[0]!.value_pending).toBe(true)
  })

  it('H11-04: el personal recibe lo mismo, sin un solo dato de cliente', async () => {
    const { data, error } = await owner.rpc('admin_prize_awards', { p_raffle_id: rMotor })
    expect(error).toBeNull()
    const filas = data as unknown as Array<Record<string, unknown>>
    expect(filas.length).toBeGreaterThan(0)
    expect(Object.keys(filas[0]!)).toEqual(
      expect.arrayContaining(['match_field', 'matched_number', 'reward_options', 'known_amount']),
    )
    for (const fila of filas) {
      expect(Object.keys(fila).join(',')).not.toMatch(/client/i)
    }
  })

  it('H11-05: el inicio operativo lo garantiza la BASE, no un filtro de la URL', async () => {
    const { rows } = await db.query<{ d: string }>(
      `select prize_award_history_start()::text as d`,
    )
    expect(rows[0]!.d).toBe('2026-08-09')

    // Una coincidencia REAL anterior al inicio operativo: la boleta, el sorteo
    // y su fotografía, que es coherente y entra sin más.
    // En la rifa TRANSFORMADA: su sorteo del 06/08 queda del lado del sistema
    // de siempre, donde cabe una fotografía sin premio (la rifa nacida
    // configurable exige el enlace en la misma operación, 0061).
    const [ticket] = await boletas(
      rHistorica,
      [{ diario: '1201', semanal: '1202', cliente: ctx.clients.ana.id }],
      '2026-06-01T08:00:00-05:00',
    )
    const { rows: prog } = await db.query<{ id: string }>(
      `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                           original_scheduled_at, official_scheduled_at, schedule_status)
       values ('bogota', $1, '2026-08-06', '2026-08-07T04:15:00Z', '2026-08-07T04:15:00Z', 'scheduled')
       returning id`,
      [`E1H-${stamp}-suelo`],
    )
    const { rows: res } = await db.query<{ id: string }>(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, '1201', 'confirmed', 'official_page', now()) returning id`,
      [prog[0]!.id],
    )
    await fotografiar(res[0]!.id, ticket!, 'daily_number', '1201')

    // El CARGADOR lo dice antes de escribir: hay coincidencia, pero el sorteo
    // es anterior al inicio operativo.
    const antesDelInicio = await reconocer(
      [
        {
          daily_number: '1201',
          weekly_number: '1202',
          lottery_code: 'bogota',
          reference_date: '2026-08-06',
          prize_title: await tituloVigente(rHistorica),
          amount: 500_000,
        },
      ],
      false,
    )
    const fila = (antesDelInicio.data as unknown as Array<Record<string, unknown>>)[0]!
    expect(fila.outcome).toBe('rechazado')
    expect(fila.problem).toMatch(/anterior al inicio operativo/)

    // Y la LECTURA tampoco la devuelve, ni con un filtro que pida más atrás.
    // Para que fuera una fila mostrable le falta su enlace al premio, y
    // fabricarlo exige desactivar los disparadores: ninguna sesión puede.
    await db.query(`set session_replication_role = replica`)
    await db.query(
      `insert into lottery_ticket_match_prizes (organization_id, raffle_id, result_id, match_id,
                                                match_field, prize_id, prize_version_id)
       select m.organization_id, m.raffle_id, m.result_id, m.id, m.match_field, $2, $3
         from lottery_ticket_matches m where m.result_id = $1`,
      [res[0]!.id, premioHistorico.prizeId, premioHistorico.versionId],
    )
    await db.query(`set session_replication_role = origin`)

    // La fila existe y es de las que el historial mostraría...
    const { rows: existe } = await db.query<{ n: string }>(
      `select count(*)::text as n from lottery_ticket_match_prizes lp
         join lottery_ticket_matches m on m.id = lp.match_id where m.ticket_id = $1`,
      [ticket],
    )
    expect(existe[0]!.n).toBe('1')

    // ...y no sale, ni pidiendo desde 2020.
    const conFiltroAmplio = await seller1.rpc('seller_prize_awards', {
      p_raffle_id: rHistorica,
      p_from: '2020-01-01',
    })
    const devueltas = (conFiltroAmplio.data as unknown as Array<Record<string, unknown>>) ?? []
    expect(devueltas.some((f) => f.matched_number === '1201')).toBe(false)
  })

  it('H11-06: la cobertura pendiente la calcula la base, y no es cero premios', async () => {
    const { data, error } = await seller1.rpc('prize_award_coverage')
    expect(error).toBeNull()
    const cobertura = (data as unknown as Array<Record<string, unknown>>)[0]!
    expect(cobertura.history_start).toBe('2026-08-09')
    // En el escenario hay sorteos jugados sin resultado confirmado: eso es
    // «pendiente de información», no «cero premios».
    expect(Number(cobertura.pending_draws)).toBeGreaterThan(0)
    expect(cobertura.pending_from).toBeTruthy()
  })
})

// =============================================================================
describe('H12 — la cobertura cuenta solo lo que pudo dar un premio (`0069`)', () => {
  // UNA SEMANA DEL TRAMO ENTRE EL INICIO OPERATIVO Y LAS DEMÁS VENTANAS. El
  // 10/08/2026 es lunes y la semana ya se jugó en cualquier corrida posterior;
  // la rifa del seed empieza siete días antes de HOY y la histórica de esta
  // suite, dos lunes antes, así que ninguna de las dos la cubre. La prueba lo
  // comprueba en vez de suponerlo.
  const SEMANA = {
    lunes: '2026-08-10',
    martes: '2026-08-11',
    miercoles: '2026-08-12',
    jueves: '2026-08-13',
    viernes: '2026-08-14',
    sabado: '2026-08-15',
  } as const

  async function rifaConEstado(
    nombre: string,
    desde: string,
    hasta: string,
    estado: 'draft' | 'active' | 'closed' | 'cancelled',
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `insert into raffles (organization_id, name, ticket_price, start_date, end_date,
                            created_by, prize_mode, status)
       values ($1, $2, $3, $4, $5, $6, 'legacy', $7)
       returning id`,
      [
        ctx.demoOrg.id,
        `${PREFIJO} cobertura ${nombre} ${stamp}`,
        PRECIO,
        desde,
        hasta,
        ctx.ids.owner,
        estado,
      ],
    )
    return rows[0]!.id
  }

  async function pendientes(): Promise<number> {
    const { data, error } = await seller1.rpc('prize_award_coverage')
    if (error) throw new Error(error.message)
    return Number((data as unknown as Array<{ pending_draws: number }>)[0]!.pending_draws)
  }

  it('H12-01: sorteos cancelados o suspendidos, y rifas que no participan, no son información pendiente', async () => {
    // Precondición: ninguna rifa de la organización que PARTICIPE —activa o
    // cerrada— cubre ya esa semana. Si alguna la cubriera, la prueba no podría
    // distinguir un recuento de otro y lo dice.
    const { rows: ajenas } = await db.query<{ name: string }>(
      `select name from raffles
        where organization_id = $1 and status in ('active', 'closed')
          and start_date <= $3 and end_date >= $2`,
      [ctx.demoOrg.id, SEMANA.lunes, SEMANA.sabado],
    )
    expect(
      ajenas.map((r) => r.name),
      'otra rifa cubre la semana de la prueba',
    ).toEqual([])

    const antes = await pendientes()

    // Una rifa ACTIVA de lunes a miércoles: el lunes se jugó y no tiene
    // resultado —eso SÍ es pendiente—; el martes se canceló y el miércoles se
    // suspendió: ninguno de los dos se jugó, así que no pudo dar ningún premio.
    await rifaConEstado('activa', SEMANA.lunes, SEMANA.miercoles, 'active')
    await programacion('cundinamarca', SEMANA.lunes)
    await programacion('cruz_roja', SEMANA.martes, 'cancelled')
    await programacion('meta', SEMANA.miercoles, 'suspended')

    // El jueves solo lo cubre una rifa en BORRADOR, y el viernes una ANULADA: el
    // motor no mira ninguna de las dos (0036, 0061), así que sus sorteos no
    // pueden dar un premio a nadie.
    await rifaConEstado('borrador', SEMANA.jueves, SEMANA.jueves, 'draft')
    await programacion('bogota', SEMANA.jueves)
    await rifaConEstado('anulada', SEMANA.viernes, SEMANA.viernes, 'cancelled')
    await programacion('medellin', SEMANA.viernes)

    // El sábado lo cubre una rifa CERRADA: participó mientras estaba activa, y
    // su sorteo sin resultado SÍ es pendiente.
    await rifaConEstado('cerrada', SEMANA.sabado, SEMANA.sabado, 'closed')
    await programacion('boyaca', SEMANA.sabado)

    // Seis sorteos nuevos y sin resultado; pendientes de verdad, dos.
    expect(await pendientes()).toBe(antes + 2)
  })

  it('H12-02: un sorteo jugado con resultado confirmado deja de estar pendiente', async () => {
    const antes = await pendientes()
    const { rows } = await db.query<{ id: string }>(
      `select id from lottery_draw_schedules
        where lottery_code = 'cundinamarca' and reference_date = $1`,
      [SEMANA.lunes],
    )
    await db.query(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, '0101', 'confirmed', 'official_page', now())`,
      [rows[0]!.id],
    )
    expect(await pendientes()).toBe(antes - 1)
  })

  it('H12-03: un sorteo ya jugado cuyo resultado entra en conflicto vuelve a contar, y su premio se queda con su importe (Etapa 3, punto A)', async () => {
    // El caso que el aviso de la pantalla tiene que poder explicar: un premio
    // reconocido de $500.000 en un sorteo YA JUGADO, cuyo resultado entra en
    // conflicto después. La base lo cuenta como pendiente —el resultado ya no
    // está `confirmed`— y el premio NO se retira ni cambia de importe (BR-J18).
    const [ticket] = await boletas(
      rHistorica,
      [{ diario: '9711', semanal: '9712', cliente: ctx.clients.beatriz.id }],
      `${boletasCreadas}T08:00:00-05:00`,
    )
    // Un sorteo que la cobertura CUENTA: jugado, programado —no cancelado ni
    // suspendido— y cubierto por una rifa que participa. Elegirlo «el primero
    // que salga» cogía a veces uno de los que H12-01 crea precisamente para NO
    // contar, y la prueba fallaba sin que nada estuviera mal (2026-09-18).
    const { rows: prog } = await db.query<{ id: string; lottery_code: Loteria; d: string }>(
      `select s.id, s.lottery_code, s.reference_date::text as d from lottery_draw_schedules s
        where s.draw_number like 'E1H-%'
          and s.reference_date < (now() at time zone 'America/Bogota')::date
          and s.reference_date >= prize_award_history_start()
          and s.schedule_status = 'scheduled'
          and s.official_scheduled_at < now()
          and not exists (select 1 from lottery_results r where r.schedule_id = s.id)
          and exists (select 1 from raffles ra
                       where ra.organization_id = $1 and ra.status in ('active', 'closed')
                         and s.reference_date between ra.start_date and ra.end_date)
        order by s.reference_date, s.lottery_code, s.draw_number
        limit 1`,
      [ctx.demoOrg.id],
    )
    expect(prog, 'no queda ningún sorteo jugado que la cobertura cuente').toHaveLength(1)
    const antesDeConfirmar = await pendientes()
    const { rows: res } = await db.query<{ id: string }>(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, '9711', 'confirmed', 'official_page', now()) returning id`,
      [prog[0]!.id],
    )
    // La prueba de que la cobertura lo cuenta: al confirmarse, deja de estar pendiente.
    expect(await pendientes(), 'el sorteo elegido tiene que contar en la cobertura').toBe(
      antesDeConfirmar - 1,
    )
    await fotografiar(res[0]!.id, ticket!, 'daily_number', '9711')
    const { rows: carga } = await db.query<{ outcome: string }>(
      `select outcome from record_declared_prize_awards($1, $2, $3::jsonb, true)`,
      [
        ctx.demoOrg.id,
        RESPALDO,
        JSON.stringify([
          {
            daily_number: '9711',
            weekly_number: '9712',
            lottery_code: prog[0]!.lottery_code,
            reference_date: prog[0]!.d,
            prize_title: await tituloVigente(rHistorica),
            amount: 500_000,
          },
        ]),
      ],
    )
    expect(carga[0]!.outcome).toBe('reconocido')

    const totales = async () => {
      const { data, error } = await seller1.rpc('seller_prize_award_totals', {
        p_raffle_id: rHistorica,
      })
      if (error) throw new Error(error.message)
      const t = (data as unknown as Array<{ prizes_count: number; known_amount: number }>)[0]!
      return { prizes: Number(t.prizes_count), money: Number(t.known_amount) }
    }
    const antesPendientes = await pendientes()
    const antesTotales = await totales()

    // Una fuente posterior trae otro número: el disparador lo marca (BR-L08).
    await db.query(`update lottery_results set winning_number = '9713' where id = $1`, [res[0]!.id])
    const { rows: estado } = await db.query<{ validation_status: string; winning_number: string }>(
      `select validation_status::text, winning_number from lottery_results where id = $1`,
      [res[0]!.id],
    )
    expect(estado[0]).toEqual({ validation_status: 'conflict', winning_number: '9711' })

    // Cuenta como pendiente…
    expect(await pendientes()).toBe(antesPendientes + 1)
    // …y el premio sigue, con su importe, marcado: los totales no se mueven.
    expect(await totales()).toEqual(antesTotales)
    const { data: filas, error } = await seller1.rpc('seller_prize_awards', {
      p_raffle_id: rHistorica,
      p_limit: 1000,
    })
    if (error) throw new Error(error.message)
    const suya = (
      filas as unknown as Array<{
        daily_number: string
        result_conflict: boolean
        known_amount: number
        origin: string
      }>
    ).find((f) => f.daily_number === '9711')
    expect(suya).toMatchObject({ result_conflict: true, origin: 'declared' })
    expect(Number(suya!.known_amount)).toBe(500_000)
  })
})

// =============================================================================
// H13 — la matriz de acceso, por PostgREST y con sesiones reales (Etapa 3)
// =============================================================================

describe('H13 — la matriz de acceso, por PostgREST y con sesiones reales (Etapa 3)', () => {
  // CADA PERSONA CONTRA CADA SUPERFICIE del historial, todo por PostgREST con la
  // sesión de esa persona: es lo que puede hacer un navegador que conoce las
  // direcciones. Nada se mide como `postgres`, que se salta la RLS; `db` solo
  // prepara el escenario y calcula, aparte, lo que cada uno DEBERÍA recibir.
  //
  // Sus propias cuentas —un vendedor que se desactiva y otro que pasa a
  // Administrador—, cada una con un premio reconocido de su cliente, por lo
  // mismo que H9: ascender a una cuenta del seed es irreversible en sus avisos.
  const inactivoEmail = `hist-aud-inactivo-${stamp}@demo.test`
  const ascendidoEmail = `hist-aud-ascendido-${stamp}@demo.test`
  let inactivoId = ''
  let ascendidoId = ''
  const ALEATORIO = '5b9d7c1e-2f4a-4c3b-9d8e-7a6f5e4d3c2b'

  async function vendedorConPremio(
    email: string,
    nombre: string,
    cliente: string,
    diario: string,
    semanal: string,
  ): Promise<string> {
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: nombre, phone: '3001234567' },
    })
    if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
    const id = data.user.id
    const { error: membresia } = await svc
      .from('memberships')
      .insert({ organization_id: ctx.demoOrg.id, profile_id: id, role: 'seller' })
    if (membresia) throw membresia

    const { rows: c } = await db.query<{ id: string }>(
      `insert into clients (organization_id, seller_id, name, phone)
       values ($1, $2, $3, '3009990101') returning id`,
      [ctx.demoOrg.id, id, cliente],
    )
    const { rows: tk } = await db.query<{ id: string }>(
      `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                            weekly_number, inventory_status, created_at)
       values ($1, $2, $3, $4, $5, $6, 'available', $7) returning id`,
      [
        ctx.demoOrg.id,
        rHistorica,
        id,
        ctx.ids.owner,
        diario,
        semanal,
        `${boletasCreadas}T08:00:00-05:00`,
      ],
    )
    await db.query(
      `update tickets set client_id = $2, inventory_status = 'assigned', sale_price = $3,
              sale_date = $4::date, assigned_at = $5 where id = $1`,
      [tk[0]!.id, c[0]!.id, PRECIO, boletasCreadas, `${boletasCreadas}T08:00:00-05:00`],
    )
    const { rows: prog } = await db.query<{ id: string; lottery_code: Loteria; d: string }>(
      `select s.id, s.lottery_code, s.reference_date::text as d from lottery_draw_schedules s
        where s.draw_number like 'E1H-%'
          and s.reference_date < (now() at time zone 'America/Bogota')::date
          and not exists (select 1 from lottery_results r where r.schedule_id = s.id)
        limit 1`,
    )
    const { rows: res } = await db.query<{ id: string }>(
      `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
       values ($1, $2, 'confirmed', 'official_page', now()) returning id`,
      [prog[0]!.id, diario],
    )
    await fotografiar(res[0]!.id, tk[0]!.id, 'daily_number', diario)
    const { error: carga } = await reconocer([
      {
        daily_number: diario,
        weekly_number: semanal,
        lottery_code: prog[0]!.lottery_code,
        reference_date: prog[0]!.d,
        prize_title: await tituloVigente(rHistorica),
        amount: 500_000,
      },
    ])
    if (carga) throw new Error(carga.message)
    return id
  }

  beforeAll(async () => {
    inactivoId = await vendedorConPremio(
      inactivoEmail,
      'Auditoría Inactivo',
      `Cliente auditoria inactivo ${stamp}`,
      '9621',
      '9622',
    )
    ascendidoId = await vendedorConPremio(
      ascendidoEmail,
      'Auditoría Ascendido',
      `Cliente auditoria ascendido ${stamp}`,
      '9631',
      '9632',
    )
    await db.query(
      `update memberships set is_active = false where profile_id = $1 and organization_id = $2`,
      [inactivoId, ctx.demoOrg.id],
    )
    await db.query(
      `update memberships set role = 'admin' where profile_id = $1 and organization_id = $2`,
      [ascendidoId, ctx.demoOrg.id],
    )
  })

  type Respuesta = { data: unknown; error: { message: string; code?: string } | null }
  type Filas = Array<Record<string, unknown>>
  const filas = (r: Respuesta): Filas => (Array.isArray(r.data) ? (r.data as Filas) : [])

  /** Todo lo que una sesión puede pedir del historial, en una pasada. */
  async function barrido(c: Client) {
    return {
      sellerFilas: await c.rpc('seller_prize_awards', { p_limit: 1000 }),
      sellerTotales: await c.rpc('seller_prize_award_totals', {}),
      adminFilas: await c.rpc('admin_prize_awards', { p_limit: 1000 }),
      adminTotales: await c.rpc('admin_prize_award_totals', {}),
      adminVendedores: await c.rpc('admin_prize_award_sellers'),
      cobertura: await c.rpc('prize_award_coverage'),
      inicio: await c.rpc('prize_award_history_start'),
      fotos: await c
        .from('lottery_ticket_matches')
        .select('id, seller_id, client_id, organization_id'),
      enlaces: await c.from('lottery_ticket_match_prizes').select('id, match_id, organization_id'),
      declarados: await c.from('declared_prize_awards').select('id, match_id, organization_id'),
    } satisfies Record<string, Respuesta>
  }

  /** Lo que la base TIENE, leído aparte como `postgres`, para comparar. */
  async function verdad() {
    const { rows: premios } = await db.query<{
      award_key: string
      seller_id: string
      client_id: string
    }>(`select award_key, seller_id, client_id from prize_award_rows(array[$1::uuid])`, [
      ctx.demoOrg.id,
    ])
    const { rows: fotos } = await db.query<{ id: string; seller_id: string }>(
      `select id, seller_id from lottery_ticket_matches where organization_id = $1`,
      [ctx.demoOrg.id],
    )
    const { rows: clientes } = await db.query<{ id: string; name: string }>(
      `select id, name from clients where id = any ($1::uuid[])`,
      [[...new Set(premios.map((p) => p.client_id))]],
    )
    return { premios, fotos, clientes }
  }

  const claves = (r: Respuesta) => filas(r).map((f) => String(f.award_key))

  it('H13-01: cada persona recibe lo suyo por cada lectura y cada tabla, y nada más', async () => {
    const v = await verdad()
    const premiosDe = (sellerId: string) =>
      v.premios
        .filter((p) => p.seller_id === sellerId)
        .map((p) => p.award_key)
        .sort()
    const fotosDe = (sellerId: string) =>
      v.fotos.filter((f) => f.seller_id === sellerId).map((f) => f.id)
    const todasLasClaves = v.premios.map((p) => p.award_key).sort()
    const todasLasFotos = new Set(v.fotos.map((f) => f.id))
    expect(
      premiosDe(ctx.ids.seller1).length,
      'el vendedor 1 tiene premios en esta suite',
    ).toBeGreaterThan(0)

    // El vendedor PROPIO: todo lo suyo por su lectura, nada por la del personal,
    // y por las tablas solo sus fotografías.
    const propio = await barrido(seller1)
    expect(claves(propio.sellerFilas).sort()).toEqual(premiosDe(ctx.ids.seller1))
    expect(filas(propio.adminFilas)).toEqual([])
    expect(Number(filas(propio.adminTotales)[0]?.prizes_count ?? -1)).toBe(0)
    expect(filas(propio.adminVendedores)).toEqual([])
    expect(propio.cobertura.error).toBeNull()
    expect(filas(propio.fotos).map((f) => f.seller_id)).toEqual(
      filas(propio.fotos).map(() => ctx.ids.seller1),
    )
    expect(
      filas(propio.fotos)
        .map((f) => f.id)
        .sort(),
    ).toEqual(fotosDe(ctx.ids.seller1).sort())
    const fotosPropias = new Set(fotosDe(ctx.ids.seller1))
    for (const e of [...filas(propio.enlaces), ...filas(propio.declarados)]) {
      expect(fotosPropias.has(String(e.match_id))).toBe(true)
    }

    // OTRO vendedor de la misma organización: ni un premio ni una fotografía del
    // vendedor 1.
    const otro = await barrido(seller2)
    expect(claves(otro.sellerFilas).sort()).toEqual(premiosDe(ctx.ids.seller2))
    for (const f of filas(otro.fotos)) expect(f.seller_id).toBe(ctx.ids.seller2)
    for (const e of [...filas(otro.enlaces), ...filas(otro.declarados)]) {
      expect(fotosPropias.has(String(e.match_id))).toBe(false)
    }

    // El PERSONAL —Dueño, Administrador y quien pasó a Administrador—: el
    // historial entero por su proyección, sin cliente, y NADA por las tablas ni
    // por la lectura del vendedor.
    const administrador = await signInAs(USERS.admin)
    const ascendido = await signInAs(ascendidoEmail)
    for (const [quien, sesion] of [
      ['Dueño', owner],
      ['Administrador', administrador],
      ['ascendido', ascendido],
    ] as const) {
      const b = await barrido(sesion)
      expect(claves(b.adminFilas).sort(), quien).toEqual(todasLasClaves)
      expect(Number(filas(b.adminTotales)[0]!.prizes_count), quien).toBe(todasLasClaves.length)
      expect(filas(b.sellerFilas), quien).toEqual([])
      expect(Number(filas(b.sellerTotales)[0]?.prizes_count ?? 0), quien).toBe(0)
      expect(filas(b.fotos), quien).toEqual([])
      expect(filas(b.enlaces), quien).toEqual([])
      expect(filas(b.declarados), quien).toEqual([])
      const vendedores = filas(b.adminVendedores).map((f) => f.seller_id)
      expect(vendedores, quien).toEqual(
        expect.arrayContaining([ctx.ids.seller1, inactivoId, ascendidoId]),
      )
      // Ni el identificador ni el nombre de un cliente con premio, en NINGUNA
      // de las respuestas: ni en las filas, ni en los totales, ni en los errores.
      const texto = JSON.stringify(b)
      for (const c of v.clientes) {
        expect(texto, `${quien} recibió el cliente ${c.name}`).not.toContain(c.id)
        expect(texto, `${quien} recibió el cliente ${c.name}`).not.toContain(c.name)
      }
      for (const fila of filas(b.adminFilas)) {
        expect(
          Object.keys(fila).filter((k) => /client/i.test(k)),
          quien,
        ).toEqual([])
      }
    }

    // OTRA organización, y las cuentas que ya no pueden: nada de ésta.
    const otraOrgVendedor = await signInAs(USERS.otherOrgSeller)
    const inactivo = await signInAs(inactivoEmail)
    for (const [quien, sesion] of [
      ['otra organización (Dueño)', otherOrgOwner],
      ['otra organización (vendedor)', otraOrgVendedor],
      ['vendedor desactivado', inactivo],
    ] as const) {
      const b = await barrido(sesion)
      const recibidas = [...claves(b.sellerFilas), ...claves(b.adminFilas)]
      expect(
        recibidas.filter((k) => todasLasClaves.includes(k)),
        quien,
      ).toEqual([])
      for (const tabla of [b.fotos, b.enlaces, b.declarados]) {
        expect(
          filas(tabla).filter(
            (f) => todasLasFotos.has(String(f.id)) || todasLasFotos.has(String(f.match_id)),
          ),
          quien,
        ).toEqual([])
        for (const f of filas(tabla)) expect(f.organization_id, quien).not.toBe(ctx.demoOrg.id)
      }
      const vendedores = filas(b.adminVendedores).map((f) => f.seller_id)
      expect(
        vendedores.filter((id) => [ctx.ids.seller1, inactivoId, ascendidoId].includes(String(id))),
        quien,
      ).toEqual([])
      const texto = JSON.stringify(b)
      for (const c of v.clientes) expect(texto, `${quien} recibió ${c.name}`).not.toContain(c.id)
    }
    // El desactivado, además, no ve NADA de ninguna lectura.
    const b = await barrido(inactivo)
    expect(filas(b.sellerFilas)).toEqual([])
    expect(filas(b.adminFilas)).toEqual([])
    expect(filas(b.fotos)).toEqual([])
  })

  it('H13-02: `anon` no alcanza ninguna lectura ni ninguna tabla del historial', async () => {
    const b = await barrido(anonClient())
    for (const [superficie, r] of Object.entries(b)) {
      expect(r.error, `anon alcanzó ${superficie}`).not.toBeNull()
      expect(filas(r), superficie).toEqual([])
    }
  })

  it('H13-03: las funciones internas y el cargador no se alcanzan desde ninguna sesión', async () => {
    const administrador = await signInAs(USERS.admin)
    const { rows: res } = await db.query<{ id: string }>(
      `select r.id from lottery_results r
         join lottery_ticket_matches m on m.result_id = r.id
        where m.organization_id = $1 limit 1`,
      [ctx.demoOrg.id],
    )
    const llamadas: Array<[string, Record<string, unknown>]> = [
      ['prize_award_rows', { p_org_ids: [ctx.demoOrg.id] }],
      ['declared_prize_award_plan', { p_organization_id: ctx.demoOrg.id, p_awards: [] }],
      [
        'record_declared_prize_awards',
        { p_organization_id: ctx.demoOrg.id, p_basis: RESPALDO, p_awards: [], p_apply: false },
      ],
      ['match_lottery_result', { p_result_id: res[0]!.id }],
    ]
    for (const [quien, sesion] of [
      ['vendedor', seller1],
      ['Dueño', owner],
      ['Administrador', administrador],
      ['anon', anonClient()],
    ] as const) {
      for (const [funcion, argumentos] of llamadas) {
        const { data, error } = await sesion.rpc(funcion as never, argumentos as never)
        expect(error, `${quien} ejecutó ${funcion}`).not.toBeNull()
        expect(data, `${quien} recibió datos de ${funcion}`).toBeNull()
      }
    }
  })

  it('H13-04: ninguna sesión escribe las tablas del historial, ni siquiera el personal', async () => {
    const cuenta = async () =>
      (
        await db.query<{ t: string; n: number }>(
          `select 'm' as t, count(*)::int as n from lottery_ticket_matches
           union all select 'p', count(*)::int from lottery_ticket_match_prizes
           union all select 'd', count(*)::int from declared_prize_awards
           union all select 'dv', count(*)::int from declared_prize_awards where voided_at is not null`,
        )
      ).rows
    const antes = await cuenta()
    const { rows: una } = await db.query<{ id: string; match_id: string; organization_id: string }>(
      `select id, match_id, organization_id from declared_prize_awards where organization_id = $1 limit 1`,
      [ctx.demoOrg.id],
    )
    const d = una[0]!
    for (const [quien, sesion] of [
      ['vendedor', seller1],
      ['Dueño', owner],
    ] as const) {
      const intentos = [
        await sesion.from('declared_prize_awards').insert({
          organization_id: d.organization_id,
          match_id: d.match_id,
        } as never),
        await sesion
          .from('declared_prize_awards')
          .update({ voided_at: new Date().toISOString(), void_reason: 'intento' } as never)
          .eq('id', d.id),
        await sesion.from('declared_prize_awards').delete().eq('id', d.id),
        await sesion.from('lottery_ticket_matches').delete().eq('id', d.match_id),
        await sesion
          .from('lottery_ticket_matches')
          .update({ matched_number: '0000' } as never)
          .eq('id', d.match_id),
        await sesion.from('lottery_ticket_match_prizes').delete().eq('match_id', d.match_id),
      ]
      for (const intento of intentos) expect(intento.error, quien).not.toBeNull()
    }
    expect(await cuenta()).toEqual(antes)
  })

  it('H13-05: un identificador ajeno responde EXACTAMENTE como uno que no existe', async () => {
    const { rows: ajenos } = await db.query<{ cliente: string }>(
      `select id as cliente from clients where organization_id = $1 and seller_id = $2 limit 1`,
      [ctx.demoOrg.id, ctx.ids.seller2],
    )
    const clienteDeOtro = ajenos[0]!.cliente
    const igual = async (a: PromiseLike<Respuesta>, b: PromiseLike<Respuesta>, que: string) => {
      const [x, y] = await Promise.all([a, b])
      expect(JSON.stringify({ d: x.data, e: x.error }), que).toBe(
        JSON.stringify({ d: y.data, e: y.error }),
      )
    }
    // El vendedor, pidiendo el cliente de OTRO vendedor, la rifa de OTRA
    // organización.
    await igual(
      seller1.rpc('seller_prize_awards', { p_client_id: clienteDeOtro }),
      seller1.rpc('seller_prize_awards', { p_client_id: ALEATORIO }),
      'cliente ajeno en la lista del vendedor',
    )
    await igual(
      seller1.rpc('seller_prize_award_totals', { p_client_id: clienteDeOtro }),
      seller1.rpc('seller_prize_award_totals', { p_client_id: ALEATORIO }),
      'cliente ajeno en los totales del vendedor',
    )
    await igual(
      seller1.rpc('seller_prize_awards', { p_raffle_id: ctx.controlRaffle.id }),
      seller1.rpc('seller_prize_awards', { p_raffle_id: ALEATORIO }),
      'rifa de otra organización para el vendedor',
    )
    // El personal, pidiendo al vendedor y la rifa de OTRA organización.
    await igual(
      owner.rpc('admin_prize_awards', { p_seller_id: ctx.ids.otherOrgSeller }),
      owner.rpc('admin_prize_awards', { p_seller_id: ALEATORIO }),
      'vendedor de otra organización en la lista del personal',
    )
    await igual(
      owner.rpc('admin_prize_award_totals', { p_seller_id: ctx.ids.otherOrgSeller }),
      owner.rpc('admin_prize_award_totals', { p_seller_id: ALEATORIO }),
      'vendedor de otra organización en los totales del personal',
    )
    await igual(
      owner.rpc('admin_prize_awards', { p_raffle_id: ctx.controlRaffle.id }),
      owner.rpc('admin_prize_awards', { p_raffle_id: ALEATORIO }),
      'rifa de otra organización para el personal',
    )
  })

  it('H13-06: un plan reutilizado no le abre `prize_award_history_start` a `anon` (`0071`)', async () => {
    // Lo que hacía PostgREST con sus sentencias preparadas, reproducido sin él:
    // un plan GENÉRICO preparado por una sesión con permiso y ejecutado después
    // como `anon`. Con la función inmutable, el plan ya traía la fecha plegada y
    // nadie volvía a comprobar el permiso.
    const conexion = new PgClient({ connectionString: DB_URL })
    await conexion.connect()
    try {
      await conexion.query('set plan_cache_mode = force_generic_plan')
      await conexion.query('begin')
      await conexion.query('set local role authenticated')
      await conexion.query('prepare inicio_h13 as select prize_award_history_start()::text as d')
      const { rows } = await conexion.query<{ d: string }>('execute inicio_h13')
      expect(rows[0]!.d).toBe('2026-08-09')
      await conexion.query('set local role anon')
      await expect(conexion.query('execute inicio_h13')).rejects.toThrow(
        /permission denied for function prize_award_history_start/,
      )
    } finally {
      await conexion.query('rollback').catch(() => {})
      await conexion.end()
    }
  })
})
