import { LOTTERY_LABELS } from '@/features/lottery/constants'
import { LOTTERY_DASHBOARD_COPY } from '@/features/lottery/dashboard'
import {
  PRIZE_DIGITS_FULL_LABELS,
  PRIZE_NUMBER_FIELD_LABELS,
  rewardOptionsText,
  rewardOptionText,
} from '@/features/raffle-prizes/copy'
import { formatLongDateBetweenEs, formatLongDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

import type { PrizeAwardBase, PrizeAwardCoverage, PrizeAwardTotals } from './queries'
import type { PrizeAwardAudience, PrizeAwardFilters } from './schemas'

/**
 * TODOS los textos de «Premios ganados», juntos (`UX_COPY_GUIDELINES.md`,
 * Anexo B), y las piezas PURAS que deciden qué frase lleva cada premio.
 *
 * EL GLOSARIO MANDA (Anexo A). Son premios GANADOS: ningún texto dice
 * «entregado», «pagado» ni «desembolsado», porque la aplicación no registra la
 * entrega. Y nadie es «ganador», «ganadora» ni «premiada» (BR-L15): el premio es
 * de la rifa; el resultado y la coincidencia, de la lotería. Una prueba unitaria
 * barre este módulo buscando esas palabras.
 *
 * PURO: no toca la base ni el reloj. Los tipos de `queries.ts` se importan solo
 * como tipos, así que este archivo no arrastra `server-only`.
 */

/**
 * El separador «·» de una frase con partes: «Bogotá · Sorteo 2862», «Número
 * diario 0046 · Cuatro cifras». Lleva un espacio de NO separación delante, así
 * que cuando el teléfono parte la línea el punto se queda al final de la
 * primera y nunca abre la siguiente. Escrito como escape, no como el carácter
 * invisible (la misma regla de `weekly-results`, D-195).
 */
const SEP = '\u00a0· '

// -----------------------------------------------------------------------------
// Textos
// -----------------------------------------------------------------------------

export const PRIZE_AWARDS_COPY = {
  /** El nombre de la sección, en el menú y en el título de la pantalla. */
  title: 'Premios ganados',

  summary: {
    prizes: 'Premios',
    clients: 'Clientes con premio',
    clientsHint: 'Cada cliente cuenta una vez',
    knownAmount: 'Total conocido en dinero',
    knownAmountHint: 'No incluye lo que está pendiente de valorar',
    valuePending: 'Con valor pendiente',
    valuePendingHint: 'Alternativas a elegir o premios en especie',
  },

  filters: {
    dateFrom: 'Sorteos desde',
    dateTo: 'Sorteos hasta',
  },

  clientFilter: {
    text: (name: string) => `Solo los premios de ${name}.`,
    clear: 'Ver todos los premios',
  },

  empty: {
    title: 'Todavía no hay premios registrados',
    seller:
      'Cuando uno de tus clientes gane un premio, aparecerá aquí con su sorteo, su boleta y su valor.',
    staff:
      'Cuando el cliente de uno de tus vendedores gane un premio, aparecerá aquí con su sorteo, su boleta y su valor.',
    filteredTitle: 'No hay premios con estos filtros',
    filteredSeller: 'Cambia la rifa o las fechas, o limpia los filtros para ver todo el historial.',
    filteredStaff:
      'Cambia la rifa, el vendedor o las fechas, o limpia los filtros para ver todo el historial.',
    clientTitle: 'Este cliente todavía no tiene premios registrados',
    clientDescription: 'Cuando gane uno, aparecerá aquí con su sorteo, su boleta y su valor.',
  },

  reversed: {
    title: 'Las fechas están al revés',
    description:
      '«Sorteos desde» es posterior a «Sorteos hasta». Cambia una de las dos para ver los premios de ese período.',
  },

  outOfRange: {
    title: 'Esa página no existe',
    action: 'Ir a la primera página',
  },

  error: {
    title: 'No pudimos cargar los premios ganados',
    description: 'Suele ser algo pasajero. Vuelve a intentarlo en unos segundos.',
  },

  coverageError:
    'No pudimos comprobar si falta el resultado de algún sorteo. Vuelve a cargar la página para intentarlo de nuevo.',

  /** Encabezados de la tabla de escritorio. */
  columns: {
    drawDate: 'Fecha del sorteo',
    draw: 'Sorteo',
    client: 'Cliente',
    seller: 'Vendedor',
    ticket: 'Boleta',
    prize: 'Premio',
    value: 'Valor',
  },

  /** Rótulos de cada premio en la tarjeta del teléfono. */
  row: {
    drawDate: 'Fecha del sorteo',
    draw: 'Sorteo',
    winningNumber: 'Número mayor',
    client: 'Cliente',
    seller: 'Vendedor',
    ticket: 'Boleta',
    playedWith: 'Jugó con',
    raffle: 'Rifa',
    declared: 'Reconocido por la organización',
    conflict: LOTTERY_DASHBOARD_COPY.conflict,
    numbersChanged:
      'El número de esta boleta ya no es el que jugó en este sorteo. Requiere verificación.',
    /** Si faltara el nombre, que no debería: la fila sigue siendo legible. */
    unnamedClient: 'Cliente',
    unnamedSeller: 'Vendedor',
  },

  caption: {
    seller: 'Premios ganados por tus clientes',
    staff: 'Premios ganados por los clientes de tus vendedores',
  },

  /** La ficha del cliente, en el portal del vendedor. */
  clientSummary: {
    title: 'Premios ganados',
    none: 'Todavía no tiene premios registrados.',
    link: 'Ver premios',
    /** Empieza por lo que se ve, para que la voz y el lector lo encuentren igual. */
    linkLabel: (name: string) => `Ver premios de ${name}`,
    error: 'No pudimos cargar sus premios. Vuelve a cargar la página para intentarlo de nuevo.',
  },

  /** La ficha del vendedor, en el portal administrativo. */
  sellerSummary: {
    title: 'Premios ganados',
    link: 'Ver sus premios',
    error: 'No pudimos cargar sus premios. Vuelve a cargar la página para intentarlo de nuevo.',
  },

  /** Un vendedor desactivado, en el desplegable del personal. */
  inactiveSeller: (name: string) => `${name} (inactivo)`,
  /**
   * Quien vendió, tiene premios en el historial y hoy tiene otro rol —pasó a
   * Administrador, por ejemplo—. No se dice cuál: lo que importa al elegirlo es
   * que esos premios son de cuando vendía (Etapa 3).
   */
  formerSeller: (name: string) => `${name} (ya no vende)`,
} as const

// -----------------------------------------------------------------------------
// La cabecera
// -----------------------------------------------------------------------------

/**
 * La descripción de la pantalla. El inicio del historial SALE DE LA BASE
 * (`prize_award_history_start`, BR-J22): si no se pudo leer, la frase se
 * queda sin fecha en vez de inventar una.
 *
 * La segunda frase existe para que nadie lea «ganado» como «entregado».
 */
export function prizeAwardsDescription(
  audience: PrizeAwardAudience,
  historyStart: string | null,
): string {
  const who = audience === 'seller' ? 'tus clientes' : 'los clientes de tus vendedores'
  const since = historyStart ? ` desde el ${formatLongDateEs(historyStart)}` : ''
  return `Los premios que ganaron ${who}${since}. La entrega de los premios no se registra aquí.`
}

// -----------------------------------------------------------------------------
// La cobertura
// -----------------------------------------------------------------------------

/**
 * Si el aviso de cobertura dice algo sobre lo que se está mirando.
 *
 * La base da el recuento y el PRIMER y el ÚLTIMO sorteo pendiente. Si el rango
 * de fechas del filtro no toca ese tramo, ningún sorteo pendiente cae dentro:
 * el aviso se calla. Si lo toca, puede que sí, y se dice.
 */
export function coverageApplies(
  coverage: PrizeAwardCoverage,
  filters: Pick<PrizeAwardFilters, 'dateFrom' | 'dateTo'>,
): boolean {
  if (coverage.pendingDraws <= 0 || !coverage.pendingFrom || !coverage.pendingTo) return false
  if (filters.dateFrom && filters.dateFrom > coverage.pendingTo) return false
  if (filters.dateTo && filters.dateTo < coverage.pendingFrom) return false
  return true
}

/**
 * El aviso, con lo que la consulta PUEDE afirmar y nada más (BR-J22): cuántos
 * sorteos ya jugados tienen el resultado sin confirmar o POR VERIFICAR, entre
 * qué fechas CAEN —no que llenen el tramo— y que puede haber premios de esos
 * sorteos que no aparecen. No dice «cero premios» ni que el resto esté completo.
 *
 * POR QUÉ «POR VERIFICAR» (Etapa 3, punto A). La base cuenta como pendiente
 * también un sorteo cuyo resultado entró en conflicto después de confirmarse
 * (`0069`), y ese sorteo puede tener ya un premio en la lista, conservado y
 * marcado (BR-J18). «No sabemos si hubo premios» lo desmentía a un centímetro;
 * «puede que tenga premios que no aparecen» es cierto en los dos casos. Tampoco
 * se dice «mientras tanto»: confirmar un sorteo del sistema de siempre no hace
 * aparecer su premio, que el negocio tiene que reconocer (BR-J19).
 *
 * Su alcance es TODA la organización: con cualquier filtro —rifa, fechas,
 * vendedor o cliente—, la tercera frase lo aclara.
 */
export function coverageNotice(coverage: PrizeAwardCoverage, filtered: boolean): string {
  const n = coverage.pendingDraws
  const when =
    coverage.pendingFrom && coverage.pendingTo
      ? `, ${formatLongDateBetweenEs(coverage.pendingFrom, coverage.pendingTo)}`
      : ''
  const first =
    n === 1
      ? `Hay 1 sorteo ya jugado con el resultado sin confirmar o por verificar${when}.`
      : `Hay ${n} sorteos ya jugados con el resultado sin confirmar o por verificar${when}.`
  const second =
    n === 1
      ? 'Puede que ese sorteo tenga premios que no aparecen aquí.'
      : 'Puede que esos sorteos tengan premios que no aparecen aquí.'
  const third = filtered ? ' La cuenta es de toda la organización, no solo de este filtro.' : ''
  return `${first} ${second}${third}`
}

// -----------------------------------------------------------------------------
// Cada premio
// -----------------------------------------------------------------------------

type AwardText = Pick<
  PrizeAwardBase,
  | 'lotteryCode'
  | 'drawNumber'
  | 'matchField'
  | 'matchedNumber'
  | 'prizeDigits'
  | 'rewardMode'
  | 'rewardOptions'
  | 'knownAmount'
  | 'valuePending'
>

/** «Bogotá · Sorteo 2862». */
export function prizeAwardDrawText(award: Pick<AwardText, 'lotteryCode' | 'drawNumber'>): string {
  return `${LOTTERY_LABELS[award.lotteryCode]}${SEP}${LOTTERY_DASHBOARD_COPY.drawNumber(award.drawNumber)}`
}

/**
 * «Número diario 3427 · Cuatro cifras»: el campo que participó y el número que
 * se fotografió, con sus ceros (BR-N03). Las cifras solo cuando se conocen —el
 * origen del motor—: un premio reconocido no tiene versión y no se le inventan
 * (BR-J23).
 */
export function prizeAwardPlayedText(
  award: Pick<AwardText, 'matchField' | 'matchedNumber' | 'prizeDigits'>,
  options: { inSentence?: boolean } = {},
): string {
  // Detrás de «Jugó con», en la misma línea, va en minúscula: se lee como una
  // frase —«Jugó con número diario 0046 · cuatro cifras»—, no como dos rótulos.
  const cased = (text: string) => (options.inSentence ? text.toLowerCase() : text)
  const played = `${cased(PRIZE_NUMBER_FIELD_LABELS[award.matchField])} ${award.matchedNumber}`
  return award.prizeDigits
    ? `${played}${SEP}${cased(PRIZE_DIGITS_FULL_LABELS[award.prizeDigits])}`
    : played
}

/**
 * La recompensa, en una frase, SOLO cuando añade algo a la columna del valor.
 *
 * Un premio único que es solo dinero ya lo dice su valor —«$500.000»—, y
 * repetirlo a un centímetro es ruido: `null`. Con algo en especie se dice qué
 * es, y con alternativas se enumeran separadas por «o», porque se elige una
 * (D-201). Nunca se suman ni se elige ninguna.
 */
export function prizeAwardRewardText(
  award: Pick<AwardText, 'rewardMode' | 'rewardOptions'>,
): string | null {
  if (award.rewardMode === 'winner_choice') {
    return `Una de estas alternativas: ${rewardOptionsText(award.rewardOptions)}`
  }
  const only = award.rewardOptions[0]
  if (!only || !only.description) return null
  return rewardOptionText(only)
}

export type PrizeAwardValue = {
  /** Lo que se lee primero: el dinero cierto, o que el valor está pendiente. */
  main: string
  /** Por qué el valor completo no se conoce, cuando es así. */
  detail: string | null
  pending: boolean
}

/**
 * El valor de UN premio, diciendo qué es cierto y qué sigue pendiente (BR-J20).
 *
 *   premio único en dinero       → «$500.000»
 *   dinero y algo en especie     → «$2.000.000 en dinero» · «Valor pendiente: …»
 *   solo en especie              → «Valor pendiente» · «Es un premio en especie.»
 *   alternativas a elegir        → «Valor pendiente» · «Se elige una de las alternativas.»
 *
 * Un bien no se valora en cero y de unas alternativas no se toma ninguna: la
 * base ya deja `knownAmount` en `null` en esos casos, y aquí solo se dice.
 */
export function prizeAwardValue(
  award: Pick<AwardText, 'rewardMode' | 'knownAmount' | 'valuePending'>,
): PrizeAwardValue {
  if (!award.valuePending) {
    return {
      main: award.knownAmount === null ? '—' : formatCOP(award.knownAmount),
      detail: null,
      pending: false,
    }
  }
  if (award.rewardMode === 'winner_choice') {
    return {
      main: 'Valor pendiente',
      detail: 'Se elige una de las alternativas.',
      pending: true,
    }
  }
  if (award.knownAmount !== null) {
    return {
      main: `${formatCOP(award.knownAmount)} en dinero`,
      detail: 'Valor pendiente: también incluye un premio en especie.',
      pending: true,
    }
  }
  return { main: 'Valor pendiente', detail: 'Es un premio en especie.', pending: true }
}

// -----------------------------------------------------------------------------
// Los resúmenes de las fichas
// -----------------------------------------------------------------------------

/**
 * La línea de la ficha del cliente: «2 premios · $1.000.000 en dinero · 1 con
 * valor pendiente». El dinero se calla cuando es cero —un premio en especie no
 * vale «$0»— y lo pendiente, cuando no hay.
 */
export function clientPrizeSummaryLine(totals: PrizeAwardTotals): string {
  const parts = [totals.prizes === 1 ? '1 premio' : `${totals.prizes} premios`]
  if (totals.knownAmount > 0) parts.push(`${formatCOP(totals.knownAmount)} en dinero`)
  if (totals.valuePending > 0) parts.push(`${totals.valuePending} con valor pendiente`)
  return parts.join(SEP)
}

/**
 * Una página que no existe, dicha con las cifras del conjunto —que la base
 * sigue contando entero—: «Con estos filtros hay 30 premios en 2 páginas.».
 */
export function outOfRangeDescription(total: number, pages: number, filtered: boolean): string {
  const premios = total === 1 ? '1 premio' : `${total} premios`
  const paginas = pages === 1 ? '1 página' : `${pages} páginas`
  return filtered
    ? `Con estos filtros hay ${premios} en ${paginas}.`
    : `El historial tiene ${premios} en ${paginas}.`
}
