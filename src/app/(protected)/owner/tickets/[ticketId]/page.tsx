import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { InventoryStatusBadge, PaymentStatusBadge } from '@/components/data/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientEmptyCard, ClientLinkCard } from '@/features/clients/components/ClientLinkCard'
import { listClientOptions } from '@/features/clients/queries'
import { TicketPaymentsCard } from '@/features/payments/components/TicketPaymentsCard'
import { listClientPayments } from '@/features/payments/queries'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { clearanceState } from '@/features/tickets/clearance-receipt'
import { TicketActions } from '@/features/tickets/components/TicketActions'
import { ClearanceReceiptReadOnly } from '@/features/tickets/components/ClearanceReceiptReadOnly'
import { TicketClientActions } from '@/features/tickets/components/TicketClientActions'
import { TicketSalePrice } from '@/features/tickets/components/TicketSalePrice'
import { getTicketDetail } from '@/features/tickets/queries'
import { canReassignClient } from '@/features/tickets/reassign-client'
import { hasTicketClientActions } from '@/features/tickets/release-ticket'
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

  // MISMO componente y MISMA regla que el portal del vendedor (D-168). Lo unico
  // propio de aqui: la RLS deja al personal ver los clientes de toda la
  // organizacion, asi que la lista se acota EXPRESAMENTE a la cartera del
  // vendedor de la boleta — ofrecer los demas seria proponer opciones que la
  // base va a rechazar (BR-C05).
  const canReassign = canReassignClient(ticket)

  const [payments, reassignClients] = await Promise.all([
    ticket.clientId ? listClientPayments(ticket.clientId) : Promise.resolve([]),
    canReassign
      ? listClientOptions(undefined, undefined, { sellerId: ticket.sellerId })
      : Promise.resolve([]),
  ])

  const canEditSalePrice =
    ticket.inventoryStatus === 'assigned' &&
    ticket.salePrice !== null &&
    ticket.raffleStatus === 'active'

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
        {/* `grid-cols-1` es obligatorio, por lo mismo que en el portal del
            vendedor: una columna `auto` se estira hasta el minimo de su
            contenido, y el nombre del cliente lleva `truncate` (I-076). */}
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
          {/* La rifa BAJA aqui desde el encabezado (D-126). Al lado del
              vendedor, que es la otra respuesta a «de quien es esta boleta»;
              aqui si importa, porque el portal administrativo ve varias
              rifas a la vez. */}
          <Field label="Rifa">
            <Link href={`/owner/raffles/${ticket.raffleId}`} className="hover:underline">
              {`${ticket.raffleShortCode} — ${ticket.raffleName}`}
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
                action={
                  hasTicketClientActions(ticket) ? (
                    <TicketClientActions ticket={ticket} clients={reassignClients} />
                  ) : undefined
                }
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
              <TicketSalePrice
                ticketId={ticket.id}
                salePrice={ticket.salePrice}
                basePrice={ticket.basePrice}
                minSalePrice={ticket.minSalePrice}
                paidAmount={ticket.paidAmount}
                canEdit={canEditSalePrice}
              />
            )}
          </Field>
          <Field label="Abonado">
            {ticket.salePrice === null ? '—' : formatCOP(ticket.paidAmount)}
          </Field>
          <Field label="Fecha de venta">
            {ticket.saleDate ? formatDateEs(ticket.saleDate) : '—'}
          </Field>
          {/* SOLO PARA MIRAR (D-170). El paz y salvo lo registra el vendedor
              que lo entregó; el personal necesita consultarlo —para saber a
              quién reclamarle un desprendible—, pero marcar una entrega que no
              hizo no significaría nada. Por eso aquí no hay interruptor, y la
              RPC tampoco se lo deja invocar. */}
          {clearanceState(ticket) !== null ? (
            <Field label="Paz y salvo">
              <ClearanceReceiptReadOnly ticket={ticket} />
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
        <TicketPaymentsCard
          payments={payments}
          ticketId={ticket.id}
          salePrice={ticket.salePrice}
          paidAmount={ticket.paidAmount}
        />
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
