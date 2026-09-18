/**
 * COMPARACIÓN DE DOS FOTOS, FILA POR FILA — la «Opción A» (Etapa 4 de D-208, `RUNBOOK` §9.0).
 *
 *   npx tsx scripts/gate-compare.ts <antes.json> <después.json> (--local | --production --project-ref <ref>)
 *        --operation none|migrations|awards [--organization <uuid>]
 *        [--migrations 0067,0068,…] [--expected-delta <delta.json>]
 *        [--save-delta <delta.json>] [--report <informe.json>]
 *
 *   npx tsx scripts/gate-compare.ts <a.json> <b.json> --structure-only [--save-delta <delta.json>]
 *
 * Versiona y generaliza los comparadores de la Entrega 5 (`build/e5/p1/diferencias.mjs` y
 * `build/e5/p2/diferencias-p2.mjs`, sin versionar). Clasifica CADA fila de `public` que
 * cambió entre las dos fotos, con su evidencia leída de la base en SOLO LECTURA:
 *
 *   LA OPERACIÓN AUTORIZADA (`--operation`):
 *     · migrations: las migraciones nuevas son EXACTAMENTE las de `--migrations`, el
 *       delta de estructura es EXACTAMENTE el ensayado en local con los privilegios de
 *       producción (`--expected-delta`) y las tablas nuevas nacen vacías;
 *     · awards: las filas nuevas de `declared_prize_awards` son las entradas confirmadas
 *       (`CONFIRMED_PRIZE_AWARDS`), con su importe, su respaldo y sin actor, y la
 *       bitácora tiene UNA fila `prize_award.record` de esa carga; ni un cambio de
 *       estructura;
 *     · none: nada que no sea actividad normal (el despliegue, una observación).
 *
 *   ACTIVIDAD NORMAL DEMOSTRABLE —la lista del dueño, y ninguna otra—:
 *     · ventas y asignaciones de boletas: el cambio de la boleta se RECONSTRUYE con la
 *       bitácora genérica y tiene que dar la huella de la línea base, solo en columnas
 *       de venta; con su cliente nuevo, su bitácora semántica y su aviso `team.sale`;
 *     · pagos y asignaciones, con el saldo y el estado derivados de sus boletas, sus
 *       movimientos de comisión —de la misma transacción— y su acumulado;
 *     · turnos PROGRAMADOS del sincronizador: una corrida que empieza en una hora de
 *       `vercel.json` —Vercel Hobby dispara en cualquier minuto de esa hora—, con sus
 *       programaciones, observaciones, resultados, fotografías, enlaces del motor y
 *       avisos dentro de la ventana de la corrida, y el candado tocado y libre en una de
 *       esas horas (un turno sin trabajo).
 *
 *   TODO LO DEMÁS DETIENE, y se reporta antes de seguir: rifas, organizaciones,
 *   membresías, perfiles, configuración de premios, transiciones, recordatorios, avisos
 *   al teléfono, cuentas de cobro, crear o aprobar boletas, marcar avisos como leídos,
 *   filas borradas, relaciones que no cuadran o cualquier fila sin causa demostrable.
 *   Nada se corrige en producción.
 *
 * ANTES DE NADA, LA PROCEDENCIA (I-145), haya o no diferencias: las dos fotos tienen que
 * ser `gate-snapshot/v2`, completas y sin tocar (su huella), del MISMO destino y del que se
 * pidió —el mismo proyecto—, dos capturas distintas, la de después posterior a la de antes
 * y, si la de después se tomó con `--base`, con esa misma foto de antes. Si algo falla, no
 * hay veredicto. Y el veredicto pasa SIEMPRE por la conexión comprobada del destino
 * pedido, aunque no haya ninguna fila que explicar: una foto no basta para decir CONTINUAR
 * de un proyecto al que esta orden no puede conectarse. Las fotos anteriores al formato
 * v2 no registran su proyecto: son evidencia histórica y hay que volver a tomarlas.
 *
 * Con `--structure-only` no hay veredicto ni conexión: compara la estructura de dos fotos
 * —también de entornos distintos, como producción y la base local de un ensayo, y también
 * fotos anteriores— y puede guardar ese delta. No admite destino, operación ni informe,
 * para que nunca pueda leerse como una puerta superada.
 *
 * El informe no lleva ningún dato de cliente: las claves de `clients` ya vienen como md5
 * en la foto. Termina en 0 si el veredicto es CONTINUAR, en 2 si es DETENER y en 1 si no
 * hay veredicto: una orden mal formada, fotos que no sirven o una conexión sin comprobar.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import {
  CONFIRMED_AWARDS_BASIS,
  CONFIRMED_PRIZE_AWARDS,
} from '../src/features/prize-awards/declared'

import {
  compareDeltas,
  cronHours,
  deltaSummary,
  provenanceProblems,
  rowChanges,
  SNAPSHOT_FORMAT,
  snapshotProblems,
  snapshotTargetLabel,
  structureDelta,
  type Delta,
  type Operation,
  type TableChanges,
} from './gate-diff'
import {
  AUDIT_IGNORED_COLUMNS,
  GateArgsError,
  gateTarget,
  gateTargetLabel,
  parseArgs,
  readOnly,
  runGateTool,
  writeGateFile,
  type Query,
  type Snapshot,
} from './gate-db'

const USAGE =
  'Uso: npx tsx scripts/gate-compare.ts <antes.json> <después.json> (--local | --production --project-ref <ref>) ' +
  '--operation none|migrations|awards [--organization <uuid>] [--migrations 0067,0068] ' +
  '[--expected-delta <delta.json>] [--save-delta <delta.json>] [--report <informe.json>]\n' +
  '     npx tsx scripts/gate-compare.ts <a.json> <b.json> --structure-only [--save-delta <delta.json>]'

type Row = Record<string, unknown>

// -----------------------------------------------------------------------------
// Evidencia y clasificación (lee la base, en solo lectura)
// -----------------------------------------------------------------------------

type Context = {
  before: Snapshot
  after: Snapshot
  cambios: Record<string, TableChanges>
  operation: Operation
  organization: string | null
  hours: Set<number>
}

type Outcome = {
  detener: string[]
  explicadas: Map<string, string>
  operaciones: Row[]
}

const iso = (t: unknown) => (t instanceof Date ? t.toISOString() : (t as string | null))
const md5Key = (id: string) => `md5:${createHash('md5').update(id).digest('hex')}`

/** Tablas que ninguna operación de estas puertas ni la actividad normal pueden tocar. */
const FROZEN_TABLES = [
  'organizations',
  'profiles',
  'memberships',
  'raffles',
  'commission_tiers',
  'seller_payment_accounts',
  'seller_payment_reminders',
  'payment_reminder_occurrences',
  'push_outbox',
  'push_subscriptions',
  'raffle_prizes',
  'raffle_prize_versions',
  'raffle_prize_schedule_rules',
  'raffle_prize_reward_options',
  'raffle_prize_transitions',
]

async function classify(q: Query, ctx: Context): Promise<Outcome> {
  const detener: string[] = []
  const explicadas = new Map<string, string>()
  const operaciones: Row[] = []
  const alto = (reason: string) => detener.push(reason)
  const explain = (table: string, key: string, why: string) =>
    explicadas.set(`${table}:${key}`, why)
  const keys = (table: string, kind: 'agregadas' | 'quitadas') => ctx.cambios[table]?.[kind] ?? []
  const modified = (table: string) => (ctx.cambios[table]?.modificadas ?? []).map((m) => m.k)

  // ---- la bitácora nueva: la base de casi todas las explicaciones
  const newAudit = keys('audit_logs', 'agregadas').length
    ? await q(
        `select a.id::text, a.organization_id::text as org, a.action, a.entity_type, a.entity_id::text,
                a.created_at, a.old_values, a.new_values, a.actor_profile_id::text as actor
           from audit_logs a where a.id = any ($1::bigint[]) order by a.id`,
        [keys('audit_logs', 'agregadas')],
      )
    : []
  for (const k of modified('audit_logs')) alto(`Una fila de bitácora existente cambió (id ${k})`)
  const used = new Set<string>()
  const auditOf = (type: string, id: string, actions?: string[]) =>
    newAudit.filter(
      (b) =>
        b.entity_type === type &&
        b.entity_id === id &&
        (!actions || actions.includes(String(b.action))),
    )

  // ---- pagos y sus asignaciones
  const touchedPayments = [...keys('payments', 'agregadas'), ...modified('payments')]
  const touchedAllocations = new Set([
    ...keys('payment_allocations', 'agregadas'),
    ...modified('payment_allocations'),
  ])
  const ticketPaymentTimes = new Map<string, string[]>()
  if (touchedAllocations.size) {
    for (const r of await q(
      `select distinct payment_id::text as p from payment_allocations where id = any ($1::uuid[])`,
      [[...touchedAllocations]],
    )) {
      if (!touchedPayments.includes(String(r.p))) touchedPayments.push(String(r.p))
    }
  }
  for (const p of touchedPayments) {
    const [payment] = await q(
      `select p.id::text, p.total_amount::bigint::text as total, p.voided_at from payments p where p.id = $1`,
      [p],
    )
    const isNew = keys('payments', 'agregadas').includes(p)
    const audit = auditOf(
      'payment',
      p,
      isNew ? ['payment.create', 'payment.update'] : ['payment.update', 'payment.void'],
    )
    if (!payment) {
      alto(`Pago ${p} tocado y ya no existe`)
      continue
    }
    if (audit.length === 0 || (isNew && !audit.some((b) => b.action === 'payment.create'))) {
      alto(`Pago ${p} ${isNew ? 'nuevo' : 'modificado'} sin su bitácora payment.*`)
      continue
    }
    const allocations = await q(
      `select pa.id::text, pa.ticket_id::text as ticket, pa.amount::bigint::text as amount
         from payment_allocations pa where pa.payment_id = $1 order by pa.id`,
      [p],
    )
    const sum = allocations.reduce((s, x) => s + BigInt(String(x.amount)), 0n)
    if (!payment.voided_at && sum !== BigInt(String(payment.total))) {
      alto(`Pago ${p}: sus asignaciones suman ${sum} y el pago es ${String(payment.total)}`)
    }
    if (isNew) {
      for (const x of allocations) {
        if (!keys('payment_allocations', 'agregadas').includes(String(x.id))) {
          alto(`Pago nuevo ${p} con una asignación que ya existía (${String(x.id)})`)
        }
      }
    }
    explain('payments', p, `pago ${isNew ? 'registrado' : 'corregido'}`)
    for (const b of audit) used.add(String(b.id))
    for (const x of allocations) {
      if (touchedAllocations.has(String(x.id)))
        explain('payment_allocations', String(x.id), `asignación del pago ${p}`)
      const times = ticketPaymentTimes.get(String(x.ticket)) ?? []
      times.push(...audit.map((b) => String(iso(b.created_at))))
      ticketPaymentTimes.set(String(x.ticket), times)
    }
    operaciones.push({
      tipo: isNew ? 'pago registrado' : 'pago corregido',
      hora: iso(audit[0]!.created_at),
      pago: p,
      importe: payment.total,
      bitacora: audit.map((b) => `${String(b.id)} ${String(b.action)}`),
    })
  }
  for (const a of touchedAllocations) {
    if (!explicadas.has(`payment_allocations:${a}`))
      alto(`Asignación de pago ${a} sin un pago explicado`)
  }

  // ---- boletas: ventas y asignaciones, nada más
  const saleTickets = new Set<string>()
  for (const k of keys('tickets', 'agregadas')) {
    alto(`Boleta nueva ${k}: crear boletas no está en la lista de actividad normal`)
  }
  const newTicketColumns = ctx.after.filas.tickets?.columnas_nuevas ?? []
  const SALE_COLUMNS = new Set([
    'client_id',
    'inventory_status',
    'sale_price',
    'sale_date',
    'assigned_at',
    'base_price',
    'seller_id',
  ])
  for (const m of ctx.cambios.tickets?.modificadas ?? []) {
    const [t] = await q(
      `select id::text, client_id::text as client, inventory_status::text as inv, payment_status::text as pay,
              paid_amount::bigint::text as paid, sale_price::bigint::text as price
         from tickets where id = $1`,
      [m.k],
    )
    if (!t) {
      alto(`Boleta ${m.k} tocada y ya no existe`)
      continue
    }
    const [paid] = await q(
      `select coalesce(sum(pa.amount), 0)::bigint::text as s from payment_allocations pa
         join payments p on p.id = pa.payment_id where pa.ticket_id = $1 and p.voided_at is null`,
      [m.k],
    )
    if (t.paid !== paid!.s)
      alto(
        `Boleta ${m.k}: paid_amount ${String(t.paid)} y sus pagos vigentes suman ${String(paid!.s)}`,
      )
    const expected =
      BigInt(String(t.paid)) === 0n
        ? 'unpaid'
        : t.price != null && BigInt(String(t.paid)) >= BigInt(String(t.price))
          ? 'paid'
          : 'partial'
    if (t.inv === 'assigned' && t.pay !== expected)
      alto(`Boleta ${m.k}: estado de pago ${String(t.pay)}, se esperaba ${expected}`)

    if (m.soloIgnoradas) {
      if (ticketPaymentTimes.has(m.k))
        explain('tickets', m.k, 'saldo y estado derivados de su pago')
      else alto(`Boleta ${m.k}: cambió su saldo o su estado de pago sin un pago que lo explique`)
      continue
    }
    const audit = auditOf('ticket', m.k, ['ticket.update'])
    if (audit.length === 0) {
      alto(`Boleta ${m.k}: cambió sin bitácora ticket.update`)
      continue
    }
    const patch: Record<string, unknown> = {}
    const touchedColumns = new Set<string>()
    for (const b of audit) {
      for (const [col, value] of Object.entries((b.old_values as Row | null) ?? {})) {
        if (!(col in patch)) patch[col] = value
        touchedColumns.add(col)
      }
      for (const col of Object.keys((b.new_values as Row | null) ?? {})) touchedColumns.add(col)
    }
    const [r] = await q(
      `select md5((((to_jsonb(t) || $1::jsonb) - $2::text[]) - $3::text[])::text) as hc from tickets t where t.id = $4`,
      [JSON.stringify(patch), AUDIT_IGNORED_COLUMNS, newTicketColumns, m.k],
    )
    if (r!.hc !== ctx.before.filas.tickets!.filas[m.k]![1]) {
      alto(`Boleta ${m.k}: su bitácora no reconstruye la fila de la línea base`)
      continue
    }
    const outside = [...touchedColumns].filter((c) => !SALE_COLUMNS.has(c))
    if (outside.length) {
      alto(`Boleta ${m.k}: cambió ${outside.join(', ')}, que no es una venta ni una asignación`)
      continue
    }
    if (patch.client_id != null && t.client == null) {
      alto(`Boleta ${m.k}: se liberó (cliente quitado), fuera de la lista`)
      continue
    }
    for (const b of audit) used.add(String(b.id))
    saleTickets.add(m.k)
    explain('tickets', m.k, t.client ? 'venta (asignada a un cliente)' : 'asignación a un vendedor')
    for (const b of newAudit) {
      if (b.entity_type === 'ticket' && b.entity_id === m.k && b.action === 'ticket.assign_client')
        used.add(String(b.id))
    }
    operaciones.push({
      tipo: t.client ? 'venta de boleta' : 'asignación de boleta',
      hora: iso(audit[0]!.created_at),
      boleta: m.k,
      columnas: [...touchedColumns].sort(),
    })
  }

  // ---- clientes: solo los creados en una venta explicada. La foto trae su clave como md5.
  const saleClients = new Set<string>()
  if (saleTickets.size) {
    for (const r of await q(
      `select distinct client_id::text as c from tickets where id = any ($1::uuid[]) and client_id is not null`,
      [[...saleTickets]],
    )) {
      saleClients.add(md5Key(String(r.c)))
    }
  }
  const newClients = keys('clients', 'agregadas')
  const clientIds = newClients.length
    ? await q(
        `select id::text, 'md5:' || md5(id::text) as k from clients where 'md5:' || md5(id::text) = any ($1::text[])`,
        [newClients],
      )
    : []
  for (const k of newClients) {
    const id = clientIds.find((c) => c.k === k)?.id as string | undefined
    const audit = id ? auditOf('client', id, ['client.create']) : []
    if (audit.length === 0) alto(`Cliente nuevo ${k} sin bitácora client.create`)
    else if (!saleClients.has(k)) alto(`Cliente nuevo ${k} sin una venta explicada que lo use`)
    else {
      audit.forEach((b) => used.add(String(b.id)))
      explain('clients', k, 'cliente creado en una venta')
    }
  }
  for (const m of ctx.cambios.clients?.modificadas ?? [])
    alto(`Cliente existente modificado ${m.k}: fuera de la lista`)
  for (const b of newAudit) {
    if (
      b.action === 'ticket.bulk_assign' &&
      b.entity_type === 'client' &&
      saleClients.has(md5Key(String(b.entity_id)))
    ) {
      used.add(String(b.id))
    }
  }

  // ---- comisiones: de la misma transacción que un pago de su boleta
  for (const k of keys('commission_ledger', 'agregadas')) {
    const [l] = await q(
      `select ticket_id::text as ticket, created_at from commission_ledger where id = $1`,
      [k],
    )
    if (!l) {
      alto(`Movimiento de comisión ${k} ya no existe`)
      continue
    }
    const times = ticketPaymentTimes.get(String(l.ticket)) ?? []
    if (times.includes(String(iso(l.created_at))))
      explain('commission_ledger', k, 'comisión del pago de su boleta')
    else alto(`Movimiento de comisión ${k} sin un pago de su boleta en la misma transacción`)
  }
  for (const m of modified('commission_ledger'))
    alto(`Movimiento de comisión existente modificado ${m}`)
  const commissionPk = ctx.after.filas.seller_commissions?.pk ?? []
  for (const k of [...keys('seller_commissions', 'agregadas'), ...modified('seller_commissions')]) {
    const parts = Object.fromEntries(k.split('|').map((v, i) => [commissionPk[i]!, v]))
    const ledger = await q(
      `select id::text from commission_ledger where raffle_id = $1 and seller_id = $2 and id = any ($3::uuid[])`,
      [parts.raffle_id, parts.seller_id, keys('commission_ledger', 'agregadas')],
    )
    if (ledger.length && ledger.every((x) => explicadas.has(`commission_ledger:${String(x.id)}`))) {
      explain('seller_commissions', k, 'acumulado de sus movimientos nuevos')
    } else alto(`Acumulado de comisión ${k} cambió sin movimientos explicados`)
  }

  // ---- el sincronizador: turnos programados. Hobby dispara en cualquier minuto de la hora.
  const windows: Array<[number, number]> = []
  const runs = [...keys('lottery_sync_runs', 'agregadas'), ...modified('lottery_sync_runs')]
  if (runs.length) {
    for (const r of await q(
      `select id::text, kind::text, started_at, finished_at, outcome::text from lottery_sync_runs where id = any ($1::uuid[])`,
      [runs],
    )) {
      const start = r.started_at as Date
      if (!ctx.hours.has(start.getUTCHours())) {
        alto(
          `Corrida del sincronizador ${String(r.id)} a las ${start.toISOString()}: fuera de las horas programadas`,
        )
        continue
      }
      explain(
        'lottery_sync_runs',
        String(r.id),
        `corrida programada (${String(r.kind)}, ${String(r.outcome)})`,
      )
      const end = (r.finished_at as Date | null) ?? new Date()
      windows.push([start.getTime() - 10_000, end.getTime() + 10_000])
      operaciones.push({
        tipo: 'turno del sincronizador',
        hora: iso(start),
        clase: r.kind,
        resultado: r.outcome,
        fin: iso(r.finished_at),
      })
    }
  }
  const inWindow = (t: unknown) =>
    t instanceof Date && windows.some(([a, b]) => t.getTime() >= a && t.getTime() <= b)
  const LOTTERY: Array<[string, string]> = [
    ['lottery_draw_schedules', 'coalesce(updated_at, created_at)'],
    ['lottery_results', 'coalesce(updated_at, created_at)'],
    ['lottery_source_observations', 'coalesce(updated_at, created_at)'],
    ['lottery_ticket_matches', 'created_at'],
    ['lottery_ticket_match_prizes', 'created_at'],
  ]
  for (const [table, column] of LOTTERY) {
    const touched = [...keys(table, 'agregadas'), ...modified(table)]
    if (!touched.length) continue
    for (const f of await q(
      `select id::text, ${column} as hora from ${table} where id::text = any ($1::text[])`,
      [touched],
    )) {
      if (inWindow(f.hora))
        explain(table, String(f.id), 'escrita por un turno programado del sincronizador')
      else
        alto(
          `${table} ${String(f.id)} (${String(iso(f.hora))}) cambió fuera de un turno programado`,
        )
    }
  }
  const lockTouched = [...keys('lottery_sync_lock', 'agregadas'), ...modified('lottery_sync_lock')]
  if (lockTouched.length) {
    for (const f of await q(
      `select id::text, holder, acquired_at, updated_at from lottery_sync_lock where id::text = any ($1::text[])`,
      [lockTouched],
    )) {
      const at = f.updated_at as Date
      if (inWindow(at)) explain('lottery_sync_lock', String(f.id), 'tocado por un turno programado')
      else if (f.holder === null && f.acquired_at === null && ctx.hours.has(at.getUTCHours())) {
        explain(
          'lottery_sync_lock',
          String(f.id),
          `turno programado sin trabajo (hora ${at.getUTCHours()} UTC)`,
        )
        operaciones.push({
          tipo: 'turno del sincronizador sin corridas (solo el candado)',
          hora: iso(at),
        })
      } else
        alto(
          `lottery_sync_lock ${String(f.id)} (${at.toISOString()}) cambió fuera de un turno o quedó tomado`,
        )
    }
  }

  // ---- la operación autorizada: reconocer las entradas confirmadas
  if (ctx.operation === 'awards') {
    const newDeclared = keys('declared_prize_awards', 'agregadas')
    const rows = newDeclared.length
      ? await q(
          `select d.id::text, d.organization_id::text as org, d.declared_title, d.amount::bigint::text as amount,
                  d.in_kind_description, d.basis, d.recorded_by::text as recorded_by, d.voided_at,
                  s.lottery_code::text as loteria, s.reference_date::text as fecha, t.daily_number, t.weekly_number
             from declared_prize_awards d
             join lottery_ticket_matches m on m.id = d.match_id
             join lottery_results r on r.id = m.result_id
             join lottery_draw_schedules s on s.id = r.schedule_id
             join tickets t on t.id = m.ticket_id
            where d.id = any ($1::uuid[])`,
          [newDeclared],
        )
      : []
    const seen = new Set<number>()
    for (const d of rows) {
      const index = CONFIRMED_PRIZE_AWARDS.findIndex(
        (e) =>
          e.lottery_code === d.loteria &&
          e.reference_date === d.fecha &&
          e.daily_number === d.daily_number &&
          e.weekly_number === d.weekly_number,
      )
      const entry = CONFIRMED_PRIZE_AWARDS[index]
      const ok =
        entry !== undefined &&
        !seen.has(index) &&
        d.org === ctx.organization &&
        d.declared_title === entry.prize_title &&
        String(d.amount ?? '') === String(entry.amount ?? '') &&
        (d.in_kind_description ?? null) === (entry.in_kind_description ?? null) &&
        d.basis === CONFIRMED_AWARDS_BASIS &&
        d.recorded_by === null &&
        d.voided_at === null
      if (!ok) {
        alto(
          `Reconocimiento ${String(d.id)} que no corresponde a una entrada confirmada, o con otro importe, respaldo o actor`,
        )
        continue
      }
      seen.add(index)
      explain(
        'declared_prize_awards',
        String(d.id),
        `reconocimiento de la entrada ${index + 1} (puerta 2)`,
      )
    }
    const loads = newAudit.filter((b) => b.action === 'prize_award.record')
    if (newDeclared.length > 0) {
      const values = (loads[0]?.new_values as Row | undefined) ?? {}
      const okLoad =
        loads.length === 1 &&
        loads[0]!.entity_type === 'declared_prize_award' &&
        loads[0]!.entity_id === null &&
        loads[0]!.actor === null &&
        loads[0]!.org === ctx.organization &&
        Number(values.entradas) === CONFIRMED_PRIZE_AWARDS.length &&
        values.respaldo === CONFIRMED_AWARDS_BASIS
      if (!okLoad)
        alto(
          `La carga tiene ${loads.length} fila(s) de bitácora prize_award.record, o no son la de estas entradas`,
        )
      else {
        used.add(String(loads[0]!.id))
        operaciones.push({
          tipo: 'puerta 2: premios reconocidos',
          hora: iso(loads[0]!.created_at),
          reconocidos: seen.size,
        })
      }
    } else if (loads.length > 0) {
      alto('Hay bitácora prize_award.record sin ningún reconocimiento nuevo')
    }
    for (const k of modified('declared_prize_awards'))
      alto(`Reconocimiento existente modificado ${k}`)
  } else {
    const c = ctx.cambios.declared_prize_awards
    if (c && (c.agregadas.length || c.modificadas.length))
      alto('declared_prize_awards cambió y esta puerta no reconoce premios')
  }

  // ---- avisos
  for (const k of keys('notifications', 'agregadas')) {
    const [n] = await q(
      `select kind, entity_id::text as entity, created_at from notifications where id = $1`,
      [k],
    )
    if (!n) {
      alto(`Aviso ${k} ya no existe`)
      continue
    }
    if (n.kind === 'team.sale' && saleTickets.has(String(n.entity)))
      explain('notifications', k, `aviso de la venta de ${String(n.entity)}`)
    else if (
      (n.kind === 'lottery.result' || n.kind === 'lottery.schedule_change') &&
      inWindow(n.created_at)
    ) {
      explain('notifications', k, `aviso ${String(n.kind)} de un turno programado`)
    } else alto(`Aviso nuevo ${String(n.kind)} (${k}) sin una operación normal que lo explique`)
  }
  for (const m of ctx.cambios.notifications?.modificadas ?? []) {
    alto(
      m.soloLectura
        ? `Aviso ${m.k} marcado como leído: fuera de la lista de la Opción A`
        : `Aviso existente ${m.k} modificado`,
    )
  }

  // ---- lo que no puede cambiar
  for (const table of FROZEN_TABLES) {
    const c = ctx.cambios[table]
    if (c && (c.agregadas.length || c.modificadas.length)) {
      alto(
        `${table}: ${c.agregadas.length} nueva(s) y ${c.modificadas.length} modificada(s): no puede cambiar en esta puerta`,
      )
    }
  }

  // ---- bitácora sin explicación, y cualquier fila tocada sin causa
  for (const b of newAudit) {
    if (!used.has(String(b.id))) {
      alto(
        `Bitácora ${String(b.id)} ${String(b.action)} (${String(b.entity_type)}) sin una operación explicada`,
      )
    } else explain('audit_logs', String(b.id), `bitácora de ${String(b.action)}`)
  }
  for (const [table, c] of Object.entries(ctx.cambios)) {
    for (const k of [...c.agregadas, ...c.modificadas.map((m) => m.k)]) {
      if (!explicadas.has(`${table}:${k}`) && !detener.some((d) => d.includes(k)))
        alto(`${table} ${k}: sin causa normal demostrable`)
    }
  }
  return { detener, explicadas, operaciones }
}

// -----------------------------------------------------------------------------

/** Una foto del disco, sin suponer nada de ella: lo comprueba `provenanceProblems`. */
function readSnapshot(file: string): Snapshot {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Snapshot
  } catch {
    throw new Error(`No se pudo leer la foto «${file}»: no existe o no es un JSON completo.`)
  }
}

/** Lo que da o encamina un veredicto de puerta: `--structure-only` no admite nada de esto. */
const VERDICT_OPTIONS = [
  '--local',
  '--production',
  '--project-ref',
  '--operation',
  '--organization',
  '--migrations',
  '--expected-delta',
  '--report',
]

/** Cómo se presenta una foto en una comparación de estructura, sin atribuirle nada. */
function describeForStructure(snapshot: Snapshot): string {
  const origin =
    snapshot.formato === SNAPSHOT_FORMAT
      ? snapshotTargetLabel(snapshot)
      : `${String(snapshot.entorno)}, formato anterior: no registra su proyecto`
  return `«${snapshot.etiqueta}» · ${origin} · ${snapshot.meta?.ahora ?? '—'}`
}

/**
 * `--structure-only`: la estructura de dos fotos, de cualquier destino y formato, para
 * ensayar. Sin conexión y SIN VEREDICTO.
 */
function structureOnly(
  parsed: ReturnType<typeof parseArgs>,
  beforeFile: string,
  afterFile: string,
): void {
  const verdictOptions = VERDICT_OPTIONS.filter(
    (o) => parsed.switches.has(o) || parsed.values.has(o),
  )
  if (verdictOptions.length > 0) {
    throw new GateArgsError(
      `--structure-only compara solo la estructura y no da veredicto: no admite ${verdictOptions.join(', ')}. ` +
        'Para una puerta, compara sin --structure-only.',
    )
  }
  const before = readSnapshot(beforeFile)
  const after = readSnapshot(afterFile)
  const delta = structureDelta(before, after)
  const saveDelta = parsed.values.get('--save-delta')
  if (saveDelta) writeGateFile(saveDelta.replace(/^.*[\\/]/, ''), delta)

  console.log(
    'COMPARACIÓN DE ESTRUCTURA, SIN VEREDICTO: sirve para ensayar y no autoriza continuar ninguna puerta.',
  )
  console.log(`Antes:   ${describeForStructure(before)}`)
  console.log(`Después: ${describeForStructure(after)}`)
  for (const [name, s] of [
    ['de antes', before],
    ['de después', after],
  ] as const) {
    if (s.formato === SNAPSHOT_FORMAT)
      for (const p of snapshotProblems(s, name)) console.log(`Aviso: ${p}`)
  }
  console.log(JSON.stringify(deltaSummary(delta)))
  for (const [category, d] of Object.entries(delta)) {
    for (const k of Object.keys(d.agregados)) console.log(`  + ${category} ${k}`)
    for (const k of d.quitados) console.log(`  − ${category} ${k}`)
    for (const k of Object.keys(d.cambiados)) console.log(`  ~ ${category} ${k}`)
  }
  if (saveDelta) console.log(`Delta guardado en build/gate/${saveDelta.replace(/^.*[\\/]/, '')}`)
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2), {
    switches: ['--structure-only'],
    valued: [
      '--operation',
      '--organization',
      '--migrations',
      '--expected-delta',
      '--save-delta',
      '--report',
    ],
    positional: 2,
  })
  const [beforeFile, afterFile] = parsed.positional
  if (!beforeFile || !afterFile) throw new Error(`Faltan las dos fotos.\n\n${USAGE}`)
  if (parsed.switches.has('--structure-only')) {
    structureOnly(parsed, beforeFile, afterFile)
    return
  }

  const target = gateTarget(parsed)
  const operation = parsed.values.get('--operation') as Operation | undefined
  if (!operation || !['none', 'migrations', 'awards'].includes(operation)) {
    throw new Error(`--operation es none, migrations o awards.\n\n${USAGE}`)
  }
  const organization = parsed.values.get('--organization') ?? null
  if (operation === 'awards' && !organization)
    throw new Error('--operation awards necesita --organization.')

  // La procedencia, siempre y antes de mirar ninguna diferencia (I-145).
  const before = readSnapshot(beforeFile)
  const after = readSnapshot(afterFile)
  const provenance = provenanceProblems(before, after, target)
  if (provenance.length > 0) {
    throw new Error(
      `No hay veredicto: estas fotos no sirven para una comparación en ${gateTargetLabel(target)}.\n` +
        provenance.map((p) => `  · ${p}`).join('\n'),
    )
  }
  const delta = structureDelta(before, after)
  const saveDelta = parsed.values.get('--save-delta')
  if (saveDelta) writeGateFile(saveDelta.replace(/^.*[\\/]/, ''), delta)

  const detener: string[] = []
  const alto = (reason: string) => detener.push(reason)

  // Migraciones
  const beforeVersions = before.migraciones.map((m) => m.version)
  const afterVersions = after.migraciones.map((m) => m.version)
  const added = afterVersions.filter((v) => !beforeVersions.includes(v))
  const removed = beforeVersions.filter((v) => !afterVersions.includes(v))
  if (removed.length) alto(`Migraciones que desaparecieron: ${removed.join(', ')}`)
  const expectedMigrations = (parsed.values.get('--migrations') ?? '').split(',').filter(Boolean)
  if (operation === 'migrations') {
    if (added.join(',') !== expectedMigrations.join(',')) {
      alto(
        `Migraciones nuevas ${added.join(',') || '(ninguna)'}; se esperaban exactamente ${expectedMigrations.join(',')}`,
      )
    }
  } else if (added.length)
    alto(`Migraciones nuevas en una puerta que no las aplica: ${added.join(', ')}`)

  // Estructura
  const expectedFile = parsed.values.get('--expected-delta')
  let differences: string[] = []
  if (operation === 'migrations') {
    if (!expectedFile)
      throw new Error(
        '--operation migrations necesita --expected-delta (el delta del ensayo local).',
      )
    differences = compareDeltas(JSON.parse(readFileSync(expectedFile, 'utf8')) as Delta, delta)
    for (const d of differences) alto(`Estructura distinta de la ensayada: ${d}`)
  } else {
    for (const [category, d] of Object.entries(delta)) {
      alto(
        `La estructura cambió en «${category}» y esta puerta no la cambia: ${deltaSummary({ [category]: d })[category]}`,
      )
    }
  }

  // Filas. Por la conexión comprobada del destino pedido SIEMPRE, también sin ninguna
  // fila que explicar: sin ella no hay veredicto (I-145).
  const rows = rowChanges(before, after)
  rows.problemas.forEach(alto)
  const hasChanges = Object.keys(rows.cambios).length > 0
  const outcome = await readOnly(target, async (q) =>
    hasChanges
      ? classify(q, {
          before,
          after,
          cambios: rows.cambios,
          operation,
          organization,
          hours: cronHours(readFileSync('vercel.json', 'utf8')),
        })
      : { detener: [], explicadas: new Map<string, string>(), operaciones: [] },
  )
  detener.push(...outcome.detener)

  const report = {
    destino: gateTargetLabel(target),
    formato: SNAPSHOT_FORMAT,
    operacion: operation,
    antes: { etiqueta: before.etiqueta, ahora: before.meta.ahora, captura: before.captura },
    despues: {
      etiqueta: after.etiqueta,
      ahora: after.meta.ahora,
      captura: after.captura,
      con_base: after.base !== null,
    },
    migraciones_nuevas: added,
    estructura: deltaSummary(delta),
    diferencias_con_lo_ensayado: differences.length,
    tablas_nuevas: rows.tablasNuevas,
    filas_tocadas: Object.fromEntries(
      Object.entries(rows.cambios).map(([t, c]) => [
        t,
        {
          nuevas: c.agregadas.length,
          modificadas: c.modificadas.length,
          borradas: c.quitadas.length,
        },
      ]),
    ),
    filas_explicadas: outcome.explicadas.size,
    operaciones: outcome.operaciones,
    veredicto: detener.length === 0 ? 'CONTINUAR' : 'DETENER',
    motivos_para_detener: detener,
  }
  const reportFile = parsed.values.get('--report')
  if (reportFile) writeGateFile(reportFile.replace(/^.*[\\/]/, ''), report)
  console.log(JSON.stringify(report, null, 2))
  process.exit(detener.length === 0 ? 0 : 2)
}

runGateTool(main, USAGE)
