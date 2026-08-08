import { toCsv } from '@/lib/csv'

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
 */

type Ejemplo = { semanal: string; diario: string }

const FILAS: Ejemplo[] = [
  { semanal: '7607', diario: '3332' },
  { semanal: '3929', diario: '9654' },
]

export const SAMPLE_CSV = toCsv<Ejemplo>(
  [
    { header: 'Premio semanal', value: (fila) => fila.semanal },
    { header: 'Premio diario', value: (fila) => fila.diario },
  ],
  FILAS,
)

export const SAMPLE_JSON = JSON.stringify(
  FILAS.map((fila) => ({ weekly_number: fila.semanal, daily_number: fila.diario })),
  null,
  2,
)
