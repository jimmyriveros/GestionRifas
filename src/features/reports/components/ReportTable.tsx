import type { ReactNode } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Tabla de un reporte.
 *
 * NO usa `DataTable`: aquel ordena en el navegador, y en una tabla paginada en
 * servidor eso ordenaria unicamente las filas de la pagina actual, dando la
 * impresion falsa de un ranking completo. Los reportes vienen ya ordenados por
 * SQL, asi que lo que hace falta es una tabla que se limite a mostrarlos.
 *
 * Es un Server Component: no envia JavaScript al telefono del vendedor.
 * Responsive con la misma tecnica que `DataTable` (CLAUDE.md §27): scroll
 * horizontal en el contenedor y columnas secundarias ocultas bajo `md`, en vez
 * de encoger la tabla hasta volverla ilegible.
 */

export type ReportTableColumn<T> = {
  header: string
  cell: (row: T) => ReactNode
  align?: 'right'
  /** Se oculta en pantallas pequenas. Nunca para la columna principal. */
  hideOnMobile?: boolean
  /** Contenido de la fila de totales, si la columna la tiene. */
  footer?: ReactNode
}

type ReportTableProps<T> = {
  columns: ReportTableColumn<T>[]
  rows: readonly T[]
  getRowId: (row: T) => string
  /** Descripcion para lectores de pantalla (CLAUDE.md §27, accesibilidad). */
  caption: string
  /** Muestra la fila de totales. Solo si alguna columna define `footer`. */
  showFooter?: boolean
  footerLabel?: string
}

export function ReportTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  showFooter = false,
  footerLabel = 'Total',
}: ReportTableProps<T>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.header}
                scope="col"
                className={cn(
                  column.hideOnMobile && 'hidden md:table-cell',
                  column.align === 'right' && 'text-right',
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-24 text-center"
              >
                No hay datos para este reporte.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={getRowId(row)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.header}
                    className={cn(
                      column.hideOnMobile && 'hidden md:table-cell',
                      column.align === 'right' && 'text-right',
                    )}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>

        {showFooter && rows.length > 0 ? (
          <TableFooter>
            <TableRow>
              {columns.map((column, index) => (
                <TableCell
                  key={column.header}
                  className={cn(
                    'font-semibold',
                    column.hideOnMobile && 'hidden md:table-cell',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {index === 0 ? footerLabel : (column.footer ?? null)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  )
}
