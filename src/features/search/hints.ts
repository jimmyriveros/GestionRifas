/**
 * Los textos que acompanan al campo de busqueda, en un solo sitio.
 *
 * Los leen las cuatro pantallas con lista y los dos selectores de cliente. Si
 * cada una escribiera el suyo, acabarian diciendo lo mismo de cuatro maneras
 * (UX_COPY_GUIDELINES Anexo B: un mismo mensaje no se escribe dos veces).
 */

type HintState = {
  isBelowMinChars: boolean
  minChars: number
  isSearching: boolean
}

/**
 * Pista bajo el campo segun el estado de la busqueda.
 *
 * Devuelve `undefined` cuando no hay nada util que decir: una pista permanente
 * se convierte en ruido y deja de leerse.
 */
export function searchHint({
  isBelowMinChars,
  minChars,
  isSearching,
}: HintState): string | undefined {
  if (isBelowMinChars) {
    // Se dice el minimo Y la salida rapida: quien tenga prisa no deberia
    // quedarse esperando a completar una letra que no piensa escribir.
    return `Escribe al menos ${minChars} caracteres, o pulsa Enter para buscar ya.`
  }
  if (isSearching) return 'Buscando...'
  return undefined
}

/**
 * Pista propia del buscador de boletas.
 *
 * Una boleta se busca por sus numeros, y esos numeros son de 1 a 4 digitos
 * (BR-N02, BR-N11). Escribir un codigo interno o una letra no encuentra nada, y
 * una lista vacia sin explicacion se lee como «la aplicacion no funciona». Se
 * avisa mientras se escribe, antes de que la busqueda salga en vano.
 *
 * Devuelve `undefined` cuando el termino si sirve: ahi manda `searchHint`.
 */
export function ticketSearchHint(term: string): string | undefined {
  const trimmed = term.trim()
  if (trimmed === '') return undefined
  if (!/^[0-9]+$/.test(trimmed)) {
    return 'Las boletas se buscan por sus números. Escribe solo cifras, por ejemplo 1234.'
  }
  if (trimmed.length > 4) return 'Los números de una boleta tienen 4 cifras como máximo.'
  return undefined
}

/**
 * Que decir cuando la lista de boletas sale vacia.
 *
 * Devuelve `undefined` cuando no hay ni busqueda ni filtros: ahi la pantalla
 * tiene algo mejor que decir («crea tus primeras boletas»), y esta funcion no
 * debe pisarselo.
 */
export function ticketSearchEmptyDescription(
  term: string | undefined,
  hasFilters: boolean,
): string | undefined {
  const hint = term ? ticketSearchHint(term) : undefined
  // Quien escribio un codigo interno merece saber por que no aparece nada, en
  // vez de concluir que la boleta se perdio.
  if (hint)
    return `${hint} El código interno no sirve para buscar: está en el detalle de cada boleta.`
  if (hasFilters) return 'Prueba a limpiar los filtros o a buscar por otro número.'
  return undefined
}
