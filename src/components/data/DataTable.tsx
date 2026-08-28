'use client'

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnMeta,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

import {
  hasTextSelection,
  isActivationKey,
  shouldActivateRow,
} from '@/components/data/row-activation'
import { useLongPress } from '@/components/data/use-long-press'
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
 *
 * Fila seleccionable (`rowHref` / `onRowActivate`): toda la fila abre el
 * detalle, no solo el enlace de la primera columna. En un telefono ese enlace
 * es una diana de pocos milimetros; la fila entera se acierta con el pulgar.
 * El enlace se conserva —da el menu contextual, «abrir en otra pestana» y una
 * parada de teclado con nombre—, y las reglas de `row-activation.ts` evitan que
 * el mismo clic cuente dos veces.
 */

declare module '@tanstack/react-table' {
  // Los parametros son los de la interfaz original de TanStack; aqui no se usan,
  // pero deben declararse igual para que la ampliacion encaje.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    hideOnMobile?: boolean
    /**
     * A partir de que ancho aparece la columna. Es el escalon que faltaba
     * —`hideOnMobile` solo distingue telefono de todo lo demas— y lo necesita
     * la tabla de boletas: en 768 px se queda con lo financiero y suelta
     * vendedor y estado de inventario; el codigo de la rifa no vuelve hasta
     * 1.536 px, que es cuando sobra sitio para el (seccion 7 del encargo).
     */
    showFrom?: 'lg' | 'xl' | '2xl'
    align?: 'right'
  }
}

const SHOW_FROM: Record<'lg' | 'xl' | '2xl', string> = {
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
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
  /**
   * Direccion que abre la fila al pulsarla. Devolver `null` deja esa fila sin
   * accion: la tabla no promete algo que luego no ocurre.
   */
  rowHref?: (row: TData) => string | null
  /** Alternativa a `rowHref` cuando la fila abre un dialogo en vez de navegar. */
  onRowActivate?: (row: TData) => void
  /**
   * Modo seleccion: mientras esta activo, pulsar la fila la marca o la desmarca
   * en vez de abrir su detalle (seccion 3 del encargo). Es lo que convierte la
   * fila entera en la diana, para no obligar a acertar sobre la casilla.
   */
  onRowSelect?: (row: TData) => void
  /** Pulsacion larga con el dedo: atajo para entrar en modo seleccion. */
  onRowLongPress?: (row: TData) => void
  /**
   * Clases del contenedor de la tabla. Existe para APLANARLA cuando ya va dentro
   * de una tarjeta (`TableSection`): alli el borde y las esquinas los pone la
   * tarjeta, y dibujarlos dos veces se ve como una caja dentro de otra.
   */
  className?: string
}

/**
 * Desde que ancho se ve la columna. `showFrom` manda sobre `hideOnMobile`:
 * las dos a la vez se pisaban —`md:table-cell` volvia a mostrar en 768 px lo
 * que `hidden 2xl:table-cell` pretendia ocultar— y el resultado era una
 * columna que no desaparecia nunca.
 */
function columnVisibility(meta: ColumnMeta<unknown, unknown> | undefined): string | false {
  if (meta?.showFrom) return SHOW_FROM[meta.showFrom]
  return meta?.hideOnMobile ? 'hidden md:table-cell' : false
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
  rowHref,
  onRowActivate,
  onRowSelect,
  onRowLongPress,
  className,
}: DataTableProps<TData, TValue>) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])
  const longPress = useLongPress(onRowLongPress)

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

  /**
   * En modo seleccion la fila marca, no abre. Es lo que evita que un toque mal
   * dado saque a la persona de la lista que estaba revisando.
   */
  function activate(rowData: TData, href: string | null) {
    if (onRowSelect) {
      onRowSelect(rowData)
      return
    }
    if (onRowActivate) {
      onRowActivate(rowData)
      return
    }
    if (href) router.push(href)
  }

  function handleRowClick(
    event: MouseEvent<HTMLTableRowElement>,
    rowData: TData,
    href: string | null,
  ) {
    // Una pulsacion larga ya hizo su trabajo: el `click` que el navegador emite
    // despues no debe contar otra vez.
    if (longPress.consumeSuppressedClick()) return
    if (!shouldActivateRow(event.target, event.currentTarget)) return
    if (hasTextSelection(window.getSelection())) return
    activate(rowData, href)
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    rowData: TData,
    href: string | null,
  ) {
    // Con el foco en el enlace o en la casilla de la fila manda ese elemento:
    // si no, `Enter` navegaria dos veces y `Space` marcaria y navegaria a la vez.
    if (event.target !== event.currentTarget) return
    if (!isActivationKey(event.key)) return
    event.preventDefault() // `Space` desplazaria la pagina.
    activate(rowData, href)
  }

  return (
    <div
      {...tourTarget('data-table')}
      className={cn('w-full overflow-x-auto rounded-lg border', className)}
    >
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
                    className={cn(columnVisibility(meta), meta?.align === 'right' && 'text-right')}
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
            table.getRowModel().rows.map((row) => {
              const href = rowHref ? rowHref(row.original) : null
              const clickable = Boolean(onRowSelect) || Boolean(onRowActivate) || href !== null

              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  data-clickable={clickable ? 'true' : undefined}
                  aria-selected={rowSelection ? row.getIsSelected() : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={
                    clickable ? (event) => handleRowClick(event, row.original, href) : undefined
                  }
                  onKeyDown={
                    clickable ? (event) => handleRowKeyDown(event, row.original, href) : undefined
                  }
                  {...longPress.getHandlers(row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          columnVisibility(meta),
                          meta?.align === 'right' && 'text-right',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
