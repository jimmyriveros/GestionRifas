import { toCsv } from '@/lib/csv'
import {
  LEGACY_NUMBER_FORMAT,
  type NumberGroupSlot,
  type RaffleNumberFormat,
} from '@/lib/ticket-number-format'

/**
 * Los archivos de ejemplo que el importador ofrece descargar.
 *
 * El CSV se genera con `toCsv`, el mismo escritor que usan los reportes: sale
 * con separador `;` y marca BOM porque es lo que Excel en configuracion
 * colombiana abre en columnas de verdad (D-056). Un archivo de ejemplo separado
 * por comas se abriria ahi con todo amontonado en la primera celda, que es
 * justo lo que un ejemplo no debe hacer.
 *
 * El importador acepta las dos formas, asi que quien prefiera comas no tiene
 * ningun problema: el separador se detecta al leer.
 *
 * Desde D-198 solo hay un ejemplo, con los numeros: ningun portal importa
 * clientes ni abonos, y ofrecer un archivo con esas columnas seria ensenar a
 * rellenar algo que la vista previa va a rechazar (BR-Q07).
 *
 * Desde D-261 el ejemplo es el de LA rifa: sus columnas se llaman como sus
 * números y cada número tiene sus cifras exactas. La rifa de siempre conserva
 * los encabezados de su Excel, «Premio semanal» y «Premio diario».
 */

const EXAMPLES = [
  { daily: '3332', weekly: '7607' },
  { daily: '9654', weekly: '3929' },
]

function isLegacy(format: RaffleNumberFormat): boolean {
  const [first, second] = format.groups
  return (
    first.name === 'Diario' && first.digits === 4 && second?.name === 'Semanal' && second.digits === 4
  )
}

/** Una columna del archivo: qué número de la boleta trae y cómo se llama. */
export type ImportColumn = { slot: NumberGroupSlot; header: string; question: string }

/**
 * Las columnas que espera el importador, en el orden del archivo de ejemplo
 * (D-261). La rifa de siempre conserva las de su Excel —«Premio semanal» y
 * «Premio diario», en ese orden— y la pantalla las sigue nombrando así; otra
 * rifa, por los nombres de sus números. Lo leen el texto de antes de subir, el
 * mapeo de columnas y la vista previa: los tres dicen lo mismo.
 */
export function importColumns(format: RaffleNumberFormat = LEGACY_NUMBER_FORMAT): ImportColumn[] {
  if (isLegacy(format)) {
    return [
      { slot: 'weekly_number', header: 'Premio semanal', question: '¿Cuál columna es el premio semanal?' },
      { slot: 'daily_number', header: 'Premio diario', question: '¿Cuál columna es el premio diario?' },
    ]
  }
  return format.groups.map((group) => ({
    slot: group.slot,
    header: group.name,
    question: `¿Cuál columna es «${group.name}»?`,
  }))
}

export function sampleCsv(format: RaffleNumberFormat = LEGACY_NUMBER_FORMAT): string {
  const [first, second] = format.groups
  if (isLegacy(format)) {
    return toCsv<(typeof EXAMPLES)[number]>(
      [
        { header: 'Premio semanal', value: (fila) => fila.weekly },
        { header: 'Premio diario', value: (fila) => fila.daily },
      ],
      EXAMPLES,
    )
  }
  return toCsv<(typeof EXAMPLES)[number]>(
    [
      { header: first.name, value: (fila) => fila.daily.slice(-first.digits) },
      ...(second
        ? [{ header: second.name, value: (fila: (typeof EXAMPLES)[number]) => fila.weekly.slice(-second.digits) }]
        : []),
    ],
    EXAMPLES,
  )
}

export function sampleJson(format: RaffleNumberFormat = LEGACY_NUMBER_FORMAT): string {
  const [first, second] = format.groups
  return JSON.stringify(
    EXAMPLES.map((fila) =>
      second
        ? { weekly_number: fila.weekly.slice(-second.digits), daily_number: fila.daily.slice(-first.digits) }
        : { daily_number: fila.daily.slice(-first.digits) },
    ),
    null,
    2,
  )
}

/** Los de la rifa de siempre (compatibilidad). */
export const SAMPLE_CSV = sampleCsv()
export const SAMPLE_JSON = sampleJson()
