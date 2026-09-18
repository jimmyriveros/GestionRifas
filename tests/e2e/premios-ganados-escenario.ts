import { Client as PgClient } from 'pg'

import { loadSeedRefs, serviceClient, signedInClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, SEED_PASSWORD } from './fixtures'

/**
 * El escenario de «Premios ganados» (D-208, Etapa 2), preparado con los mismos
 * caminos que usan la base y el motor —no con filas inventadas—, salvo DOS
 * cosas que ninguna sesión puede hacer y que el historial tiene que saber
 * enseñar: un número de boleta que cambió después del sorteo (se fabrica con los
 * disparadores apartados, como en H5-07) y un resultado que entra en conflicto
 * (se provoca con el mismo `UPDATE` que haría una fuente posterior, BR-L08).
 *
 * DOS RIFAS, porque los dos orígenes viven a los dos lados de la frontera de
 * D-206 (la misma razón que `tests/db/prize-award-history.test.ts`):
 *
 *   * MOTOR: nace configurable y juega en 2088, lejos de cualquier otra suite.
 *     Sus premios los escribe `match_lottery_result` con la versión aplicada:
 *     dinero, dinero y especie, solo especie, alternativas a elegir y tres
 *     cifras. Al final se CIERRA: el historial conserva las rifas cerradas.
 *   * HISTÓRICA: existía y pasa a configurable por la pieza interna de la
 *     transición, con sorteos YA JUGADOS del lado del sistema de siempre. Ahí el
 *     motor no puede premiar, y los dos premios de $500.000 los reconoce el
 *     negocio con `record_declared_prize_awards`: el caso real de H1.
 *
 * Las cifras que la pantalla tiene que enseñar se calculan aquí, a mano, en
 * `ESPERADO`: si la base o la pantalla sumaran distinto, la prueba lo dice.
 *
 * SOLO LOCAL. Todo se limpia por prefijo al empezar y al terminar: la
 * programación de loterías es nacional y única por lotería y fecha, así que un
 * resto de una corrida abortada bloquearía la siguiente.
 */

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export const PREMIOS_PREFIJO = 'E2E premios'
const SORTEO_PREFIJO = 'E2EP-'
const CORREO_PREFIJO = 'e2e-premios-'
const PRECIO = 120_000
const RESPALDO =
  'Confirmación del Dueño en el encargo del historial de premios ganados, prueba de extremo a extremo.'

type Loteria = 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'

/** El día de la semana, contando desde el lunes, en que juega cada lotería (BR-L01). */
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

/** El primer lunes en o después de una fecha. */
function primerLunes(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const dow = new Date(Date.UTC(y!, m! - 1, d!, 12)).getUTCDay() // 0 = domingo, 1 = lunes
  return masDias(fecha, (8 - dow) % 7)
}

export type Persona = { id: string; nombre: string }

export type ClienteSecreto = Persona & {
  alias: string
  telefono: string
  correo: string
}

export type PremiosEscenario = {
  refs: SeedRefs
  marca: string
  rifaMotor: Persona
  rifaHistorica: Persona
  vendedor1Nombre: string
  clientes: {
    /** Tres premios: dos diarios y el de dinero y especie. */
    aurora: ClienteSecreto
    /** Tres cifras y el de alternativas. */
    bruno: ClienteSecreto
    /** Archivado después del sorteo, cuyo resultado entra en conflicto. */
    camila: ClienteSecreto
    /** Nombre larguísimo, un número cambiado y un premio solo en especie. */
    dona: ClienteSecreto
    /** Treinta premios de un solo cliente: la paginación. */
    emilio: ClienteSecreto
    /** Los dos premios reconocidos por el negocio. */
    fabio: ClienteSecreto
    gloria: ClienteSecreto
    /** Del vendedor que se desactiva. */
    ximena: ClienteSecreto
    /** Del vendedor que pasa a Administrador. */
    yago: ClienteSecreto
  }
  /** Vendedor DESACTIVADO con un premio. */
  inactivo: Persona & { correo: string }
  /** Vendedor que vendió, ganó un premio y después pasó a Administrador. */
  ascendido: Persona & { correo: string }
  boletas: {
    auroraDiaria: string
    donaCambiada: string
  }
  fechas: {
    historicaBogota: string
    historicaCundinamarca: string
  }
}

/**
 * Lo que la pantalla tiene que decir, calculado A MANO a partir del escenario.
 *
 *   Aurora    diario $500.000 · diario $500.000 · moto y $2.000.000 (pendiente)
 *   Bruno     tres cifras $1.000.000 · alternativas (pendiente)
 *   Camila    diario $500.000 (resultado en conflicto)
 *   Doña      diario $500.000 (número cambiado) · televisor (pendiente)
 *   Emilio    30 × diario $500.000 = $15.000.000
 *   Ximena    diario $500.000 (vendedor desactivado)
 *   Yago      diario $500.000 (vendedor que ahora es Administrador)
 *   Fabio     reconocido $500.000 · Gloria reconocido $500.000
 */
export const ESPERADO = {
  /** El vendedor 1, filtrando por la rifa del motor. */
  vendedorMotor: { prizes: 38, clients: 5, knownAmount: 20_000_000, valuePending: 3 },
  /** El vendedor 1, filtrando por la rifa histórica: los dos reconocidos. */
  vendedorHistorica: { prizes: 2, clients: 2, knownAmount: 1_000_000, valuePending: 0 },
  /** El vendedor 1, sin filtros. */
  vendedorTodo: { prizes: 40, clients: 7, knownAmount: 21_000_000, valuePending: 3 },
  /** El personal, filtrando por la rifa del motor: suma los otros dos vendedores. */
  personalMotor: { prizes: 40, clients: 7, knownAmount: 21_000_000, valuePending: 3 },
  /** La ficha de Aurora. */
  aurora: { prizes: 3, clients: 1, knownAmount: 3_000_000, valuePending: 1 },
} as const

// -----------------------------------------------------------------------------

async function conectar(): Promise<PgClient> {
  const db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  return db
}

/**
 * Borra TODO lo del escenario, de esta corrida y de cualquiera anterior.
 *
 * Fotografías, enlaces y reconocimientos son inmutables también para la service
 * role, así que se apartan los disparadores (`replica`), como hace la suite de
 * la base. Con ellos apartados las claves ajenas tampoco se comprueban: por eso
 * se borra TODO lo que apunta a lo que se borra, sin dejar huérfanos.
 */
export async function borrarEscenarioPremios(): Promise<void> {
  const db = await conectar()
  try {
    const rifas = `${PREMIOS_PREFIJO}%`
    const { rows: personas } = await db.query<{ id: string }>(
      `select id from profiles where email like $1`,
      [`${CORREO_PREFIJO}%`],
    )
    const ids = personas.map((p) => p.id)

    await db.query('begin')
    await db.query(`set local session_replication_role = replica`)
    const porRifa = [
      'declared_prize_awards',
      'lottery_ticket_match_prizes',
      'lottery_ticket_matches',
    ]
    for (const tabla of porRifa) {
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
    await db.query(`delete from audit_logs where entity_type = 'declared_prize_award'`)
    await db.query(
      `delete from notifications where entity_id in (select id from raffles where name like $1)`,
      [rifas],
    )
    await db.query(`delete from tickets where raffle_id in (select id from raffles where name like $1)`, [
      rifas,
    ])
    await db.query(
      `delete from raffle_prize_schedule_rules where version_id in
         (select v.id from raffle_prize_versions v join raffles r on r.id = v.raffle_id where r.name like $1)`,
      [rifas],
    )
    await db.query(
      `delete from raffle_prize_reward_options where version_id in
         (select v.id from raffle_prize_versions v join raffles r on r.id = v.raffle_id where r.name like $1)`,
      [rifas],
    )
    await db.query(`delete from raffle_prizes where raffle_id in (select id from raffles where name like $1)`, [
      rifas,
    ])
    await db.query(
      `delete from raffle_prize_versions where raffle_id in (select id from raffles where name like $1)`,
      [rifas],
    )
    await db.query(
      `delete from raffle_prize_transitions where raffle_id in (select id from raffles where name like $1)`,
      [rifas],
    )
    for (const tabla of ['commission_ledger', 'seller_commissions']) {
      await db.query(
        `delete from ${tabla} where raffle_id in (select id from raffles where name like $1)`,
        [rifas],
      )
    }
    await db.query(`delete from raffles where name like $1`, [rifas])

    // Los clientes del escenario —del vendedor 1 y de las dos cuentas propias—.
    await db.query(`delete from clients where name like $1`, [`${PREMIOS_PREFIJO}%`])

    // Lo que cuelga de las dos cuentas propias. Las cuentas en sí se borran
    // después, fuera de `replica`, para que Auth arrastre lo suyo en cascada.
    if (ids.length > 0) {
      await db.query(
        `delete from notifications where recipient_profile_id = any($1) or actor_profile_id = any($1)`,
        [ids],
      )
      await db.query(`delete from audit_logs where actor_profile_id = any($1)`, [ids])
      await db.query(`delete from commission_ledger where seller_id = any($1)`, [ids])
      await db.query(`delete from seller_commissions where seller_id = any($1)`, [ids])
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
  const { data: cuentas } = await svc.from('profiles').select('id').like('email', `${CORREO_PREFIJO}%`)
  for (const cuenta of cuentas ?? []) {
    const { error } = await svc.auth.admin.deleteUser(cuenta.id)
    if (error) throw new Error(`No se pudo borrar la cuenta ${cuenta.id}: ${error.message}`)
  }
}

// -----------------------------------------------------------------------------

export async function crearEscenarioPremios(): Promise<PremiosEscenario> {
  await borrarEscenarioPremios()

  const refs = await loadSeedRefs()
  const svc = serviceClient()
  const owner = await signedInClient(ACCOUNTS.owner)
  const marca = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
  const db = await conectar()
  let secuencia = 0

  const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows

  try {
    // --- Personas --------------------------------------------------------------
    const cliente = async (etiqueta: string, sellerId: string): Promise<ClienteSecreto> => {
      const nombre = `${PREMIOS_PREFIJO} ${etiqueta} ${marca}`
      const alias = `alias-${etiqueta.toLowerCase().split(' ')[0]}-${marca}`
      const telefono = `31${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`
      const correo = `${etiqueta.toLowerCase().split(' ')[0]}.${marca}@privado.test`
      const [fila] = await q<{ id: string }>(
        `insert into clients (organization_id, seller_id, name, alias, phone, email, notes)
         values ($1, $2, $3, $4, $5, $6, 'Nota privada del escenario de premios')
         returning id`,
        [refs.organizationId, sellerId, nombre, alias, telefono, correo],
      )
      return { id: fila!.id, nombre, alias, telefono, correo }
    }

    const cuenta = async (etiqueta: string, nombre: string) => {
      const correo = `${CORREO_PREFIJO}${etiqueta}-${marca}@demo.test`
      const { data, error } = await svc.auth.admin.createUser({
        email: correo,
        password: SEED_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: nombre, phone: '3001112233' },
      })
      if (error || !data.user) throw error ?? new Error('No se pudo crear la cuenta')
      // I-007: `createUser` no deja la contraseña usable hasta que se actualiza.
      await svc.auth.admin.updateUserById(data.user.id, { password: SEED_PASSWORD })
      await q(
        `insert into memberships (organization_id, profile_id, role) values ($1, $2, 'seller')`,
        [refs.organizationId, data.user.id],
      )
      return { id: data.user.id, nombre, correo }
    }

    const inactivo = await cuenta('inactivo', `Vendedor Inactivo ${marca}`)
    const ascendido = await cuenta('ascendido', `Vendedor Ascendido ${marca}`)

    const clientes = {
      aurora: await cliente('Aurora Premios', refs.sellerId),
      bruno: await cliente('Bruno Premios', refs.sellerId),
      camila: await cliente('Camila Archivada', refs.sellerId),
      dona: await cliente(
        'Doña María de los Ángeles Rodríguez-Villavicencio de la Torre',
        refs.sellerId,
      ),
      emilio: await cliente('Emilio Paginas', refs.sellerId),
      fabio: await cliente('Fabio Historico', refs.sellerId),
      gloria: await cliente('Gloria Historica', refs.sellerId),
      ximena: await cliente('Ximena Inactivo', inactivo.id),
      yago: await cliente('Yago Ascendido', ascendido.id),
    }

    const [vendedor1] = await q<{ full_name: string }>(
      `select full_name from profiles where id = $1`,
      [refs.sellerId],
    )

    // --- Utilidades de sorteo --------------------------------------------------
    const programacion = async (loteria: Loteria, fecha: string): Promise<string> => {
      secuencia += 1
      const [fila] = await q<{ id: string }>(
        `insert into lottery_draw_schedules (lottery_code, draw_number, reference_date,
                                             original_scheduled_at, official_scheduled_at, schedule_status)
         values ($1, $2, $3, $4, $4, 'scheduled') returning id`,
        [loteria, `${SORTEO_PREFIJO}${marca}-${secuencia}`, fecha, `${fecha}T22:30:00-05:00`],
      )
      return fila!.id
    }
    const resultado = async (scheduleId: string, mayor: string): Promise<string> => {
      const [fila] = await q<{ id: string }>(
        `insert into lottery_results (schedule_id, winning_number, validation_status, source_kind, confirmed_at)
         values ($1, $2, 'confirmed', 'official_page', now()) returning id`,
        [scheduleId, mayor],
      )
      return fila!.id
    }
    const boleta = async (
      raffleId: string,
      sellerId: string,
      clienteId: string,
      diario: string,
      semanal: string,
      creada: string,
    ): Promise<string> => {
      const [fila] = await q<{ id: string }>(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number,
                              weekly_number, inventory_status, created_at)
         values ($1, $2, $3, $4, $5, $6, 'available', $7) returning id`,
        [refs.organizationId, raffleId, sellerId, refs.ownerId, diario, semanal, `${creada}T08:00:00-05:00`],
      )
      await q(
        `update tickets set client_id = $2, inventory_status = 'assigned', sale_price = $3,
                sale_date = $4::date, assigned_at = $5
          where id = $1`,
        [fila!.id, clienteId, PRECIO, creada, `${creada}T09:00:00-05:00`],
      )
      return fila!.id
    }
    const motor = async (resultId: string) => {
      await q('select match_lottery_result($1)', [resultId])
    }

    // --- Rifa del MOTOR: nace configurable, juega en 2088 ----------------------
    const lunes = primerLunes('2088-03-01')
    const rifaMotorNombre = `${PREMIOS_PREFIJO} motor ${marca}`
    const [rifaMotor] = await q<{ id: string }>(
      `insert into raffles (organization_id, name, ticket_price, start_date, end_date,
                            created_by, prize_mode, status)
       values ($1, $2, $3, $4, $5, $6, 'configurable', 'draft') returning id`,
      [refs.organizationId, rifaMotorNombre, PRECIO, masDias(lunes, -7), masDias(lunes, 40), refs.ownerId],
    )
    const rMotor = rifaMotor!.id

    const premio = async (p: {
      titulo: string
      categoria: 'main' | 'daily' | 'weekly' | 'special'
      modo: 'fixed' | 'winner_choice'
      opciones: Array<{ description: string | null; amount: number | null }>
      campo: 'daily_number' | 'weekly_number'
      cifras: 'four' | 'last_three'
      desde: string
      hasta: string
      dias: number[]
    }) => {
      const { error } = await owner.rpc('create_raffle_prize', {
        p_raffle_id: rMotor,
        p_title: p.titulo,
        p_category: p.categoria,
        p_reward_mode: p.modo,
        p_reward_options: p.opciones,
        p_number_field: p.campo,
        p_digits: p.cifras,
        p_rules: [
          {
            start_date: p.desde,
            end_date: p.hasta,
            weekdays: p.dias,
            lottery_mode: 'corresponding',
            lottery_code: null,
          },
        ],
      })
      if (error) throw new Error(`No se pudo crear «${p.titulo}»: ${error.message}`)
    }

    // Lunes a viernes de las dos primeras semanas: el diario, cuatro cifras, y
    // el especial de tres cifras, que conviven (BR-J07).
    await premio({
      titulo: 'Premio diario',
      categoria: 'daily',
      modo: 'fixed',
      opciones: [{ description: null, amount: 500_000 }],
      campo: 'daily_number',
      cifras: 'four',
      desde: lunes,
      hasta: masDias(lunes, 11),
      dias: [1, 2, 3, 4, 5],
    })
    await premio({
      titulo: 'Premio especial de tres cifras',
      categoria: 'special',
      modo: 'fixed',
      opciones: [{ description: null, amount: 1_000_000 }],
      campo: 'daily_number',
      cifras: 'last_three',
      desde: lunes,
      hasta: masDias(lunes, 11),
      dias: [1, 2, 3, 4, 5],
    })
    // Los sábados: dinero Y especie. El dinero es cierto; el valor completo, no.
    await premio({
      titulo: 'Premio fin de semana',
      categoria: 'weekly',
      modo: 'fixed',
      opciones: [{ description: 'Moto AKT 125', amount: 2_000_000 }],
      campo: 'weekly_number',
      cifras: 'four',
      desde: masDias(lunes, 5),
      hasta: masDias(lunes, 12),
      dias: [6],
    })
    // Un martes: alternativas excluyentes. No se suman ni se elige ninguna.
    await premio({
      titulo: 'Premio principal',
      categoria: 'main',
      modo: 'winner_choice',
      opciones: [
        { description: 'Camioneta KIA', amount: null },
        { description: null, amount: 120_000_000 },
        { description: 'Renault Logan', amount: 70_000_000 },
      ],
      campo: 'daily_number',
      cifras: 'four',
      desde: masDias(lunes, 29),
      hasta: masDias(lunes, 29),
      dias: [2],
    })
    // Un sábado: solo en especie. No vale «$0».
    await premio({
      titulo: 'Premio sorpresa',
      categoria: 'special',
      modo: 'fixed',
      opciones: [{ description: 'Televisor de 55 pulgadas', amount: null }],
      campo: 'weekly_number',
      cifras: 'four',
      desde: masDias(lunes, 33),
      hasta: masDias(lunes, 33),
      dias: [6],
    })
    await q(`update raffles set status = 'active' where id = $1`, [rMotor])

    // Las boletas se venden ANTES de los sorteos (BR-L09).
    const vendida = '2088-01-05'
    const v1 = refs.sellerId
    const auroraDiaria = await boleta(rMotor, v1, clientes.aurora.id, '0046', '1111', vendida)
    await boleta(rMotor, v1, clientes.aurora.id, '7788', '2222', vendida)
    await boleta(rMotor, v1, clientes.aurora.id, '3333', '4321', vendida)
    await boleta(rMotor, v1, clientes.bruno.id, '1046', '5555', vendida)
    await boleta(rMotor, v1, clientes.bruno.id, '9090', '6666', vendida)
    await boleta(rMotor, v1, clientes.camila.id, '5151', '7777', vendida)
    const donaCambiada = await boleta(rMotor, v1, clientes.dona.id, '6262', '8888', vendida)
    await boleta(rMotor, v1, clientes.dona.id, '2020', '1212', vendida)
    for (let i = 1; i <= 30; i += 1) {
      await boleta(rMotor, v1, clientes.emilio.id, '8008', String(9000 + i), vendida)
    }
    await boleta(rMotor, inactivo.id, clientes.ximena.id, '3131', '1313', vendida)
    await boleta(rMotor, ascendido.id, clientes.yago.id, '4141', '1414', vendida)

    // Los sorteos, con su resultado confirmado, y el motor sobre cada uno.
    const sorteos: Array<[Loteria, number, string]> = [
      ['cundinamarca', 0, '0046'], // Aurora cuatro cifras; Bruno las tres últimas
      ['cruz_roja', 1, '7788'], // Aurora
      ['meta', 2, '5151'], // Camila (después, en conflicto)
      ['bogota', 3, '6262'], // Doña (después, número cambiado)
      ['medellin', 4, '8008'], // Emilio × 30
      ['boyaca', 5, '4321'], // Aurora, semanal: moto y dinero
      ['cundinamarca', 7, '4141'], // Yago (vendedor que asciende)
      ['medellin', 11, '3131'], // Ximena (vendedor que se desactiva)
      ['cruz_roja', 29, '9090'], // Bruno: alternativas
      ['boyaca', 33, '1212'], // Doña, semanal: solo en especie
    ]
    const resultados: string[] = []
    for (const [loteria, dias, mayor] of sorteos) {
      const id = await resultado(await programacion(loteria, masDias(lunes, dias)), mayor)
      await motor(id)
      resultados.push(id)
    }

    // --- Rifa HISTÓRICA: sorteos ya jugados, del lado del sistema de siempre ---
    const [hoy] = await q<{ hoy: string; dow: number }>(
      `select (now() at time zone 'America/Bogota')::date::text as hoy,
              extract(isodow from (now() at time zone 'America/Bogota')::date)::int as dow`,
    )
    const lunesEsta = masDias(hoy!.hoy, 1 - hoy!.dow)
    const lunesPasado = masDias(lunesEsta, -14)
    const lunesProximo = masDias(lunesEsta, 7)
    const historicaBogota = masDias(lunesPasado, NOMINAL.bogota)
    const historicaCundinamarca = masDias(lunesPasado, NOMINAL.cundinamarca)

    // TODAS las fechas de la ventana con su hora: la transición no admite una
    // semana empezada con un sorteo de corte desconocido (BR-J13).
    const historicos: Record<string, string> = {}
    for (let l = lunesPasado; l <= lunesProximo; l = masDias(l, 7)) {
      for (const loteria of Object.keys(NOMINAL) as Loteria[]) {
        const fecha = masDias(l, NOMINAL[loteria])
        const scheduleId = await programacion(loteria, fecha)
        if (fecha === historicaBogota) historicos.bogota = await resultado(scheduleId, '3427')
        if (fecha === historicaCundinamarca) {
          historicos.cundinamarca = await resultado(scheduleId, '9019')
        }
      }
    }

    const rifaHistoricaNombre = `${PREMIOS_PREFIJO} historica ${marca}`
    const desde = lunesPasado
    const hasta = masDias(lunesProximo, 5)
    const [rifaHistorica] = await q<{ id: string }>(
      `insert into raffles (organization_id, name, ticket_price, start_date, end_date,
                            created_by, prize_mode, status)
       values ($1, $2, $3, $4, $5, $6, 'legacy', 'active') returning id`,
      [refs.organizationId, rifaHistoricaNombre, PRECIO, desde, hasta, refs.ownerId],
    )
    const rHistorica = rifaHistorica!.id
    const antes = masDias(lunesPasado, -30)
    await boleta(rHistorica, v1, clientes.fabio.id, '3427', '7702', antes)
    await boleta(rHistorica, v1, clientes.gloria.id, '9019', '3294', antes)

    // La transición, por la MISMA pieza interna que la de verdad (D-204): su
    // premio juega la semana próxima, así que los sorteos ya jugados conservan
    // el sistema de siempre para siempre (D-206).
    await q(`select raffle_prize_transition_apply($1, $2, $3, 'active', $4, $5, $6::jsonb)`, [
      refs.organizationId,
      rHistorica,
      rifaHistoricaNombre,
      desde,
      hasta,
      JSON.stringify([
        {
          title: 'Premio diario',
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
    await motor(historicos.bogota!)
    await motor(historicos.cundinamarca!)

    // Los dos premios que reconoce el negocio: $500.000 cada uno (H1).
    const reconocidos = await q<{ outcome: string; problem: string | null }>(
      `select outcome, problem from record_declared_prize_awards($1, $2, $3::jsonb, true)`,
      [
        refs.organizationId,
        RESPALDO,
        JSON.stringify([
          {
            daily_number: '3427',
            weekly_number: '7702',
            lottery_code: 'bogota',
            reference_date: historicaBogota,
            prize_title: 'Premio diario',
            amount: 500_000,
          },
          {
            daily_number: '9019',
            weekly_number: '3294',
            lottery_code: 'cundinamarca',
            reference_date: historicaCundinamarca,
            prize_title: 'Premio diario',
            amount: 500_000,
          },
        ]),
      ],
    )
    if (reconocidos.some((r) => r.outcome !== 'reconocido')) {
      throw new Error(`El cargador no reconoció los dos premios: ${JSON.stringify(reconocidos)}`)
    }

    // --- Lo que el historial tiene que saber enseñar ---------------------------
    // Un resultado confirmado que entra en conflicto: una fuente posterior trae
    // otro número y el disparador lo marca (BR-L08). El premio se queda (BR-J18).
    await q(`update lottery_results set winning_number = '5152' where id = $1`, [resultados[2]])

    // Un número de boleta que cambió después del sorteo. Hoy ninguna vía puede
    // hacerlo (BR-I16): se fabrica apartando los disparadores, como H5-07.
    await db.query('begin')
    await db.query(`set local session_replication_role = replica`)
    await db.query(`update tickets set daily_number = '6263' where id = $1`, [donaCambiada])
    await db.query('commit')

    // Un cliente archivado, un vendedor desactivado, uno que pasó a
    // Administrador y una rifa cerrada: el historial los conserva a todos.
    await q(`update clients set archived_at = now() where id = $1`, [clientes.camila.id])
    await q(`update memberships set is_active = false where profile_id = $1`, [inactivo.id])
    await q(`update memberships set role = 'admin' where profile_id = $1`, [ascendido.id])
    await q(`update raffles set status = 'closed' where id = $1`, [rMotor])

    return {
      refs,
      marca,
      rifaMotor: { id: rMotor, nombre: rifaMotorNombre },
      rifaHistorica: { id: rHistorica, nombre: rifaHistoricaNombre },
      vendedor1Nombre: vendedor1!.full_name,
      clientes,
      inactivo,
      ascendido,
      boletas: { auroraDiaria, donaCambiada },
      fechas: { historicaBogota, historicaCundinamarca },
    }
  } finally {
    await db.end()
  }
}

/** Todos los datos de cliente del escenario: nada de esto puede llegar al personal. */
export function secretosDeClientes(escenario: PremiosEscenario): string[] {
  const valores: string[] = []
  for (const c of Object.values(escenario.clientes)) {
    const espaciado = `${c.telefono.slice(0, 3)} ${c.telefono.slice(3, 6)} ${c.telefono.slice(6)}`
    valores.push(c.id, c.nombre, c.alias, c.telefono, espaciado, c.correo)
  }
  valores.push('Nota privada del escenario de premios')
  return valores
}
