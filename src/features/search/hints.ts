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
 * El campo entiende DOS cosas (BR-N13, D-100): los numeros de la boleta y el
 * cliente que la tiene. Casi cualquier cosa que se escriba es una de las dos,
 * asi que ya no se avisa por escribir letras —antes si, cuando solo valian las
 * cifras—.
 *
 * Queda un aviso, y es el util: mas de cuatro cifras seguidas no puede ser un
 * numero de boleta (BR-N02), y quien las escribe suele estar copiando un codigo
 * interno. Se le dice mientras escribe, y se le dice tambien que con esas
 * cifras se esta buscando el telefono del cliente, que es lo que de verdad
 * ocurre: si no lo supiera, un resultado inesperado pareceria un fallo.
 *
 * Devuelve `undefined` cuando el termino si sirve: ahi manda `searchHint`.
 */
export function ticketSearchHint(term: string): string | undefined {
  const trimmed = term.trim()
  if (trimmed === '') return undefined
  if (/^[0-9]{5,}$/.test(trimmed)) {
    return 'Los números de una boleta tienen 4 cifras como máximo. Con más cifras buscamos el teléfono del cliente.'
  }
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
  if (term) {
    // Quien escribio un codigo interno merece saber por que no aparece nada, en
    // vez de concluir que la boleta se perdio.
    const hint = ticketSearchHint(term)
    if (hint)
      return `${hint} El código interno no sirve para buscar: está en el detalle de cada boleta.`
    return 'Revisa el número de la boleta o el nombre del cliente. El código interno no sirve para buscar: está en el detalle de cada boleta.'
  }
  if (hasFilters) return 'Prueba a limpiar los filtros o a buscar por otro número.'
  return undefined
}
