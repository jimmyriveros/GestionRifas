import { z } from 'zod'

import { formatCOP } from '@/lib/money'

/**
 * Las listas de tramos (D-237, BR-G29, BR-G32): la general de la organizacion y
 * las personalizadas de un vendedor.
 *
 * PURO Y COMPARTIDO: lo importan el editor (cliente), los esquemas de las
 * acciones (servidor) y sus pruebas. No calcula ninguna ganancia —eso es del
 * motor en PostgreSQL—: valida la forma de una lista y deriva el «hasta» de
 * cada tramo para ensenarlo.
 *
 * LOS MENSAJES SON LOS DE LA BASE (`commission_tiers_problem`, 0078), letra por
 * letra: quien vea el mismo error por los dos caminos no tiene por que entender
 * que son dos sistemas. El unico propio de la pantalla es el del orden: el
 * editor pide los tramos de menor a mayor, y la base los ordena sola.
 */

/** Un tramo tal como se escribe: vacio mientras la persona no lo llena. */
export type EditableTier = { minTickets: number | null; rate: number | null }

/** Un tramo completo. */
export type Tier = { minTickets: number; rate: number }

/** Los mismos limites de cordura que la base (BR-G32). */
export const TIER_LIMITS = {
  maxTiers: 20,
  maxMinTickets: 100_000,
  maxRate: 10_000_000,
} as const

export const TIER_MESSAGES = {
  empty: 'Escribe al menos un tramo.',
  tooMany: 'Puedes tener como máximo 20 tramos.',
  missing: 'Cada tramo necesita desde cuántas boletas aplica y cuánto se gana por boleta.',
  notInteger: 'Escribe cantidades enteras: boletas sin decimales y pesos sin centavos.',
  minBelowOne: 'Un tramo tiene que empezar en 1 boleta o más.',
  minTooHigh: 'Un tramo no puede empezar después de la boleta 100.000.',
  rateNotPositive: 'La ganancia por boleta tiene que ser mayor que cero.',
  rateTooHigh: 'La ganancia por boleta no puede pasar de $10.000.000.',
  firstNotOne: 'El primer tramo tiene que empezar en 1 boleta.',
  duplicate: (desde: number) =>
    `Dos tramos empiezan desde ${desde} ${desde === 1 ? 'boleta' : 'boletas'}. Cada tramo tiene que empezar en una cantidad distinta de boletas.`,
  notIncreasing: (desde: number, anterior: number) =>
    `El tramo que empieza en ${desde} boletas tiene que pagar más que el anterior, que paga ${formatCOP(anterior)} por boleta.`,
  // Solo de la pantalla: el editor muestra el «hasta» del tramo siguiente, y
  // eso exige escribirlos en orden.
  outOfOrder: (anterior: number) =>
    `Este tramo tiene que empezar después del anterior, que empieza en ${anterior} ${anterior === 1 ? 'boleta' : 'boletas'}.`,
} as const

export type TierProblems = {
  /** Un problema de la lista entera (vacía, demasiados tramos). */
  list: string | null
  /** Un problema por fila, con su índice. */
  rows: Record<number, string>
}

/**
 * Lo que tiene de malo una lista, en el ORDEN en que la persona la escribio.
 * Vacio = valida. Primer problema de cada fila: uno a la vez (§4 de la guia).
 */
export function tierProblems(tiers: readonly EditableTier[]): TierProblems {
  const rows: Record<number, string> = {}
  if (tiers.length === 0) return { list: TIER_MESSAGES.empty, rows }
  if (tiers.length > TIER_LIMITS.maxTiers) return { list: TIER_MESSAGES.tooMany, rows }

  tiers.forEach((tier, index) => {
    if (rows[index]) return
    const { minTickets, rate } = tier
    if (minTickets === null || rate === null) {
      rows[index] = TIER_MESSAGES.missing
    } else if (index === 0 && minTickets !== 1) {
      rows[index] = TIER_MESSAGES.firstNotOne
    } else if (minTickets < 1) {
      rows[index] = TIER_MESSAGES.minBelowOne
    } else if (minTickets > TIER_LIMITS.maxMinTickets) {
      rows[index] = TIER_MESSAGES.minTooHigh
    } else if (rate <= 0) {
      rows[index] = TIER_MESSAGES.rateNotPositive
    } else if (rate > TIER_LIMITS.maxRate) {
      rows[index] = TIER_MESSAGES.rateTooHigh
    }
  })

  for (let index = 1; index < tiers.length; index++) {
    if (rows[index] || rows[index - 1]) continue
    const actual = tiers[index]!
    const anterior = tiers[index - 1]!
    if (actual.minTickets === anterior.minTickets) {
      rows[index] = TIER_MESSAGES.duplicate(actual.minTickets!)
    } else if (actual.minTickets! < anterior.minTickets!) {
      rows[index] = TIER_MESSAGES.outOfOrder(anterior.minTickets!)
    } else if (actual.rate! <= anterior.rate!) {
      rows[index] = TIER_MESSAGES.notIncreasing(actual.minTickets!, anterior.rate!)
    }
  }

  return { list: null, rows }
}

export function hasTierProblems(problems: TierProblems): boolean {
  return problems.list !== null || Object.keys(problems.rows).length > 0
}

/**
 * El «hasta» de cada tramo: el inicio del siguiente menos uno, y el ultimo
 * abierto. No se guarda en ninguna parte: asi no puede contradecirse.
 */
export function tierRanges(
  tiers: readonly Tier[],
): Array<{ from: number; to: number | null; rate: number }> {
  return tiers.map((tier, index) => {
    const next = tiers[index + 1]
    return { from: tier.minTickets, to: next ? next.minTickets - 1 : null, rate: tier.rate }
  })
}

export function sameTiers(a: readonly Tier[], b: readonly Tier[]): boolean {
  return (
    a.length === b.length &&
    a.every((tier, index) => tier.minTickets === b[index]!.minTickets && tier.rate === b[index]!.rate)
  )
}

/** La forma en que la base recibe y devuelve una lista (`{min_tickets, rate}`). */
export type DbTier = { min_tickets: number; rate: number }

export function toDbTiers(tiers: readonly Tier[]): DbTier[] {
  return tiers.map((tier) => ({ min_tickets: tier.minTickets, rate: tier.rate }))
}

export function fromDbTiers(rows: ReadonlyArray<{ min_tickets: number; rate: number | string }>): Tier[] {
  return rows
    .map((row) => ({ minTickets: Number(row.min_tickets), rate: Number(row.rate) }))
    .sort((a, b) => a.minTickets - b.minTickets)
}

/**
 * La validacion de una lista para las acciones del servidor. Entera y en
 * orden: la misma regla que el editor, y la base tiene la ultima palabra.
 */
export const tierListSchema = z
  .array(
    z.object({
      minTickets: z.number(TIER_MESSAGES.missing).int(TIER_MESSAGES.notInteger),
      rate: z.number(TIER_MESSAGES.missing).int(TIER_MESSAGES.notInteger),
    }),
  )
  .superRefine((tiers, ctx) => {
    const problems = tierProblems(tiers)
    if (problems.list) ctx.addIssue({ code: 'custom', message: problems.list })
    for (const [index, message] of Object.entries(problems.rows)) {
      ctx.addIssue({ code: 'custom', path: [Number(index)], message })
    }
  })
