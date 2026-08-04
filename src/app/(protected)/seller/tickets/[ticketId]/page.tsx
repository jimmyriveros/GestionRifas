import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listClientOptions } from '@/features/clients/queries'
import { AssignTicketDialog } from '@/features/tickets/assign/components/AssignTicketDialog'
import { getTicketDetail } from '@/features/tickets/queries'
import { SellerTicketActions } from '@/features/tickets/seller/components/SellerTicketActions'
import { formatDateEs, formatDateTimeEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

/** Explica por que una boleta no se puede asignar todavia (BR-I07). */
function blockedReason(status: string, raffleStatus: string): string | null {
  if (status === 'assigned') return null
  if (status === 'cancelled') return 'Esta boleta esta anulada y ya no se puede usar.'
  if (status === 'pending_approval')
    return 'Tu administrador debe aprobar esta boleta antes de que puedas venderla.'
  if (status === 'draft') return 'A esta boleta le faltan datos. Tu administrador debe completarla.'
  if (raffleStatus !== 'active')
    return 'La rifa no esta activa: no se pueden asignar boletas en este momento.'
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

  const clients = ticket.inventoryStatus === 'available' ? await listClientOptions() : []
  const reason = blockedReason(ticket.inventoryStatus, ticket.raffleStatus)
  const canAssign = ticket.inventoryStatus === 'available' && reason === null
  const canEditNumbers =
    ticket.inventoryStatus === 'draft' || ticket.inventoryStatus === 'pending_approval'

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.internalCode}
        description={`${ticket.raffleShortCode} — ${ticket.raffleName}`}
        actions={
          <>
            {canAssign ? (
              <AssignTicketDialog
                ticketId={ticket.id}
                ticketCode={ticket.internalCode}
                rafflePrice={ticket.raffleTicketPrice}
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
          <Field label="Numero diario">
            <span className="font-mono text-lg tabular-nums">{ticket.dailyNumber ?? '—'}</span>
          </Field>
          <Field label="Numero semanal">
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
              formatCOP(ticket.salePrice)
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <HistoryLine label="Creada" value={formatDateTimeEs(ticket.createdAt)} />
          <HistoryLine
            label="Aprobada"
            value={ticket.approvedAt ? formatDateTimeEs(ticket.approvedAt) : 'Todavia no'}
          />
          <HistoryLine
            label="Asignada"
            value={
              ticket.assignedAt
                ? `${formatDateTimeEs(ticket.assignedAt)}${
                    ticket.clientName ? ` a ${ticket.clientName}` : ''
                  }`
                : 'Todavia no'
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

      <Button asChild variant="outline">
        <Link href="/seller/tickets">Volver a mis boletas</Link>
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

function HistoryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
