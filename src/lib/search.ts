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

/**
 * Texto con el que buscar de verdad.
 *
 * Un telefono se reduce a sus digitos para que dé igual como lo escriba quien
 * busca; lo demas solo se dobla a minusculas y sin acentos. En ambos casos el
 * dato GUARDADO no se toca: esto es solo el termino.
 */
export function searchNeedle(term: string): string {
  return isPhoneLikeTerm(term) ? digitsOnly(term) : foldForSearch(term)
}

/** `true` si el termino da para buscar solo, sin que nadie pulse nada. */
export function meetsMinChars(term: string, minChars: number): boolean {
  return normalizeSearchTerm(term).length >= minChars
}

/**
 * `true` si el termino es un numero de boleta completo (1 a 4 digitos).
 *
 * Los numeros diario y semanal se comparan EXACTOS y como texto (BR-N03):
 * buscar «07» no puede traer «0007» ni «7». Por eso se distinguen aqui, en vez
 * de dejarlos caer en la busqueda parcial junto al resto.
 */
export function isTicketNumberTerm(term: string): boolean {
  return /^[0-9]{1,4}$/.test(term.trim())
}
