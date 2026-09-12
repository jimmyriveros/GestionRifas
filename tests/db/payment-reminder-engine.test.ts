/**
 * El motor de recordatorios de pago — ETAPA 3
 * (BR-S10..BR-S14, BR-V01; migracion 0052, D-186, D-189).
 *
 * Lo que se prueba aqui es lo que ninguna pantalla puede garantizar: que el
 * reloj avance, que correrlo dos veces no duplique nada, que un atraso de mas
 * se calle, que un vendedor desactivado no reciba avisos y que nadie pueda
 * marcar como atendido lo de otro.
 *
 * POR QUE CASI TODO VA DENTRO DE UNA TRANSACCION
 *
 * Desde la 0052 hay un `pg_cron` CORRIENDO cada minuto en la base local. Una
 * prueba que venciera un recordatorio y llamara al motor en dos sentencias
 * sueltas podria perder la carrera: el cron materializaria la ocurrencia entre
 * las dos y la prueba fallaria sin que nada estuviera roto.
 *
 * Dentro de una transaccion no hay carrera posible: el vencimiento no existe
 * para el cron hasta que la transaccion confirma, y para entonces el motor ya
 * corrio dentro de ella. Es ademas la forma honesta de probar el aislamiento
 * —`for update skip locked` se comporta igual— y todo se deshace con `rollback`,
 * asi que estas pruebas no dejan ni una fila.
 *
 * Las que SI necesitan una sesion real —quien lee, quien atiende— usan la clave
 * publica como cualquier otra prueba de RLS (docs/TESTING.md §2) y limpian lo
 * suyo al terminar.
 */
import { Client as PgClient } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  DB_URL,
  anonClient,
  loadSeedContext,
  SEED_PASSWORD,
  signInAs,
  USERS,
  type Client,
} from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let db: PgClient

let owner: Client
let admin: Client
let otherSeller: Client

/**
 * Un vendedor PROPIO de esta suite.
 *
 * No se usa `vendedor1`: es una cuenta compartida con otras suites, y el tope de
 * catorce recordatorios activos haria que el resultado dependiera del orden de
 * ejecucion (I-035).
 */
let sellerId: string
let sellerEmail: string
let seller: Client

const createdProfileIds: string[] = []

const HORA = '19:00:00'

async function createAuthUser(email: string, fullName: string): Promise<string> {
  const { data, error } = await ctx.svc.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
  // `createUser` no deja la contrasena usable hasta actualizarla (I-007).
  await ctx.svc.auth.admin.updateUserById(data.user.id, { password: SEED_PASSWORD })
  createdProfileIds.push(data.user.id)
  return data.user.id
}

/** Crea un recordatorio activo de este vendedor y devuelve su id. */
async function nuevoRecordatorio(weekday: number, time = HORA): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into seller_payment_reminders (organization_id, seller_id, weekday, time_of_day)
     values ($1, $2, $3, $4) returning id`,
    [ctx.demoOrg.id, sellerId, weekday, time],
  )
  return rows[0]!.id
}

/** Lo vence: pone su reloj `atraso` en el pasado, sin despertar ningun trigger. */
async function vencer(reminderId: string, atraso: string): Promise<void> {
  await db.query(
    `update seller_payment_reminders set next_run_at = now() - $2::interval where id = $1`,
    [reminderId, atraso],
  )
}

async function correrMotor(limite?: number): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    limite === undefined
      ? 'select process_due_payment_reminders() as n'
      : `select process_due_payment_reminders(${limite}) as n`,
  )
  return rows[0]!.n
}

async function ocurrenciasDe(reminderId: string) {
  const { rows } = await db.query(
    `select status, scheduled_for, processed_at, notification_id
       from payment_reminder_occurrences
      where reminder_id = $1
      order by scheduled_for`,
    [reminderId],
  )
  return rows
}

async function avisosDe(profileId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from notifications
      where recipient_profile_id = $1 and kind = 'payment_reminder.due'`,
    [profileId],
  )
  return rows[0]!.n
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()

  owner = await signInAs(USERS.owner)
  admin = await signInAs(USERS.admin)
  otherSeller = await signInAs(USERS.seller2)

  const stamp = Date.now().toString(36)
  sellerEmail = `motor-cobro-${stamp}@demo.test`
  sellerId = await createAuthUser(sellerEmail, 'Vendedor Motor')
  const { error } = await ctx.svc
    .from('memberships')
    .insert({ organization_id: ctx.demoOrg.id, profile_id: sellerId, role: 'seller' })
  if (error) throw error
  seller = await signInAs(sellerEmail)
})

afterAll(async () => {
  // Orden obligatorio: las ocurrencias apuntan al recordatorio y a la campana
  // con `on delete restrict`, y las tres cuelgan de la membresia.
  await ctx.svc.from('payment_reminder_occurrences').delete().eq('seller_id', sellerId)
  await ctx.svc.from('notifications').delete().eq('recipient_profile_id', sellerId)
  await ctx.svc.from('seller_payment_reminders').delete().eq('seller_id', sellerId)
  await ctx.svc.from('seller_payment_accounts').delete().eq('seller_id', sellerId)

  if (createdProfileIds.length > 0) {
    await ctx.svc.from('memberships').delete().in('profile_id', createdProfileIds)
    for (const id of createdProfileIds) {
      await ctx.svc.auth.admin.deleteUser(id)
    }
  }
  await db.end()
})

// =============================================================================
describe('E — el motor: vencer, avisar y adelantar el reloj (BR-S10..BR-S12)', () => {
  // Cada prueba abre su propia transaccion y la deshace: ni se pisan entre
  // ellas, ni corren contra el cron, ni dejan rastro.
  beforeEach(async () => {
    await db.query('begin')
  })

  afterEach(async () => {
    await db.query('rollback')
  })

  it('E-01: un vencido de hace media hora se materializa PENDIENTE, con campana', async () => {
    const id = await nuevoRecordatorio(3)
    await vencer(id, '30 minutes')

    expect(await correrMotor()).toBe(1)

    const [ocurrencia] = await ocurrenciasDe(id)
    expect(ocurrencia.status).toBe('pending')
    expect(ocurrencia.notification_id).not.toBeNull()
    // El atraso es la distancia entre las dos fechas, no un campo aparte.
    expect(new Date(ocurrencia.processed_at).getTime()).toBeGreaterThan(
      new Date(ocurrencia.scheduled_for).getTime(),
    )
    expect(await avisosDe(sellerId)).toBe(1)
  })

  it('E-02: el reloj queda en el futuro, y no una semana desde el vencimiento', async () => {
    const id = await nuevoRecordatorio(3)
    await vencer(id, '30 minutes')
    await correrMotor()

    const { rows } = await db.query<{ next_run_at: string; last_run_at: string }>(
      'select next_run_at, last_run_at from seller_payment_reminders where id = $1',
      [id],
    )
    expect(new Date(rows[0]!.next_run_at).getTime()).toBeGreaterThan(Date.now())
    expect(rows[0]!.last_run_at).not.toBeNull()
  })

  it('E-03: correrlo dos veces no crea dos ocurrencias ni dos avisos (BR-S10)', async () => {
    const id = await nuevoRecordatorio(3)
    await vencer(id, '30 minutes')

    expect(await correrMotor()).toBe(1)
    // Ya no hay vencidos: el reloj avanzo en la misma transaccion.
    expect(await correrMotor()).toBe(0)

    // Y aunque se fuerce el mismo vencimiento otra vez, el indice unico manda.
    await db.query(
      `update seller_payment_reminders
          set next_run_at = (select scheduled_for from payment_reminder_occurrences
                              where reminder_id = $1)
        where id = $1`,
      [id],
    )
    expect(await correrMotor()).toBe(0)

    expect(await ocurrenciasDe(id)).toHaveLength(1)
    expect(await avisosDe(sellerId)).toBe(1)
  })

  it('E-04: un vencido de hace cinco horas nace OMITIDO y NO avisa (BR-S11)', async () => {
    const id = await nuevoRecordatorio(3)
    await vencer(id, '5 hours')

    expect(await correrMotor()).toBe(1)

    const [ocurrencia] = await ocurrenciasDe(id)
    expect(ocurrencia.status).toBe('missed')
    expect(ocurrencia.notification_id).toBeNull()
    expect(await avisosDe(sellerId)).toBe(0)
  })

  it('E-05: el borde son dos horas exactas: dentro avisa, fuera no', async () => {
    const aTiempo = await nuevoRecordatorio(1)
    const tarde = await nuevoRecordatorio(2)
    // Un segundo de margen: `now()` es el inicio de la transaccion y el motor
    // compara contra el mismo instante, pero el margen deja la prueba legible.
    await vencer(aTiempo, '119 minutes')
    await vencer(tarde, '121 minutes')

    expect(await correrMotor()).toBe(2)

    expect((await ocurrenciasDe(aTiempo))[0].status).toBe('pending')
    expect((await ocurrenciasDe(tarde))[0].status).toBe('missed')
    expect(await avisosDe(sellerId)).toBe(1)
  })

  it('E-06: varias semanas perdidas producen UNA omitida, no cuatro avisos (BR-S11)', async () => {
    const id = await nuevoRecordatorio(3)
    await vencer(id, '30 days')

    expect(await correrMotor()).toBe(1)
    // El reloj salta al proximo futuro, asi que ya no queda nada que procesar.
    expect(await correrMotor()).toBe(0)

    const ocurrencias = await ocurrenciasDe(id)
    expect(ocurrencias).toHaveLength(1)
    expect(ocurrencias[0].status).toBe('missed')
    expect(await avisosDe(sellerId)).toBe(0)
  })

  it('E-07: un pausado y un archivado no se procesan (BR-S04)', async () => {
    const pausado = await nuevoRecordatorio(1)
    const archivado = await nuevoRecordatorio(2)
    await vencer(pausado, '10 minutes')
    await vencer(archivado, '10 minutes')
    // Se cambia el estado sin pasar por la RPC y SIN tocar el reloj: el trigger
    // solo recalcula al REACTIVAR, asi que los dos siguen vencidos.
    await db.query(`update seller_payment_reminders set status = 'paused' where id = $1`, [pausado])
    await db.query(`update seller_payment_reminders set status = 'archived' where id = $1`, [
      archivado,
    ])

    expect(await correrMotor()).toBe(0)
    expect(await ocurrenciasDe(pausado)).toHaveLength(0)
    expect(await ocurrenciasDe(archivado)).toHaveLength(0)
  })

  it('E-08: un vendedor DESACTIVADO no recibe nada, y su reloj no se atasca (BR-S13)', async () => {
    const id = await nuevoRecordatorio(3)
    await vencer(id, '10 minutes')
    await db.query('update memberships set is_active = false where profile_id = $1', [sellerId])

    expect(await correrMotor()).toBe(0)
    expect(await ocurrenciasDe(id)).toHaveLength(0)
    expect(await avisosDe(sellerId)).toBe(0)

    // Pero el reloj SI avanzo: si no, esa fila volveria a salir cada minuto para
    // siempre, y al reactivarse la cuenta arrastraria meses de vencimientos.
    const { rows } = await db.query<{ next_run_at: string }>(
      'select next_run_at from seller_payment_reminders where id = $1',
      [id],
    )
    expect(new Date(rows[0]!.next_run_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('E-09: tambien lo apaga un PERFIL desactivado, no solo la membresia', async () => {
    const id = await nuevoRecordatorio(3)
    await vencer(id, '10 minutes')
    await db.query('update profiles set is_active = false where id = $1', [sellerId])

    expect(await correrMotor()).toBe(0)
    expect(await ocurrenciasDe(id)).toHaveLength(0)
  })

  it('E-10: el aviso NO nombra a ningun cliente, saldo ni importe (BR-S09)', async () => {
    const id = await nuevoRecordatorio(3)
    await vencer(id, '10 minutes')
    await correrMotor()

    const { rows } = await db.query<{ data: Record<string, unknown>; entity_type: string }>(
      `select data, entity_type from notifications
        where recipient_profile_id = $1 and kind = 'payment_reminder.due'`,
      [sellerId],
    )
    expect(Object.keys(rows[0]!.data).sort()).toEqual([
      'reminder_id',
      'scheduled_for',
      'time_of_day',
      'weekday',
    ])
    expect(rows[0]!.entity_type).toBe('payment_reminder_occurrence')
  })

  /**
   * El caso que un bucle mal escrito se come.
   *
   * Si `insert ... on conflict do nothing returning id into v_occurrence_id` NO
   * dejara la variable en NULL al no insertar, la iteracion siguiente
   * arrastraria el id de la anterior y escribiria un aviso de mas, enlazado a
   * una ocurrencia ajena. Por eso hacen falta DOS en la misma tanda, y que la
   * primera sea la que se materializa.
   */
  it('E-14: una ocurrencia ya materializada no arrastra el aviso de la anterior', async () => {
    const nuevo = await nuevoRecordatorio(1)
    const repetido = await nuevoRecordatorio(2)
    await vencer(nuevo, '10 minutes')
    await vencer(repetido, '15 minutes')

    // Se materializa a mano la del segundo, para que su insert choque.
    //
    // El `scheduled_for` se copia DENTRO de SQL, no leyendo la fila y volviendo
    // a mandarla: un `timestamptz` tiene microsegundos y un `Date` de
    // JavaScript solo milisegundos, asi que el viaje de ida y vuelta cambiaria
    // el valor y no chocaria con nada.
    await db.query(
      `insert into payment_reminder_occurrences
         (organization_id, seller_id, reminder_id, scheduled_for, processed_at, status)
       select r.organization_id, r.seller_id, r.id, r.next_run_at, now(), 'missed'
         from seller_payment_reminders r
        where r.id = $1`,
      [repetido],
    )

    // El motor procesa los dos: crea UNA y choca con la otra.
    expect(await correrMotor()).toBe(1)

    expect(await ocurrenciasDe(nuevo)).toHaveLength(1)
    expect(await ocurrenciasDe(repetido)).toHaveLength(1)
    // Y hay UN solo aviso: el de la que si se materializo.
    expect(await avisosDe(sellerId)).toBe(1)

    const { rows: enlaces } = await db.query<{ reminder_id: string }>(
      `select o.reminder_id
         from payment_reminder_occurrences o
         join notifications n on n.id = o.notification_id
        where o.seller_id = $1`,
      [sellerId],
    )
    expect(enlaces.map((e) => e.reminder_id)).toEqual([nuevo])
  })

  it('E-11: el lote acota cuantos procesa de una vez', async () => {
    const ids = [await nuevoRecordatorio(1), await nuevoRecordatorio(2), await nuevoRecordatorio(4)]
    for (const id of ids) await vencer(id, '10 minutes')

    expect(await correrMotor(2)).toBe(2)
    expect(await correrMotor(2)).toBe(1)
    expect(await correrMotor(2)).toBe(0)
  })

  /**
   * Esta es estructural, y se dice por que.
   *
   * Ejercerla con dos conexiones vivas obligaria a dejar un vencimiento
   * CONFIRMADO en la base —un bloqueo solo se ve entre transacciones que ven la
   * misma fila—, y ahi el `pg_cron` que corre cada minuto competiria con la
   * prueba: ganaria o perderia segun el segundo en que se lance. Una prueba que
   * depende del reloj es peor que ninguna.
   *
   * Lo que el `skip locked` garantiza de verdad —que dos corridas simultaneas
   * no dupliquen nada— lo defiende E-03 con el indice unico, que es la pieza
   * que de verdad lo impide (BR-S10). Esto solo vigila que la clausula no
   * desaparezca en una edicion futura y convierta el motor en una cola que se
   * bloquea a si misma.
   */
  it('E-12: el motor toma las filas con «for update skip locked» (BR-S12)', async () => {
    const { rows } = await db.query<{ prosrc: string }>(
      `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'process_due_payment_reminders'`,
    )
    expect(rows[0]!.prosrc).toMatch(/for update skip locked/i)
  })
})

// =============================================================================
describe('E — atomicidad: las cuatro escrituras son UNA (BR-S12)', () => {
  /**
   * Esta no puede ir en el bloque de arriba porque maneja sus propias
   * transacciones.
   *
   * El recordatorio se crea CONFIRMADO desde otra conexion, con su reloj en el
   * futuro —asi el cron no lo toca—; el vencimiento solo existe dentro de la
   * transaccion de la prueba, que se deshace. Si alguna de las cuatro
   * escrituras se hubiera hecho fuera de esa transaccion, sobreviviria al
   * `rollback` y se veria desde la otra conexion.
   */
  it('E-13: deshacer la transaccion no deja ni ocurrencia, ni aviso, ni reloj adelantado', async () => {
    const otra = new PgClient({ connectionString: DB_URL })
    await otra.connect()
    try {
      const { rows: creado } = await otra.query<{ id: string; next_run_at: string }>(
        `insert into seller_payment_reminders (organization_id, seller_id, weekday, time_of_day)
         values ($1, $2, 4, '07:15') returning id, next_run_at`,
        [ctx.demoOrg.id, sellerId],
      )
      const id = creado[0]!.id
      const relojAntes = creado[0]!.next_run_at

      await db.query('begin')
      await vencer(id, '10 minutes')
      expect(await correrMotor()).toBe(1)
      // Dentro de la transaccion, las cuatro escrituras estan hechas.
      expect(await ocurrenciasDe(id)).toHaveLength(1)
      await db.query('rollback')

      // Y fuera, ninguna. Se pregunta desde la OTRA conexion, que nunca vio
      // nada de lo anterior.
      const { rows: ocurrencias } = await otra.query(
        'select id from payment_reminder_occurrences where reminder_id = $1',
        [id],
      )
      expect(ocurrencias).toHaveLength(0)

      const { rows: avisos } = await otra.query(
        `select id from notifications
          where recipient_profile_id = $1 and kind = 'payment_reminder.due'`,
        [sellerId],
      )
      expect(avisos).toHaveLength(0)

      const { rows: reloj } = await otra.query<{ next_run_at: string; last_run_at: string | null }>(
        'select next_run_at, last_run_at from seller_payment_reminders where id = $1',
        [id],
      )
      expect(new Date(reloj[0]!.next_run_at).toISOString()).toBe(
        new Date(relojAntes).toISOString(),
      )
      expect(reloj[0]!.last_run_at).toBeNull()

      await otra.query('delete from seller_payment_reminders where id = $1', [id])
    } finally {
      await otra.end()
    }
  })
})

// =============================================================================
describe('O — la forma de una ocurrencia: lo que la base no deja escribir', () => {
  let reminderId: string

  beforeAll(async () => {
    reminderId = await nuevoRecordatorio(6)
  })

  async function insertar(campos: Record<string, unknown>) {
    const base = {
      organization_id: ctx.demoOrg.id,
      seller_id: sellerId,
      reminder_id: reminderId,
      scheduled_for: new Date(Date.now() - 3600_000).toISOString(),
      processed_at: new Date().toISOString(),
      status: 'pending',
      ...campos,
    }
    const cols = Object.keys(base)
    const vals = Object.values(base)
    return db
      .query(
        `insert into payment_reminder_occurrences (${cols.join(', ')})
         values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
        vals,
      )
      .then(
        () => null,
        (error: Error) => error.message,
      )
  }

  it('O-01: una OMITIDA no puede llevar campana (BR-S11)', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into notifications (organization_id, recipient_profile_id, kind, data)
       values ($1, $2, 'team.sale', '{}'::jsonb) returning id`,
      [ctx.demoOrg.id, sellerId],
    )
    const error = await insertar({ status: 'missed', notification_id: rows[0]!.id })
    expect(error).toMatch(/missed_silent/)
    await db.query('delete from notifications where id = $1', [rows[0]!.id])
  })

  it('O-02: atendida sin fecha de atencion es imposible, y al reves tambien', async () => {
    expect(await insertar({ status: 'attended' })).toMatch(/attended_coherent/)
    expect(await insertar({ status: 'pending', attended_at: new Date().toISOString() })).toMatch(
      /attended_coherent/,
    )
  })

  it('O-03: nadie procesa antes de que toque', async () => {
    const error = await insertar({
      scheduled_for: new Date(Date.now() + 3600_000).toISOString(),
      processed_at: new Date().toISOString(),
    })
    expect(error).toMatch(/not_early/)
  })

  it('O-04: dos ocurrencias del mismo vencimiento se rechazan (BR-S10)', async () => {
    const cuando = new Date(Date.now() - 7200_000).toISOString()
    expect(await insertar({ scheduled_for: cuando })).toBeNull()
    expect(await insertar({ scheduled_for: cuando })).toMatch(/payment_reminder_occurrences_once/)

    await db.query('delete from payment_reminder_occurrences where reminder_id = $1', [reminderId])
  })

  it('O-05: una ocurrencia no se puede borrar desde una sesion (D-038)', async () => {
    const { error } = await seller.from('payment_reminder_occurrences').delete().neq('id', sellerId)
    // Sin privilegio de DELETE la peticion no llega ni a evaluar politicas.
    expect(error?.code).toBe('42501')
  })
})

// =============================================================================
describe('A — atender: lo dice el vendedor, y solo el (BR-S14)', () => {
  let pendiente: string
  let omitida: string

  /** Materializa una pendiente y una omitida reales, con el motor. */
  beforeAll(async () => {
    await ctx.svc.from('payment_reminder_occurrences').delete().eq('seller_id', sellerId)
    await ctx.svc.from('notifications').delete().eq('recipient_profile_id', sellerId)
    await ctx.svc.from('seller_payment_reminders').delete().eq('seller_id', sellerId)

    const aTiempo = await nuevoRecordatorio(1)
    const tarde = await nuevoRecordatorio(2)
    await vencer(aTiempo, '20 minutes')
    await vencer(tarde, '6 hours')
    await correrMotor()

    const { rows } = await db.query<{ id: string; status: string }>(
      'select id, status from payment_reminder_occurrences where seller_id = $1',
      [sellerId],
    )
    pendiente = rows.find((r) => r.status === 'pending')!.id
    omitida = rows.find((r) => r.status === 'missed')!.id
  })

  it('A-01: el personal NO ve las ocurrencias de un vendedor (D-185, decision 9)', async () => {
    for (const [quien, cliente] of [
      ['el Dueño', owner],
      ['el Administrador', admin],
      ['otro vendedor', otherSeller],
      ['un visitante', anonClient()],
    ] as const) {
      const { data } = await cliente
        .from('payment_reminder_occurrences')
        .select('id')
        .eq('seller_id', sellerId)
      expect(data ?? [], `${quien} vio una ocurrencia ajena`).toEqual([])
    }
  })

  it('A-02: su dueño si las ve, y el aviso de la campana tambien es suyo', async () => {
    const { data } = await seller
      .from('payment_reminder_occurrences')
      .select('id, status')
      .eq('status', 'pending')
    expect(data).toHaveLength(1)

    const { data: avisos } = await seller
      .from('notifications')
      .select('id, kind')
      .eq('kind', 'payment_reminder.due')
    expect(avisos).toHaveLength(1)
  })

  it('A-03: marcarla como atendida la saca de las pendientes', async () => {
    const { data, error } = await seller.rpc('mark_reminder_occurrence_attended', {
      p_id: pendiente,
    })
    expect(error).toBeNull()
    expect(data!.status).toBe('attended')
    expect(data!.attended_at).not.toBeNull()

    const { data: quedan } = await seller
      .from('payment_reminder_occurrences')
      .select('id')
      .eq('status', 'pending')
    expect(quedan).toEqual([])
  })

  it('A-04: dos veces no, y lo dice con una frase que se puede leer', async () => {
    const { error } = await seller.rpc('mark_reminder_occurrence_attended', { p_id: pendiente })
    expect(error?.message).toMatch(/ya no está pendiente/i)
  })

  it('A-05: una OMITIDA no se puede atender: el sistema no la aviso (BR-S11)', async () => {
    const { error } = await seller.rpc('mark_reminder_occurrence_attended', { p_id: omitida })
    expect(error?.message).toMatch(/ya no está pendiente/i)
  })

  it('A-06: nadie atiende lo de otro, ni el personal usa la RPC', async () => {
    for (const cliente of [otherSeller, owner, admin]) {
      const { error } = await cliente.rpc('mark_reminder_occurrence_attended', { p_id: pendiente })
      expect(error).not.toBeNull()
    }
  })

  it('A-07: tampoco se puede marcar escribiendo directo en la tabla', async () => {
    const { error } = await seller
      .from('payment_reminder_occurrences')
      .update({ status: 'attended', attended_at: new Date().toISOString() })
      .eq('id', omitida)
    expect(error?.code).toBe('42501')
  })

  it('A-08: atender queda en la bitacora, y sin datos de cobro (BR-D04)', async () => {
    const { rows } = await db.query<{ new_values: Record<string, unknown> }>(
      `select new_values from audit_logs
        where action = 'payment_reminder.attended' and entity_id = $1`,
      [pendiente],
    )
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]!.new_values)).toEqual(['scheduled_for'])
  })
})

// =============================================================================
describe('catalogo: lo que trajo la 0052', () => {
  it('los dos cron existen, estan activos y con su horario', async () => {
    const { rows } = await db.query<{ jobname: string; schedule: string; active: boolean }>(
      `select jobname, schedule, active from cron.job
        where jobname in ('payment-reminders-due', 'payment-reminders-cron-cleanup')
        order by jobname`,
    )
    expect(rows).toHaveLength(2)
    const porNombre = Object.fromEntries(rows.map((r) => [r.jobname, r]))
    expect(porNombre['payment-reminders-due']!.schedule).toBe('* * * * *')
    expect(porNombre['payment-reminders-due']!.active).toBe(true)
    expect(porNombre['payment-reminders-cron-cleanup']!.active).toBe(true)
  })

  it('el esquema del cron no es accesible desde una sesion', async () => {
    const { rows } = await db.query<{ autenticado: boolean; anonimo: boolean }>(
      `select has_schema_privilege('authenticated', 'cron', 'usage') as autenticado,
              has_schema_privilege('anon', 'cron', 'usage') as anonimo`,
    )
    expect(rows[0]!.autenticado).toBe(false)
    expect(rows[0]!.anonimo).toBe(false)
  })

  it('la tabla tiene RLS forzada y una sola politica, de SELECT', async () => {
    const { rows: clase } = await db.query<{
      relrowsecurity: boolean
      relforcerowsecurity: boolean
    }>(
      `select relrowsecurity, relforcerowsecurity from pg_class
        where relname = 'payment_reminder_occurrences'`,
    )
    expect(clase[0]!.relrowsecurity).toBe(true)
    expect(clase[0]!.relforcerowsecurity).toBe(true)

    const { rows: politicas } = await db.query<{ policyname: string; cmd: string }>(
      `select policyname, cmd from pg_policies
        where tablename = 'payment_reminder_occurrences'`,
    )
    expect(politicas).toHaveLength(1)
    expect(politicas[0]!.cmd).toBe('SELECT')
  })

  it('authenticated solo tiene SELECT sobre la tabla', async () => {
    const { rows } = await db.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where table_name = 'payment_reminder_occurrences' and grantee = 'authenticated'
        order by privilege_type`,
    )
    expect(rows.map((r) => r.privilege_type)).toEqual(['SELECT'])
  })

  it('el kind nuevo esta en el CHECK, y los cuatro anteriores siguen', async () => {
    const { rows } = await db.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conname = 'notifications_kind_check'`,
    )
    for (const kind of [
      'team.member_added',
      'team.sale',
      'lottery.result',
      'lottery.schedule_change',
      'payment_reminder.due',
    ]) {
      expect(rows[0]!.def, `falta ${kind}`).toContain(kind)
    }
  })
})
