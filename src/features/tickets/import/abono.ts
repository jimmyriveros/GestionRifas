import { formatCOP } from '@/lib/money'
import { foldForSearch } from '@/lib/search'

/**
 * Lectura de la casilla «Abono» de un archivo de boletas (BR-N14, D-129).
 *
 * Quien sube el archivo lo lleva en Excel y anota los abonos como los anota en
 * el cuaderno: «20», «20.000», «20000» o «Cancelado» cuando ya la pagaron.
 * Las cuatro formas significan lo mismo y aqui se convierten a lo unico que
 * entiende el resto del sistema: un ENTERO de pesos (BR-P02).
 *
 * Funcion PURA y sin estado, igual que el resto de la lectura del archivo: se
 * prueba sin navegador y sin base de datos.
 *
 * El precio NO esta escrito en este archivo. Entra por parametro y sale de
 * `raffles.ticket_price` (CLAUDE.md 6 y 14, D-098): ni el tope del abono ni el
 * valor de «Cancelado» pueden depender de una cifra copiada en el codigo.
 */

export type AbonoParse =
  /** La casilla esta vacia: esta boleta no lleva abono. */
  | { kind: 'none' }
  /** Valor en pesos enteros, ya listo para el backend. */
  | { kind: 'amount'; amount: number }
  /** No se pudo interpretar. `problem` se muestra tal cual en la vista previa. */
  | { kind: 'error'; problem: string }

/** La palabra que significa «esta boleta ya esta pagada del todo». */
const PALABRA_PAGADA = 'cancelado'

/**
 * Palabras que suenan a lo mismo y NO valen.
 *
 * Se rechazan con un mensaje que dice cual es la buena, en vez de con el error
 * generico: quien escribe «Completa» cree que lo esta haciendo bien, y decirle
 * solo «no entendemos este abono» le deja adivinando.
 */
const PALABRAS_PARECIDAS = ['completa', 'completo', 'pagada', 'pagado', 'paga', 'total']

/**
 * Un valor escrito a mano: o todo digitos, o digitos agrupados de tres en tres.
 *
 * Los separadores de miles se comprueban AQUI en vez de borrarlos sin mirar, y
 * es lo unico que impide leer «20,5» como veinte mil quinientos. Un valor con
 * decimales no es un abono valido: el dinero de este sistema son pesos enteros.
 */
const NUMERO_ESCRITO = /^-?(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/

/** Cuantos miles cabe en el precio: el «20» del cuaderno son veinte mil. */
function topeEnMiles(ticketPrice: number): number {
  return Math.floor(ticketPrice / 1000)
}

/**
 * Interpreta la casilla «Abono» de una fila.
 *
 * Reglas, en el orden en que se aplican:
 *
 *   1. Vacia -> la boleta no lleva abono y no se crea ningun movimiento.
 *   2. «Cancelado», como se escriba -> el precio completo de la boleta.
 *   3. Un numero hasta los miles que caben en el precio -> miles de pesos
 *      («20» son $20.000). Por encima, el valor completo («20000» son $20.000).
 *   4. Cero, negativo, texto no reconocido o por encima del precio -> error.
 */
export function parseAbono(raw: string, ticketPrice: number): AbonoParse {
  const trimmed = raw.trim()
  if (trimmed === '') return { kind: 'none' }

  // `foldForSearch` baja a minusculas, quita acentos y colapsa espacios: es la
  // misma normalizacion que usa la busqueda, para no tener dos reglas distintas.
  const folded = foldForSearch(trimmed)

  if (folded === PALABRA_PAGADA) return { kind: 'amount', amount: ticketPrice }

  if (PALABRAS_PARECIDAS.includes(folded)) {
    return {
      kind: 'error',
      problem: 'Para dar la boleta por pagada escribe «Cancelado».',
    }
  }

  const bare = folded.replace(/\s/g, '').replace(/^(?:cop|\$)+|(?:cop|\$)+$/g, '')

  if (!NUMERO_ESCRITO.test(bare)) {
    return {
      kind: 'error',
      problem:
        'No entendemos este abono. Escribe solo el valor, por ejemplo 20.000, o «Cancelado» si ya está pagada.',
    }
  }

  if (bare.startsWith('-')) {
    return { kind: 'error', problem: 'El abono no puede ser un valor negativo.' }
  }

  const escrito = Number.parseInt(bare.replace(/[.,]/g, ''), 10)

  if (escrito === 0) {
    return {
      kind: 'error',
      problem: 'El abono debe ser mayor que cero. Deja la casilla vacía si esta boleta no tiene.',
    }
  }

  const amount = escrito <= topeEnMiles(ticketPrice) ? escrito * 1000 : escrito

  if (amount > ticketPrice) {
    return {
      kind: 'error',
      problem: `El abono de ${formatCOP(amount)} supera el precio de la boleta (${formatCOP(ticketPrice)}).`,
    }
  }

  return { kind: 'amount', amount }
}
