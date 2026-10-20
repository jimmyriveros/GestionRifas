/**
 * Los numeros de una boleta los define su RIFA (D-261, BR-N19..BR-N27).
 *
 * Cada rifa dice, al crearse y para siempre, cuantos grupos de numeros tiene
 * cada boleta —uno o dos—, como se llama cada uno y cuantas cifras EXACTAS
 * tiene (2, 3 o 4). La identidad de un grupo es su RANURA, no su nombre: el
 * primero vive en `daily_number` y el segundo en `weekly_number`, las mismas
 * ranuras que ya usan los premios y las coincidencias (`LotteryMatchField`).
 * El nombre solo se pinta: «Diario» no hace jugar a nadie los lunes.
 *
 * Este modulo es la UNICA definicion en TypeScript. Las reglas y sus frases
 * viven tambien en SQL (`supabase/migrations/0084_raffle_number_groups.sql`,
 * secciones 2 y 5) y una prueba de base las compara letra por letra: cambiar
 * una frase es cambiar las dos, con una migracion nueva.
 *
 * Es PURO: lo usan componentes de servidor y de navegador, formularios,
 * listas, el catalogo publico y las pruebas.
 */

/** La ranura de un grupo: la columna de `tickets` donde vive su numero. */
export type NumberGroupSlot = 'daily_number' | 'weekly_number'

export const NUMBER_GROUP_DIGIT_OPTIONS = [2, 3, 4] as const
export type NumberGroupDigits = (typeof NUMBER_GROUP_DIGIT_OPTIONS)[number]

export type NumberGroup = {
  slot: NumberGroupSlot
  name: string
  digits: NumberGroupDigits
}

/** Uno o dos grupos, en el orden en que se ven (el de sus ranuras). */
export type RaffleNumberFormat = {
  groups: readonly [NumberGroup] | readonly [NumberGroup, NumberGroup]
}

export const NUMBER_GROUP_NAME_MIN = 2
export const NUMBER_GROUP_NAME_MAX = 20

/**
 * La rifa de siempre: «Diario» y «Semanal», de cuatro cifras. Es lo que la 0084
 * dio a toda rifa que ya existia y el valor por omision de la base. NO se usa
 * para adivinar el formato de una rifa que no se leyo: quien lo necesite lo lee.
 */
export const LEGACY_NUMBER_FORMAT: RaffleNumberFormat = {
  groups: [
    { slot: 'daily_number', name: 'Diario', digits: 4 },
    { slot: 'weekly_number', name: 'Semanal', digits: 4 },
  ],
}

/** Las columnas de `raffles` que hay que pedir para conocer su formato. */
export const RAFFLE_NUMBER_FORMAT_COLUMNS =
  'number_group_count, first_group_name, first_group_digits, second_group_name, second_group_digits'

export type RaffleNumberFormatRow = {
  number_group_count: number
  first_group_name: string
  first_group_digits: number
  second_group_name: string | null
  second_group_digits: number | null
}

function asDigits(value: number | null | undefined): NumberGroupDigits {
  return value === 2 || value === 3 ? value : 4
}

/** De la fila de la base al formato. */
export function numberFormatFromRow(row: RaffleNumberFormatRow): RaffleNumberFormat {
  const first: NumberGroup = {
    slot: 'daily_number',
    name: row.first_group_name,
    digits: asDigits(row.first_group_digits),
  }
  if (row.number_group_count === 1 || row.second_group_name === null) {
    return { groups: [first] }
  }
  return {
    groups: [
      first,
      { slot: 'weekly_number', name: row.second_group_name, digits: asDigits(row.second_group_digits) },
    ],
  }
}

export function groupCount(format: RaffleNumberFormat): 1 | 2 {
  return format.groups.length
}

export function hasSecondGroup(format: RaffleNumberFormat): boolean {
  return format.groups.length === 2
}

/** El grupo de una ranura, o `null` si la rifa no lo tiene. */
export function groupForSlot(format: RaffleNumberFormat, slot: NumberGroupSlot): NumberGroup | null {
  return format.groups.find((group) => group.slot === slot) ?? null
}

/** «0000» … para N cifras. */
export function lowestNumber(digits: number): string {
  return '0'.repeat(digits)
}
export function highestNumber(digits: number): string {
  return '9'.repeat(digits)
}

// -----------------------------------------------------------------------------
// Las frases. Iguales a las de la 0084: una prueba de base las compara.
// -----------------------------------------------------------------------------

export const NUMBER_GROUPS_MESSAGES = {
  count: 'Cada boleta tiene uno o dos números.',
  firstName: 'Escribe el nombre del primer número.',
  secondName: 'Escribe el nombre del segundo número.',
  noSecond: 'Con un solo número por boleta no hay segundo número.',
  nameLength: `El nombre de cada número tiene de ${NUMBER_GROUP_NAME_MIN} a ${NUMBER_GROUP_NAME_MAX} caracteres.`,
  nameLine: 'El nombre de cada número va en una sola línea, sin caracteres invisibles.',
  digits: 'Cada número tiene 2, 3 o 4 cifras.',
  sameName: 'Los dos números necesitan nombres distintos.',
  immutable:
    'Los números de una rifa no se cambian después de crearla: ni cuántos son, ni sus nombres, ni sus cifras.',
} as const

export const TICKET_NUMBER_MESSAGES = {
  onlyOne: (firstName: string) =>
    `Esta rifa tiene un solo número por boleta («${firstName}»): la boleta no lleva otro número.`,
  missing: (name: string) => `Escribe el número «${name}».`,
  notDigits: (name: string) => `El número «${name}» lleva solo cifras, sin letras ni símbolos.`,
  tooShort: (name: string, digits: number, padded: string) =>
    `El número «${name}» lleva exactamente ${digits} cifras: escribe ${padded}.`,
  tooLong: (name: string, digits: number, value: string) =>
    `El número «${name}» lleva exactamente ${digits} cifras, y ${value} tiene ${value.length}.`,
} as const

// Los caracteres de control (categoria Cc), como `[[:cntrl:]]` de PostgreSQL.
const CONTROL_CHARACTERS = /\p{Cc}/u

export type NumberGroupsInput = {
  count: number
  firstName: string
  firstDigits: number
  secondName: string | null
  secondDigits: number | null
}

/**
 * Por que no valen los grupos de una rifa nueva, o `null`. Los nombres llegan
 * ya sin espacios exteriores, como los deja la base. Mismo orden y mismas
 * frases que `raffle_number_groups_problem` (0084, 2.2).
 */
export function numberGroupsProblem(input: NumberGroupsInput): string | null {
  const { count, firstName, firstDigits, secondName, secondDigits } = input
  if (count !== 1 && count !== 2) return NUMBER_GROUPS_MESSAGES.count
  if (!firstName) return NUMBER_GROUPS_MESSAGES.firstName
  if (count === 2 && !secondName) return NUMBER_GROUPS_MESSAGES.secondName
  if (count === 1 && (secondName !== null || secondDigits !== null)) {
    return NUMBER_GROUPS_MESSAGES.noSecond
  }
  const lengthOk = (name: string) =>
    name.length >= NUMBER_GROUP_NAME_MIN && name.length <= NUMBER_GROUP_NAME_MAX
  if (!lengthOk(firstName) || (count === 2 && !lengthOk(secondName ?? ''))) {
    return NUMBER_GROUPS_MESSAGES.nameLength
  }
  if (CONTROL_CHARACTERS.test(firstName) || (count === 2 && CONTROL_CHARACTERS.test(secondName ?? ''))) {
    return NUMBER_GROUPS_MESSAGES.nameLine
  }
  const digitsOk = (digits: number | null) => digits === 2 || digits === 3 || digits === 4
  if (!digitsOk(firstDigits) || (count === 2 && !digitsOk(secondDigits))) {
    return NUMBER_GROUPS_MESSAGES.digits
  }
  if (count === 2 && firstName.toLowerCase() === (secondName ?? '').toLowerCase()) {
    return NUMBER_GROUPS_MESSAGES.sameName
  }
  return null
}

/**
 * Por que no valen los numeros de UNA boleta, o `null`. NUNCA rellena ni
 * recorta: dice que escribir. `requireComplete` es para todo lo que no es un
 * borrador: cada grupo necesita su numero. Mismo orden y frases que
 * `ticket_numbers_problem` (0084, 2.3).
 */
export function ticketNumbersProblem(
  format: RaffleNumberFormat,
  daily: string | null,
  weekly: string | null,
  requireComplete: boolean,
): string | null {
  const [first] = format.groups
  if (format.groups.length === 1 && weekly !== null && weekly !== '') {
    return TICKET_NUMBER_MESSAGES.onlyOne(first.name)
  }
  for (const group of format.groups) {
    const value = group.slot === 'daily_number' ? daily : weekly
    if (value === null || value === '') {
      if (requireComplete) return TICKET_NUMBER_MESSAGES.missing(group.name)
      continue
    }
    if (!/^[0-9]+$/.test(value)) return TICKET_NUMBER_MESSAGES.notDigits(group.name)
    if (value.length < group.digits) {
      return TICKET_NUMBER_MESSAGES.tooShort(group.name, group.digits, value.padStart(group.digits, '0'))
    }
    if (value.length > group.digits) {
      return TICKET_NUMBER_MESSAGES.tooLong(group.name, group.digits, value)
    }
  }
  return null
}

/** El problema de UN grupo, para pintar el error junto a su campo. */
export function groupNumberProblem(
  group: NumberGroup,
  value: string | null,
  required: boolean,
): string | null {
  if (value === null || value === '') return required ? TICKET_NUMBER_MESSAGES.missing(group.name) : null
  if (!/^[0-9]+$/.test(value)) return TICKET_NUMBER_MESSAGES.notDigits(group.name)
  if (value.length < group.digits) {
    return TICKET_NUMBER_MESSAGES.tooShort(group.name, group.digits, value.padStart(group.digits, '0'))
  }
  if (value.length > group.digits) return TICKET_NUMBER_MESSAGES.tooLong(group.name, group.digits, value)
  return null
}

// -----------------------------------------------------------------------------
// Como se nombran y se pintan
// -----------------------------------------------------------------------------

/**
 * La leyenda que dice cual cifra es cual, en el orden en que se escriben:
 * «Diario · Semanal», o «Número» con un solo grupo.
 */
export function numberFormatLegend(format: RaffleNumberFormat): string {
  return format.groups.map((group) => group.name).join(' · ')
}

/** «Diario, de 4 cifras (0000 a 9999)». */
export function numberGroupDescription(group: NumberGroup): string {
  return `${group.name}, de ${group.digits} cifras (${lowestNumber(group.digits)} a ${highestNumber(group.digits)})`
}

/**
 * El nombre de un número dentro de una frase: «número diario», «número mayor».
 * Si el dueño ya lo llamó «Número…», no se repite la palabra. Es lo que la
 * rifa de siempre escribía a mano —«el número diario»— y sigue diciendo igual.
 */
export function numberGroupPhrase(name: string): string {
  const lower = name.toLocaleLowerCase('es-CO')
  return lower.startsWith('número') || lower.startsWith('numero') ? lower : `número ${lower}`
}

/** Lo mismo, encabezando un rótulo: «Número diario». */
export function numberGroupTitle(name: string): string {
  const phrase = numberGroupPhrase(name)
  return phrase.charAt(0).toLocaleUpperCase('es-CO') + phrase.slice(1)
}

/** Una linea con toda la estructura: «Diario · 4 cifras, Semanal · 4 cifras». */
export function numberFormatSummary(format: RaffleNumberFormat): string {
  return format.groups.map((group) => `${group.name} · ${group.digits} cifras`).join(', ')
}

/** Las mayores cifras de cualquier grupo: el tope de una busqueda. */
export function maxDigits(format: RaffleNumberFormat): NumberGroupDigits {
  return format.groups.reduce<NumberGroupDigits>(
    (max, group) => (group.digits > max ? group.digits : max),
    2,
  )
}

/**
 * Los formatos de varias rifas, por su id. Una lista que mezcla rifas pinta
 * cada boleta con el de SU rifa (D-261): ninguna se interpreta con la
 * estructura de otra.
 */
export type RaffleNumberFormats = ReadonlyMap<string, RaffleNumberFormat>

export function formatForRaffle(
  formats: RaffleNumberFormats | undefined,
  raffleId: string | null | undefined,
): RaffleNumberFormat | undefined {
  if (!formats || !raffleId) return undefined
  return formats.get(raffleId)
}
