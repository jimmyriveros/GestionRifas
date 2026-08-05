import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TicketPaymentsCard } from '@/features/payments/components/TicketPaymentsCard'
import { listClientPayments } from '@/features/payments/queries'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { TicketActions } from '@/features/tickets/components/TicketActions'
import { getTicketDetail } from '@/features/tickets/queries'
import { formatDateEs, formatDateTimeEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const { ticketId } = await params
  const [ticket, sellers] = await Promise.all([
    getTicketDetail(ticketId),
    listActiveSellerOptions(),
  ])

  if (!ticket) notFound()

  const payments = ticket.clientId ? await listClientPayments(ticket.clientId) : []

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.internalCode}
        description={`${ticket.raffleShortCode} — ${ticket.raffleName}`}
        actions={
          <TicketActions
            ticket={ticket}
            sellers={sellers.map((seller) => ({ id: seller.id, fullName: seller.fullName }))}
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boleta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Número diario">
            <span className="font-mono text-lg tabular-nums">{ticket.dailyNumber ?? '—'}</span>
          </Field>
          <Field label="Número semanal">
            <span className="font-mono text-lg tabular-nums">{ticket.weeklyNumber ?? '—'}</span>
          </Field>
          <Field label="Estado">
            <InventoryStatusBadge status={ticket.inventoryStatus} />
          </Field>
          <Field label="Estado de pago">
            {ticket.inventoryStatus === 'assigned' ? (
              <PaymentStatusBadge status={ticket.paymentStatus} />
            ) : (
              <span className="text-muted-foreground">Sin venta</span>
            )}
          </Field>
          <Field label="Vendedor">
            <Link href={`/owner/sellers/${ticket.sellerId}`} className="hover:underline">
              {ticket.sellerName}
            </Link>
          </Field>
          <Field label="Cliente">
            {ticket.clientId ? (
              <Link href={`/owner/clients/${ticket.clientId}`} className="hover:underline">
                {ticket.clientName}
              </Link>
            ) : (
              <span className="text-muted-foreground">Sin asignar</span>
            )}
          </Field>
          <Field label="Precio de venta">
            {ticket.salePrice === null ? (
              <span className="text-muted-foreground">
                Sin vender (precio vigente {formatCOP(ticket.raffleTicketPrice)})
              </span>
            ) : (
              formatCOP(ticket.salePrice)
            )}
          </Field>
          <Field label="Abonado">
            {ticket.salePrice === null ? '—' : formatCOP(ticket.paidAmount)}
          </Field>
          <Field label="Fecha de venta">
            {ticket.saleDate ? formatDateEs(ticket.saleDate) : '—'}
          </Field>
          <Field label="Creada">{formatDateTimeEs(ticket.createdAt)}</Field>
          <Field label="Aprobada">
            {ticket.approvedAt ? formatDateTimeEs(ticket.approvedAt) : '—'}
          </Field>
          <Field label="Anulada">
            {ticket.cancelledAt ? formatDateTimeEs(ticket.cancelledAt) : '—'}
          </Field>
        </CardContent>
      </Card>

      {ticket.inventoryStatus === 'assigned' ? (
        <TicketPaymentsCard payments={payments} ticketId={ticket.id} />
      ) : null}

      {ticket.cancelReason ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Motivo de anulación</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{ticket.cancelReason}</p>
          </CardContent>
        </Card>
      ) : null}

      <Button asChild variant="outline">
        <Link href={`/owner/tickets?raffleId=${ticket.raffleId}`}>Volver a las boletas</Link>
      </Button>
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
