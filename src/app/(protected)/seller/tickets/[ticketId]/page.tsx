import { CalendarDaysIcon, PlusIcon, TagIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientEmptyCard, ClientLinkCard } from '@/features/clients/components/ClientLinkCard'
import { listClientOptions } from '@/features/clients/queries'
import { listClientPayments } from '@/features/payments/queries'
import { TicketPaymentsCard } from '@/features/payments/components/TicketPaymentsCard'
import { AssignTicketDialog } from '@/features/tickets/assign/components/AssignTicketDialog'
import { TicketPaymentSummary } from '@/features/tickets/components/TicketPaymentSummary'
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
    ticket.salePrice !== null && ticket.basePrice !== null ? ticket.basePrice - ticket.salePrice : 0

  const reason = blockedReason(ticket.inventoryStatus, ticket.raffleStatus)
  const canAssign = ticket.inventoryStatus === 'available' && reason === null
  const canEditNumbers =
    ticket.inventoryStatus === 'draft' || ticket.inventoryStatus === 'pending_approval'
  // El mismo criterio de siempre: solo se ofrece cobrar lo que de verdad falta.
  const canRegisterPayment =
    ticket.inventoryStatus === 'assigned' &&
    ticket.clientId !== null &&
    ticket.salePrice !== null &&
    ticket.salePrice > ticket.paidAmount

  return (
    <div className="space-y-5 md:space-y-6">
      {/* La boleta se nombra por sus numeros; el codigo interno baja al final
          (BR-N11). Cobrar es la accion principal de esta pantalla y por eso
          sube al encabezado, donde se alcanza sin recorrer el historial. */}
      <PageHeader
        title={ticketLabel(ticket)}
        description={`${ticket.raffleShortCode} — ${ticket.raffleName}`}
        backHref="/seller/tickets"
        actions={
          <>
            {/* En el telefono la accion principal ocupa el ancho y mide 44 px
                de alto, la diana minima comoda que ya usan la flecha de volver
                y las casillas de seleccion (D-085). */}
            {canRegisterPayment ? (
              <Button asChild className="h-11 w-full sm:h-9 sm:w-auto">
                <Link
                  href={`/seller/payments/new?clientId=${ticket.clientId}`}
                  // En pantalla dice «Registrar abono», que es lo que cabe en un
                  // telefono; quien lo oye necesita saber de quien es el abono.
                  aria-label={`Registrar un abono de ${ticket.clientName ?? 'este cliente'}`}
                >
                  <PlusIcon className="size-4" aria-hidden />
                  Registrar abono
                </Link>
              </Button>
            ) : null}
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

      {/* Quien es esta boleta: sus dos numeros, cuanto costo y quien la tiene.
          El orden del HTML es el del telefono —numeros, cliente, precio—; en
          escritorio la rejilla recoloca el cliente a la derecha sin repetir
          nada (seccion 7 del encargo). */}
      <Card>
        <CardContent className="grid gap-6 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] xl:gap-8">
          <div className="grid grid-cols-2 gap-3 sm:col-start-1 sm:row-start-1 xl:col-start-1">
            <TicketNumber label="Número diario" value={ticket.dailyNumber} />
            <TicketNumber label="Número semanal" value={ticket.weeklyNumber} />
          </div>

          {/* La fila entera del cliente es el enlace, y en escritorio ocupa toda
              la altura de su columna: es la diana mas grande posible (D-101). */}
          <div className="sm:col-span-2 sm:row-start-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:border-l xl:pl-8">
            {ticket.clientId ? (
              <ClientLinkCard
                href={`/seller/clients/${ticket.clientId}`}
                name={ticket.clientName ?? 'Cliente'}
                phone={ticket.clientPhone}
              />
            ) : (
              <ClientEmptyCard description="Todavía no la has vendido." />
            )}
          </div>

          <div className="space-y-4 sm:col-start-2 sm:row-start-1 xl:col-start-2 xl:border-l xl:pl-8">
            <Field icon={<TagIcon className="size-4" aria-hidden />} label="Precio de venta">
              {ticket.salePrice === null ? (
                <p className="text-muted-foreground text-sm">
                  Sin vender (precio vigente {formatCOP(ticket.raffleTicketPrice)})
                </p>
              ) : (
                <>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatCOP(ticket.salePrice)}
                  </p>
                  {/* La rebaja solo se nombra cuando la hubo: una venta al precio
                      normal no necesita que le anuncien «rebaja de $0» (seccion
                      11 del encargo). */}
                  {discount > 0 ? (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {`Precio de la rifa ${formatCOP(ticket.basePrice ?? 0)} · rebaja de ${formatCOP(discount)}`}
                    </p>
                  ) : null}
                </>
              )}
            </Field>

            <Field
              icon={<CalendarDaysIcon className="size-4" aria-hidden />}
              label="Fecha de venta"
            >
              <p className="text-sm">
                {ticket.saleDate ? formatDateEs(ticket.saleDate) : 'Todavía no'}
              </p>
            </Field>
          </div>
        </CardContent>
      </Card>

      <TicketPaymentSummary
        inventoryStatus={ticket.inventoryStatus}
        paymentStatus={ticket.paymentStatus}
        salePrice={ticket.salePrice}
        paidAmount={ticket.paidAmount}
      />

      {ticket.inventoryStatus === 'assigned' ? (
        <TicketPaymentsCard payments={payments} ticketId={ticket.id} />
      ) : null}

      {/* Lo administrativo, al final y en voz baja: hace falta alguna vez, pero
          no compite con la boleta, el cliente ni el cobro (seccion 15). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground text-sm font-medium">
            Detalles de la boleta
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <dl className="divide-y">
            <DetailLine label="Creada" value={formatDateTimeEs(ticket.createdAt)} />
            <DetailLine
              label="Aprobada"
              value={ticket.approvedAt ? formatDateTimeEs(ticket.approvedAt) : 'Todavía no'}
            />
            <DetailLine
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
              <DetailLine
                label="Anulada"
                value={`${formatDateTimeEs(ticket.cancelledAt)}${
                  ticket.cancelReason ? ` — ${ticket.cancelReason}` : ''
                }`}
              />
            ) : null}
            <DetailLine label="Código interno" value={ticket.internalCode} mono />
          </dl>
          <p className="text-muted-foreground mt-3 text-xs">
            El código interno lo genera el sistema para identificar la boleta por dentro. Para
            buscarla, usa sus números.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/** Uno de los dos numeros, con su nombre encima: cual es cual importa. */
function TicketNumber({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-lg border px-3 py-2">
      {/* Sin recortar: en una columna estrecha el rotulo baja de linea, pero
          «cuál de los dos números es este» no se puede esconder. */}
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">{value ?? '—'}</p>
    </div>
  )
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        {children}
      </div>
    </div>
  )
}

function DetailLine({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'text-muted-foreground text-right font-mono' : 'text-right'}>
        {value}
      </dd>
    </div>
  )
}
