/**
 * El historial de premios ganados CON VOLUMEN — auditoría de la Etapa 3 (D-208).
 *
 * MILES DE BOLETAS Y CIENTOS DE PREMIOS, montados por los caminos de verdad —el
 * motor configurable, la transición y el cargador— y comparados con lo que se
 * CALCULA AQUÍ, en TypeScript, a partir del propio escenario: qué boletas
 * coinciden con cada resultado, qué premio aplica y con qué versión, la
 * prioridad de cuatro cifras por cliente, qué boletas estaban vendidas a
 * tiempo, y el valor cierto y el pendiente de cada premio. Ninguna expectativa
 * sale de `prize_award_rows` ni de las cuatro lecturas: si la base sumara,
 * paginara u ordenara distinto, esta suite lo dice.
 *
 * DATOS REPRODUCIBLES: un generador pseudoaleatorio con SEMILLA FIJA elige los
 * números de las boletas, sus clientes y los resultados, así que cada corrida
 * monta exactamente el mismo escenario.
 *
 * DOS RIFAS, por lo mismo que la suite del historial:
 *
 *   * VOLUMEN (configurable, 2089, lejos de las demás suites): 3.000 boletas de
 *     cuatro vendedores —dos del seed, uno que se desactiva y otro que pasa a
 *     Administrador—, 600 clientes y diez semanas de sorteos. Cinco premios:
 *     diario de cuatro cifras (con una VERSIÓN NUEVA a mitad de camino), tres
 *     cifras, dinero y especie, alternativas y solo especie. Al final se CIERRA.
 *   * RECONOCIDA (heredada y transformada, sorteos YA JUGADOS): coincidencias
 *     del sistema de siempre que el negocio reconoce con el cargador —dinero,
 *     especie, las dos cosas, y una anulada y vuelta a reconocer—.
 *
 * Y lo que el historial tiene que conservar: resultados que entran en
 * conflicto, números cambiados después del sorteo, boletas libres y asignadas
 * tarde que NO son premios, un vendedor desactivado y otro con otro rol.
 *
 * SOLO LOCAL. Se limpia por prefijo al empezar y al terminar.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DB_URL,
  loadSeedContext,
  SEED_PASSWORD,
  serviceClient,
  signInAs,
  USERS,
  type Client,
} from './helpers'

type Loteria = 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'

const PREFIJO = 'E3 volumen'
const SORTEO = 'VOL-'
const CORREO = 'vol-'
const PRECIO = 120_000
const stamp = Date.now().toString(36)
const RESPALDO = 'Confirmación del Dueño, prueba de volumen del historial de premios ganados.'

/** El orden del enum `lottery_code`, que es el que usa `order by` en la base. */
const ORDEN_LOTERIA: Loteria[] = [
  'cundinamarca',
  'cruz_roja',
  'meta',
  'bogota',
  'medellin',
  'boyaca',
]
/** El día de la semana, contando desde el lunes, en que juega cada lotería (BR-L01). */
const NOMINAL: Record<Loteria, number> = {
  cundinamarca: 0,
  cruz_roja: 1,
  meta: 2,
  bogota: 3,
  medellin: 4,
  boyaca: 5,
}

// -----------------------------------------------------------------------------
// Generador con semilla (mulberry32): mismo escenario en cada corrida.
// -----------------------------------------------------------------------------
function generador(semilla: number) {
  let a = semilla >>> 0
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    entero: (n: number) => Math.floor(siguiente() * n),
    cuatro: () => String(Math.floor(siguiente() * 10_000)).padStart(4, '0'),
  }
}

function masDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + dias, 12)).toISOString().slice(0, 10)
}

function primerLunes(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const dow = new Date(Date.UTC(y!, m! - 1, d!, 12)).getUTCDay()
  return masDias(fecha, (8 - dow) % 7)
}

// -----------------------------------------------------------------------------
// El modelo: lo que el historial DEBE decir, calculado aquí.
// -----------------------------------------------------------------------------

type Premio = {
  clave: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
  titulo: string
  campo: 'daily_number' | 'weekly_number'
  cifras: 'four' | 'last_three'
  modo: 'fixed' | 'winner_choice'
}

type Boleta = {
  id: string
  diario: string
  semanal: string
  vendedor: string
  cliente: string | null
  /** `vendida` antes de todos los sorteos, `tarde` después de todos, o `libre`. */
  estado: 'vendida' | 'tarde' | 'libre'
}

type Fila = {
  origen: 'engine' | 'declared'
  fecha: string
  loteria: Loteria
  rifa: string
  vendedor: string
  cliente: string
  diario: string
  semanal: string
  campo: 'daily_number' | 'weekly_number'
  jugado: string
  titulo: string
  dinero: number | null
  pendiente: boolean
  conflicto: boolean
  cambiado: boolean
}

type Totales = { prizes: number; clients: number; knownAmount: number; valuePending: number }

function totalesDe(filas: Fila[]): Totales {
  return {
    prizes: filas.length,
    clients: new Set(filas.map((f) => f.cliente)).size,
    knownAmount: filas.reduce((s, f) => s + (f.dinero ?? 0), 0),
    valuePending: filas.filter((f) => f.pendiente).length,
  }
}

/** Una fila en texto, para comparar conjuntos sin depender del identificador interno. */
function huella(f: {
  fecha: string
  loteria: string
  diario: string
  semanal: string
  campo: string
  jugado: string
  titulo: string
  dinero: number | null
  pendiente: boolean
  conflicto: boolean
  cambiado: boolean
  origen: string
}): string {
  return [
    f.origen,
    f.fecha,
    f.loteria,
    f.diario,
    f.semanal,
    f.campo,
    f.jugado,
    f.titulo,
    f.dinero ?? '-',
    f.pendiente,
    f.conflicto,
    f.cambiado,
  ].join('|')
}

// -----------------------------------------------------------------------------

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient
let svc: Client
let owner: Client
let seller1: Client
let seller2: Client
let secuencia = 0

let rVolumen = ''
let rReconocida = ''
let vInactivo = ''
let vAscendido = ''
const modelo: Fila[] = []
const clientesPorVendedor = new Map<string, string[]>()
/** Cuántas veces el escenario ejercita lo que el modelo tiene que saber hacer. */
const ejercicio = { descartadasPorPrioridad: 0, noVendidas: 0 }

async function limpiar(): Promise<void> {
  const rifas = `${PREFIJO}%`
  await db.query(`set session_replication_role = replica`)
  for (const tabla of [
    'declared_prize_awards',
    'lottery_ticket_match_prizes',
    'lottery_ticket_matches',
  ]) {
    await db.query(
      `delete from ${tabla} where raffle_id in (select id from raffles where name like $1)`,
      [rifas],
    )
  }
  await db.query(
    `delete from lottery_results where schedule_id in
       (select id from lottery_draw_schedules where draw_number like $1)`,
    [`${SORTEO}%`],
  )
  await db.query(`delete from lottery_draw_schedules where draw_number like $1`, [`${SORTEO}%`])
  await db.query(`delete from audit_logs where entity_type = 'declared_prize_award'`)
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
  await db.query(
    `delete from notifications where entity_id in (select id from raffles where name like $1)`,
    [rifas],
  )
  await db.query(`delete from clients where name like $1`, [`${PREFIJO}%`])
  await db.query(
    `delete from notifications where recipient_profile_id in
       (select id from profiles where email like $1)`,
    [`${CORREO}%@demo.test`],
  )
  await db.query(
    `delete from memberships where profile_id in (select id from profiles where email like $1)`,
    [`${CORREO}%@demo.test`],
  )
  await db.query(`delete from auth.users where email like $1`, [`${CORREO}%@demo.test`])
  await db.query(`delete from raffles where name like $1`, [rifas])
  await db.query(`set session_replication_role = origin`)
}

async function programacion(loteria: Loteria, fecha: string): Promise<string> {
  secuencia += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                         original_scheduled_at, official_scheduled_at, schedule_status)
     values ($1, $2, $3, $4, $4, 'scheduled') returning id`,
    [loteria, `${SORTEO}${stamp}-${secuencia}`, fecha, `${fecha}T22:30:00-05:00`],
  )
  return rows[0]!.id
}

async function resultado(scheduleId: string, mayor: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
     values ($1, $2, 'confirmed', 'official_page', now()) returning id`,
    [scheduleId, mayor],
  )
  return rows[0]!.id
}

async function motor(resultId: string): Promise<void> {
  await db.query('select match_lottery_result($1)', [resultId])
}

async function vendedorPropio(etiqueta: string, nombre: string): Promise<string> {
  const email = `${CORREO}${etiqueta}-${stamp}@demo.test`
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: nombre, phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
  const { error: membresia } = await svc
    .from('memberships')
    .insert({ organization_id: ctx.demoOrg.id, profile_id: data.user.id, role: 'seller' })
  if (membresia) throw membresia
  return data.user.id
}

/** Crea los clientes de un vendedor de una sola vez y devuelve sus identificadores. */
async function clientesDe(vendedor: string, cuantos: number, desde: number): Promise<string[]> {
  const nombres = Array.from(
    { length: cuantos },
    (_, i) => `${PREFIJO} cliente ${desde + i} ${stamp}`,
  )
  const { rows } = await db.query<{ id: string }>(
    `insert into clients (organization_id, seller_id, name, phone)
     select $1, $2, n, '3009990000' from unnest($3::text[]) with ordinality as x(n, o)
     order by o
     returning id`,
    [ctx.demoOrg.id, vendedor, nombres],
  )
  return rows.map((r) => r.id)
}

/**
 * Inserta boletas en bloque —disponibles— y después vende las que tienen
 * cliente, con la fecha que diga su estado. Devuelve sus identificadores en el
 * mismo orden.
 */
async function insertarBoletas(
  raffleId: string,
  filas: Array<Omit<Boleta, 'id'>>,
  creada: string,
  vendida: string,
  tarde: string,
): Promise<string[]> {
  const { rows } = await db.query<{ id: string; o: string }>(
    `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                          weekly_number, inventory_status, created_at)
     select $1, $2, x.vendedor, $3, x.diario, x.semanal, 'available', $4
       from unnest($5::uuid[], $6::text[], $7::text[]) with ordinality as x(vendedor, diario, semanal, o)
     returning id, daily_number || '/' || weekly_number as o`,
    [
      ctx.demoOrg.id,
      raffleId,
      ctx.ids.owner,
      creada,
      filas.map((f) => f.vendedor),
      filas.map((f) => f.diario),
      filas.map((f) => f.semanal),
    ],
  )
  const porPar = new Map(rows.map((r) => [r.o, r.id]))
  const ids = filas.map((f) => porPar.get(`${f.diario}/${f.semanal}`)!)
  const vendidas = filas.map((f, i) => ({ f, id: ids[i]! })).filter(({ f }) => f.cliente !== null)
  await db.query(
    `update tickets t
        set client_id = x.cliente, inventory_status = 'assigned', sale_price = $1,
            sale_date = (x.cuando at time zone 'America/Bogota')::date, assigned_at = x.cuando
       from unnest($2::uuid[], $3::uuid[], $4::timestamptz[]) as x(id, cliente, cuando)
      where t.id = x.id`,
    [
      PRECIO,
      vendidas.map((v) => v.id),
      vendidas.map((v) => v.f.cliente),
      vendidas.map((v) => (v.f.estado === 'tarde' ? tarde : vendida)),
    ],
  )
  return ids
}

// -----------------------------------------------------------------------------
// El escenario
// -----------------------------------------------------------------------------

beforeAll(async () => {
  ctx = await loadSeedContext()
  svc = serviceClient()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  owner = await signInAs(USERS.owner)
  seller1 = await signInAs(USERS.seller1)
  seller2 = await signInAs(USERS.seller2)
  await limpiar()

  const azar = generador(20_260_918)

  // --- Personas -------------------------------------------------------------
  vInactivo = await vendedorPropio('inactivo', 'Volumen Inactivo')
  vAscendido = await vendedorPropio('ascendido', 'Volumen Ascendido')
  const reparto: Array<[string, number]> = [
    [ctx.ids.seller1, 240],
    [ctx.ids.seller2, 180],
    [vInactivo, 90],
    [vAscendido, 90],
  ]
  let desde = 0
  for (const [vendedor, cuantos] of reparto) {
    clientesPorVendedor.set(vendedor, await clientesDe(vendedor, cuantos, desde))
    desde += cuantos
  }
  const todosLosClientes = [...clientesPorVendedor.entries()].flatMap(([v, cs]) =>
    cs.map((c) => ({ vendedor: v, cliente: c })),
  )

  // --- Rifa VOLUMEN: configurable, diez semanas de 2089 ---------------------
  const lunes0 = primerLunes('2089-03-01')
  const semana = (w: number) => masDias(lunes0, 7 * w)
  const inicioV = masDias(lunes0, -7)
  const finV = masDias(semana(9), 12)
  const nombreV = `${PREFIJO} motor ${stamp}`
  const { rows: rv } = await db.query<{ id: string }>(
    `insert into raffles (organization_id, name, ticket_price, start_date, end_date,
                          created_by, prize_mode, status)
     values ($1, $2, $3, $4, $5, $6, 'configurable', 'draft') returning id`,
    [ctx.demoOrg.id, nombreV, PRECIO, inicioV, finV, ctx.ids.owner],
  )
  rVolumen = rv[0]!.id

  // El martes de la semana 4 juega el principal; el sábado de la semana 7, la
  // sorpresa. Los otros premios con la MISMA firma se lo saltan (BR-J08).
  const martesPrincipal = masDias(semana(4), 1)
  const sabadoSorpresa = masDias(semana(7), 5)
  const regla = (inicio: string, fin: string, dias: number[]) => ({
    start_date: inicio,
    end_date: fin,
    weekdays: dias,
    lottery_mode: 'corresponding',
    lottery_code: null,
  })
  const reglasDiario = [
    regla(semana(0), semana(4), [1, 2, 3, 4, 5]),
    regla(masDias(semana(4), 2), masDias(semana(9), 4), [1, 2, 3, 4, 5]),
  ]
  const premios: Record<Premio['clave'], Premio & { id: string; version: string }> = {} as never
  const crear = async (
    p: Premio,
    categoria: 'main' | 'daily' | 'weekly' | 'special',
    opciones: Array<{ description: string | null; amount: number | null }>,
    reglas: Array<Record<string, unknown>>,
  ) => {
    const { data, error } = await owner.rpc('create_raffle_prize', {
      p_raffle_id: rVolumen,
      p_title: p.titulo,
      p_category: categoria,
      p_reward_mode: p.modo,
      p_reward_options: opciones,
      p_number_field: p.campo,
      p_digits: p.cifras,
      p_rules: reglas as never,
    })
    if (error) throw new Error(`No se pudo crear «${p.titulo}»: ${error.message}`)
    const fila = (data as unknown as Array<{ prize_id: string; version_id: string }>)[0]!
    premios[p.clave] = { ...p, id: fila.prize_id, version: fila.version_id }
  }
  const P = {
    P1: {
      clave: 'P1',
      titulo: 'Premio diario',
      campo: 'daily_number',
      cifras: 'four',
      modo: 'fixed',
    },
    P2: {
      clave: 'P2',
      titulo: 'Premio de tres cifras',
      campo: 'daily_number',
      cifras: 'last_three',
      modo: 'fixed',
    },
    P3: {
      clave: 'P3',
      titulo: 'Premio fin de semana',
      campo: 'weekly_number',
      cifras: 'four',
      modo: 'fixed',
    },
    P4: {
      clave: 'P4',
      titulo: 'Premio principal',
      campo: 'daily_number',
      cifras: 'four',
      modo: 'winner_choice',
    },
    P5: {
      clave: 'P5',
      titulo: 'Premio sorpresa',
      campo: 'weekly_number',
      cifras: 'four',
      modo: 'fixed',
    },
  } as const satisfies Record<string, Premio>
  await crear(P.P1, 'daily', [{ description: null, amount: 500_000 }], reglasDiario)
  await crear(
    P.P2,
    'special',
    [{ description: null, amount: 1_000_000 }],
    [regla(semana(0), masDias(semana(9), 4), [1, 2, 3, 4, 5])],
  )
  await crear(
    P.P3,
    'weekly',
    [{ description: 'Moto AKT 125', amount: 2_000_000 }],
    [
      regla(masDias(semana(0), 5), masDias(semana(6), 5), [6]),
      regla(masDias(semana(8), 5), masDias(semana(9), 5), [6]),
    ],
  )
  await crear(
    P.P4,
    'main',
    [
      { description: 'Camioneta KIA', amount: null },
      { description: null, amount: 120_000_000 },
      { description: 'Renault Logan', amount: 70_000_000 },
    ],
    [regla(martesPrincipal, martesPrincipal, [2])],
  )
  await crear(
    P.P5,
    'special',
    [{ description: 'Televisor de 55 pulgadas', amount: null }],
    [regla(sabadoSorpresa, sabadoSorpresa, [6])],
  )
  await db.query(`update raffles set status = 'active' where id = $1`, [rVolumen])

  // --- 3.000 boletas: 2.400 vendidas a tiempo, 300 libres, 300 tarde ---------
  // Los números diarios comparten sus tres últimas cifras de a ~6: así el premio
  // de tres cifras tiene varios candidatos por sorteo y la prioridad por
  // cliente trabaja de verdad.
  const sufijos: string[] = []
  while (sufijos.length < 500) {
    const s = String(azar.entero(1000)).padStart(3, '0')
    if (!sufijos.includes(s)) sufijos.push(s)
  }
  const pares = new Set<string>()
  const boletasV: Array<Omit<Boleta, 'id'>> = []
  while (boletasV.length < 3000) {
    const diario = `${azar.entero(10)}${sufijos[azar.entero(sufijos.length)]}`
    const semanal = azar.cuatro()
    if (pares.has(`${diario}/${semanal}`)) continue
    pares.add(`${diario}/${semanal}`)
    const i = boletasV.length
    const estado: Boleta['estado'] = i < 2400 ? 'vendida' : i < 2700 ? 'libre' : 'tarde'
    const dueño = todosLosClientes[azar.entero(todosLosClientes.length)]!
    boletasV.push({
      diario,
      semanal,
      vendedor: dueño.vendedor,
      cliente: estado === 'libre' ? null : dueño.cliente,
      estado,
    })
  }
  const creadaV = '2089-01-05T08:00:00-05:00'
  const vendidaV = '2089-01-06T09:00:00-05:00'
  const tardeV = `${masDias(semana(9), 20)}T09:00:00-05:00`
  const idsV = await insertarBoletas(rVolumen, boletasV, creadaV, vendidaV, tardeV)
  const boletas: Boleta[] = boletasV.map((b, i) => ({ ...b, id: idsV[i]! }))
  const vendidas = boletas.filter((b) => b.estado === 'vendida')

  // --- Diez semanas de sorteos; el motor corre sobre cada uno ---------------
  type Sorteo = { fecha: string; loteria: Loteria; mayor: string; resultId: string; semana: number }
  const sorteos: Sorteo[] = []
  const premiosDelSorteo = (fecha: string, loteria: Loteria): Premio[] => {
    if (loteria === 'boyaca') return [fecha === sabadoSorpresa ? P.P5 : P.P3]
    if (fecha === martesPrincipal) return [P.P4, P.P2]
    return [P.P1, P.P2]
  }
  /** El valor del P1 lo decide la versión VIGENTE cuando el motor procesó el sorteo. */
  let montoDiario = 500_000
  const valorDe = (p: Premio): { dinero: number | null; pendiente: boolean } => {
    switch (p.clave) {
      case 'P1':
        return { dinero: montoDiario, pendiente: false }
      case 'P2':
        return { dinero: 1_000_000, pendiente: false }
      case 'P3':
        return { dinero: 2_000_000, pendiente: true }
      default:
        return { dinero: null, pendiente: true }
    }
  }

  for (let w = 0; w < 10; w += 1) {
    if (w === 5) {
      // La VERSIÓN NUEVA del diario, a mitad de camino: los sorteos que ya se
      // procesaron conservan su importe; los siguientes usan el nuevo (BR-J09).
      const { error } = await owner.rpc('publish_raffle_prize_version', {
        p_prize_id: premios.P1.id,
        p_expected_version_id: premios.P1.version,
        p_title: P.P1.titulo,
        p_category: 'daily',
        p_reward_mode: 'fixed',
        p_reward_options: [{ description: null, amount: 600_000 }],
        p_number_field: 'daily_number',
        p_digits: 'four',
        p_rules: reglasDiario as never,
      })
      if (error) throw new Error(`No se pudo publicar la versión nueva: ${error.message}`)
      montoDiario = 600_000
    }
    for (const loteria of ORDEN_LOTERIA) {
      const fecha = masDias(semana(w), NOMINAL[loteria])
      const campo = loteria === 'boyaca' ? 'weekly_number' : 'daily_number'
      const elegida = vendidas[azar.entero(vendidas.length)]!
      const mayor = campo === 'weekly_number' ? elegida.semanal : elegida.diario
      const resultId = await resultado(await programacion(loteria, fecha), mayor)
      await motor(resultId)
      sorteos.push({ fecha, loteria, mayor, resultId, semana: w })

      // EL MODELO del motor: premios que juegan, candidatos elegibles y la
      // prioridad de cuatro cifras por cliente (BR-J07, D-203).
      const candidatos: Array<{ boleta: Boleta; premio: Premio }> = []
      for (const premio of premiosDelSorteo(fecha, loteria)) {
        for (const b of boletas) {
          const numero = premio.campo === 'weekly_number' ? b.semanal : b.diario
          const coincide =
            premio.cifras === 'four' ? numero === mayor : numero.slice(-3) === mayor.slice(-3)
          if (coincide) candidatos.push({ boleta: b, premio })
        }
      }
      const reclamante = (b: Boleta) => (b.estado === 'vendida' ? `c:${b.cliente}` : `t:${b.id}`)
      const conCuatro = new Set(
        candidatos.filter((c) => c.premio.cifras === 'four').map((c) => reclamante(c.boleta)),
      )
      for (const { boleta, premio } of candidatos) {
        if (premio.cifras === 'last_three' && conCuatro.has(reclamante(boleta))) {
          ejercicio.descartadasPorPrioridad += 1
          continue
        }
        if (boleta.estado !== 'vendida') {
          ejercicio.noVendidas += 1
          continue
        }
        modelo.push({
          origen: 'engine',
          fecha,
          loteria,
          rifa: rVolumen,
          vendedor: boleta.vendedor,
          cliente: boleta.cliente!,
          diario: boleta.diario,
          semanal: boleta.semanal,
          campo: premio.campo,
          jugado: premio.campo === 'weekly_number' ? boleta.semanal : boleta.diario,
          titulo: premio.titulo,
          ...valorDe(premio),
          conflicto: false,
          cambiado: false,
        })
      }
    }
  }

  // Tres resultados entran en conflicto después: sus premios se quedan, marcados.
  for (const s of [sorteos[3]!, sorteos[20]!, sorteos[41]!]) {
    await db.query(`update lottery_results set winning_number = $2 where id = $1`, [
      s.resultId,
      s.mayor === '0000' ? '0001' : '0000',
    ])
    for (const f of modelo) {
      if (f.fecha === s.fecha && f.loteria === s.loteria) f.conflicto = true
    }
  }

  // Dos boletas premiadas en el diario cambian de número DESPUÉS del sorteo. Hoy
  // ninguna vía puede hacerlo (BR-I16): se fabrica apartando los disparadores.
  const premiadas = [
    ...new Set(
      modelo.filter((f) => f.campo === 'daily_number').map((f) => f.diario + '/' + f.semanal),
    ),
  ]
  for (const par of premiadas.slice(0, 2)) {
    const b = boletas.find((x) => `${x.diario}/${x.semanal}` === par)!
    let nuevo = b.diario === '9999' ? '9998' : '9999'
    while (pares.has(`${nuevo}/${b.semanal}`)) nuevo = String(Number(nuevo) - 1).padStart(4, '0')
    await db.query('begin')
    await db.query(`set local session_replication_role = replica`)
    await db.query(`update tickets set daily_number = $2 where id = $1`, [b.id, nuevo])
    await db.query('commit')
    for (const f of modelo) {
      if (f.diario === b.diario && f.semanal === b.semanal) {
        f.diario = nuevo
        if (f.campo === 'daily_number') f.cambiado = true
      }
    }
  }

  // --- Rifa RECONOCIDA: sorteos YA JUGADOS del sistema de siempre -----------
  const { rows: hoy } = await db.query<{ hoy: string; dow: number }>(
    `select (now() at time zone 'America/Bogota')::date::text as hoy,
            extract(isodow from (now() at time zone 'America/Bogota')::date)::int as dow`,
  )
  const lunesEsta = masDias(hoy[0]!.hoy, 1 - hoy[0]!.dow)
  const lunesPasado = masDias(lunesEsta, -14)
  const lunesProximo = masDias(lunesEsta, 7)
  const nombreR = `${PREFIJO} reconocida ${stamp}`
  const inicioR = lunesPasado
  const finR = masDias(lunesProximo, 5)
  const { rows: rr } = await db.query<{ id: string }>(
    `insert into raffles (organization_id, name, ticket_price, start_date, end_date,
                          created_by, prize_mode, status)
     values ($1, $2, $3, $4, $5, $6, 'legacy', 'active') returning id`,
    [ctx.demoOrg.id, nombreR, PRECIO, inicioR, finR, ctx.ids.owner],
  )
  rReconocida = rr[0]!.id

  // Cuatro boletas por sorteo con el número que va a salir, de los vendedores
  // del seed: 24 coincidencias vendidas.
  const sorteosPasados = ORDEN_LOTERIA.map((loteria) => ({
    loteria,
    fecha: masDias(lunesPasado, NOMINAL[loteria]),
    mayor: '',
  }))
  const boletasR: Array<Omit<Boleta, 'id'>> = []
  const paresR = new Set<string>()
  for (const s of sorteosPasados) {
    s.mayor = azar.cuatro()
    for (let k = 0; k < 4; k += 1) {
      const dueño = [
        ...(clientesPorVendedor.get(k % 2 === 0 ? ctx.ids.seller1 : ctx.ids.seller2) ?? []),
      ]
      const cliente = dueño[azar.entero(dueño.length)]!
      let diario = s.loteria === 'boyaca' ? azar.cuatro() : s.mayor
      let semanal = s.loteria === 'boyaca' ? s.mayor : azar.cuatro()
      while (paresR.has(`${diario}/${semanal}`)) {
        if (s.loteria === 'boyaca') diario = azar.cuatro()
        else semanal = azar.cuatro()
      }
      paresR.add(`${diario}/${semanal}`)
      boletasR.push({
        diario,
        semanal,
        vendedor: k % 2 === 0 ? ctx.ids.seller1 : ctx.ids.seller2,
        cliente,
        estado: 'vendida',
      })
    }
  }
  const creadaR = `${masDias(lunesPasado, -30)}T08:00:00-05:00`
  const idsR = await insertarBoletas(rReconocida, boletasR, creadaR, creadaR, creadaR)
  const boletasRec: Boleta[] = boletasR.map((b, i) => ({ ...b, id: idsR[i]! }))

  // TODAS las fechas de la ventana, con su hora: la transición no admite un
  // sorteo de corte desconocido (BR-J13). Resultados solo de la primera semana.
  const resultadosR = new Map<string, string>()
  for (let l = lunesPasado; l <= lunesProximo; l = masDias(l, 7)) {
    for (const loteria of ORDEN_LOTERIA) {
      const fecha = masDias(l, NOMINAL[loteria])
      const id = await programacion(loteria, fecha)
      const pasado = sorteosPasados.find((s) => s.fecha === fecha && s.loteria === loteria)
      if (pasado) resultadosR.set(`${fecha}|${loteria}`, await resultado(id, pasado.mayor))
    }
  }
  await db.query(`select raffle_prize_transition_apply($1, $2, $3, 'active', $4, $5, $6::jsonb)`, [
    ctx.demoOrg.id,
    rReconocida,
    nombreR,
    inicioR,
    finR,
    JSON.stringify([
      {
        title: 'Premio diario',
        category: 'daily',
        reward_mode: 'fixed',
        reward_options: [{ description: null, amount: 500_000 }],
        number_field: 'daily_number',
        digits: 'four',
        rules: [regla(lunesProximo, masDias(lunesProximo, 4), [1, 2, 3, 4, 5])],
        conditions: null,
      },
    ]),
  ])
  for (const id of resultadosR.values()) await motor(id)

  // Lo que reconoce el negocio: dinero, especie y las dos cosas.
  const entradas = boletasRec.map((b, i) => {
    const s = sorteosPasados[Math.floor(i / 4)]!
    const base = {
      daily_number: b.diario,
      weekly_number: b.semanal,
      lottery_code: s.loteria,
      reference_date: s.fecha,
      prize_title: 'Premio diario',
    }
    if (i === 5) return { ...base, in_kind_description: 'Bicicleta' }
    if (i === 9) return { ...base, amount: 300_000, in_kind_description: 'Mercado del mes' }
    return { ...base, amount: 500_000 }
  })
  const reconocer = async (lista: typeof entradas) => {
    const { error } = await svc.rpc('record_declared_prize_awards', {
      p_organization_id: ctx.demoOrg.id,
      p_basis: RESPALDO,
      p_awards: lista as never,
      p_apply: true,
    })
    if (error) throw new Error(`El cargador no reconoció: ${error.message}`)
  }
  await reconocer(entradas)
  // Uno se anula y se vuelve a reconocer con otro importe: cuenta el VIGENTE.
  const corregida = entradas[0]!
  await db.query(
    `update declared_prize_awards set voided_at = now(), void_reason = 'Importe equivocado, prueba de volumen'
      where voided_at is null and match_id in (
        select m.id from lottery_ticket_matches m join tickets t on t.id = m.ticket_id
         where t.raffle_id = $1 and t.daily_number = $2 and t.weekly_number = $3)`,
    [rReconocida, corregida.daily_number, corregida.weekly_number],
  )
  await reconocer([
    {
      daily_number: corregida.daily_number,
      weekly_number: corregida.weekly_number,
      lottery_code: corregida.lottery_code,
      reference_date: corregida.reference_date,
      prize_title: 'Premio diario',
      amount: 450_000,
    },
  ])

  for (const [i, b] of boletasRec.entries()) {
    const s = sorteosPasados[Math.floor(i / 4)]!
    const e = i === 0 ? { amount: 450_000 } : entradas[i]!
    const dinero = 'amount' in e && e.amount !== undefined ? e.amount : null
    modelo.push({
      origen: 'declared',
      fecha: s.fecha,
      loteria: s.loteria,
      rifa: rReconocida,
      vendedor: b.vendedor,
      cliente: b.cliente!,
      diario: b.diario,
      semanal: b.semanal,
      campo: s.loteria === 'boyaca' ? 'weekly_number' : 'daily_number',
      jugado: s.loteria === 'boyaca' ? b.semanal : b.diario,
      titulo: 'Premio diario',
      dinero,
      pendiente: 'in_kind_description' in e && Boolean(e.in_kind_description),
      conflicto: false,
      cambiado: false,
    })
  }
  // Y un resultado reconocido entra en conflicto: los cuatro premios se quedan.
  const conflictoR = sorteosPasados[2]!
  await db.query(`update lottery_results set winning_number = $2 where id = $1`, [
    resultadosR.get(`${conflictoR.fecha}|${conflictoR.loteria}`),
    conflictoR.mayor === '0000' ? '0001' : '0000',
  ])
  for (const f of modelo) {
    if (
      f.origen === 'declared' &&
      f.fecha === conflictoR.fecha &&
      f.loteria === conflictoR.loteria
    ) {
      f.conflicto = true
    }
  }

  // --- Lo que el historial conserva ------------------------------------------
  await db.query(`update raffles set status = 'closed' where id = $1`, [rVolumen])
  await db.query(`update memberships set is_active = false where profile_id = $1`, [vInactivo])
  await db.query(`update memberships set role = 'admin' where profile_id = $1`, [vAscendido])
}, 600_000)

afterAll(async () => {
  await limpiar()
  await db.end()
})

// -----------------------------------------------------------------------------
// Lecturas
// -----------------------------------------------------------------------------

type FilaBase = {
  award_key: string
  origin: string
  reference_date: string
  lottery_code: Loteria
  raffle_id: string
  daily_number: string
  weekly_number: string
  match_field: 'daily_number' | 'weekly_number'
  matched_number: string
  numbers_changed: boolean
  result_conflict: boolean
  prize_title: string
  prize_category: string | null
  prize_digits: string | null
  known_amount: number | null
  value_pending: boolean
  total_count: number
}

const huellaDe = (f: FilaBase) =>
  huella({
    origen: f.origin,
    fecha: f.reference_date,
    loteria: f.lottery_code,
    diario: f.daily_number,
    semanal: f.weekly_number,
    campo: f.match_field,
    jugado: f.matched_number,
    titulo: f.prize_title,
    dinero: f.known_amount === null ? null : Number(f.known_amount),
    pendiente: f.value_pending,
    conflicto: f.result_conflict,
    cambiado: f.numbers_changed,
  })

const ordenadas = (xs: string[]) => [...xs].sort()

async function totalesAdmin(argumentos: Record<string, unknown>): Promise<Totales> {
  const { data, error } = await owner.rpc('admin_prize_award_totals', argumentos as never)
  if (error) throw new Error(error.message)
  const t = (data as unknown as Array<Record<string, number>>)[0]!
  return {
    prizes: Number(t.prizes_count),
    clients: Number(t.clients_count),
    knownAmount: Number(t.known_amount),
    valuePending: Number(t.value_pending_count),
  }
}

async function totalesVendedor(
  sesion: Client,
  argumentos: Record<string, unknown>,
): Promise<Totales> {
  const { data, error } = await sesion.rpc('seller_prize_award_totals', argumentos as never)
  if (error) throw new Error(error.message)
  const t = (data as unknown as Array<Record<string, number>>)[0]!
  return {
    prizes: Number(t.prizes_count),
    clients: Number(t.clients_count),
    knownAmount: Number(t.known_amount),
    valuePending: Number(t.value_pending_count),
  }
}

/** Recorre TODAS las páginas de una lectura, de 25 en 25, como la pantalla. */
async function todasLasPaginas(
  sesion: Client,
  funcion: 'admin_prize_awards' | 'seller_prize_awards',
  argumentos: Record<string, unknown>,
): Promise<{ filas: FilaBase[]; totales: number[] }> {
  const filas: FilaBase[] = []
  const totales: number[] = []
  for (let pagina = 0; ; pagina += 1) {
    const { data, error } = await sesion.rpc(funcion, {
      ...argumentos,
      p_limit: 25,
      p_offset: pagina * 25,
    } as never)
    if (error) throw new Error(error.message)
    const lote = data as unknown as FilaBase[]
    filas.push(...lote)
    if (lote.length > 0) totales.push(Number(lote[0]!.total_count))
    if (lote.length < 25) break
  }
  return { filas, totales }
}

/** El orden de la base: fecha descendente, lotería en el orden del enum y la clave. */
function enOrden(filas: FilaBase[]): boolean {
  for (let i = 1; i < filas.length; i += 1) {
    const a = filas[i - 1]!
    const b = filas[i]!
    if (a.reference_date !== b.reference_date) {
      if (a.reference_date < b.reference_date) return false
      continue
    }
    const la = ORDEN_LOTERIA.indexOf(a.lottery_code)
    const lb = ORDEN_LOTERIA.indexOf(b.lottery_code)
    if (la !== lb) {
      if (la > lb) return false
      continue
    }
    if (a.award_key > b.award_key) return false
  }
  return true
}

// =============================================================================

describe('V1 — el escenario tiene el volumen que promete', () => {
  it('V1-01: miles de boletas y cientos de premios, calculados aparte', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from tickets where raffle_id in ($1, $2)`,
      [rVolumen, rReconocida],
    )
    expect(rows[0]!.n).toBeGreaterThanOrEqual(3000)
    expect(modelo.length, 'premios del modelo').toBeGreaterThanOrEqual(200)
    // El modelo cubre cada forma de valor y cada marca.
    expect(modelo.some((f) => f.titulo === 'Premio principal')).toBe(true)
    expect(modelo.some((f) => f.titulo === 'Premio sorpresa')).toBe(true)
    expect(modelo.some((f) => f.titulo === 'Premio fin de semana')).toBe(true)
    expect(modelo.some((f) => f.titulo === 'Premio de tres cifras')).toBe(true)
    expect(modelo.some((f) => f.dinero === 500_000 && f.origen === 'engine')).toBe(true)
    expect(modelo.some((f) => f.dinero === 600_000)).toBe(true)
    expect(modelo.some((f) => f.conflicto)).toBe(true)
    expect(modelo.some((f) => f.cambiado)).toBe(true)
    expect(modelo.filter((f) => f.origen === 'declared')).toHaveLength(24)
    // Hay clientes con varios premios: premios y clientes no son lo mismo.
    expect(totalesDe(modelo).clients).toBeLessThan(modelo.length)
    // Y el escenario EJERCITA las dos reglas que el modelo reproduce: la
    // prioridad de cuatro cifras por cliente y las boletas libres o asignadas
    // tarde que coinciden sin ser premio. Sin esto, que el modelo coincida con
    // la base no demostraría nada de ellas.
    expect(ejercicio.descartadasPorPrioridad).toBeGreaterThan(0)
    expect(ejercicio.noVendidas).toBeGreaterThan(0)
  })
})

describe('V2 — el personal: filas, totales y paginación contra el modelo', () => {
  it('V2-01: sin filtros, cada página suma el conjunto entero, sin huecos, sin repetidos y en orden', async () => {
    const { filas, totales } = await todasLasPaginas(owner, 'admin_prize_awards', {})
    // Las filas de ESTE escenario, que es lo que el modelo conoce.
    const nuestras = filas.filter((f) => f.raffle_id === rVolumen || f.raffle_id === rReconocida)
    expect(ordenadas(nuestras.map(huellaDe))).toEqual(ordenadas(modelo.map(huella)))
    // Ninguna clave dos veces, y el recuento de cada página es el del conjunto.
    expect(new Set(filas.map((f) => f.award_key)).size).toBe(filas.length)
    for (const total of totales) expect(total).toBe(filas.length)
    expect(enOrden(filas)).toBe(true)
    // Y leer de 25 en 25 da EXACTAMENTE lo mismo que leer todo de una vez.
    const { data } = await owner.rpc('admin_prize_awards', { p_limit: 1000 })
    expect((data as unknown as FilaBase[]).map((f) => f.award_key)).toEqual(
      filas.map((f) => f.award_key),
    )
  })

  it('V2-02: los cuatro indicadores son los del modelo, con cada filtro y sus combinaciones', async () => {
    const semanas = modelo
      .filter((f) => f.rifa === rVolumen)
      .map((f) => f.fecha)
      .sort()
    const medio = semanas[Math.floor(semanas.length / 2)]!
    const casos: Array<[string, Record<string, unknown>, (f: Fila) => boolean]> = [
      ['rifa del motor', { p_raffle_id: rVolumen }, (f) => f.rifa === rVolumen],
      ['rifa reconocida', { p_raffle_id: rReconocida }, (f) => f.rifa === rReconocida],
      ['vendedor 1', { p_seller_id: ctx.ids.seller1 }, (f) => f.vendedor === ctx.ids.seller1],
      ['vendedor 2', { p_seller_id: ctx.ids.seller2 }, (f) => f.vendedor === ctx.ids.seller2],
      ['desactivado', { p_seller_id: vInactivo }, (f) => f.vendedor === vInactivo],
      ['ahora Administrador', { p_seller_id: vAscendido }, (f) => f.vendedor === vAscendido],
      [
        'desde la mitad',
        { p_raffle_id: rVolumen, p_from: medio },
        (f) => f.rifa === rVolumen && f.fecha >= medio,
      ],
      [
        'hasta la mitad',
        { p_raffle_id: rVolumen, p_to: medio },
        (f) => f.rifa === rVolumen && f.fecha <= medio,
      ],
      [
        'vendedor 2 en una ventana',
        { p_seller_id: ctx.ids.seller2, p_raffle_id: rVolumen, p_from: semanas[10], p_to: medio },
        (f) =>
          f.vendedor === ctx.ids.seller2 &&
          f.rifa === rVolumen &&
          f.fecha >= semanas[10]! &&
          f.fecha <= medio,
      ],
    ]
    for (const [nombre, argumentos, filtro] of casos) {
      const esperado = totalesDe(modelo.filter(filtro))
      expect(await totalesAdmin(argumentos), nombre).toEqual(esperado)
      // Y la lista, página a página, dice lo mismo que los totales.
      const { filas } = await todasLasPaginas(owner, 'admin_prize_awards', argumentos)
      expect(filas.length, nombre).toBe(esperado.prizes)
    }
  })

  it('V2-03: una página que no existe no tiene filas, y los totales siguen enteros', async () => {
    const esperado = totalesDe(modelo.filter((f) => f.rifa === rVolumen))
    const { data, error } = await owner.rpc('admin_prize_awards', {
      p_raffle_id: rVolumen,
      p_limit: 25,
      p_offset: esperado.prizes + 100,
    })
    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(await totalesAdmin({ p_raffle_id: rVolumen })).toEqual(esperado)
    // Un desplazamiento negativo se trata como cero, y un límite enorme se acota.
    const negativo = await owner.rpc('admin_prize_awards', {
      p_raffle_id: rVolumen,
      p_limit: 5,
      p_offset: -40,
    })
    const cero = await owner.rpc('admin_prize_awards', { p_raffle_id: rVolumen, p_limit: 5 })
    expect(negativo.data).toEqual(cero.data)
    const enorme = await owner.rpc('admin_prize_awards', { p_limit: 100_000 })
    expect((enorme.data as unknown[]).length).toBeLessThanOrEqual(1000)
  })
})

describe('V3 — el vendedor: lo suyo, contra el modelo', () => {
  it('V3-01: cada vendedor del seed ve exactamente sus premios, con sus totales y sus páginas', async () => {
    for (const [sesion, vendedor] of [
      [seller1, ctx.ids.seller1],
      [seller2, ctx.ids.seller2],
    ] as const) {
      const suyos = modelo.filter((f) => f.vendedor === vendedor)
      const { filas, totales } = await todasLasPaginas(sesion, 'seller_prize_awards', {})
      const nuestras = filas.filter((f) => f.raffle_id === rVolumen || f.raffle_id === rReconocida)
      expect(ordenadas(nuestras.map(huellaDe))).toEqual(ordenadas(suyos.map(huella)))
      expect(new Set(filas.map((f) => f.award_key)).size).toBe(filas.length)
      for (const total of totales) expect(total).toBe(filas.length)
      expect(enOrden(filas)).toBe(true)
      expect(await totalesVendedor(sesion, { p_raffle_id: rVolumen })).toEqual(
        totalesDe(suyos.filter((f) => f.rifa === rVolumen)),
      )
    }
  })

  it('V3-02: el filtro de cliente suma solo ese cliente, y un cliente con varios premios cuenta una vez', async () => {
    const porCliente = new Map<string, Fila[]>()
    for (const f of modelo.filter((x) => x.vendedor === ctx.ids.seller1)) {
      porCliente.set(f.cliente, [...(porCliente.get(f.cliente) ?? []), f])
    }
    const varios = [...porCliente.entries()].filter(([, fs]) => fs.length > 1).slice(0, 5)
    expect(varios.length).toBeGreaterThan(0)
    for (const [cliente, filas] of varios) {
      const t = await totalesVendedor(seller1, { p_client_id: cliente })
      expect(t).toEqual(totalesDe(filas))
      expect(t.clients).toBe(1)
    }
  })
})

describe('V4 — la cobertura del escenario', () => {
  it('V4-01: los sorteos ya jugados de la rifa reconocida sin resultado confirmado —y el que entró en conflicto— son pendientes', async () => {
    // Lo que el escenario deja pendiente, contado aquí: de la ventana de la rifa
    // reconocida, las fechas ya jugadas sin resultado, más la del conflicto. Las
    // de la rifa del motor son de 2089 y todavía no se juegan.
    const { rows } = await db.query<{ fecha: string; confirmado: boolean }>(
      `select s.reference_date::text as fecha,
              exists (select 1 from lottery_results r
                       where r.schedule_id = s.id and r.validation_status = 'confirmed') as confirmado
         from lottery_draw_schedules s
        where s.draw_number like $1 and s.official_scheduled_at < now()`,
      [`${SORTEO}${stamp}-%`],
    )
    const nuestrasPendientes = rows.filter((r) => !r.confirmado).length
    const { data, error } = await seller1.rpc('prize_award_coverage')
    expect(error).toBeNull()
    const c = (data as unknown as Array<{ pending_draws: number }>)[0]!
    // La cuenta es de TODA la organización: incluye al menos las del escenario.
    expect(Number(c.pending_draws)).toBeGreaterThanOrEqual(nuestrasPendientes)
    expect(nuestrasPendientes).toBeGreaterThan(0)
  })
})

// =============================================================================
// V5 — rendimiento con este volumen (solo si se pide: PREMIOS_EXPLAIN=<archivo>)
// =============================================================================

describe('V5 — rendimiento', () => {
  const destino = process.env.PREMIOS_EXPLAIN

  it.skipIf(!destino)(
    'V5-01: planes y tiempos de las cuatro lecturas y la cobertura, con la sesión de verdad',
    async () => {
      const { writeFile } = await import('node:fs/promises')
      const salida: string[] = [`# Planes del historial con volumen (${new Date().toISOString()})`]

      // 1) Los planes ANIDADOS —lo que corre dentro de cada función—, con
      //    auto_explain, en una conexión que se hace pasar por la sesión del
      //    Dueño y del vendedor 1 (el alcance sale de auth.uid(), como en la app).
      // `auto_explain` solo lo carga un superusuario: en la pila LOCAL es
      // `supabase_admin` (en Supabase `postgres` no lo es). Solo para medir, y
      // solo aquí; la sesión que se mide es la de `authenticated` de abajo.
      const conexion = new PgClient({
        connectionString: DB_URL.replace('postgres:postgres@', 'supabase_admin:postgres@'),
      })
      await conexion.connect()
      const avisos: string[] = []
      conexion.on('notice', (n) => avisos.push(n.message ?? ''))
      try {
        await conexion.query(`load 'auto_explain'`)
        await conexion.query(`set auto_explain.log_min_duration = 0`)
        await conexion.query(`set auto_explain.log_analyze = on`)
        await conexion.query(`set auto_explain.log_buffers = on`)
        await conexion.query(`set auto_explain.log_nested_statements = on`)
        await conexion.query(`set client_min_messages = log`)
        const consultas: Array<[string, string, string]> = [
          [
            ctx.ids.owner,
            'admin_prize_awards (página 1, sin filtros)',
            `select count(*) from admin_prize_awards(null, null, null, null, 25, 0)`,
          ],
          [
            ctx.ids.owner,
            'admin_prize_award_totals (sin filtros)',
            `select * from admin_prize_award_totals()`,
          ],
          [
            ctx.ids.owner,
            'admin_prize_awards (vendedor 2, rifa del motor)',
            `select count(*) from admin_prize_awards('${rVolumen}', '${ctx.ids.seller2}', null, null, 25, 0)`,
          ],
          [ctx.ids.owner, 'admin_prize_award_sellers', `select * from admin_prize_award_sellers()`],
          [
            ctx.ids.seller1,
            'seller_prize_awards (página 1)',
            `select count(*) from seller_prize_awards(null, null, null, null, 25, 0)`,
          ],
          [
            ctx.ids.seller1,
            'seller_prize_award_totals',
            `select * from seller_prize_award_totals()`,
          ],
          [ctx.ids.seller1, 'prize_award_coverage', `select * from prize_award_coverage()`],
        ]
        for (const [sub, nombre, sql] of consultas) {
          avisos.length = 0
          await conexion.query('begin')
          await conexion.query(`set local role authenticated`)
          await conexion.query(
            `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
            [sub],
          )
          await conexion.query(sql)
          await conexion.query('rollback')
          salida.push(`\n## ${nombre}\n`, ...avisos.map((a) => a.trim()))
        }
      } finally {
        await conexion.end()
      }

      // 2) Tiempos de punta a punta por PostgREST, con la sesión real: 20 llamadas.
      const medir = async (nombre: string, llamada: () => PromiseLike<{ error: unknown }>) => {
        const tiempos: number[] = []
        for (let i = 0; i < 20; i += 1) {
          const t0 = performance.now()
          const { error } = await llamada()
          tiempos.push(performance.now() - t0)
          if (error) throw new Error(`${nombre}: ${JSON.stringify(error)}`)
        }
        tiempos.sort((a, b) => a - b)
        salida.push(
          `- ${nombre}: mediana ${tiempos[10]!.toFixed(1)} ms · p95 ${tiempos[18]!.toFixed(1)} ms · máx ${tiempos[19]!.toFixed(1)} ms`,
        )
      }
      salida.push('\n## PostgREST, 20 llamadas cada una\n')
      await medir('admin_prize_awards (página 1)', () => owner.rpc('admin_prize_awards', {}))
      await medir('admin_prize_award_totals', () => owner.rpc('admin_prize_award_totals', {}))
      await medir('admin_prize_award_sellers', () => owner.rpc('admin_prize_award_sellers'))
      await medir('seller_prize_awards (página 1)', () => seller1.rpc('seller_prize_awards', {}))
      await medir('seller_prize_award_totals', () => seller1.rpc('seller_prize_award_totals', {}))
      await medir('prize_award_coverage', () => seller1.rpc('prize_award_coverage'))

      await writeFile(destino!, salida.join('\n'), 'utf8')
    },
    120_000,
  )
})
