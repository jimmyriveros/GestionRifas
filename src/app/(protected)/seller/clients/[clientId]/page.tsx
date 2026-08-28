import { PencilIcon, PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { ClientStatusBadge } from '@/components/data/StatusBadge'
import { SECTION_TABLE_CLASSES, TableSection } from '@/components/data/TableSection'
import { Button } from '@/components/ui/button'
import { ClientArchiveButton } from '@/features/clients/components/ClientArchiveButton'
import { ClientInfoCard } from '@/features/clients/components/ClientInfoCard'
import { ClientTotals } from '@/features/clients/components/ClientTotals'
import { getClientDetail } from '@/features/clients/queries'
import { PaymentsTable } from '@/features/payments/components/PaymentsTable'
import { listClientPayments } from '@/features/payments/queries'
import { ClientTicketsList } from '@/features/tickets/components/ClientTicketsList'
import { listTickets } from '@/features/tickets/queries'

export default async function SellerClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const client = await getClientDetail(clientId)

  // Si el cliente es de otro vendedor, RLS no lo devuelve: no se distingue
  // «no existe» de «no es tuyo» (BR-U07, docs/SECURITY.md T15).
  if (!client) notFound()

  const [{ rows: tickets }, payments] = await Promise.all([
    listTickets({ clientId, pageSize: 100 }),
    listClientPayments(clientId),
  ])

  const archived = client.archivedAt !== null
  // El mismo criterio de siempre: solo se ofrece cobrar lo que de verdad falta,
  // y a un cliente archivado no se le cobra (BR-C07).
  const canRegisterPayment = client.pendingAmount > 0 && !archived
  const newPaymentHref = `/seller/payments/new?clientId=${client.id}`

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
        actions={
          <>
            {canRegisterPayment ? (
              <Button asChild className="h-11 w-full sm:h-9 sm:w-auto">
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
            ) : null}
            <Button asChild variant="outline" className="h-11 grow sm:h-9 sm:grow-0">
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
              className="h-11 grow sm:h-9 sm:grow-0"
            />
          </>
        }
      />

      {archived ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          Este cliente está archivado: no aparece al asignar boletas. Su historial se conserva.
        </p>
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
        {payments.length === 0 ? (
          <p className="text-muted-foreground px-2 py-2 text-sm">
            Todavía no le has registrado ningún abono.
          </p>
        ) : (
          <PaymentsTable
            payments={payments}
            clientBasePath="/seller/clients"
            showClient={false}
            className={SECTION_TABLE_CLASSES}
          />
        )}
      </TableSection>
    </div>
  )
}
