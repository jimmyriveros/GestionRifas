import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { AdminPaymentStateBadge, InventoryStatusBadge } from '@/components/data/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { getAdminTicketDetail } from '@/features/tickets/admin-queries'
import { ClearanceReceiptReadOnly } from '@/features/tickets/components/ClearanceReceiptReadOnly'
import { TicketActions } from '@/features/tickets/components/TicketActions'
import { formatDateEs, formatDateTimeEs } from '@/lib/dates'

/**
 * Detalle de una boleta en el portal administrativo.
 *
 * LA CARTERA ES DEL VENDEDOR (D-198, BR-Q03). Esta pantalla lee
 * `admin_ticket_detail`, que no devuelve cliente, precio, abonado, saldo ni
 * abonos, y por eso ya no hay tarjeta del cliente, ni resumen de cobro, ni
 * historial de abonos, ni edicion del precio, ni cambiar o liberar el cliente:
 * todo eso necesitaba ver lo que el personal ya no ve. Lo que se conserva son
 * las acciones de inventario —aprobar, corregir los numeros, cambiar el
 * vendedor, anular y eliminar—, cada una con las reglas de su RPC.
 *
 * Un id que no existe, uno de otra organizacion y uno que ni siquiera es un uuid
 * responden igual: 404.
 */
export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const { ticketId } = await params
  const [ticket, sellers] = await Promise.all([
    getAdminTicketDetail(ticketId),
    listActiveSellerOptions(),
  ])

  if (!ticket) notFound()

  return (
    <div className="space-y-6">
      {/* EL ENCABEZADO SOLO DICE DONDE ESTAS (D-126). Los dos numeros y la
          rifa ya estan en la tarjeta de abajo, a un dedo de distancia; el
          codigo interno sigue en «Informacion administrativa» del final. La
          boleta se sigue nombrando por sus numeros donde hace falta nombrarla
          (BR-N11) — esto es un titulo de pantalla, no un nombre. */}
      <PageHeader
        title="Detalle boleta"
        backHref={`/owner/tickets?raffleId=${ticket.raffleId}`}
        actions={
          // Al componente cliente viajan SOLO los cinco datos que usan sus
          // acciones, no el detalle entero.
          <TicketActions
            ticket={{
              id: ticket.id,
              dailyNumber: ticket.dailyNumber,
              weeklyNumber: ticket.weeklyNumber,
              inventoryStatus: ticket.inventoryStatus,
              sellerId: ticket.sellerId,
            }}
            sellers={sellers.map((seller) => ({ id: seller.id, fullName: seller.fullName }))}
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <h2>Boleta</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            {ticket.paymentState === null ? (
              <span className="text-muted-foreground">Sin venta</span>
            ) : (
              <AdminPaymentStateBadge state={ticket.paymentState} />
            )}
          </Field>
          <Field label="Vendedor">
            <Link href={`/owner/sellers/${ticket.sellerId}`} className="hover:underline">
              {ticket.sellerName}
            </Link>
          </Field>
          {/* La rifa BAJA aqui desde el encabezado (D-126). Al lado del
              vendedor, que es la otra respuesta a «de quien es esta boleta»;
              aqui si importa, porque el portal administrativo ve varias
              rifas a la vez. */}
          <Field label="Rifa">
            <Link href={`/owner/raffles/${ticket.raffleId}`} className="hover:underline">
              {`${ticket.raffleShortCode} — ${ticket.raffleName}`}
            </Link>
          </Field>
          <Field label="Fecha de venta">
            {ticket.saleDate ? formatDateEs(ticket.saleDate) : '—'}
          </Field>
          {/* SOLO PARA MIRAR (D-170). El paz y salvo lo registra el vendedor
              que lo entregó; el personal lo consulta para saber a quién
              reclamarle un desprendible. El estado llega ya resuelto por SQL,
              sin el cliente (D-198). */}
          {ticket.clearanceState !== null ? (
            <Field label="Paz y salvo">
              <ClearanceReceiptReadOnly
                state={ticket.clearanceState}
                deliveredAt={ticket.clearanceDeliveredAt}
              />
            </Field>
          ) : null}
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
          <CardTitle className="text-base">
            <h2>Información administrativa</h2>
          </CardTitle>
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

      {ticket.cancelReason ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <h2>Motivo de anulación</h2>
            </CardTitle>
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
