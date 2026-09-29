import type { Tier } from './tiers'

/**
 * El acuerdo de ganancia de un vendedor, tal como lo leen las pantallas (D-237).
 *
 * PURO Y SIN `server-only`: lo usan los componentes de cliente que lo pintan y
 * las paginas que lo leen. No calcula ninguna ganancia —eso lo hace el motor en
 * PostgreSQL (BR-G05)—; describe con que regla se le paga a alguien.
 *
 * Cada vendedor tiene DOS acuerdos en su membresia y rige uno (D-237 §3):
 *
 *   * el ADMINISTRATIVO (`direct`), mientras NO tiene vendedor padre —aunque
 *     tenga integrantes a su cargo: un jefe de equipo cobra por este—: la mitad
 *     del precio (solo quien ya la tenia), un fijo o unos tramos. Lo configura
 *     el personal (BR-G30, BR-G31);
 *   * el DE EQUIPO (`team`), mientras tiene vendedor padre: un fijo o la lista
 *     general por tramos. Lo elige su vendedor padre, y nadie mas (BR-G24,
 *     BR-G34, D-238).
 *
 * La condicion es tener o no vendedor padre, no tener o no equipo propio. El
 * que no rige queda inerte y vuelve tal cual si cambia la situacion.
 */

export type AgreementMode = 'half_price' | 'fixed_per_ticket' | 'tiered'

/** Una lista de tramos guardada: una version de la general o la de un vendedor. */
export type TierListInfo = {
  id: string
  kind: 'template' | 'custom'
  /** Solo en la lista general: 1, 2, 3... */
  templateVersion: number | null
  tiers: Tier[]
}

export type Agreement = {
  mode: AgreementMode
  /** Solo con `fixed_per_ticket`. */
  fixedAmount: number | null
  /**
   * Solo con `tiered`. `null` tambien si la RLS no deja leerla, que no deberia
   * pasar con ningun lector legitimo: la general la lee toda la organizacion y
   * una personalizada, su dueño y el personal.
   */
  list: TierListInfo | null
}

export type SellerAgreement = {
  profileId: string
  parentSellerId: string | null
  /** El acuerdo que rige hoy, y de cual de los dos sale. */
  effective: Agreement & { source: 'direct' | 'team' }
  direct: Agreement
  team: Agreement
}

/**
 * Lo que gana por la PRIMERA boleta que cobre completa, para decirselo a quien
 * todavia no ha cobrado ninguna: justo cuando no hay fila de comision que leer.
 *
 * No es un calculo de dinero ganado: es leer la regla. La mitad se redondea
 * hacia abajo como la redondea el motor (`floor(precio / 2)`, BR-G15). `null`
 * cuando la regla depende de un precio que no hay.
 */
export function firstTicketRate(agreement: Agreement, ticketPrice: number | null): number | null {
  switch (agreement.mode) {
    case 'half_price':
      return ticketPrice === null ? null : Math.floor(ticketPrice / 2)
    case 'fixed_per_ticket':
      return agreement.fixedAmount
    case 'tiered':
      return agreement.list?.tiers[0]?.rate ?? null
  }
}

/** Si la lista de un acuerdo es la general vigente, una version anterior o propia. */
export type TierListOrigin = 'current_template' | 'old_template' | 'custom'

export function tierListOrigin(list: TierListInfo, currentTemplateId: string | null): TierListOrigin {
  if (list.kind === 'custom') return 'custom'
  return list.id === currentTemplateId ? 'current_template' : 'old_template'
}
