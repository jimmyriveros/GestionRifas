import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientEmptyCard, ClientLinkCard } from '@/features/clients/components/ClientLinkCard'
import { TicketPaymentsCard } from '@/features/payments/components/TicketPaymentsCard'
import { listClientPayments } from '@/features/payments/queries'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { TicketActions } from '@/features/tickets/components/TicketActions'
import { getTicketDetail } from '@/features/tickets/queries'
import { formatDateEs, formatDateTimeEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'

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

  // BR-P10: nulo en las boletas vendidas antes de existir la rebaja, que
  // equivalen a rebaja cero.
  const discount =
    ticket.salePrice !== null && ticket.basePrice !== null
      ? ticket.basePrice - ticket.salePrice
      : 0

  return (
    <div className="space-y-6">
      {/* La boleta se nombra por sus numeros; el codigo interno baja a la
          informacion administrativa del final (BR-N11). */}
      <PageHeader
        title={ticketLabel(ticket)}
        description={`${ticket.raffleShortCode} — ${ticket.raffleName}`}
        backHref={`/owner/tickets?raffleId=${ticket.raffleId}`}
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
          {/* El cliente ocupa su propia fila y es una tarjeta pulsable entera,
              no un enlace escondido en una celda (D-101). Lleva a la MISMA
              ficha de «Clientes», no a una version propia de esta pantalla. */}
          <div className="sm:col-span-2 lg:col-span-4">
            {ticket.clientId ? (
              <ClientLinkCard
                href={`/owner/clients/${ticket.clientId}`}
                name={ticket.clientName ?? 'Cliente'}
                phone={ticket.clientPhone}
              />
            ) : (
              <ClientEmptyCard description="Esta boleta todavía no se ha vendido." />
            )}
          </div>
          <Field label="Precio de venta">
            {ticket.salePrice === null ? (
              <span className="text-muted-foreground">
                Sin vender (precio vigente {formatCOP(ticket.raffleTicketPrice)})
              </span>
            ) : (
              <>
                {formatCOP(ticket.salePrice)}
                {/* Aqui la rebaja no es una metrica del negocio (el reparto de
                    la empresa no cambia): esta para que un precio distinto al
                    de la rifa se explique solo y no parezca un error. */}
                {discount > 0 ? (
                  <span className="text-muted-foreground block text-xs">
                    Precio de la rifa {formatCOP(ticket.basePrice ?? 0)} · rebaja de{' '}
                    {formatCOP(discount)}
                  </span>
                ) : null}
              </>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información administrativa</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="Código interno">
            <span className="text-muted-foreground font-mono">{ticket.internalCode}</span>
          </Field>
          <p className="text-muted-foreground mt-2 text-xs">
            Lo genera el sistema para identificar la boleta por dentro. Para buscarla, usa sus
            números.
          </p>
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
