'use client'

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { tourTarget } from '@/features/tour/tours'
import { cn } from '@/lib/utils'

/**
 * Envoltura de TanStack Table (docs/ARCHITECTURE.md 8.2).
 *
 * La paginacion es de SERVIDOR (rango en la consulta, ver DataTablePagination):
 * aqui solo se ordena y renderiza la pagina actual. Asi una organizacion con
 * decenas de miles de boletas nunca las trae todas al navegador.
 *
 * Responsive: contenedor con scroll horizontal y columnas secundarias ocultas
 * bajo `md` mediante `meta.hideOnMobile`, en vez de encoger la tabla hasta
 * hacerla ilegible en un telefono.
 */

declare module '@tanstack/react-table' {
  // Los parametros son los de la interfaz original de TanStack; aqui no se usan,
  // pero deben declararse igual para que la ampliacion encaje.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    hideOnMobile?: boolean
    align?: 'right'
  }
}

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  getRowId?: (row: TData) => string
  /** Contenido a mostrar cuando no hay filas (normalmente un <EmptyState />). */
  empty?: ReactNode
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  enableRowSelection?: boolean | ((row: TData) => boolean)
  caption?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  empty,
  rowSelection,
  onRowSelectionChange,
  enableRowSelection,
  caption,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    state: { sorting, ...(rowSelection ? { rowSelection } : {}) },
    onSortingChange: setSorting,
    onRowSelectionChange,
    enableRowSelection:
      typeof enableRowSelection === 'function'
        ? (row) => enableRowSelection(row.original)
        : enableRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (data.length === 0 && empty) {
    return <>{empty}</>
  }

  return (
    <div {...tourTarget('data-table')} className="w-full overflow-x-auto rounded-lg border">
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta
                const canSort = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      meta?.hideOnMobile && 'hidden md:table-cell',
                      meta?.align === 'right' && 'text-right',
                    )}
                    aria-sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : canSort
                            ? 'none'
                            : undefined
                    }
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="hover:text-foreground inline-flex items-center gap-1"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUpIcon className="size-3" aria-hidden />
                        ) : sorted === 'desc' ? (
                          <ArrowDownIcon className="size-3" aria-hidden />
                        ) : (
                          <ChevronsUpDownIcon className="size-3 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-24 text-center"
              >
                No hay resultados.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        meta?.hideOnMobile && 'hidden md:table-cell',
                        meta?.align === 'right' && 'text-right',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
