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

type Ejemplo = {
  semanal: string
  diario: string
  cliente?: string
  celular?: string
  abono?: string
}

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

/**
 * Las cuatro filas enseñan, en este orden, las cuatro formas de rellenarlas:
 * abono a medias, boleta ya cancelada, cliente sin abono todavia, y boleta sin
 * vender. Un ejemplo que solo enseña un caso deja adivinando los otros tres.
 */
const FILAS_CON_CLIENTE: Ejemplo[] = [
  {
    semanal: '7607',
    diario: '3332',
    cliente: 'Carlos Gómez',
    celular: '3001234567',
    abono: '20.000',
  },
  {
    semanal: '5218',
    diario: '0461',
    cliente: 'Carlos Gómez',
    celular: '3001234567',
    abono: 'Cancelado',
  },
  { semanal: '8140', diario: '2276', cliente: 'Marta Ruiz', celular: '3009876543', abono: '' },
  { semanal: '3929', diario: '9654', cliente: '', celular: '', abono: '' },
]

export const SAMPLE_CSV_WITH_CLIENTS = toCsv<Ejemplo>(
  [
    { header: 'Premio semanal', value: (fila) => fila.semanal },
    { header: 'Premio diario', value: (fila) => fila.diario },
    { header: 'Cliente', value: (fila) => fila.cliente ?? '' },
    { header: 'Celular', value: (fila) => fila.celular ?? '' },
    { header: 'Abono', value: (fila) => fila.abono ?? '' },
  ],
  FILAS_CON_CLIENTE,
)

export const SAMPLE_JSON = JSON.stringify(
  FILAS.map((fila) => ({ weekly_number: fila.semanal, daily_number: fila.diario })),
  null,
  2,
)

export const SAMPLE_JSON_WITH_CLIENTS = JSON.stringify(
  FILAS_CON_CLIENTE.map((fila) => ({
    weekly_number: fila.semanal,
    daily_number: fila.diario,
    client_name: fila.cliente,
    client_phone: fila.celular,
    abono: fila.abono,
  })),
  null,
  2,
)
