/**
 * LOS EFECTOS DE DATOS DE UNA MIGRACIÓN, comprobados (I-191, D-240, `RUNBOOK` §10.2 P9).
 *
 * `gate-compare --operation migrations` nació para migraciones que no tocan datos: las
 * tablas nuevas nacen vacías y nada de lo que ya existía cambia. La `0078` sí migra
 * datos —traslada los tramos a listas versionadas, fija la lista de cada integrante por
 * tramos y recuenta las comisiones—, y con esa regla P9 decía DETENER aunque todo
 * estuviera bien.
 *
 * Aquí vive lo que esas migraciones PUEDEN hacer con los datos, y nada más. No es una
 * lista de cosas que se perdonan: lo esperado se DERIVA del estado anterior —los hechos
 * de ganancias de la foto de antes— y de las reglas de las migraciones, y se compara con
 * el estado posterior. Cualquier fila que esto no explique sigue por la clasificación de
 * siempre de `gate-compare`, que la detiene.
 *
 *   readEarningFacts()        lo que `gate-snapshot` guarda en `hechos.ganancias`, en
 *                             solo lectura, con el esquema de 0077 o con el de 0078+.
 *   earningMigrationEffects() PURO: los hechos de antes, los de después, las filas que
 *                             cambiaron y la bitácora nueva → motivos para detener, filas
 *                             explicadas y bitácora usada. Sin base, sin red y sin reloj
 *                             (`tests/unit/gate-data-effects.test.ts`).
 *
 * Ningún recuento está escrito aquí: ni cuántas organizaciones, ni cuántos tramos. Lo
 * único literal son las reglas de la propia migración —los cuatro tramos que reciben las
 * organizaciones sin tramos, el modo `half_price` que conservan todos—.
 */
import type { Query } from './gate-db'
import type { TableChanges } from './gate-diff'
import { stableJson } from './record-prize-awards-guard'

// -----------------------------------------------------------------------------
// Los hechos de ganancias de una foto
// -----------------------------------------------------------------------------

export type TierFact = { min_tickets: number; rate: string }

export type EarningFacts = {
  /** `0077`: los tramos viven en `commission_tiers`. `0078`: en listas versionadas. */
  forma: '0077' | '0078'
  organizaciones: string[]
  tramos: Array<{ organization_id: string } & TierFact> | null
  listas: Array<{
    id: string
    organization_id: string
    kind: string
    template_version: number | null
    owner_profile_id: string | null
    created_by: string | null
    tramos: TierFact[]
  }> | null
  membresias: Array<{
    id: string
    organization_id: string
    profile_id: string
    role: string
    parent_seller_id: string | null
    commission_model: string
    fixed_commission_amount: string | null
    direct_commission_mode?: string
    direct_fixed_amount?: string | null
    direct_tier_list_id?: string | null
    team_tier_list_id?: string | null
  }>
  comisiones: Array<{
    organization_id: string
    raffle_id: string
    seller_id: string
    tickets_paid: number
    rate: string
    earned: string
    team_tickets_paid: number
    team_earned: string
    tier_tickets_paid?: number
    team_shortfall?: string
  }>
  ledger: Array<{
    raffle_id: string
    seller_id: string
    team_movement: boolean
    n: number
    suma: string
  }>
  pagos: Array<{ seller_id: string; n: number; vigente: string; anulado: string }>
  boletas: Array<{
    raffle_id: string
    seller_id: string | null
    inventory_status: string
    payment_status: string
    n: number
    precio: string
    abonado: string
  }>
  /** Por cada jefe, las rifas donde algún integrante suyo tiene boletas. */
  equipos_con_boletas: Array<{
    organization_id: string
    raffle_id: string
    parent_seller_id: string
  }>
}

/**
 * Los hechos de ganancias, POR ENTIDAD: identificadores de organización, vendedor y rifa,
 * modos y cifras. Ningún nombre, correo, teléfono ni dato de cliente. Solo `select`.
 */
export async function readEarningFacts(query: Query): Promise<EarningFacts> {
  const [shape] = await query<{ listas: boolean }>(
    `select to_regclass('public.commission_tier_lists') is not null as listas`,
  )
  const lists = shape!.listas === true
  const text = (rows: Array<Record<string, unknown>>) => rows as never

  return {
    forma: lists ? '0078' : '0077',
    organizaciones: (
      await query<{ id: string }>(`select id::text from organizations order by 1`)
    ).map((r) => r.id),
    tramos: lists
      ? null
      : text(
          await query(
            `select organization_id::text, min_tickets, rate::text
               from commission_tiers order by 1, 2`,
          ),
        ),
    listas: lists
      ? text(
          await query(
            `select l.id::text, l.organization_id::text, l.kind::text, l.template_version,
                    l.owner_profile_id::text, l.created_by::text,
                    coalesce((select jsonb_agg(jsonb_build_object('min_tickets', i.min_tickets, 'rate', i.rate::text)
                                               order by i.min_tickets)
                                from commission_tier_list_items i where i.list_id = l.id), '[]'::jsonb) as tramos
               from commission_tier_lists l order by l.organization_id, l.kind, l.template_version, l.id`,
          ),
        )
      : null,
    membresias: text(
      await query(
        `select m.id::text, m.organization_id::text, m.profile_id::text, m.role::text,
                m.parent_seller_id::text, m.commission_model::text, m.fixed_commission_amount::text
                ${
                  lists
                    ? `, m.direct_commission_mode::text, m.direct_fixed_amount::text,
                       m.direct_tier_list_id::text, m.team_tier_list_id::text`
                    : ''
                }
           from memberships m order by 1`,
      ),
    ),
    comisiones: text(
      await query(
        `select organization_id::text, raffle_id::text, seller_id::text, tickets_paid, rate::text,
                earned::text, team_tickets_paid, team_earned::text
                ${lists ? ', tier_tickets_paid, team_shortfall::text' : ''}
           from seller_commissions order by raffle_id, seller_id`,
      ),
    ),
    ledger: text(
      await query(
        `select raffle_id::text, seller_id::text, team_movement, count(*)::int as n,
                coalesce(sum(amount), 0)::bigint::text as suma
           from commission_ledger group by 1, 2, 3 order by 1, 2, 3`,
      ),
    ),
    pagos: text(
      await query(
        `select seller_id::text, count(*)::int as n,
                coalesce(sum(total_amount) filter (where voided_at is null), 0)::bigint::text as vigente,
                coalesce(sum(total_amount) filter (where voided_at is not null), 0)::bigint::text as anulado
           from payments group by 1 order by 1`,
      ),
    ),
    boletas: text(
      await query(
        `select raffle_id::text, seller_id::text, inventory_status::text, payment_status::text,
                count(*)::int as n, coalesce(sum(sale_price), 0)::bigint::text as precio,
                coalesce(sum(paid_amount), 0)::bigint::text as abonado
           from tickets group by 1, 2, 3, 4 order by 1, 2, 3, 4`,
      ),
    ),
    equipos_con_boletas: text(
      await query(
        `select distinct t.organization_id::text, t.raffle_id::text, m.parent_seller_id::text
           from tickets t
           join memberships m on m.profile_id = t.seller_id and m.organization_id = t.organization_id
          where m.parent_seller_id is not null
          order by 1, 2, 3`,
      ),
    ),
  }
}

// -----------------------------------------------------------------------------
// La comprobación (pura)
// -----------------------------------------------------------------------------

/** Una fila nueva de la bitácora, tal como la lee `gate-compare`. */
export type AuditFact = {
  id: string
  org: string | null
  action: string
  entity_type: string
  entity_id: string | null
  actor: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
}

export type DataEffectsInput = {
  /** `hechos.ganancias` de la foto de antes y de la de después. */
  before: unknown
  after: unknown
  cambios: Record<string, TableChanges>
  tablasNuevas: Record<string, number>
  /** Cuántas filas tenía cada tabla en la foto de antes. */
  filasAntes: Record<string, number | undefined>
  /** Las columnas de la clave de `seller_commissions`, en el orden de la foto. */
  claveComisiones: string[]
  bitacoraNueva: AuditFact[]
}

export type DataEffectsResult = {
  detener: string[]
  explicadas: Array<{ tabla: string; clave: string; motivo: string }>
  bitacoraUsada: string[]
  resumen: Record<string, number>
}

export type DataMigration = {
  nombre: string
  /**
   * Qué hechos de la foto lee `comprobar` como `before` y `after`: `ganancias` (0078,
   * 0079) o `numeros` (la 0084, D-262).
   */
  hechos: 'ganancias' | 'numeros'
  /** Tablas nuevas que NACEN CON FILAS: su contenido lo comprueba `comprobar`. */
  tablasConDatos: ReadonlySet<string>
  /** Tablas que la migración retira: adónde fue su contenido lo comprueba `comprobar`. */
  tablasRetiradas: ReadonlySet<string>
  comprobar: (input: DataEffectsInput) => DataEffectsResult
}

/**
 * Los tramos que la `0078` le da a una organización que no tenía ninguno (su sección 3).
 * Es una regla de la migración, no un recuento del ensayo.
 */
export const DEFAULT_TIERS: TierFact[] = [
  { min_tickets: 1, rate: '20000' },
  { min_tickets: 21, rate: '25000' },
  { min_tickets: 31, rate: '30000' },
  { min_tickets: 51, rate: '40000' },
]

/** Lo que la migración no puede tocar ni con la pausa cerrada: una fila distinta detiene. */
const MONEY_TABLES = ['commission_ledger', 'payments', 'payment_allocations', 'tickets', 'clients']

const MEMBERSHIP_BASE = [
  'organization_id',
  'profile_id',
  'role',
  'parent_seller_id',
  'commission_model',
  'fixed_commission_amount',
] as const
const COMMISSION_BASE = [
  'organization_id',
  'tickets_paid',
  'rate',
  'earned',
  'team_tickets_paid',
  'team_earned',
] as const

/** Igualdad por contenido. `undefined` —un tramo que falta— solo es igual a sí mismo. */
const same = (a: unknown, b: unknown) =>
  a === undefined || b === undefined ? a === b : stableJson(a) === stableJson(b)
const short = (id: string | null | undefined) => (id ? `${id.slice(0, 8)}…` : '(ninguno)')
const isFacts = (value: unknown): value is EarningFacts =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as EarningFacts).organizaciones) &&
  Array.isArray((value as EarningFacts).membresias) &&
  Array.isArray((value as EarningFacts).comisiones) &&
  Array.isArray((value as EarningFacts).ledger) &&
  Array.isArray((value as EarningFacts).pagos) &&
  Array.isArray((value as EarningFacts).boletas) &&
  Array.isArray((value as EarningFacts).equipos_con_boletas)

/**
 * Los efectos de datos de la `0078` y la `0079` sobre una base que estaba en `0077`.
 *
 * LO QUE LAS MIGRACIONES HACEN, y aquí se exige exactamente:
 *   1. Cada organización recibe UNA lista `template`, versión 1, sin dueño y sin autor,
 *      con los tramos que tenía en `commission_tiers` —o los cuatro de siempre si no
 *      tenía ninguno—. `commission_tiers` desaparece.
 *   2. Toda membresía conserva sus columnas y nace con el acuerdo administrativo
 *      `half_price`. Las de integrantes por tramos —con padre y `tiered`— quedan fijadas
 *      en la versión 1 DE SU ORGANIZACIÓN, con una fila `membership.update` sin actor que
 *      solo nombra `team_tier_list_id`. Ninguna otra cambia.
 *   3. Las comisiones se recuentan sin mover una cifra: cada fila conserva lo cobrado, su
 *      tarifa y lo ganado; `tier_tickets_paid` es propias más equipo y `team_shortfall`,
 *      cero. Un jefe sin fila recibe una en cero en las rifas donde su equipo tiene
 *      boletas.
 *   4. El ledger, los pagos, sus asignaciones, las boletas y los clientes no cambian: ni
 *      una fila, ni una cifra por entidad.
 *
 * De las columnas de antes solo puede cambiar `updated_at`, y solo en las filas que la
 * migración escribe: las membresías del punto 2 y las comisiones recontadas.
 */
export function earningMigrationEffects(input: DataEffectsInput): DataEffectsResult {
  const detener: string[] = []
  const explicadas: DataEffectsResult['explicadas'] = []
  const bitacoraUsada: string[] = []
  const alto = (reason: string) => detener.push(reason)
  const explain = (tabla: string, clave: string, motivo: string) =>
    explicadas.push({ tabla, clave, motivo })
  const resumen: Record<string, number> = {}

  const b = input.before
  const a = input.after
  if (!isFacts(b) || !isFacts(a)) {
    alto(
      'Las fotos no traen los hechos de ganancias (`hechos.ganancias`): tómalas otra vez con esta versión de gate-snapshot.',
    )
    return { detener, explicadas, bitacoraUsada, resumen }
  }
  if (b.forma !== '0077' || !Array.isArray(b.tramos)) {
    alto('La foto de antes no es de una base en 0077: sus tramos no están en commission_tiers.')
    return { detener, explicadas, bitacoraUsada, resumen }
  }
  if (a.forma !== '0078' || !Array.isArray(a.listas)) {
    alto('La foto de después no tiene las listas de tramos de la 0078.')
    return { detener, explicadas, bitacoraUsada, resumen }
  }

  // ---- organizaciones: las mismas
  if (!same(b.organizaciones, a.organizaciones)) {
    alto('Las organizaciones no son las mismas antes y después de migrar.')
  }

  // ---- 1. las listas: una por organización, con exactamente sus tramos
  const v1 = new Map<string, string>()
  let tramosEsperados = 0
  for (const org of b.organizaciones) {
    const propios = b.tramos
      .filter((t) => t.organization_id === org)
      .map((t) => ({ min_tickets: Number(t.min_tickets), rate: String(t.rate) }))
      .sort((x, y) => x.min_tickets - y.min_tickets)
    const esperados = propios.length > 0 ? propios : DEFAULT_TIERS
    tramosEsperados += esperados.length
    const suyas = a.listas.filter((l) => l.organization_id === org)
    if (suyas.length !== 1) {
      alto(
        `La organización ${short(org)} tiene ${suyas.length} lista(s) de tramos; la migración crea exactamente una, la versión 1.`,
      )
      continue
    }
    const lista = suyas[0]!
    if (
      lista.kind !== 'template' ||
      lista.template_version !== 1 ||
      lista.owner_profile_id !== null ||
      lista.created_by !== null
    ) {
      alto(
        `La lista de la organización ${short(org)} no es la versión 1 de la lista general, sin dueño y sin autor.`,
      )
      continue
    }
    const tiene = lista.tramos.map((t) => ({
      min_tickets: Number(t.min_tickets),
      rate: String(t.rate),
    }))
    if (!same(tiene, esperados)) {
      const distinto = esperados.find((e, i) => !same(e, tiene[i])) ?? tiene[esperados.length]
      alto(
        `Los tramos de la versión 1 de la organización ${short(org)} no son los que tenía: ` +
          `${tiene.length} tramo(s) frente a ${esperados.length}` +
          (distinto ? `; el primero distinto, desde ${distinto.min_tickets} boleta(s)` : '') +
          '.',
      )
      continue
    }
    v1.set(org, lista.id)
  }
  for (const lista of a.listas) {
    if (!b.organizaciones.includes(lista.organization_id)) {
      alto(
        `Hay una lista de tramos de una organización que no existía (${short(lista.organization_id)}).`,
      )
    }
  }
  const items = a.listas.reduce((s, l) => s + l.tramos.length, 0)
  if (input.tablasNuevas.commission_tier_lists !== a.listas.length) {
    alto(
      `commission_tier_lists tiene ${String(input.tablasNuevas.commission_tier_lists)} fila(s) y los hechos dicen ${a.listas.length}.`,
    )
  }
  if (input.tablasNuevas.commission_tier_list_items !== items) {
    alto(
      `commission_tier_list_items tiene ${String(input.tablasNuevas.commission_tier_list_items)} fila(s) y los hechos dicen ${items}.`,
    )
  }
  if (input.filasAntes.commission_tiers !== b.tramos.length) {
    alto(
      `commission_tiers tenía ${String(input.filasAntes.commission_tiers)} fila(s) y los hechos de antes dicen ${b.tramos.length}.`,
    )
  }
  resumen.organizaciones = b.organizaciones.length
  resumen.listas_version_1 = v1.size
  resumen.tramos_trasladados = tramosEsperados

  // ---- 2. membresías
  const antes = new Map(b.membresias.map((m) => [m.id, m]))
  const despues = new Map(a.membresias.map((m) => [m.id, m]))
  const conLista = new Map<string, string>()
  for (const id of despues.keys()) if (!antes.has(id)) alto(`Membresía nueva ${short(id)}.`)
  for (const [id, m] of antes) {
    const n = despues.get(id)
    if (!n) {
      alto(`La membresía ${short(id)} desapareció.`)
      continue
    }
    const cambiadas = MEMBERSHIP_BASE.filter((c) => (m[c] ?? null) !== (n[c] ?? null))
    if (cambiadas.length > 0) {
      alto(`Membresía ${short(id)}: cambió ${cambiadas.join(', ')}, y la migración no lo toca.`)
      continue
    }
    if (
      n.direct_commission_mode !== 'half_price' ||
      (n.direct_fixed_amount ?? null) !== null ||
      (n.direct_tier_list_id ?? null) !== null
    ) {
      alto(
        `Membresía ${short(id)}: su acuerdo administrativo no es la mitad (half_price) sin fijo ni lista, que es con el que nace toda membresía.`,
      )
      continue
    }
    const porTramos = m.parent_seller_id !== null && m.commission_model === 'tiered'
    const esperada = porTramos ? (v1.get(m.organization_id) ?? null) : null
    const tiene = n.team_tier_list_id ?? null
    if (tiene !== esperada) {
      const deOtra = a.listas.find((l) => l.id === tiene)
      alto(
        tiene !== null && deOtra && deOtra.organization_id !== m.organization_id
          ? `Membresía ${short(id)}: su lista de tramos es de OTRA organización (${short(deOtra.organization_id)}).`
          : porTramos
            ? `Membresía ${short(id)}: es un integrante por tramos y no quedó en la versión 1 de su organización.`
            : `Membresía ${short(id)}: tiene una lista de tramos de equipo y no es un integrante por tramos.`,
      )
      continue
    }
    if (esperada !== null) conLista.set(id, esperada)
  }
  for (const m of input.cambios.memberships?.modificadas ?? []) {
    if (!conLista.has(m.k)) {
      alto(
        `Membresía ${short(m.k)} modificada: la migración solo escribe las de integrantes por tramos.`,
      )
    } else if (!m.soloIgnoradas) {
      alto(`Membresía ${short(m.k)}: de sus columnas de antes cambió algo más que updated_at.`)
    } else explain('memberships', m.k, 'integrante por tramos fijado en la versión 1 (0078)')
  }
  for (const [id, lista] of conLista) {
    const filas = input.bitacoraNueva.filter(
      (x) => x.entity_type === 'membership' && x.entity_id === id,
    )
    const fila = filas[0]
    const ok =
      filas.length === 1 &&
      fila !== undefined &&
      fila.action === 'membership.update' &&
      fila.actor === null &&
      fila.org === antes.get(id)!.organization_id &&
      same(fila.old_values, { team_tier_list_id: null }) &&
      same(fila.new_values, { team_tier_list_id: lista })
    if (!ok) {
      alto(
        `Membresía ${short(id)}: se esperaba UNA fila de bitácora membership.update, sin actor, que solo cambie team_tier_list_id de nulo a su versión 1; hay ${filas.length} o dice otra cosa.`,
      )
    } else bitacoraUsada.push(fila.id)
  }
  resumen.membresias = antes.size
  resumen.integrantes_por_tramos_fijados = conLista.size

  // ---- 3. comisiones, por entidad
  const clave = (r: { raffle_id: string; seller_id: string }) =>
    input.claveComisiones.map((c) => (c === 'raffle_id' ? r.raffle_id : r.seller_id)).join('|')
  if (!same([...input.claveComisiones].sort(), ['raffle_id', 'seller_id'])) {
    alto(
      'La clave de seller_commissions no es (raffle_id, seller_id): no se puede comparar por entidad.',
    )
  }
  const comAntes = new Map(b.comisiones.map((r) => [clave(r), r]))
  const comDespues = new Map(a.comisiones.map((r) => [clave(r), r]))
  const jefes = new Set(
    b.equipos_con_boletas.map((e) =>
      clave({ raffle_id: e.raffle_id, seller_id: e.parent_seller_id }),
    ),
  )
  const nuevasEsperadas = new Set([...jefes].filter((k) => !comAntes.has(k)))
  for (const [k, r] of comAntes) {
    const n = comDespues.get(k)
    if (!n) {
      alto(
        `La fila de comisión ${short(r.seller_id)} en la rifa ${short(r.raffle_id)} desapareció.`,
      )
      continue
    }
    const cambiadas = COMMISSION_BASE.filter((c) => String(r[c]) !== String(n[c]))
    if (cambiadas.length > 0) {
      alto(
        `Comisión de ${short(r.seller_id)} en la rifa ${short(r.raffle_id)}: cambió ${cambiadas.join(', ')}. La migración recuenta sin mover una cifra.`,
      )
    }
  }
  for (const [k, n] of comDespues) {
    if (n.tier_tickets_paid !== n.tickets_paid + n.team_tickets_paid) {
      alto(
        `Comisión de ${short(n.seller_id)} en la rifa ${short(n.raffle_id)}: tier_tickets_paid no es propias más equipo.`,
      )
    }
    if (String(n.team_shortfall) !== '0') {
      alto(
        `Comisión de ${short(n.seller_id)} en la rifa ${short(n.raffle_id)}: team_shortfall no es cero. Es un par incompatible anterior: lo decide el dueño (BR-G35).`,
      )
    }
    if (comAntes.has(k)) continue
    if (!nuevasEsperadas.has(k)) {
      alto(
        `Fila de comisión nueva de ${short(n.seller_id)} en la rifa ${short(n.raffle_id)}: no es un jefe cuyo equipo tenga boletas en esa rifa.`,
      )
    } else if (n.tickets_paid !== 0 || String(n.earned) !== '0' || String(n.team_earned) !== '0') {
      alto(
        `Fila de comisión nueva de ${short(n.seller_id)} en la rifa ${short(n.raffle_id)} con importe: una fila que la migración crea nace en cero.`,
      )
    }
  }
  for (const k of nuevasEsperadas) {
    if (!comDespues.has(k))
      alto(`Falta la fila de comisión en cero del jefe (${k.split('|').map(short).join(' · ')}).`)
  }
  const com = input.cambios.seller_commissions
  for (const k of com?.agregadas ?? []) {
    if (nuevasEsperadas.has(k) && comDespues.has(k)) {
      explain('seller_commissions', k, 'fila en cero de un jefe cuyo equipo tiene boletas (0078)')
    }
  }
  for (const m of com?.modificadas ?? []) {
    if (!comAntes.has(m.k)) continue
    if (!m.soloIgnoradas) {
      alto(
        `Fila de comisión ${m.k.split('|').map(short).join(' · ')}: de sus columnas de antes cambió algo más que updated_at.`,
      )
    } else
      explain(
        'seller_commissions',
        m.k,
        'recuento sin cambio de cifras: solo updated_at (0078, 0079)',
      )
  }
  resumen.comisiones_conservadas = comAntes.size
  resumen.comisiones_nuevas_en_cero = nuevasEsperadas.size

  // ---- 4. lo que no cambia: ni una fila, ni una cifra por entidad
  for (const tabla of MONEY_TABLES) {
    const c = input.cambios[tabla]
    if (c && (c.agregadas.length || c.modificadas.length || c.quitadas.length)) {
      alto(
        `${tabla}: ${c.agregadas.length} nueva(s), ${c.modificadas.length} modificada(s) y ${c.quitadas.length} borrada(s). Estas migraciones no tocan ${tabla}.`,
      )
    }
  }
  const conservado = <T>(
    campo: string,
    nombre: string,
    filasAntes: T[],
    filasDespues: T[],
    id: (r: T) => string,
  ) => {
    const x = new Map(filasAntes.map((r) => [id(r), stableJson(r)]))
    const y = new Map(filasDespues.map((r) => [id(r), stableJson(r)]))
    const distintas = [...new Set([...x.keys(), ...y.keys()])].filter((k) => x.get(k) !== y.get(k))
    if (distintas.length > 0) {
      alto(
        `${nombre} no se conservan por entidad: ${distintas.length} entidad(es) con otra cifra o recuento (la primera, ${distintas[0]!.split('|').map(short).join(' · ')}).`,
      )
    }
    resumen[`entidades_de_${campo}`] = x.size
  }
  conservado(
    'ledger',
    'Los movimientos del ledger',
    b.ledger,
    a.ledger,
    (r) => `${r.raffle_id}|${r.seller_id}|${String(r.team_movement)}`,
  )
  conservado('pagos', 'Los pagos', b.pagos, a.pagos, (r) => r.seller_id)
  conservado(
    'boletas',
    'Las boletas',
    b.boletas,
    a.boletas,
    (r) => `${r.raffle_id}|${String(r.seller_id)}|${r.inventory_status}|${r.payment_status}`,
  )

  return { detener, explicadas, bitacoraUsada, resumen }
}


// -----------------------------------------------------------------------------
// Los números de cada rifa (0084, D-261): los hechos y lo que la migración deja
// -----------------------------------------------------------------------------

/** Lo que una fila de raffles dice de sus números; todo nulo antes de la 0084. */
export type NumberGroupConfig = {
  number_group_count: number | null
  first_group_name: string | null
  first_group_digits: number | null
  second_group_name: string | null
  second_group_digits: number | null
}

/** Recuentos por clave —un estado, un ancho, un number_group_count— sin ningún número. */
export type Counts = Record<string, number>

/**
 * Los hechos de números de una foto. POR RIFA, en agregado: cuántas boletas, cuántas con
 * números, cuántas no tienen «Diario» 4 + «Semanal» 4 —con la MISMA definición que la
 * auditoría de la 0084—, por estado, y los anchos que hay. Ningún número de boleta, ningún
 * cliente. `grupos`: el number_group_count de las boletas, vacío antes de la 0084.
 */
export type NumberFacts = {
  /** `antes`: las rifas todavía no tienen sus números (sin la 0084). */
  forma: 'antes' | '0084'
  rifas: Array<{ id: string; organization_id: string } & NumberGroupConfig>
  boletas: Array<{
    raffle_id: string
    tickets_count: number
    tickets_with_numbers: number
    nonconforming_count: number
    nonconforming_by_status: Counts
    daily_lengths: Counts
    weekly_lengths: Counts
    grupos: Counts
  }>
  auditoria: Array<
    {
      raffle_id: string
      organization_id: string
      source: string
      tickets_count: number
      tickets_with_numbers: number
      nonconforming_count: number
      nonconforming_by_status: Counts
      daily_lengths: Counts
      weekly_lengths: Counts
    } & NumberGroupConfig
  > | null
}

/** Una boleta fuera de «Diario» 4 + «Semanal» 4: la definición de la auditoría de la 0084. */
const NONCONFORMING_4X4 = `((t.daily_number is not null and t.daily_number !~ '^[0-9]{4}$')
    or (t.weekly_number is not null and t.weekly_number !~ '^[0-9]{4}$'))`

/**
 * Los hechos de números, con el esquema de antes o con el de la 0084. Solo `select`; por
 * rifa y en agregado, sin números de boleta ni datos de cliente.
 */
export async function readNumberFacts(query: Query): Promise<NumberFacts> {
  const [shape] = await query<{ columnas: boolean; auditoria: boolean }>(
    `select exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'raffles'
                      and column_name = 'number_group_count') as columnas,
            to_regclass('public.raffle_number_format_audits') is not null as auditoria`,
  )
  const columnas = shape!.columnas === true
  const counts = (rows: Array<{ raffle_id: string; k: string; n: number }>, id: string): Counts =>
    Object.fromEntries(rows.filter((r) => r.raffle_id === id).map((r) => [r.k, Number(r.n)]))

  const rifas = (
    await query<Record<string, unknown>>(
      `select r.id::text as id, r.organization_id::text as organization_id,
              (to_jsonb(r) ->> 'number_group_count')::int as number_group_count,
              to_jsonb(r) ->> 'first_group_name' as first_group_name,
              (to_jsonb(r) ->> 'first_group_digits')::int as first_group_digits,
              to_jsonb(r) ->> 'second_group_name' as second_group_name,
              (to_jsonb(r) ->> 'second_group_digits')::int as second_group_digits
         from raffles r order by r.id`,
    )
  ).map((r) => ({
    id: String(r.id),
    organization_id: String(r.organization_id),
    number_group_count: (r.number_group_count as number | null) ?? null,
    first_group_name: (r.first_group_name as string | null) ?? null,
    first_group_digits: (r.first_group_digits as number | null) ?? null,
    second_group_name: (r.second_group_name as string | null) ?? null,
    second_group_digits: (r.second_group_digits as number | null) ?? null,
  }))

  const totals = await query<{
    raffle_id: string
    tickets_count: number
    tickets_with_numbers: number
    nonconforming_count: number
  }>(
    `select t.raffle_id::text as raffle_id, count(*)::int as tickets_count,
            count(*) filter (where t.daily_number is not null or t.weekly_number is not null)::int
              as tickets_with_numbers,
            count(*) filter (where ${NONCONFORMING_4X4})::int as nonconforming_count
       from tickets t group by 1 order by 1`,
  )
  const byStatus = await query<{ raffle_id: string; k: string; n: number }>(
    `select t.raffle_id::text as raffle_id, t.inventory_status::text as k, count(*)::int as n
       from tickets t where ${NONCONFORMING_4X4} group by 1, 2`,
  )
  const daily = await query<{ raffle_id: string; k: string; n: number }>(
    `select t.raffle_id::text as raffle_id, char_length(t.daily_number)::text as k, count(*)::int as n
       from tickets t where t.daily_number is not null group by 1, 2`,
  )
  const weekly = await query<{ raffle_id: string; k: string; n: number }>(
    `select t.raffle_id::text as raffle_id, char_length(t.weekly_number)::text as k, count(*)::int as n
       from tickets t where t.weekly_number is not null group by 1, 2`,
  )
  const grupos = columnas
    ? await query<{ raffle_id: string; k: string; n: number }>(
        `select t.raffle_id::text as raffle_id, (to_jsonb(t) ->> 'number_group_count') as k,
                count(*)::int as n
           from tickets t group by 1, 2`,
      )
    : []

  const auditoria = shape!.auditoria
    ? (
        await query<Record<string, unknown>>(
          `select raffle_id::text, organization_id::text, source, number_group_count::int,
                  first_group_name, first_group_digits::int, second_group_name,
                  second_group_digits::int, tickets_count, tickets_with_numbers, nonconforming_count,
                  nonconforming_by_status, daily_lengths, weekly_lengths
             from raffle_number_format_audits order by raffle_id`,
        )
      ).map((a) => ({
        raffle_id: String(a.raffle_id),
        organization_id: String(a.organization_id),
        source: String(a.source),
        number_group_count: (a.number_group_count as number | null) ?? null,
        first_group_name: (a.first_group_name as string | null) ?? null,
        first_group_digits: (a.first_group_digits as number | null) ?? null,
        second_group_name: (a.second_group_name as string | null) ?? null,
        second_group_digits: (a.second_group_digits as number | null) ?? null,
        tickets_count: Number(a.tickets_count),
        tickets_with_numbers: Number(a.tickets_with_numbers),
        nonconforming_count: Number(a.nonconforming_count),
        nonconforming_by_status: a.nonconforming_by_status as Counts,
        daily_lengths: a.daily_lengths as Counts,
        weekly_lengths: a.weekly_lengths as Counts,
      }))
    : null

  return {
    forma: columnas ? '0084' : 'antes',
    rifas,
    boletas: totals.map((t) => ({
      raffle_id: t.raffle_id,
      tickets_count: Number(t.tickets_count),
      tickets_with_numbers: Number(t.tickets_with_numbers),
      nonconforming_count: Number(t.nonconforming_count),
      nonconforming_by_status: counts(byStatus, t.raffle_id),
      daily_lengths: counts(daily, t.raffle_id),
      weekly_lengths: counts(weekly, t.raffle_id),
      grupos: counts(grupos, t.raffle_id),
    })),
    auditoria,
  }
}

/** Lo que la 0084 les asigna a las rifas que ya existían (su sección 1): una regla, no un recuento. */
export const EXISTING_RAFFLE_GROUPS = {
  number_group_count: 2,
  first_group_name: 'Diario',
  first_group_digits: 4,
  second_group_name: 'Semanal',
  second_group_digits: 4,
} as const

function isNumberFacts(value: unknown): value is NumberFacts {
  const v = value as NumberFacts | null | undefined
  return (
    !!v &&
    (v.forma === 'antes' || v.forma === '0084') &&
    Array.isArray(v.rifas) &&
    Array.isArray(v.boletas)
  )
}

/**
 * Los efectos de datos de la publicación 0081–0084, comprobados (D-262). PURO.
 *
 * La 0081, la 0082 y la 0083 no tocan datos. La 0084 sí deja dos cosas, y nada más:
 *   · `raffle_number_format_audits`, una tabla NUEVA con una fila por cada rifa que ya
 *     existía: lo que encontró en sus boletas, derivado aquí de la foto de antes con la
 *     misma definición, y la configuración que le asignó;
 *   · las columnas nuevas de `raffles` y `tickets` con sus valores por omisión: cada rifa
 *     de antes en «Diario» 4 + «Semanal» 4 y cada boleta de antes con number_group_count 2.
 * Las filas de `raffles` y `tickets` no aparecen como cambiadas —la foto de después se
 * toma con `--base` y sus huellas excluyen las columnas nuevas—, así que esta función no
 * explica ninguna fila: solo comprueba lo que las huellas no ven.
 */
export function numberGroupMigrationEffects(input: DataEffectsInput): DataEffectsResult {
  const detener: string[] = []
  const resultado = (resumen: Record<string, number> = {}): DataEffectsResult => ({
    detener,
    explicadas: [],
    bitacoraUsada: [],
    resumen,
  })
  if (!isNumberFacts(input.before) || !isNumberFacts(input.after)) {
    detener.push(
      'Las fotos no traen los hechos de números (hechos.numeros): tómalas con el gate-snapshot del candidato.',
    )
    return resultado()
  }
  const before = input.before
  const after = input.after
  if (before.forma !== 'antes') {
    detener.push('La foto de antes ya tiene la 0084: no es la línea base de esta publicación.')
  }
  if (after.forma !== '0084' || after.auditoria === null) {
    detener.push('La foto de después no tiene la 0084: sus rifas no tienen números ni auditoría.')
  }
  if (detener.length > 0) return resultado()
  const auditoria = after.auditoria!

  const nuevas = input.tablasNuevas.raffle_number_format_audits
  if (nuevas === undefined) {
    detener.push('raffle_number_format_audits no es una tabla nueva de esta puerta.')
  } else if (nuevas !== auditoria.length) {
    detener.push(
      `raffle_number_format_audits tiene ${nuevas} filas y los hechos describen ${auditoria.length}.`,
    )
  }

  const compara = (quien: string, campo: string, es: unknown, esperado: unknown) => {
    if (stableJson(es) !== stableJson(esperado)) {
      detener.push(`${quien}: ${campo} es ${stableJson(es)} y se esperaba ${stableJson(esperado)}.`)
    }
  }
  const vacio = {
    tickets_count: 0,
    tickets_with_numbers: 0,
    nonconforming_count: 0,
    nonconforming_by_status: {},
    daily_lengths: {},
    weekly_lengths: {},
  }

  const deAntes = new Set(before.rifas.map((r) => r.id))
  for (const fila of auditoria) {
    if (!deAntes.has(fila.raffle_id)) {
      detener.push(`Auditoría de ${fila.raffle_id}: esa rifa no existía antes de la migración.`)
    }
  }

  let boletas = 0
  let fueraDeFormato = 0
  for (const rifa of before.rifas) {
    const b = before.boletas.find((x) => x.raffle_id === rifa.id) ?? { ...vacio, grupos: {} }
    boletas += b.tickets_count
    fueraDeFormato += b.nonconforming_count

    const fila = auditoria.find((a) => a.raffle_id === rifa.id)
    if (!fila) {
      detener.push(`Rifa ${rifa.id}: sin su fila en raffle_number_format_audits.`)
    } else {
      const quien = `Auditoría de ${rifa.id}`
      compara(quien, 'organization_id', fila.organization_id, rifa.organization_id)
      compara(quien, 'source', fila.source, '0084')
      for (const [campo, valor] of Object.entries(EXISTING_RAFFLE_GROUPS)) {
        compara(quien, campo, fila[campo as keyof NumberGroupConfig], valor)
      }
      for (const campo of Object.keys(vacio) as Array<keyof typeof vacio>) {
        compara(quien, campo, fila[campo], b[campo])
      }
    }

    const ahora = after.rifas.find((r) => r.id === rifa.id)
    if (!ahora) {
      detener.push(`Rifa ${rifa.id}: no está en la foto de después.`)
    } else {
      for (const [campo, valor] of Object.entries(EXISTING_RAFFLE_GROUPS)) {
        compara(`Rifa ${rifa.id}`, campo, ahora[campo as keyof NumberGroupConfig], valor)
      }
    }

    const despues = after.boletas.find((x) => x.raffle_id === rifa.id)
    const grupos = despues?.grupos ?? {}
    const esperado = b.tickets_count > 0 ? { '2': b.tickets_count } : {}
    if (stableJson(grupos) !== stableJson(esperado)) {
      detener.push(
        `Boletas de ${rifa.id}: number_group_count ${stableJson(grupos)} y se esperaba ${stableJson(esperado)}.`,
      )
    }
  }

  return resultado({ rifas: before.rifas.length, boletas, fuera_de_formato: fueraDeFormato })
}

/**
 * Qué migraciones migran datos, por la lista EXACTA de las que añade la puerta. Cualquier
 * otra lista —también `0078` sola, o la `0084` sin las otras tres— sigue con la
 * exigencia de siempre: tablas nuevas vacías y nada de lo que existía, tocado.
 */
export const DATA_MIGRATIONS: Record<string, DataMigration> = {
  '0078,0079': {
    nombre: 'configuración de ganancias (0078, 0079)',
    hechos: 'ganancias',
    tablasConDatos: new Set(['commission_tier_lists', 'commission_tier_list_items']),
    tablasRetiradas: new Set(['commission_tiers']),
    comprobar: earningMigrationEffects,
  },
  // D-262: la publicación del inventario común y de los números de cada rifa, entera.
  '0081,0082,0083,0084': {
    nombre: 'inventario común y números de cada rifa (0081, 0082, 0083, 0084)',
    hechos: 'numeros',
    tablasConDatos: new Set(['raffle_number_format_audits']),
    tablasRetiradas: new Set(),
    comprobar: numberGroupMigrationEffects,
  },
}

/** Los efectos de datos de una puerta de migraciones, si esa lista exacta los tiene. */
export function dataMigrationFor(added: readonly string[]): DataMigration | null {
  return DATA_MIGRATIONS[added.join(',')] ?? null
}
