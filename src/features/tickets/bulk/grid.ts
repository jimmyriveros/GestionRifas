/**
 * Las dos reglas de la rejilla de creacion masiva que no son «duplicados»:
 * cuanta gente escribio ya algo que se puede perder, y si la cantidad pedida
 * se puede generar.
 *
 * Vive aparte de `duplicates.ts` —que compara numeros entre si— y aparte del
 * componente, porque es logica pura y comprobable sin navegador
 * (tests/unit/bulk-grid.test.ts). El mismo criterio que `row-activation.ts`.
 *
 * LOS TEXTOS VIVEN AQUI, JUNTOS. Es la regla del Anexo B de la guia de
 * redaccion: un mensaje que explica una regla se escribe al lado de la regla,
 * no suelto dentro del JSX que lo pinta.
 */
import { BULK_TICKET_MAX, BULK_TICKET_MIN } from '@/lib/constants'

import type { BulkTicketRow } from '../schemas'

export const BULK_GRID_COPY = {
  /**
   * Los tres motivos por los que una cantidad no se puede generar.
   *
   * No repiten el rango entero porque la etiqueta del campo ya lo dice
   * —«Cantidad (1 a 1000)»—: cada mensaje dice la regla que se incumplio, que
   * es lo que la pantalla NO estaba diciendo.
   */
  quantityNotANumber: 'Escribe la cantidad en números.',
  quantityTooFew: `Necesitas al menos ${BULK_TICKET_MIN} boleta.`,
  quantityTooMany: `Puedes generar hasta ${BULK_TICKET_MAX} boletas por lote.`,

  /** Confirmacion de volver a generar, cuando hay numeros escritos. */
  regenerateTitle: 'Volver a generar las filas',
  regenerateConfirm: 'Generar de nuevo',
  regenerateCancel: 'Cancelar',
} as const

export type BulkQuantityCheck =
  | { ok: true; quantity: number }
  /**
   * `message` es `null` mientras el campo esta VACIO. No es un descuido: quien
   * borra la cantidad para escribir otra no ha cometido ningun error todavia, y
   * un aviso parpadeando entre tecla y tecla es ruido. El boton se desactiva
   * igual, y la etiqueta del campo sigue diciendo el rango.
   */
  | { ok: false; message: string | null }

/**
 * Si la cantidad escrita se puede generar tal cual.
 *
 * RECIBE EL TEXTO, NO UN NUMERO, y a proposito (P2-3). Antes el componente
 * guardaba un `number` y al generar hacia `Math.min(Math.max(...))`: escribir
 * 5000 dejaba el campo con 5000 y generaba 1000, sin decir nada. Con el texto
 * crudo se conserva exactamente lo que la persona escribio —la guia prohibe
 * corregir en silencio un dato recien tecleado— y el limite se explica en vez
 * de aplicarse a escondidas.
 */
export function checkBulkQuantity(raw: string): BulkQuantityCheck {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, message: null }

  const value = Number(trimmed)
  if (!Number.isInteger(value)) return { ok: false, message: BULK_GRID_COPY.quantityNotANumber }
  if (value < BULK_TICKET_MIN) return { ok: false, message: BULK_GRID_COPY.quantityTooFew }
  if (value > BULK_TICKET_MAX) return { ok: false, message: BULK_GRID_COPY.quantityTooMany }

  return { ok: true, quantity: value }
}

/** Filas con algo escrito en cualquiera de los dos numeros. */
export function countFilledRows(rows: readonly BulkTicketRow[]): number {
  return rows.filter((row) => row.dailyNumber.trim() !== '' || row.weeklyNumber.trim() !== '')
    .length
}

/**
 * Lo que se pierde al volver a generar. Se cuenta en FILAS y no en numeros
 * sueltos: es la unidad que la persona ve en la rejilla.
 *
 * Singular y plural escritos de verdad. En esta pantalla conviven «1000
 * fila(s)» y «Guardar 1000 boleta(s)», que la guia ya senala como defecto
 * abierto; no se arreglan aqui —no es el alcance de este bloque— pero tampoco
 * se anade uno nuevo.
 */
export function regenerateWarning(filled: number): string {
  const filas = filled === 1 ? '1 fila' : `${filled} filas`
  return `Escribiste números en ${filas}. Al generar de nuevo se borran y las filas quedan vacías.`
}
