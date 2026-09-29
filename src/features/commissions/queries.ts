import 'server-only'

import { listRaffleOptions, type RaffleOption } from '@/features/raffles/queries'
import { createClient } from '@/lib/supabase/server'

import type { Agreement, AgreementMode, SellerAgreement, TierListInfo } from './agreement'
import { fromDbTiers } from './tiers'

/**
 * Lectura de comisiones.
 *
 * TODO pasa por `commission_summary` (migracion 0024, ampliada en la 0078):
 * ninguna pantalla suma, multiplica ni decide tramos por su cuenta. Es la regla del proyecto para el
 * dinero —se calcula en SQL— y ademas lo que pedia el encargo: una sola fuente
 * de verdad en el servidor.
 *
 * La funcion es `security invoker`, asi que quien pregunta recibe lo suyo, lo de
 * su equipo o —si es personal— lo de su organizacion, sin que este archivo tenga
 * que repetir esas condiciones.
 */

/**
 * Con que regla se le paga a este vendedor: la del acuerdo que RIGE (D-237).
 *
 *   `half_price` — la mitad del precio vigente de la rifa. Solo rige para
 *                  quien ya la tenia y no tiene vendedor padre, tenga o no
 *                  integrantes a su cargo (BR-G30).
 *   `tiered`     — por tramos: los de la lista general o unos propios.
 *   `fixed`      — una cifra fija por boleta.
 *
 * Desde D-237 las tres existen con y sin vendedor padre: un vendedor directo
 * tambien puede cobrar un fijo o por tramos. Se explican con palabras distintas
 * y ninguna sirve para las otras dos: a quien cobra fijo no se le puede hablar
 * de subir de tramo, y a quien cobra la mitad tampoco.
 */
export type PayModel = 'half_price' | 'tiered' | 'fixed'

export type CommissionSummary = {
  sellerId: string
  raffleId: string
  payModel: PayModel
  /**
   * Verdadero solo con `tiered`. Es exactamente la condicion que habilita
   * hablar de «subir de tramo», y por eso sigue existiendo aparte de
   * `payModel`: las pantallas preguntan por la capacidad, no por el nombre.
   */
  byTiers: boolean
  /** Boletas pagadas por completo: las que cuentan para la comision (BR-G01). */
  ticketsPaid: number
  /**
   * Las boletas que deciden su TRAMO (BR-G27): las suyas mas las de su equipo si
   * lo tiene; las suyas si no. Es con este conteo, y no con `ticketsPaid`, con
   * el que se sube de tramo, y por eso tambien es el que cuenta
   * `ticketsToNext`.
   */
  tierTicketsPaid: number
  /** Lo que vale hoy cada boleta pagada. */
  rate: number
  /**
   * Ganancia acumulada por lo que vendio EL MISMO, con sus rebajas ya restadas
   * (BR-G17). No incluye lo que le deja su equipo: eso es `teamEarned`, y van
   * separadas porque son dinero de distinta naturaleza y la pantalla tiene que
   * poder decir cual es cual.
   */
  earned: number
  /** Boletas cobradas por los integrantes de su equipo (BR-G20). Cero sin equipo. */
  teamTicketsPaid: number
  /**
   * Lo que le queda por las ventas de su equipo: por cada boleta cobrada, SU
   * tarifa menos la del integrante (BR-G20, D-237). Cero sin equipo.
   */
  teamEarned: number
  /** Lo que se le debe en total por esta rifa. Es lo que se le paga. */
  totalEarned: number
  /**
   * Lo que se ha dejado de ganar por rebajar boletas (BR-G17, D-099).
   *
   * Se DERIVA de las otras tres cifras, no se consulta: por definicion
   * `earned = ticketsPaid × rate − rebajas`, asi que la resta es exacta. Y es
   * ademas la unica forma segura de obtenerla aqui: `commission_summary` es
   * `security invoker`, de modo que un `join` contra `tickets` devolveria cero
   * para los integrantes de un equipo —su vendedor padre no ve sus boletas
   * (D-092)— sin que nada avisara (misma trampa que I-015).
   *
   * Cuando la ganancia toca su suelo de cero (BR-G19) esta cifra se queda corta:
   * lo rebajado de verdad fue mas. Solo sirve para explicar una ganancia, nunca
   * como dato contable.
   */
  discounts: number
  /**
   * Desde cuantas boletas aplica el siguiente tramo, cuanto paga y cuantas le
   * faltan, contadas como su tramo (`tierTicketsPaid`). `null` sin tramos
   * por delante.
   */
  nextMinTickets: number | null
  nextRate: number | null
  ticketsToNext: number | null
  /**
   * PROYECCION de lo PROPIO al llegar al siguiente tramo. No es dinero ganado.
   * `null` con equipo: ahi el siguiente tramo depende de quien venda.
   */
  projectedEarned: number | null
}

function mapRow(row: {
  seller_id: string
  raffle_id: string
  pay_model: string
  by_tiers: boolean
  tickets_paid: number
  rate: number
  earned: number
  team_tickets_paid: number
  team_earned: number
  tier_tickets_paid: number
  next_min_tickets: number | null
  next_rate: number | null
  tickets_to_next: number | null
  projected_earned: number | null
}): CommissionSummary {
  const ticketsPaid = Number(row.tickets_paid ?? 0)
  const rate = Number(row.rate ?? 0)
  const earned = Number(row.earned ?? 0)
  const teamEarned = Number(row.team_earned ?? 0)

  return {
    sellerId: row.seller_id,
    raffleId: row.raffle_id,
    // `commission_summary` solo devuelve estos tres, pero el tipo generado dice
    // `string`: la comprobacion mantiene honesto el tipo sin confiar en un cast.
    payModel:
      row.pay_model === 'tiered' || row.pay_model === 'fixed' ? row.pay_model : 'half_price',
    byTiers: row.by_tiers,
    ticketsPaid,
    tierTicketsPaid: Number(row.tier_tickets_paid ?? 0),
    rate,
    earned,
    teamTicketsPaid: Number(row.team_tickets_paid ?? 0),
    teamEarned,
    totalEarned: earned + teamEarned,
    // Se deriva de lo PROPIO, nunca del total: sumarle lo del equipo daria cero
    // rebajas en cuanto un vendedor padre tuviera equipo (BR-G20).
    discounts: Math.max(0, ticketsPaid * rate - earned),
    nextMinTickets: row.next_min_tickets,
    nextRate: row.next_rate === null ? null : Number(row.next_rate),
    ticketsToNext: row.tickets_to_next,
    projectedEarned: row.projected_earned === null ? null : Number(row.projected_earned),
  }
}

async function listCommissions(raffleId?: string): Promise<CommissionSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('commission_summary', {
    p_raffle_id: raffleId,
  })

  if (error) throw error
  return (data ?? []).map(mapRow)
}

/**
 * De que rifa habla la comision que se muestra.
 *
 * El negocio opera una sola rifa activa (D-088) y entonces esto devuelve esa y
 * ya esta. Pero el modelo admite varias, y ahi «la mas reciente» resulto ser
 * una regla mala: al probarlo con la base de las pruebas —que acumula rifas
 * creadas por las E2E— eligio una rifa activa sin ventas y la pantalla mostro
 * $0 a un vendedor que tenia $80.000. La regla correcta es «donde esta el
 * trabajo»: entre las activas, aquella donde quien consulta acumula mas boletas
 * cobradas.
 *
 * Y la pantalla dice de que rifa habla: con una sola es redundante, con varias
 * es la diferencia entre informar y confundir.
 */
export type CommissionContext = {
  /** De qué rifa hablan las cifras. `null` si no hay ninguna activa. */
  raffle: RaffleOption | null
  /** Comisión de cada vendedor visible EN ESA rifa, por id de vendedor. */
  bySeller: Map<string, CommissionSummary>
}

/**
 * Todo lo que una pantalla necesita para hablar de comisión, en dos consultas.
 *
 * Elegir la rifa y leer las cifras salen de la MISMA lectura: pedirlas por
 * separado significaba llamar a `commission_summary` dos veces por pantalla
 * —una para decidir y otra para mostrar— y nada garantizaba que las dos vieran
 * lo mismo.
 */
export async function getCommissionContext(): Promise<CommissionContext> {
  const [rows, raffles] = await Promise.all([listCommissions(), listRaffleOptions()])

  const active = raffles.filter((raffle) => raffle.status === 'active')

  let elegida: RaffleOption | null = active[0] ?? null
  if (active.length > 1) {
    const paidByRaffle = new Map<string, number>()
    for (const row of rows) {
      paidByRaffle.set(row.raffleId, (paidByRaffle.get(row.raffleId) ?? 0) + row.ticketsPaid)
    }
    elegida =
      [...active].sort(
        (a, b) =>
          (paidByRaffle.get(b.id) ?? 0) - (paidByRaffle.get(a.id) ?? 0) ||
          b.shortCode.localeCompare(a.shortCode),
      )[0] ?? null
  }

  const bySeller = new Map<string, CommissionSummary>(
    rows.filter((row) => row.raffleId === elegida?.id).map((row) => [row.sellerId, row]),
  )

  return { raffle: elegida, bySeller }
}

/**
 * Una lista de tramos tal como llega embebida de PostgREST. La RLS decide si
 * llega: la general la lee toda la organizacion; una personalizada, su dueño y
 * el personal (D-237 §7).
 */
type DbTierList = {
  id: string
  kind: 'template' | 'custom'
  template_version: number | null
  items: Array<{ min_tickets: number; rate: number }> | null
} | null

function mapTierList(row: DbTierList): TierListInfo | null {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    templateVersion: row.template_version,
    tiers: fromDbTiers(row.items ?? []),
  }
}

/**
 * Los dos acuerdos de una membresia con sus listas, en UNA peticion: las listas
 * vienen embebidas por las dos claves foraneas de la `0078`, en vez de una
 * segunda ida y vuelta para leer los tramos.
 */
const AGREEMENT_SELECT = `
  profile_id,
  parent_seller_id,
  commission_model,
  fixed_commission_amount,
  direct_commission_mode,
  direct_fixed_amount,
  direct_list:commission_tier_lists!memberships_direct_tier_list_fk ( id, kind, template_version, items:commission_tier_list_items ( min_tickets, rate ) ),
  team_list:commission_tier_lists!memberships_team_tier_list_fk ( id, kind, template_version, items:commission_tier_list_items ( min_tickets, rate ) )
`

type AgreementRow = {
  profile_id: string
  parent_seller_id: string | null
  commission_model: 'tiered' | 'fixed_per_ticket'
  fixed_commission_amount: number | null
  direct_commission_mode: AgreementMode
  direct_fixed_amount: number | null
  direct_list: DbTierList
  team_list: DbTierList
}

function mapAgreement(row: AgreementRow): SellerAgreement {
  const direct: Agreement = {
    mode: row.direct_commission_mode,
    fixedAmount:
      row.direct_commission_mode === 'fixed_per_ticket' && row.direct_fixed_amount !== null
        ? Number(row.direct_fixed_amount)
        : null,
    list: row.direct_commission_mode === 'tiered' ? mapTierList(row.direct_list) : null,
  }
  const team: Agreement = {
    mode: row.commission_model,
    fixedAmount:
      row.commission_model === 'fixed_per_ticket' && row.fixed_commission_amount !== null
        ? Number(row.fixed_commission_amount)
        : null,
    list: row.commission_model === 'tiered' ? mapTierList(row.team_list) : null,
  }

  return {
    profileId: row.profile_id,
    parentSellerId: row.parent_seller_id,
    // D-237 §3: con vendedor padre rige el de equipo; sin el, el administrativo.
    effective:
      row.parent_seller_id === null ? { ...direct, source: 'direct' } : { ...team, source: 'team' },
    direct,
    team,
  }
}

/**
 * El acuerdo de un vendedor, o `null` si quien pregunta no puede verlo.
 *
 * Lo leen tres lectores y los tres por la RLS de siempre (`memberships_select`):
 * el propio vendedor, su vendedor padre y el personal de su organizacion. Un id
 * ajeno y uno inexistente devuelven lo mismo.
 *
 * NO ES CARTERA (D-198): dice con que regla se le paga, no cuanto lleva. Por eso
 * el personal lo lee aunque no vea ninguna ganancia.
 */
export async function getSellerAgreement(
  organizationId: string,
  profileId: string,
): Promise<SellerAgreement | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select(AGREEMENT_SELECT)
    .eq('organization_id', organizationId)
    .eq('profile_id', profileId)
    .eq('role', 'seller')
    .maybeSingle()

  if (error) throw error
  return data ? mapAgreement(data as unknown as AgreementRow) : null
}

/**
 * Los acuerdos de VARIOS vendedores en una sola peticion, por id de perfil.
 *
 * Existe para las pantallas que necesitan el de quien mira y el de otro a la
 * vez —la ficha de un integrante: el del padre dice como se escribe el tope, y
 * el del integrante, sus tramos—: dos lecturas de la misma tabla en la misma
 * espera eran dos idas y vueltas. Quien no se puede ver sencillamente no esta
 * en el mapa, igual que en `getSellerAgreement`.
 */
export async function listSellerAgreements(
  organizationId: string,
  profileIds: readonly string[],
): Promise<Map<string, SellerAgreement>> {
  if (profileIds.length === 0) return new Map()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select(AGREEMENT_SELECT)
    .eq('organization_id', organizationId)
    .in('profile_id', [...profileIds])
    .eq('role', 'seller')

  if (error) throw error
  return new Map(
    ((data ?? []) as unknown as AgreementRow[]).map((row) => [row.profile_id, mapAgreement(row)]),
  )
}

export type CommissionTemplate = TierListInfo & {
  templateVersion: number
  /** Cuando se guardo esta version. */
  savedAt: string
}

/**
 * La lista general VIGENTE: la version mas alta de la organizacion (BR-G29).
 *
 * La lee cualquiera de la organizacion —es la regla del juego—. `null` solo si
 * la organizacion no tiene ninguna, que no deberia pasar: la `0078` le da la
 * version 1 a cada organizacion y el alta de una nueva tambien.
 */
export async function getCommissionTemplate(
  organizationId: string,
): Promise<CommissionTemplate | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('commission_tier_lists')
    .select('id, kind, template_version, created_at, items:commission_tier_list_items ( min_tickets, rate )')
    .eq('organization_id', organizationId)
    .eq('kind', 'template')
    .order('template_version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data || data.template_version === null) return null

  return {
    id: data.id,
    kind: 'template',
    templateVersion: data.template_version,
    tiers: fromDbTiers(data.items ?? []),
    savedAt: data.created_at,
  }
}

export type TeamCommissionLimits = {
  /**
   * La ganancia fija mas alta que el vendedor que consulta puede pagarle a un
   * integrante: lo que el gana por boleta en el peor caso (BR-G28). `null` si su
   * acuerdo depende de un precio y no hay ninguna rifa.
   */
  maxFixed: number | null
  /** La version de la lista general que recibiria un integrante por tramos. */
  templateListId: string | null
  /**
   * Por que la lista general NO cabe en su acuerdo, dicho para una persona, o
   * `null` si cabe. Con una frase aqui, la pantalla no ofrece los tramos.
   */
  templateProblem: string | null
}

/**
 * Lo que un vendedor a cargo puede ofrecerle a un integrante (BR-G28).
 *
 * Sale de la MISMA funcion que aplica la base (`commission_parent_cap`,
 * `commission_pair_problem`), para que la pantalla no ofrezca algo que el
 * disparador va a rechazar. Solo informa: la ultima palabra la tiene el
 * disparador, que ademas mira las rifas cerradas y las rebajas.
 *
 * Solo la puede pedir quien puede formar equipo: activo y sin vendedor padre.
 */
export async function getTeamCommissionLimits(
  organizationId: string,
): Promise<TeamCommissionLimits> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('team_commission_limits', { p_organization_id: organizationId })
    .single()

  if (error) throw error

  return {
    maxFixed: data?.max_fixed === null || data?.max_fixed === undefined ? null : Number(data.max_fixed),
    templateListId: data?.template_list_id ?? null,
    templateProblem: data?.template_problem ?? null,
  }
}

/**
 * Quien aparece en `bySeller` lo decide la RLS, no este archivo: un vendedor
 * recibe lo suyo y lo de su equipo; el Dueño y el Administrador, lo de toda la
 * organizacion (BR-G12). La misma lectura sirve al panel del vendedor, a «Mi
 * equipo» y al portal administrativo.
 *
 * Que un vendedor no tenga fila NO es lo mismo que tener cero: significa que
 * todavia no ha cobrado ninguna boleta en esa rifa, y la pantalla lo dice con
 * palabras en vez de pintar un importe.
 */
