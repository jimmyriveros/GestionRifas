import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { SECTION_TABLE_CLASSES } from '@/components/data/TableSection'
import { Button } from '@/components/ui/button'
import { LIST_ITEM_LABELS } from '@/lib/constants'

import type { PaymentListItem } from '../queries'
import { PaymentsTable } from './PaymentsTable'

type ClientPaymentsHistoryProps = {
  rows: PaymentListItem[]
  /** Pagos del cliente en TOTAL, no los de esta pagina. */
  total: number
  page: number
  pageSize: number
  /** La direccion de la pagina 1 con los demas parametros intactos. */
  firstPageHref: string
  /**
   * El `id` de la seccion entera, titulo incluido: la paginacion trae ahi la
   * vista. Apuntar a la tabla dejaba «Historial de abonos» debajo del
   * encabezado fijo (medido).
   */
  sectionId: string
}

/** Los textos de esta seccion, juntos (UX_COPY_GUIDELINES, Anexo B). */
const COPY = {
  empty: 'Todavía no le has registrado ningún abono.',
  outOfRangeTitle: 'Esa página no existe',
  outOfRangeAction: 'Ir a la primera página',
} as const

/** «El historial tiene 130 abonos en 6 páginas.» */
export function clientPaymentsOutOfRange(total: number, pages: number): string {
  const label = LIST_ITEM_LABELS.clientPayments
  const abonos = `${total} ${total === 1 ? label.one : label.many}`
  const paginas = pages === 1 ? '1 página' : `${pages} páginas`
  return `El historial tiene ${abonos} en ${paginas}.`
}

/**
 * El cuerpo de «Historial de abonos» en la ficha del cliente (I-156).
 *
 * TRES CASOS, Y NO SE CONFUNDEN. El vacio se decide con `total` —el del
 * historial entero—, nunca con las filas de la pagina: con `rows`, la pagina 99
 * de un cliente con 130 abonos diria «todavia no le has registrado ningun
 * abono», que es falso (la misma leccion de D-214). Una pagina fuera de rango
 * lo dice con las cifras del conjunto y ofrece volver, como «Premios ganados».
 *
 * LA TABLA ORDENA EN LA BASE (`serverSorted`). Paginada, un orden de navegador
 * reacomodaria solo las 25 filas servidas y afirmaria un orden del conjunto que
 * no es (P1-B). Los totales de arriba (`ClientTotals`) salen de la ficha, no de
 * estas filas: ninguno se convierte en un total de la pagina.
 */
export function ClientPaymentsHistory({
  rows,
  total,
  page,
  pageSize,
  firstPageHref,
  sectionId,
}: ClientPaymentsHistoryProps) {
  if (total === 0) {
    return <p className="text-muted-foreground px-2 py-2 text-sm">{COPY.empty}</p>
  }

  if (rows.length === 0) {
    const pages = Math.max(1, Math.ceil(total / pageSize))
    return (
      <div className="space-y-3 px-2 py-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">{COPY.outOfRangeTitle}</p>
          <p className="text-muted-foreground text-sm">{clientPaymentsOutOfRange(total, pages)}</p>
        </div>
        <Button asChild variant="outline" size="touch" className="w-full sm:w-auto">
          <Link href={firstPageHref}>{COPY.outOfRangeAction}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <PaymentsTable
        payments={rows}
        clientBasePath="/seller/clients"
        showClient={false}
        className={SECTION_TABLE_CLASSES}
        serverSorted
        keepScrollOnSort
      />
      {/* El mismo relleno lateral que el texto vacio de la seccion: la barra se
          alinea con la primera columna de la tabla. */}
      <div className="px-2">
        <DataTablePagination
          total={total}
          page={page}
          pageSize={pageSize}
          items="clientPayments"
          scrollTargetId={sectionId}
        />
      </div>
    </div>
  )
}
