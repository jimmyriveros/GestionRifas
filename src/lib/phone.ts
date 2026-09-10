/**
 * Presentacion de un telefono mientras se escribe (D-184).
 *
 * Logica PURA y sin React, para que se pueda probar entera sin montar un
 * componente: `PhoneInput` solo traduce eventos del navegador a estas tres
 * funciones. Es la misma separacion que ya existe entre `MoneyInput` y
 * `lib/money.ts`.
 *
 * QUE HACE Y QUE NO HACE
 *
 * Esto es PRESENTACION. No valida —eso es `PHONE_REGEX` (`lib/constants.ts`),
 * el esquema Zod de cada modulo y el CHECK de `profiles`/`clients`—, no
 * normaliza para buscar —eso es `searchNeedle` (`lib/search.ts`) y
 * `search_normalize()` (migracion 0017)— y no canoniza para WhatsApp —eso es
 * `normalizeWhatsappNumber` (`lib/whatsapp.ts`)—. Las tres siguen recibiendo lo
 * mismo que antes, porque ninguna mira los separadores: todas empiezan por
 * quedarse con los digitos.
 *
 * LA PROPIEDAD QUE HAY QUE CUIDAR: ESTO NO CAMBIA LO QUE LA APLICACION ACEPTA
 *
 * `PHONE_REGEX` es `/^[0-9+ ()-]{7,20}$/`, y cuenta CARACTERES permitidos, no
 * digitos (I-108). Un separador anadido cuenta, asi que una mascara ingenua
 * convertiria `300123` —seis digitos, hoy rechazados— en `300 123`, siete
 * caracteres, y lo aceptaria. Por eso:
 *
 *   * los grupos no aparecen hasta el octavo digito nacional
 *     (`GROUP_MIN_DIGITS`), de modo que la forma con separadores nunca alcanza
 *     los 7 caracteres antes que la forma sin ellos; y
 *   * la forma con separadores mas larga que se produce mide 16 caracteres
 *     (`+57 300 123 4567`), muy por debajo del tope de 20.
 *
 * Consecuencia: un valor que hoy se acepta se sigue aceptando despues de
 * formatearlo, y uno que se rechaza se sigue rechazando. La unica diferencia es
 * que los caracteres que la columna NO admite se descartan al escribir en vez
 * de producir un mensaje de error, que es lo que hace cualquier mascara.
 *
 * EL OCTAVO DIGITO TAMBIEN PROTEGE A LOS FIJOS ANTIGUOS. Un telefono de siete
 * cifras —el fijo colombiano de antes de 2022, que la columna admite y del que
 * puede haber registros guardados— no se reagrupa: con siete digitos todavia
 * puede ser un numero completo, y a partir de ocho solo puede ir camino de uno
 * nacional de diez.
 */

import { digitsOnly } from '@/lib/search'

/**
 * Lo que NO admite la columna `phone` (CHECK de `0001` y `0002`) ni
 * `PHONE_REGEX`: se descarta al escribir. El espacio es el literal, no `\s`,
 * para que un tabulador pegado desde una hoja de calculo no se cuele.
 */
const NOT_ALLOWED = /[^0-9+() -]/g

/** Caracteres que «cuentan» para colocar el cursor: los digitos y el `+`. */
const SIGNIFICANT = /[0-9+]/

const COLOMBIA_COUNTRY_CODE = '57'

/** Digitos de un numero nacional colombiano: movil `3XX` o fijo `60X` + 7. */
const NATIONAL_DIGITS = 10

/** Los dos unicos comienzos de un numero nacional colombiano. */
const NATIONAL_PREFIX = /^[36]/

/** Desde cuantos digitos se agrupa. Ver el encabezado: no es un numero suelto. */
const GROUP_MIN_DIGITS = 8

/** `3 3 4`: «300 123 4567». */
const NATIONAL_GROUPS = [3, 3, 4] as const

/**
 * Texto de ejemplo del campo. Se escribe UNA vez: lo usan los formularios de
 * cliente y de usuario a traves del valor por defecto de `PhoneInput`.
 */
export const PHONE_PLACEHOLDER = '300 123 4567'

/** Lo mismo cuando el campo pide el indicativo (el WhatsApp del catalogo). */
export const PHONE_WITH_CODE_PLACEHOLDER = '+57 300 123 4567'

/** Quita lo que la columna no admite. No recorta ni junta espacios. */
function cleanPhone(raw: string): string {
  return raw.replace(NOT_ALLOWED, '')
}

/** `true` si estos digitos ya solo pueden ser un numero nacional colombiano. */
function isGroupableNational(digits: string): boolean {
  return (
    digits.length >= GROUP_MIN_DIGITS &&
    digits.length <= NATIONAL_DIGITS &&
    NATIONAL_PREFIX.test(digits)
  )
}

/** Reparte los digitos en `3 3 4`, aunque el ultimo grupo este a medias. */
function groupNational(digits: string): string {
  const parts: string[] = []
  let from = 0
  for (const size of NATIONAL_GROUPS) {
    if (from >= digits.length) break
    parts.push(digits.slice(from, from + size))
    from += size
  }
  return parts.join(' ')
}

/**
 * El telefono tal como se ve en el campo.
 *
 * Es IDEMPOTENTE —`formatPhone(formatPhone(x)) === formatPhone(x)`— y NUNCA
 * pierde un digito ni el `+`: eso es lo que permite derivar lo que se ve del
 * valor controlado, sin un segundo estado «crudo/formateado» como el que costo
 * I-016 en `MoneyInput` (D-053).
 *
 * Solo agrupa lo que reconoce con seguridad. Un numero internacional que no sea
 * colombiano se devuelve con los separadores que traiga: imponerle el
 * agrupamiento `3 3 4` seria inventar una lectura que no le corresponde.
 */
export function formatPhone(raw: string): string {
  const cleaned = cleanPhone(raw)
  const digits = digitsOnly(cleaned)
  const hasCountryCode = cleaned.trimStart().startsWith('+')

  // «+57 300 123 4567». El `57` se toma por indicativo cuando lo anuncia un `+`
  // o cuando sobran digitos para un numero nacional: `5712345` es un fijo
  // antiguo, no un indicativo, y su resto (`12345`) no empieza por 3 ni por 6.
  if (
    digits.startsWith(COLOMBIA_COUNTRY_CODE) &&
    (hasCountryCode || digits.length > NATIONAL_DIGITS)
  ) {
    const national = digits.slice(COLOMBIA_COUNTRY_CODE.length)
    if (isGroupableNational(national)) {
      return `+${COLOMBIA_COUNTRY_CODE} ${groupNational(national)}`
    }
  }

  // «300 123 4567»: nacional escrito sin indicativo, que es como lo teclea todo
  // el mundo aqui (CLAUDE.md 6: la aplicacion opera en un solo pais).
  if (!hasCountryCode && isGroupableNational(digits)) return groupNational(digits)

  return cleaned
}

/** Cuantos caracteres significativos hay en este texto. */
function countSignificant(value: string): number {
  let total = 0
  for (const char of value) {
    if (SIGNIFICANT.test(char)) total += 1
  }
  return total
}

/** La posicion que deja el cursor justo detras del enesimo significativo. */
function caretAfterSignificant(value: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let index = 0; index < value.length; index += 1) {
    if (SIGNIFICANT.test(value[index]!)) {
      seen += 1
      if (seen === count) return index + 1
    }
  }
  return value.length
}

/**
 * El resultado de una edicion: como queda el campo y donde queda el cursor.
 *
 * El cursor NO se mide en caracteres, porque la mascara mueve los separadores:
 * se mide en cuantos digitos —y el `+`— quedan a su izquierda, y se busca esa
 * misma cuenta en el texto formateado. Asi escribir o borrar EN MEDIO deja el
 * cursor pegado al digito que se acaba de tocar, en vez de saltar al final como
 * haria un campo controlado sin esto.
 *
 * QUIEN ESTABA AL FINAL SE QUEDA AL FINAL, y es una regla aparte porque la
 * cuenta de significativos no basta: al bajar del octavo digito borrando, la
 * forma sin agrupar conserva los espacios que ya estaban escritos, y el cursor
 * medido por significativos quedaba DELANTE de ellos. Entonces cada pulsacion
 * siguiente se llevaba un digito y dejaba su espacio detras, hasta acabar con un
 * campo que parecia vacio y tenia dos espacios dentro. Lo encontro la prueba
 * end-to-end que borra diez veces (`telefono-mascara.spec.ts`), no una revision
 * a ojo.
 */
export function applyPhoneEdit(raw: string, caret: number): { value: string; caret: number } {
  const at = Math.max(0, Math.min(caret, raw.length))
  const value = formatPhone(raw)
  if (at === raw.length) return { value, caret: value.length }
  return { value, caret: caretAfterSignificant(value, countSignificant(raw.slice(0, at))) }
}

export type PhoneDeletionDirection = 'backward' | 'forward'

/**
 * Que hay que quitar cuando un borrado empieza SOBRE UN SEPARADOR, o `null` si
 * el navegador ya hace lo correcto.
 *
 * Sin esto, borrar con el cursor detras de un espacio no parece hacer nada: el
 * navegador quita el espacio, la mascara lo vuelve a poner y la persona tiene
 * que pulsar dos veces. Aqui el borrado se lleva el espacio Y el digito que hay
 * al otro lado, que es lo que quien pulsa esta pidiendo.
 *
 * Devuelve `null` cuando hay texto seleccionado (el borrado normal ya es
 * correcto) y cuando el caracter contiguo es significativo.
 */
export function phoneDeletionRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: PhoneDeletionDirection,
): { start: number; end: number } | null {
  if (selectionStart !== selectionEnd) return null

  if (direction === 'backward') {
    if (selectionStart <= 0) return null
    let index = selectionStart - 1
    while (index >= 0 && !SIGNIFICANT.test(value[index]!)) index -= 1
    if (index === selectionStart - 1) return null
    return { start: Math.max(index, 0), end: selectionStart }
  }

  if (selectionStart >= value.length) return null
  let index = selectionStart
  while (index < value.length && !SIGNIFICANT.test(value[index]!)) index += 1
  if (index === selectionStart) return null
  return { start: selectionStart, end: Math.min(index + 1, value.length) }
}
