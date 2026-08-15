const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

// \p{White_Space} cubre el espacio normal, el NBSP y el espacio fino que
// distintas versiones de ICU insertan entre el simbolo de moneda y la cifra.
const CURRENCY_WHITESPACE_RE = /\p{White_Space}/gu

/**
 * Formatea un entero de pesos colombianos como "$120.000", sin espacio entre
 * el simbolo y la cifra (CLAUDE.md, seccion 6), sin importar el entorno.
 */
export function formatCOP(amount: number): string {
  return COP_FORMATTER.format(amount).replace(CURRENCY_WHITESPACE_RE, '')
}

/**
 * Extrae los digitos de una entrada de usuario y los convierte a entero.
 * Devuelve null cuando no hay ningun digito (entrada vacia o invalida).
 */
export function parseCOP(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, '')
  if (digits === '') return null
  return Number.parseInt(digits, 10)
}
