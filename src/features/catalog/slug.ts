/**
 * El identificador de la URL publica de un vendedor (BR-K02).
 *
 * Logica PURA y sin dependencias, como `lib/search.ts`: la usan la Server
 * Action que genera el enlace, la pagina publica que lo valida antes de
 * consultar y las pruebas. Que las tres normalicen igual es lo que evita que
 * una URL guardada deje de resolver.
 *
 * NO ES UN SECRETO. Quien reciba la direccion la puede abrir, y por eso el
 * sufijo aleatorio no protege nada: solo evita que dos personas con el mismo
 * nombre se disputen el mismo texto. La autorizacion la hacen las funciones de
 * la base de datos (`public_catalog_*`, migracion 0043), nunca el slug.
 */

/** Lo mismo que exige el CHECK `memberships_public_slug_format` (0043). */
export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SLUG_MIN_LENGTH = 3
export const SLUG_MAX_LENGTH = 80

/** Longitud del sufijo aleatorio: «laura-gomez-k7m4». */
export const SLUG_SUFFIX_LENGTH = 4

/**
 * Alfabeto del sufijo, sin caracteres que se confunden al dictar o al copiar a
 * mano: no hay `0`/`o`, ni `1`/`l`/`i`. Quedan 31 simbolos, que en cuatro
 * posiciones dan cerca de un millon de combinaciones: de sobra para que dos
 * vendedores homonimos no colisionen, y si colisionan lo impide el indice
 * unico y se reintenta.
 */
const SUFFIX_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'

/**
 * Deja un nombre como parte legible de una URL: «Laura Gómez» -> «laura-gomez».
 *
 * `NFD` separa la tilde de su letra y el rango de marcas diacriticas la
 * elimina, igual que hace `foldForSearch` en `lib/search.ts`. Cualquier otro
 * caracter —espacios, puntos, la «ñ» ya sin virgulilla no, esa se conserva como
 * `n`— se convierte en un guion, y los guiones repetidos se colapsan.
 */
export function slugifyName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Cuatro caracteres al azar del alfabeto de arriba. */
function randomSuffix(): string {
  const bytes = new Uint8Array(SLUG_SUFFIX_LENGTH)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]
  return out
}

/**
 * El slug completo de una persona: su nombre y un sufijo aleatorio.
 *
 * La parte legible se recorta para que el total quepa en los 80 caracteres que
 * admite la columna. Un nombre que al normalizar no deja ni una letra —escrito
 * solo con simbolos, o en un alfabeto que `slugifyName` no conserva— cae en
 * «vendedor», de modo que el resultado siempre cumple el formato.
 *
 * NO SE DERIVA DEL NOMBRE MAS TARDE. Se genera una vez y se guarda: renombrar a
 * la persona no puede cambiarle la URL que ya repartio (BR-K03).
 */
export function buildSellerSlug(fullName: string): string {
  const suffix = randomSuffix()
  const room = SLUG_MAX_LENGTH - SLUG_SUFFIX_LENGTH - 1
  const base = (slugifyName(fullName) || 'vendedor').slice(0, room).replace(/-+$/g, '')
  return `${base || 'vendedor'}-${suffix}`
}

/** `true` si el texto puede ser un slug guardado. Lo mismo que valida la base. */
export function isValidSlug(value: string): boolean {
  if (value.length < SLUG_MIN_LENGTH || value.length > SLUG_MAX_LENGTH) return false
  return SLUG_REGEX.test(value)
}
