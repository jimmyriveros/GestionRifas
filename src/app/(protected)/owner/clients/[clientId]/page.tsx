import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { ClientStatusBadge } from '@/components/data/StatusBadge'
import { SECTION_TABLE_CLASSES, TableSection } from '@/components/data/TableSection'
import { Button } from '@/components/ui/button'
import { ClientInfoCard } from '@/features/clients/components/ClientInfoCard'
import { ClientTotals } from '@/features/clients/components/ClientTotals'
import { getClientDetail } from '@/features/clients/queries'
import { PaymentsTable } from '@/features/payments/components/PaymentsTable'
import { listClientPayments } from '@/features/payments/queries'
import { TicketsList } from '@/features/tickets/components/TicketsList'
import { listTickets } from '@/features/tickets/queries'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const client = await getClientDetail(clientId)

  if (!client) notFound()

  const [{ rows: tickets }, payments] = await Promise.all([
    listTickets({ clientId, pageSize: 100 }),
    listClientPayments(clientId),
  ])

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        title={client.name}
        titleBadge={<ClientStatusBadge archived={client.archivedAt !== null} />}
        description={client.alias ?? undefined}
        backHref="/owner/clients"
        actions={
          <Button asChild variant="outline">
            <Link href={`/owner/sellers/${client.sellerId}`}>Ver vendedor</Link>
          </Button>
        }
      />

      {/* La misma tarjeta del portal del vendedor, con un dato mas: de quien es
          este cliente. Aqui si hace falta, porque el personal ve la cartera
          entera de la organizacion. */}
      <ClientInfoCard
        phone={client.phone}
        email={client.email}
        createdAt={client.createdAt}
        archivedAt={client.archivedAt}
        notes={client.notes}
        sellerName={client.sellerName}
      />

      <ClientTotals
        ticketsCount={client.ticketsCount}
        totalPurchased={client.totalPurchased}
        totalPaid={client.totalPaid}
        pendingAmount={client.pendingAmount}
      />

      {/* Se quita «Cliente», que repetiria el nombre del titulo en todas las
          filas. La rifa y el vendedor se quedan: un cliente puede comprar en
          varias rifas, y el portal administrativo mira toda la organizacion. */}
      <TableSection title="Boletas de este cliente">
        {tickets.length === 0 ? (
          <p className="text-muted-foreground px-2 py-2 text-sm">
            Este cliente todavía no tiene boletas.
          </p>
        ) : (
          <TicketsList tickets={tickets} showClient={false} className={SECTION_TABLE_CLASSES} />
        )}
      </TableSection>

      <TableSection title="Historial de abonos">
        {payments.length === 0 ? (
          <p className="text-muted-foreground px-2 py-2 text-sm">
            Este cliente todavía no tiene abonos registrados.
          </p>
        ) : (
          <PaymentsTable
            payments={payments}
            clientBasePath="/owner/clients"
            showSeller
            showClient={false}
            canVoid
            className={SECTION_TABLE_CLASSES}
          />
        )}
      </TableSection>
    </div>
  )
}
