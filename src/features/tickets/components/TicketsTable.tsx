'use client'

import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { useMemo } from 'react'

import { DataTable } from '@/components/data/DataTable'
import { PaymentProgressBar } from '@/components/data/PaymentProgressBar'
import { RowChevron } from '@/components/data/RowChevron'
import {
  AdminPaymentStateBadge,
  InventoryStatusBadge,
  PaymentStatusBadge,
} from '@/components/data/StatusBadge'
import { SelectionCheckbox } from '@/components/form/SelectionCheckbox'
import {
  useOptionalTicketSelection,
  type TicketSelectionContextValue,
} from '@/features/tickets/selection/TicketSelectionContext'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'
import { cn } from '@/lib/utils'

import { ticketFinancials } from '../financials'
import { ClearanceReceiptIndicator } from './ClearanceReceiptIndicator'
import { TicketNumbersCell } from './TicketNumbers'

import type { AdminTicketListItem } from '../admin-queries'
import type { TicketListItem } from '../queries'

type SellerTicketsTableProps = {
  audience?: 'seller'
  tickets: TicketListItem[]
  /** `/owner/tickets` o `/seller/tickets`: la tabla sirve a los dos portales. */
  basePath?: string
  /** El vendedor no necesita la columna «Vendedor»: todas las boletas son suyas. */
  showSeller?: boolean
  /** Se oculta donde se opera una sola rifa: el portal del vendedor (D-088). */
  showRaffle?: boolean
  /** Se pasa al contenedor de la tabla; la aplana dentro de una tarjeta. */
  className?: string
}

/** El portal administrativo: su propio modelo, sin cliente ni dinero (D-198). */
type StaffTicketsTableProps = {
  audience: 'staff'
  tickets: AdminTicketListItem[]
  basePath?: string
  className?: string
}

type TicketsTableProps = SellerTicketsTableProps | StaffTicketsTableProps

/** Lo que las dos tablas necesitan de una fila para seleccionarla y abrirla. */
type TicketTableRow = { id: string; dailyNumber: string | null; weeklyNumber: string | null }

/**
 * Tabla de boletas de «Mis boletas» y de «Boletas» del portal administrativo.
 *
 * ES LA LISTA LARGA, y por eso es DENSA. Aqui se recorren cientos de boletas
 * buscando una, asi que la fila se queda en dos lineas de alto: cifras
 * pequeñas, una barra de 4 px y ningun fondo de color. La ficha de un cliente
 * tiene su propia tabla (`ClientTicketsTable`), con las mismas cuentas y mas
 * aire: alli se miran tres boletas, no trescientas.
 *
 * DOS JUEGOS DE COLUMNAS, UN SOLO COMPORTAMIENTO (D-198). El vendedor ve la
 * boleta, de quien es, en que estado esta y el dinero —abonado, falta, por
 * donde va y cuanto vale—. El personal ve la boleta, su rifa y su vendedor, los
 * dos estados —inventario y pago en dos valores— y el paz y salvo; su fila NO
 * TRAE cliente ni dinero, asi que no hay columna que pueda pintarlos. La
 * seleccion, la fila pulsable y la flecha son las mismas para los dos.
 *
 * NO HAY CONSULTA POR FILA. Todo viene en la misma lectura paginada que trae la
 * lista; esta tabla no pide nada mas.
 *
 * ANCHOS. A partir de `lg` caben todas las columnas. Entre `md` y `lg` —una
 * tablet— se retiran rifa, vendedor y estado de inventario, y se quedan las
 * financieras, que es lo que el encargo pide conservar (seccion 7). Por debajo
 * de `md` no hay tabla: hay tarjetas (`TicketCardList`).
 *
 * La seleccion multiple es OPCIONAL: la columna de casillas aparece solo si la
 * tabla esta dentro de un `TicketSelectionProvider`. En escritorio la columna
 * esta siempre y la fila sigue abriendo el detalle. En el telefono aparece solo
 * en modo seleccion, y entonces la fila entera marca en vez de abrir. Que la
 * columna se vea o no lo decide Tailwind, no JavaScript: asi no parpadea al
 * cargar.
 */
export function TicketsTable(props: TicketsTableProps) {
  if (props.audience === 'staff') return <StaffTicketsTable {...props} />
  return <SellerTicketsTable {...props} />
}

function SellerTicketsTable({
  tickets,
  basePath = '/owner/tickets',
  showSeller = true,
  showRaffle = true,
  className,
}: SellerTicketsTableProps) {
  const selection = useOptionalTicketSelection()

  const columns = useMemo<ColumnDef<TicketListItem>[]>(() => {
    const sellerColumn: ColumnDef<TicketListItem>[] = showSeller
      ? [
          {
            accessorKey: 'sellerName',
            header: 'Vendedor',
            meta: { showFrom: 'lg' },
            cell: ({ row }) => (
              <span
                title={row.original.sellerName}
                className="block max-w-[10rem] truncate text-sm"
              >
                {row.original.sellerName}
              </span>
            ),
          },
        ]
      : []

    const raffleColumn: ColumnDef<TicketListItem>[] = showRaffle
      ? [
          {
            accessorKey: 'raffleShortCode',
            header: 'Rifa',
            meta: { showFrom: '2xl' },
            cell: ({ row }) => (
              <span className="text-sm" title={row.original.raffleName}>
                {row.original.raffleShortCode}
              </span>
            ),
          },
        ]
      : []

    return [
      ...selectColumn<TicketListItem>(selection),
      /*
        Los dos numeros, juntos y primeros: asi se nombra una boleta (BR-N11).
        El codigo interno no aparece aqui —vive en el detalle, junto al resto de
        la informacion administrativa—, pero la fila se sigue abriendo por su
        `id`, igual que antes.
      */
      {
        accessorKey: 'dailyNumber',
        header: 'Boleta',
        cell: ({ row }) => (
          <TicketNumbersCell ticket={row.original} href={`${basePath}/${row.original.id}`} />
        ),
      },
      ...raffleColumn,
      ...sellerColumn,
      {
        accessorKey: 'clientName',
        header: 'Cliente',
        cell: ({ row }) => (
          // El paz y salvo va DENTRO del ancho maximo de la celda, no al lado:
          // la columna no puede crecer (el `px-2` de «Progreso» ya se pago con
          // la holgura que sobraba aqui). Son 20 px que le quita al nombre, y
          // el nombre entero sigue a un `title` de distancia.
          <span
            className={cn(
              'flex max-w-[9rem] items-center gap-1.5 text-sm 2xl:max-w-[14rem]',
              row.original.clientName === null && 'text-muted-foreground',
            )}
          >
            <ClearanceReceiptIndicator ticket={row.original} variant="icon" />
            {/* Se recorta: las celdas de esta tabla no parten en dos lineas
                (`whitespace-nowrap`), asi que un nombre de cuarenta letras se
                llevaba 400 px y empujaba las columnas de dinero fuera de la
                pantalla. */}
            <span className="truncate" title={row.original.clientName ?? undefined}>
              {row.original.clientName ?? 'Sin cliente'}
            </span>
          </span>
        ),
      },
      {
        accessorKey: 'inventoryStatus',
        header: 'Estado',
        meta: { showFrom: 'lg' },
        cell: ({ row }) => <InventoryStatusBadge status={row.original.inventoryStatus} />,
      },
      {
        accessorKey: 'paymentStatus',
        header: 'Pago',
        cell: ({ row }) =>
          row.original.inventoryStatus === 'assigned' ? (
            <PaymentStatusBadge status={row.original.paymentStatus} />
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          ),
      },
      /*
        Las tres columnas del cobro. Se ordenan por la cifra de verdad —no por
        el texto ya formateado—, asi que la clave de orden es una funcion, no la
        celda: «$1.000.000» ordenado como texto quedaria antes que «$90.000».
      */
      {
        id: 'paidAmount',
        accessorFn: (row) => ticketFinancials(row).paidAmount,
        header: 'Abonado',
        meta: { align: 'right' },
        cell: ({ row }) => <Money ticket={row.original} pick="paidAmount" />,
      },
      {
        id: 'pendingAmount',
        accessorFn: (row) => ticketFinancials(row).pendingAmount,
        // «Falta», no «Saldo pendiente»: en una columna de esta tabla no cabe
        // el termino entero. La ficha del cliente, que tiene ancho, si lo
        // escribe completo.
        header: 'Falta',
        meta: { align: 'right' },
        cell: ({ row }) => <Money ticket={row.original} pick="pendingAmount" />,
      },
      {
        id: 'percentage',
        accessorFn: (row) => ticketFinancials(row).percentage,
        header: 'Progreso',
        // Centrada: «Falta» va pegada a la derecha de SU celda, asi que una
        // barra alineada a la izquierda de la suya quedaba a un pelo de la
        // cifra y las dos se leian como una sola columna.
        meta: { align: 'center' },
        cell: ({ row }) => {
          const money = ticketFinancials(row.original)
          if (!money.sold) return <span className="text-muted-foreground text-sm">—</span>
          return (
            // El `px-2` no es decoracion: sin el, la barra empieza a 16 px de
            // «$120.000» —solo el relleno de las dos celdas— y las dos columnas
            // se leen pegadas. Lo paga la holgura que sobraba en «Cliente».
            <div className="flex items-center justify-center gap-2 px-2">
              <PaymentProgressBar
                // 56 px hasta 2xl: es lo que hay que devolver para pagar el
                // `px-2` de al lado sin que la tabla desborde a 1.280 px.
                className="w-14 shrink-0 2xl:w-24"
                percentage={money.percentage}
                status={row.original.paymentStatus}
                label={`${money.percentage}% abonado`}
              />
              <span className="text-muted-foreground text-xs tabular-nums">
                {money.percentage}%
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: 'salePrice',
        header: 'Precio',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.salePrice === null ? '—' : formatCOP(row.original.salePrice)}
          </span>
        ),
      },
      chevronColumn<TicketListItem>(),
    ]
  }, [basePath, showSeller, showRaffle, selection])

  return (
    <TicketsDataTable
      columns={columns}
      tickets={tickets}
      basePath={basePath}
      selection={selection}
      className={className}
    />
  )
}

/**
 * Las columnas del PERSONAL (D-198, BR-Q03).
 *
 * Caben todas desde `md` salvo la rifa, que se retira hasta `lg` como en la
 * tabla del vendedor. «Pago» usa la insignia administrativa: dos valores, y un
 * «—» cuando la boleta no se ha vendido, igual que en «Mis boletas».
 */
function StaffTicketsTable({
  tickets,
  basePath = '/owner/tickets',
  className,
}: StaffTicketsTableProps) {
  const selection = useOptionalTicketSelection()

  const columns = useMemo<ColumnDef<AdminTicketListItem>[]>(
    () => [
      ...selectColumn<AdminTicketListItem>(selection),
      {
        accessorKey: 'dailyNumber',
        header: 'Boleta',
        cell: ({ row }) => (
          <TicketNumbersCell ticket={row.original} href={`${basePath}/${row.original.id}`} />
        ),
      },
      {
        accessorKey: 'raffleShortCode',
        header: 'Rifa',
        meta: { showFrom: 'lg' },
        cell: ({ row }) => (
          <span className="text-sm" title={row.original.raffleName}>
            {row.original.raffleShortCode}
          </span>
        ),
      },
      {
        accessorKey: 'sellerName',
        header: 'Vendedor',
        cell: ({ row }) => (
          <span title={row.original.sellerName} className="block max-w-[14rem] truncate text-sm">
            {row.original.sellerName}
          </span>
        ),
      },
      {
        accessorKey: 'inventoryStatus',
        header: 'Estado',
        cell: ({ row }) => <InventoryStatusBadge status={row.original.inventoryStatus} />,
      },
      {
        accessorKey: 'paymentState',
        header: 'Pago',
        cell: ({ row }) =>
          row.original.paymentState === null ? (
            <span className="text-muted-foreground text-sm">—</span>
          ) : (
            <AdminPaymentStateBadge state={row.original.paymentState} />
          ),
      },
      {
        id: 'clearance',
        // Una columna propia, con el termino del glosario: en esta tabla ya no
        // hay celda «Cliente» donde colgarlo (D-170). Una boleta sin vender no
        // dice nada: no hay entrega de la que hablar.
        header: 'Paz y salvo',
        enableSorting: false,
        cell: ({ row }) => (
          <ClearanceReceiptIndicator state={row.original.clearanceState} variant="short" />
        ),
      },
      chevronColumn<AdminTicketListItem>(),
    ],
    [basePath, selection],
  )

  return (
    <TicketsDataTable
      columns={columns}
      tickets={tickets}
      basePath={basePath}
      selection={selection}
      className={className}
    />
  )
}

/**
 * La columna de casillas, compartida por las dos tablas.
 *
 * Esta siempre en escritorio y, en el telefono, solo en modo seleccion. Se
 * reutiliza `hideOnMobile`, que ya existe: es una clase de Tailwind, asi que la
 * decide el navegador sin JavaScript.
 */
function selectColumn<T extends TicketTableRow>(
  selection: TicketSelectionContextValue | null,
): ColumnDef<T>[] {
  if (!selection) return []
  return [
    {
      id: 'select',
      enableSorting: false,
      meta: { hideOnMobile: !selection.selectionMode },
      header: () => (
        <SelectionCheckbox
          checked={
            selection.pageAllSelected ? true : selection.pageSomeSelected ? 'indeterminate' : false
          }
          onCheckedChange={(checked) => selection.togglePage(checked)}
          label="Seleccionar las boletas de esta página"
        />
      ),
      cell: ({ row }) => (
        <SelectionCheckbox
          checked={selection.isSelected(row.original.id)}
          onCheckedChange={() => selection.toggle(row.original.id)}
          label={`Seleccionar la boleta ${ticketLabel(row.original)}`}
        />
      ),
    },
  ]
}

/**
 * Sin titulo visible: la columna no contiene un dato, contiene la pista de que
 * la fila se abre. Un encabezado aqui se leeria como una columna mas; el nombre
 * en `sr-only` la deja anunciada para quien la oye.
 */
function chevronColumn<T>(): ColumnDef<T> {
  return {
    id: 'chevron',
    enableSorting: false,
    header: () => <span className="sr-only">Ver la boleta</span>,
    cell: () => <RowChevron />,
  }
}

function TicketsDataTable<T extends TicketTableRow>({
  columns,
  tickets,
  basePath,
  selection,
  className,
}: {
  columns: ColumnDef<T>[]
  tickets: T[]
  basePath: string
  selection: TicketSelectionContextValue | null
  className?: string
}) {
  // TanStack necesita el mapa `{ id: true }` para pintar `data-state=selected`;
  // la verdad sigue siendo la lista de ids del contexto.
  const rowSelection = useMemo<RowSelectionState | undefined>(() => {
    if (!selection) return undefined
    const state: RowSelectionState = {}
    for (const ticket of tickets) {
      if (selection.isSelected(ticket.id)) state[ticket.id] = true
    }
    return state
  }, [selection, tickets])

  return (
    <DataTable
      columns={columns}
      data={tickets}
      getRowId={(row) => row.id}
      rowSelection={rowSelection}
      rowHref={(row) => `${basePath}/${row.id}`}
      onRowSelect={selection?.rowClickSelects ? (row) => selection.toggle(row.id) : undefined}
      onRowLongPress={
        selection && selection.compact && !selection.selectionMode
          ? (row) => selection.startSelectionMode(row.id)
          : undefined
      }
      caption="Boletas"
      className={className}
    />
  )
}

/**
 * Una de las dos cifras del cobro. Sin venta no hay cifra: se escribe «—», que
 * es distinto de «$0» —eso significaria «vendida y sin abonar»—.
 */
function Money({ ticket, pick }: { ticket: TicketListItem; pick: 'paidAmount' | 'pendingAmount' }) {
  const money = ticketFinancials(ticket)
  if (!money.sold) return <span className="text-muted-foreground text-sm">—</span>
  return <span className="text-sm tabular-nums">{formatCOP(money[pick])}</span>
}
