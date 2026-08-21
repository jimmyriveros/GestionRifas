/**
 * Reglas de busqueda del proyecto: valores por defecto y normalizacion del
 * termino.
 *
 * Es logica PURA y sin dependencias, a proposito: la usan el navegador (para
 * decidir si toca buscar y con que texto) y el servidor (para construir la
 * consulta). Que ambos normalicen igual es lo que hace que «José» encuentre a
 * «Jose» y que «300 555-0000» encuentre a «3005550000»; si cada lado lo hiciera
 * a su manera, la busqueda funcionaria en unas pantallas y no en otras.
 *
 * Los valores de aqui son los PREDETERMINADOS. Cada pantalla puede subirlos o
 * bajarlos, pero nadie deberia inventarse los suyos sin motivo.
 */

/**
 * Espera desde la ultima tecla antes de buscar sola.
 *
 * 350 ms: por debajo se dispara mientras la persona todavia escribe; por encima
 * empieza a sentirse que la aplicacion no responde.
 */
export const SEARCH_DEBOUNCE_MS = 350

/**
 * Retraso antes de MOSTRAR el indicador de carga (no antes de buscar).
 *
 * Una respuesta rapida llega antes de esto y el indicador no llega a
 * aparecer, que es justo lo que evita el parpadeo. La consulta sale igual de
 * pronto: esto solo afecta a lo que se pinta.
 */
export const SEARCH_SPINNER_DELAY_MS = 250

/**
 * Minimo de caracteres para que la busqueda salga sola.
 *
 * `Enter` y el boton de buscar se saltan este minimo: si alguien quiere buscar
 * «7», es su decision, no un error que haya que impedir.
 */
export const SEARCH_MIN_CHARS = {
  /** Personas: nombre, alias o telefono. Dos letras ya descartan casi todo. */
  people: 2,
  /** Codigos y numeros de boleta: «07» es una busqueda legitima. */
  tickets: 2,
  /** Texto libre sobre listas grandes: tres evita traer media tabla. */
  general: 3,
} as const

/**
 * Cuantos resultados devuelve un selector con buscador.
 *
 * Es el PRIMER bloque que se ve al abrirlo y tambien el tope de cada busqueda.
 * Pequeno a proposito: quien busca afina el termino, no recorre doscientas
 * filas. Vive aqui y no junto a la consulta porque `queries.ts` es `server-only`
 * y este valor lo necesitan tambien las pruebas.
 */
export const SEARCH_OPTIONS_LIMIT = 50

/**
 * Deja el termino como se va a buscar: sin espacios sobrantes al principio ni
 * al final, y sin espacios repetidos por dentro.
 *
 * No toca mayusculas ni acentos: eso depende de contra que se compare, y lo
 * resuelve `foldForSearch`.
 */
export function normalizeSearchTerm(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Version comparable de un texto: sin acentos, en minusculas.
 *
 * `NFD` separa la letra de su tilde y el rango de marcas diacriticas la
 * elimina, asi que «José» y «Jose» acaban igual. Es la misma transformacion que
 * hace `search_normalize()` en la base de datos (migracion 0017), y las dos
 * tienen que seguir coincidiendo.
 */
export function foldForSearch(value: string): string {
  return normalizeSearchTerm(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas diacriticas ya separadas por NFD
    .toLowerCase()
}

/** Solo los digitos de un texto: «+57 300 555-0000» -> «573005550000». */
export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

/**
 * `true` si el termino parece un telefono escrito a mano.
 *
 * Se exige un minimo de digitos para no confundir «3» o un numero de boleta
 * con un telefono. Los separadores que admite son los que la gente escribe de
 * verdad y los que acepta la columna `phone`: `+`, espacio, parentesis y guion.
 */
export function isPhoneLikeTerm(term: string): boolean {
  const trimmed = term.trim()
  if (!/^[0-9+ ()-]+$/.test(trimmed)) return false
  return digitsOnly(trimmed).length >= 3
}

/** Digitos de un numero de telefono nacional en Colombia (CLAUDE.md 6). */
const NATIONAL_PHONE_DIGITS = 10

/**
 * Digitos con los que buscar un telefono, sin el indicativo del pais.
 *
 * Los telefonos se guardan de las dos maneras segun quien los escribiera:
 * «3101112233» a secas o «+57 (310) 111-2233». Reducir el termino a sus digitos
 * no basta, y falla de forma asimetrica:
 *
 *   guardado 3101112233 · buscado «+57 (310) 111-2233» -> 573101112233
 *   «%573101112233%» NO esta dentro de «3101112233»  ->  no lo encuentra
 *
 * Al reves si funcionaba —un termino corto es subcadena del guardado largo—, y
 * por eso el fallo se colo: la prueba original guardaba el telefono CON
 * separadores y lo buscaba en digitos, justo la direccion que ya andaba.
 * Reproducido contra produccion (I-039).
 *
 * La solucion es quedarse con el numero NACIONAL: los ultimos diez digitos.
 * Asi el mismo termino encuentra las dos formas de guardado, porque diez
 * digitos son subcadena tanto de «3101112233» como de «573101112233».
 */
function phoneNeedle(term: string): string {
  const digits = digitsOnly(term)
  return digits.length > NATIONAL_PHONE_DIGITS ? digits.slice(-NATIONAL_PHONE_DIGITS) : digits
}

/**
 * Texto con el que buscar de verdad.
 *
 * Un telefono se reduce a sus digitos nacionales para que dé igual como lo
 * escriba quien busca; lo demas solo se dobla a minusculas y sin acentos. En
 * ambos casos el dato GUARDADO no se toca: esto es solo el termino.
 */
export function searchNeedle(term: string): string {
  return isPhoneLikeTerm(term) ? phoneNeedle(term) : foldForSearch(term)
}

/** `true` si el termino da para buscar solo, sin que nadie pulse nada. */
export function meetsMinChars(term: string, minChars: number): boolean {
  return normalizeSearchTerm(term).length >= minChars
}

/**
 * `true` si el termino puede ser un numero de boleta o parte de uno.
 *
 * Los numeros diario y semanal son texto de 1 a 4 digitos (BR-N02), asi que un
 * termino con cualquier otro caracter —«R001», «12A4», un codigo interno
 * entero— no puede coincidir con ninguno: no hay nada que consultar (BR-N11).
 *
 * Se comparan SIEMPRE como texto, nunca convertidos a numero: «00» tiene que
 * poder encontrar «0017», y `parseInt('0017')` perderia los ceros de delante.
 *
 * La misma regla vive en SQL, dentro de `search_tickets` (migracion 0018): si
 * cambia una, tiene que cambiar la otra.
 */
export function isTicketNumberTerm(term: string): boolean {
  return /^[0-9]{1,4}$/.test(term.trim())
}

/**
 * `true` si el termino da para buscar una boleta, por el camino que sea.
 *
 * El buscador de «Boletas» es uno solo y entiende dos cosas (BR-N13, D-100):
 *
 *   * un numero de boleta, de 1 a 4 digitos, y
 *   * el nombre del cliente que la tiene.
 *
 * Solo se descarta lo que no puede ser ninguna de las dos: una sola letra, que
 * devolveria media tabla sin ayudar a nadie. El minimo es el mismo que aplica
 * el campo en pantalla (`SEARCH_MIN_CHARS.tickets`), y `search_tickets`
 * (migracion 0029) lo repite en SQL: esto es un atajo para no ir a la base de
 * datos, no la unica defensa.
 *
 * Un numero de UNA cifra si pasa: «7» es una busqueda legitima de boleta.
 */
export function isTicketSearchTerm(term: string): boolean {
  if (isTicketNumberTerm(term)) return true
  return foldForSearch(term).length >= SEARCH_MIN_CHARS.tickets
}
