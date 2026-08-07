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
