import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getClientDetail } from '@/features/clients/queries'
import { PaymentsTable } from '@/features/payments/components/PaymentsTable'
import { listClientPayments } from '@/features/payments/queries'
import { TicketsTable } from '@/features/tickets/components/TicketsTable'
import { listTickets } from '@/features/tickets/queries'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

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
    <div className="space-y-6">
      <PageHeader
        title={client.name}
        description={client.alias ?? undefined}
        actions={
          <Button asChild variant="outline">
            <Link href={`/owner/sellers/${client.sellerId}`}>Ver vendedor</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información general</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Teléfono">{client.phone}</Field>
          <Field label="Correo">{client.email ?? '—'}</Field>
          <Field label="Vendedor">{client.sellerName}</Field>
          <Field label="Alta">{formatDateEs(client.createdAt)}</Field>
          <Field label="Estado">
            {client.archivedAt ? <Badge variant="secondary">Archivado</Badge> : <span>Activo</span>}
          </Field>
          {client.notes ? <Field label="Notas">{client.notes}</Field> : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Boletas compradas" value={client.ticketsCount} />
        <MetricCard label="Total comprado" value={formatCOP(client.totalPurchased)} />
        <MetricCard label="Total pagado" value={formatCOP(client.totalPaid)} />
        <MetricCard label="Saldo pendiente" value={formatCOP(client.pendingAmount)} />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Boletas del cliente</h2>
        {tickets.length === 0 ? (
          <p className="text-muted-foreground text-sm">Este cliente todavía no tiene boletas.</p>
        ) : (
          <TicketsTable tickets={tickets} />
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Historial de abonos</h2>
        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Este cliente todavía no tiene abonos registrados.
          </p>
        ) : (
          <PaymentsTable payments={payments} clientBasePath="/owner/clients" showSeller canVoid />
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}
