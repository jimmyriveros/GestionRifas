import { PencilIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientArchiveButton } from '@/features/clients/components/ClientArchiveButton'
import { getClientDetail } from '@/features/clients/queries'
import { PaymentsTable } from '@/features/payments/components/PaymentsTable'
import { listClientPayments } from '@/features/payments/queries'
import { TicketsTable } from '@/features/tickets/components/TicketsTable'
import { listTickets } from '@/features/tickets/queries'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={client.name}
        description={client.alias ?? undefined}
        backHref="/seller/clients"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/seller/clients/${client.id}/edit`}>
                <PencilIcon className="size-4" aria-hidden />
                Editar
              </Link>
            </Button>
            <ClientArchiveButton
              clientId={client.id}
              clientName={client.name}
              archived={client.archivedAt !== null}
              ticketsCount={client.ticketsCount}
            />
          </>
        }
      />

      {client.archivedAt ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          Este cliente está archivado: no aparece al asignar boletas. Su historial se conserva.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información general</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Teléfono">
            <a href={`tel:${client.phone}`} className="hover:underline">
              {client.phone}
            </a>
          </Field>
          <Field label="Correo">{client.email ?? '—'}</Field>
          <Field label="Alta">{formatDateEs(client.createdAt)}</Field>
          <Field label="Estado">
            {client.archivedAt ? <Badge variant="secondary">Archivado</Badge> : <span>Activo</span>}
          </Field>
          {client.notes ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <Field label="Notas">{client.notes}</Field>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Boletas compradas" value={client.ticketsCount} />
        <MetricCard label="Total comprado" value={formatCOP(client.totalPurchased)} />
        <MetricCard label="Total pagado" value={formatCOP(client.totalPaid)} />
        <MetricCard label="Saldo pendiente" value={formatCOP(client.pendingAmount)} />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Boletas de este cliente</h2>
        {tickets.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no le has asignado ninguna boleta.{' '}
            <Link href="/seller/tickets?inventoryStatus=available" className="underline">
              Ver boletas disponibles
            </Link>
            .
          </p>
        ) : (
          <TicketsTable tickets={tickets} basePath="/seller/tickets" showSeller={false} />
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Historial de abonos</h2>
          {client.pendingAmount > 0 && !client.archivedAt ? (
            <Button asChild size="sm">
              <Link href={`/seller/payments/new?clientId=${client.id}`}>Registrar abono</Link>
            </Button>
          ) : null}
        </div>
        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no le has registrado ningún abono.
          </p>
        ) : (
          <PaymentsTable payments={payments} clientBasePath="/seller/clients" />
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
