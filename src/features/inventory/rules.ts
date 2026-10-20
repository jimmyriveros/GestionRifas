/**
 * Las reglas puras del inventario comun y los apartados (D-257).
 *
 * ESPEJO DE LA BASE. Cada constante y la regla de un rango existen tambien en
 * la migracion `0081` —`ticket_hold_default_minutes()`, `ticket_generation_max()`,
 * `ticket_generation_range_problem()`...— y una prueba de base de datos compara
 * las dos versiones letra por letra. Aqui sirven para AVISAR antes de enviar; la
 * frontera son las funciones de la base, que lo vuelven a comprobar todo.
 *
 * PURO: sin red, sin sesion y sin `server-only`, para que lo usen igual el
 * formulario del navegador, las acciones del servidor y las pruebas unitarias.
 */

/** Duracion inicial de un apartado cuando la rifa no tiene la suya (BR-I24). */
export const HOLD_DEFAULT_MINUTES = 30
/** Apartados simultaneos por vendedor y rifa cuando la rifa no tiene el suyo (BR-I24). */
export const HOLD_DEFAULT_MAX_ACTIVE = 10
/** Lo que suma la UNICA extension de un apartado (BR-I24). */
export const HOLD_EXTENSION_MINUTES = 30
/** Limites de lo que el Dueño puede configurar por rifa (BR-I27). */
export const HOLD_DURATION_MIN = 5
export const HOLD_DURATION_MAX = 180
export const HOLD_MAX_ACTIVE_MIN = 0
export const HOLD_MAX_ACTIVE_MAX = 100

/** Tope TECNICO de una generacion; no es un limite comercial (BR-N16). */
export const GENERATION_MAX = 100_000
/** Combinaciones por bloque: una transaccion de la base por bloque (D-257). */
export const GENERATION_CHUNK_SIZE = 5_000

export const RANGE_MESSAGES = {
  empty: 'Escribe el primer y el último número del rango.',
  format: 'Cada número tiene de 1 a 4 cifras, sin letras ni símbolos.',
  width: 'Escribe los dos números con la misma cantidad de cifras. Por ejemplo: 00 y 99.',
  order: 'El primer número no puede ser mayor que el último.',
} as const

const NUMBER = /^[0-9]{1,4}$/

/**
 * Por que no vale un rango, o `null` si vale. Las MISMAS frases que
 * `ticket_generation_range_problem` de la 0081, en el mismo orden.
 *
 * DESDE D-261 EL FORMULARIO NO LA USA: el ancho lo pone la rifa y el rango de
 * cada número se valida con `groupRangeProblem`. Se conserva como espejo de la
 * función de la base, que sigue protegiendo la FORMA de los rangos guardados en
 * `ticket_generation_runs` (sus CHECK de la 0081 y la 0084): se guardan ya con
 * los ceros de su número, así que sus dos extremos tienen siempre el mismo ancho.
 */
export function rangeProblem(from: string, to: string): string | null {
  if (from === '' || to === '') return RANGE_MESSAGES.empty
  if (!NUMBER.test(from) || !NUMBER.test(to)) return RANGE_MESSAGES.format
  if (from.length !== to.length) return RANGE_MESSAGES.width
  if (Number(from) > Number(to)) return RANGE_MESSAGES.order
  return null
}

export type NumberRange = { from: string; to: string }
/**
 * Los rangos de una generacion. Con un solo número en la rifa (D-261) el
 * segundo no existe: `weekly` es `null` y cada número es una boleta.
 */
export type GenerationRanges = { daily: NumberRange; weekly: NumberRange | null }

/** Cuantos numeros tiene un rango que ya vale. */
export function rangeSize(range: NumberRange): number {
  return Number(range.to) - Number(range.from) + 1
}

/** Cuantas boletas dan los rangos: la combinacion de los dos, o los numeros de uno. */
export function generationTotal(ranges: GenerationRanges): number {
  return rangeSize(ranges.daily) * (ranges.weekly ? rangeSize(ranges.weekly) : 1)
}

/**
 * Por que no vale el rango de UN número de la rifa (D-261), o `null`. Las
 * MISMAS frases que `ticket_generation_group_range_problem` de la 0084, en el
 * mismo orden. El ANCHO lo da el número de la rifa, no lo escrito: con cuatro
 * cifras, del 0 al 5 vale y crea 0000…0005. Más cifras que las del número se
 * rechazan; nada se recorta.
 */
export const GROUP_RANGE_MESSAGES = {
  empty: (name: string) => `Escribe el primer y el último número del rango de «${name}».`,
  format: (name: string) => `Escribe el rango de «${name}» solo con cifras, sin letras ni símbolos.`,
  tooLong: (name: string, digits: number) =>
    `El número «${name}» tiene ${digits} cifras: su rango va como mucho del ${'0'.repeat(digits)} al ${'9'.repeat(digits)}.`,
  order: (name: string) =>
    `En el rango de «${name}», el primer número no puede ser mayor que el último.`,
} as const

export function groupRangeProblem(
  from: string,
  to: string,
  group: { name: string; digits: number },
): string | null {
  if (from === '' || to === '') return GROUP_RANGE_MESSAGES.empty(group.name)
  if (!/^[0-9]+$/.test(from) || !/^[0-9]+$/.test(to)) return GROUP_RANGE_MESSAGES.format(group.name)
  if (from.length > group.digits || to.length > group.digits) {
    return GROUP_RANGE_MESSAGES.tooLong(group.name, group.digits)
  }
  if (Number(from) > Number(to)) return GROUP_RANGE_MESSAGES.order(group.name)
  return null
}

/**
 * Lo escrito, con el ancho de cada número de la rifa: «0» a «5» en un número de
 * cuatro cifras es «0000» a «0005». Es lo que se ve en la vista previa y lo que
 * guarda la base (`ticket_generation_padded_ranges`). Solo con rangos que valen.
 */
export function paddedRanges(
  groups: readonly { digits: number }[],
  values: { dailyFrom: string; dailyTo: string; weeklyFrom: string; weeklyTo: string },
): GenerationRanges {
  const [first, second] = groups
  const pad = (value: string, digits: number) => value.padStart(digits, '0')
  return {
    daily: { from: pad(values.dailyFrom, first!.digits), to: pad(values.dailyTo, first!.digits) },
    weekly: second
      ? { from: pad(values.weeklyFrom, second.digits), to: pad(values.weeklyTo, second.digits) }
      : null,
  }
}

/**
 * La combinacion de la posicion `index`, en el MISMO orden en que las crea la
 * base: diario por diario y, dentro de cada uno, todos los semanales. Con el
 * ancho de cada rango y sus ceros de delante.
 */
export function combinationAt(
  ranges: GenerationRanges,
  index: number,
): { daily: string; weekly: string | null } {
  if (!ranges.weekly) {
    const daily = Number(ranges.daily.from) + index
    return { daily: String(daily).padStart(ranges.daily.from.length, '0'), weekly: null }
  }
  const weeklySpan = rangeSize(ranges.weekly)
  const daily = Number(ranges.daily.from) + Math.floor(index / weeklySpan)
  const weekly = Number(ranges.weekly.from) + (index % weeklySpan)
  return {
    daily: String(daily).padStart(ranges.daily.from.length, '0'),
    weekly: String(weekly).padStart(ranges.weekly.from.length, '0'),
  }
}

/**
 * Una muestra para la vista previa: las primeras y las ultimas, sin repetir
 * ninguna cuando hay pocas. Nunca la lista entera (BR-N17).
 */
export function generationSample(
  ranges: GenerationRanges,
  edge = 3,
): {
  first: { daily: string; weekly: string | null }[]
  last: { daily: string; weekly: string | null }[]
} {
  const total = generationTotal(ranges)
  const firstCount = Math.min(edge, total)
  const first = Array.from({ length: firstCount }, (_, i) => combinationAt(ranges, i))
  const lastCount = Math.min(edge, total - firstCount)
  const last = Array.from({ length: lastCount }, (_, i) =>
    combinationAt(ranges, total - lastCount + i),
  )
  return { first, last }
}

/** Lo que una generacion todavia tiene por delante, en bloques. */
export function remainingChunks(total: number, processed: number): number {
  return Math.ceil(Math.max(0, total - processed) / GENERATION_CHUNK_SIZE)
}

/**
 * Recuento con puntos de miles, como `format_count` de la base: «100.000», y
 * «5.000» y no «5000». Sin `Intl`: en es-CO algunas versiones de ICU no agrupan
 * los numeros de cuatro cifras, y los mensajes tienen que coincidir con los de
 * la base.
 */
export function formatCount(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Lo que ve un vendedor de cada boleta del catalogo interno (BR-I21). Lo ajeno
 * solo puede ser `unavailable`: la base no le dice de quien es.
 */
export const INVENTORY_AVAILABILITY = ['free', 'held_by_me', 'mine', 'unavailable'] as const
export type InventoryAvailability = (typeof INVENTORY_AVAILABILITY)[number]

export function parseAvailability(value: string): InventoryAvailability {
  return (INVENTORY_AVAILABILITY as readonly string[]).includes(value)
    ? (value as InventoryAvailability)
    : 'unavailable'
}

/** Quien tiene una boleta, para el personal (D-257). */
export const TICKET_CUSTODY_VALUES = ['common', 'held', 'seller'] as const
export type TicketCustody = (typeof TICKET_CUSTODY_VALUES)[number]

export function parseCustody(value: string | null | undefined): TicketCustody | undefined {
  return (TICKET_CUSTODY_VALUES as readonly string[]).includes(value ?? '')
    ? (value as TicketCustody)
    : undefined
}

/**
 * Cuanto le queda a un apartado, en minutos enteros hacia arriba, segun la hora
 * de la BASE: `serverNowMs` es la hora que devolvio la consulta y `clientOffsetMs`
 * la diferencia con el reloj del telefono en ese momento. Asi un telefono con la
 * hora mal no adelanta ni atrasa la cuenta. Es solo para mostrar: quien decide
 * si el apartado vencio es la base, al confirmar.
 */
export function minutesLeft(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 60_000))
}
