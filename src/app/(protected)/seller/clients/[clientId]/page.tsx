import { PencilIcon, PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { ClientStatusBadge } from '@/components/data/StatusBadge'
import { SECTION_TABLE_CLASSES, TableSection } from '@/components/data/TableSection'
import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import { ClientArchiveButton } from '@/features/clients/components/ClientArchiveButton'
import { ClientInfoCard } from '@/features/clients/components/ClientInfoCard'
import { ClientTotals } from '@/features/clients/components/ClientTotals'
import { getClientDetail } from '@/features/clients/queries'
import { ClientPaymentsHistory } from '@/features/payments/components/ClientPaymentsHistory'
import { CLIENT_PAYMENT_SORT_COLUMNS, listClientPayments } from '@/features/payments/queries'
import { paymentNewHref } from '@/features/payments/return-to'
import { ClientPrizeSummary } from '@/features/prize-awards/components/ClientPrizeSummary'
import { readClientPrizeTotals } from '@/features/prize-awards/queries'
import { ClientTicketsList } from '@/features/tickets/components/ClientTicketsList'
import { listTickets } from '@/features/tickets/queries'
import { parseListSort } from '@/lib/list-sort'

/** La seccion del historial: ahi trae la vista su paginacion (I-156). */
const PAYMENTS_SECTION_ID = 'historial-abonos'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function SellerClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>
  searchParams: SearchParams
}) {
  const { clientId } = await params
  const query = await searchParams

  /*
    `page`, `sort` y `dir` son del HISTORIAL DE ABONOS (I-156): es la unica
    lista de esta ficha que pagina y ordena en la base. Los mismos nombres que
    «Mis pagos», para reutilizar `DataTablePagination` y `useListSort` tal cual.
    La lista de boletas de arriba ordena en el navegador y no los lee.
  */
  const requestedPage = Number.parseInt(single(query.page) ?? '1', 10)
  const paymentsSort = parseListSort(
    single(query.sort),
    single(query.dir),
    CLIENT_PAYMENT_SORT_COLUMNS,
  )
  const client = await getClientDetail(clientId)

  // Si el cliente es de otro vendedor, RLS no lo devuelve: no se distingue
  // «no existe» de «no es tuyo» (BR-U07, docs/SECURITY.md T15).
  if (!client) notFound()

  // En la MISMA espera: las boletas, los abonos y el resumen de premios son
  // lecturas independientes (D-208).
  const [{ rows: tickets }, payments, prizes] = await Promise.all([
    listTickets({ clientId, pageSize: 100 }),
    listClientPayments(clientId, {
      page: Number.isNaN(requestedPage) ? 1 : requestedPage,
      sort: paymentsSort,
    }),
    readClientPrizeTotals(clientId),
  ])

  const archived = client.archivedAt !== null
  // El mismo criterio de siempre: solo se ofrece cobrar lo que de verdad falta,
  // y a un cliente archivado no se le cobra (BR-C07).
  const canRegisterPayment = client.pendingAmount > 0 && !archived
  const newPaymentHref = paymentNewHref({ from: 'client', clientId: client.id })

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Cobrar es la accion principal de esta pantalla, asi que sube al
          encabezado y es la unica de color; editar y archivar la acompañan en
          voz baja. En el telefono el boton principal ocupa el ancho y mide 44 px
          de alto —la diana comoda de D-085— y los otros dos se reparten la fila
          siguiente. */}
      <PageHeader
        title={client.name}
        titleBadge={<ClientStatusBadge archived={archived} />}
        description={client.alias ?? undefined}
        backHref="/seller/clients"
        compactAction={
          canRegisterPayment ? (
            <Button asChild size="touch" className="w-full sm:w-auto">
              <Link
                href={newPaymentHref}
                // En pantalla dice «Registrar abono», que es lo que cabe en un
                // telefono; quien lo oye necesita saber de quien es el abono.
                aria-label={`Registrar abono de ${client.name}`}
              >
                <PlusIcon className="size-4" aria-hidden />
                Registrar abono
              </Link>
            </Button>
          ) : undefined
        }
        actions={
          <>
            <Button asChild variant="outline" size="touch" className="grow sm:grow-0">
              <Link href={`/seller/clients/${client.id}/edit`}>
                <PencilIcon className="size-4" aria-hidden />
                Editar
              </Link>
            </Button>
            <ClientArchiveButton
              clientId={client.id}
              clientName={client.name}
              archived={archived}
              ticketsCount={client.ticketsCount}
              size="touch"
              className="grow sm:grow-0"
            />
          </>
        }
      />

      {archived ? (
        <Notice tone="neutral">
          Este cliente está archivado: no aparece al asignar boletas. Su historial se conserva.
        </Notice>
      ) : null}

      <ClientInfoCard
        phone={client.phone}
        email={client.email}
        createdAt={client.createdAt}
        archivedAt={client.archivedAt}
        notes={client.notes}
      />

      <ClientTotals
        ticketsCount={client.ticketsCount}
        totalPurchased={client.totalPurchased}
        totalPaid={client.totalPaid}
        pendingAmount={client.pendingAmount}
      />

      {/* Un resumen y un enlace, no el historial: la lista vive en «Premios
          ganados» y llega allí ya filtrada por este cliente (D-208). */}
      <ClientPrizeSummary clientId={client.id} clientName={client.name} result={prizes} />

      {/* Ni la rifa ni el cliente: la una es siempre la misma en el portal del
          vendedor (D-088) y el otro es el dueño de esta ficha. Quitarlas deja
          sitio para lo que se viene a mirar —estado, pago y precio—, que en un
          telefono era justo lo que se ocultaba. */}
      <TableSection title="Boletas de este cliente">
        {tickets.length === 0 ? (
          <p className="text-muted-foreground px-2 py-2 text-sm">
            Todavía no le has asignado ninguna boleta.{' '}
            <Link href="/seller/tickets?inventoryStatus=available" className="underline">
              Ver boletas disponibles
            </Link>
            .
          </p>
        ) : (
          <ClientTicketsList
            tickets={tickets}
            basePath="/seller/tickets"
            className={SECTION_TABLE_CLASSES}
          />
        )}
      </TableSection>

      <TableSection
        id={PAYMENTS_SECTION_ID}
        // Que el encabezado fijo no tape el titulo cuando la paginacion trae
        // aqui la vista (I-156).
        className="scroll-mt-20"
        title="Historial de abonos"
        action={
          canRegisterPayment ? (
            <Button asChild variant="outline" size="sm">
              <Link href={newPaymentHref}>
                <PlusIcon className="size-4" aria-hidden />
                Registrar abono
              </Link>
            </Button>
          ) : null
        }
      >
        <ClientPaymentsHistory
          rows={payments.rows}
          total={payments.total}
          page={payments.page}
          pageSize={payments.pageSize}
          firstPageHref={firstPageHref(client.id, query)}
          sectionId={PAYMENTS_SECTION_ID}
        />
      </TableSection>
    </div>
  )
}

/** La pagina 1 del historial, con los demas parametros intactos. */
function firstPageHref(
  clientId: string,
  query: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (key === 'page' || value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item)
  }
  const rest = params.toString()
  return rest ? `/seller/clients/${clientId}?${rest}` : `/seller/clients/${clientId}`
}
