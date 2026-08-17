import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listClientOptions } from '@/features/clients/queries'
import { listClientPayments } from '@/features/payments/queries'
import { TicketPaymentsCard } from '@/features/payments/components/TicketPaymentsCard'
import { AssignTicketDialog } from '@/features/tickets/assign/components/AssignTicketDialog'
import { getTicketDetail } from '@/features/tickets/queries'
import { SellerTicketActions } from '@/features/tickets/seller/components/SellerTicketActions'
import { formatDateEs, formatDateTimeEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'

/** Explica por que una boleta no se puede asignar todavia (BR-I07). */
function blockedReason(status: string, raffleStatus: string): string | null {
  if (status === 'assigned') return null
  if (status === 'cancelled') return 'Esta boleta está anulada y ya no se puede usar.'
  if (status === 'pending_approval')
    return 'Tu administrador debe aprobar esta boleta antes de que puedas venderla.'
  if (status === 'draft') return 'A esta boleta le faltan datos. Tu administrador debe completarla.'
  if (raffleStatus !== 'active')
    return 'La rifa no está activa: no se pueden asignar boletas en este momento.'
  return null
}

export default async function SellerTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const { ticketId } = await params

  // Si la boleta es de otro vendedor, RLS no la devuelve (BR-U07).
  const ticket = await getTicketDetail(ticketId)
  if (!ticket) notFound()

  const [clients, payments] = await Promise.all([
    ticket.inventoryStatus === 'available' ? listClientOptions() : Promise.resolve([]),
    ticket.clientId ? listClientPayments(ticket.clientId) : Promise.resolve([]),
  ])

  // BR-P10: `base_price` es nulo en las boletas vendidas antes de existir la
  // rebaja, que equivalen a rebaja cero.
  const discount =
    ticket.salePrice !== null && ticket.basePrice !== null
      ? ticket.basePrice - ticket.salePrice
      : 0

  const reason = blockedReason(ticket.inventoryStatus, ticket.raffleStatus)
  const canAssign = ticket.inventoryStatus === 'available' && reason === null
  const canEditNumbers =
    ticket.inventoryStatus === 'draft' || ticket.inventoryStatus === 'pending_approval'

  return (
    <div className="space-y-6">
      {/* La boleta se nombra por sus numeros; el codigo interno baja a la
          informacion administrativa del final (BR-N11). */}
      <PageHeader
        title={ticketLabel(ticket)}
        description={`${ticket.raffleShortCode} — ${ticket.raffleName}`}
        backHref="/seller/tickets"
        actions={
          <>
            {canAssign ? (
              <AssignTicketDialog
                ticketId={ticket.id}
                ticketNumbers={ticketLabel(ticket)}
                rafflePrice={ticket.raffleTicketPrice}
                minSalePrice={ticket.minSalePrice}
                clients={clients}
              />
            ) : null}
            {canEditNumbers ? (
              <SellerTicketActions
                ticketId={ticket.id}
                dailyNumber={ticket.dailyNumber}
                weeklyNumber={ticket.weeklyNumber}
              />
            ) : null}
          </>
        }
      />

      {reason ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          {reason}
        </p>
      ) : null}

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
          <Field label="Cliente">
            {ticket.clientId ? (
              <Link href={`/seller/clients/${ticket.clientId}`} className="hover:underline">
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
              <>
                {formatCOP(ticket.salePrice)}
                {/* La rebaja solo se nombra cuando la hubo: una venta al precio
                    normal no necesita que le anuncien «rebaja de $0»
                    (seccion 11 del encargo). */}
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
        </CardContent>
      </Card>

      {ticket.inventoryStatus === 'assigned' ? (
        <>
          <TicketPaymentsCard payments={payments} ticketId={ticket.id} />
          {ticket.salePrice !== null && ticket.salePrice > ticket.paidAmount ? (
            <Button asChild>
              <Link href={`/seller/payments/new?clientId=${ticket.clientId}`}>
                Registrar un abono de {ticket.clientName}
              </Link>
            </Button>
          ) : null}
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <HistoryLine label="Creada" value={formatDateTimeEs(ticket.createdAt)} />
          <HistoryLine
            label="Aprobada"
            value={ticket.approvedAt ? formatDateTimeEs(ticket.approvedAt) : 'Todavía no'}
          />
          <HistoryLine
            label="Asignada"
            value={
              ticket.assignedAt
                ? `${formatDateTimeEs(ticket.assignedAt)}${
                    ticket.clientName ? ` a ${ticket.clientName}` : ''
                  }`
                : 'Todavía no'
            }
          />
          {ticket.cancelledAt ? (
            <HistoryLine
              label="Anulada"
              value={`${formatDateTimeEs(ticket.cancelledAt)}${
                ticket.cancelReason ? ` — ${ticket.cancelReason}` : ''
              }`}
            />
          ) : null}
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

function HistoryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
