import { PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { ClientEmptyCard, ClientLinkCard } from '@/features/clients/components/ClientLinkCard'
import { listClientOptions } from '@/features/clients/queries'
import { TicketPaymentsCard } from '@/features/payments/components/TicketPaymentsCard'
import { listTicketPayments } from '@/features/payments/queries'
import { paymentNewHref } from '@/features/payments/return-to'
import { AssignTicketDialog } from '@/features/tickets/assign/components/AssignTicketDialog'
import { canEditClearanceReceipt, clearanceState } from '@/features/tickets/clearance-receipt'
import { ClearanceReceiptField } from '@/features/tickets/components/ClearanceReceiptField'
import { ClearanceReceiptReadOnly } from '@/features/tickets/components/ClearanceReceiptReadOnly'
import { TicketClientActions } from '@/features/tickets/components/TicketClientActions'
import {
  DateTime,
  DetailLine,
  InternalCodeNote,
  TICKET_DETAIL_CARD,
  TicketDetailCard,
  TicketNumbersCard,
} from '@/features/tickets/components/TicketDetailParts'
import { TicketPaymentSummary } from '@/features/tickets/components/TicketPaymentSummary'
import { TicketSalePrice } from '@/features/tickets/components/TicketSalePrice'
import { getTicketDetail } from '@/features/tickets/queries'
import { canReassignClient } from '@/features/tickets/reassign-client'
import { hasTicketClientActions } from '@/features/tickets/release-ticket'
import { SellerTicketActions } from '@/features/tickets/seller/components/SellerTicketActions'
import { getWhatsappSettings } from '@/features/whatsapp/queries'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'
import { cn } from '@/lib/utils'

/*
  LAS PIEZAS DE LAS TARJETAS SON COMPARTIDAS (D-234). La densidad
  (`TICKET_DETAIL_CARD`), el titulo de cada tarjeta, «Números de la boleta» con
  sus dos tonos (D-233), las lineas de «Detalles» y la fecha con su hora viven en
  `TicketDetailParts`, porque el detalle administrativo las pinta igual. Esta
  pagina sigue decidiendo cuales lleva y donde (D-231).
*/

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

  // La correccion de cliente solo ofrece la cartera del vendedor de la boleta
  // (BR-C05, D-168). Aqui coincide con la suya, pero se acota igual: la consulta
  // es la misma en los dos portales. Liberar (D-169) no necesita clientes, asi
  // que esta condicion no cambia: sigue siendo la de «Cambiar cliente».
  const canReassign = canReassignClient(ticket)

  // La configuracion de WhatsApp viaja con el HTML (D-176): el dialogo de exito
  // de la venta no consulta nada al abrirse. En el mismo `Promise.all` para no
  // anadir un viaje en serie.
  const [clients, reassignClients, payments, whatsappSettings] = await Promise.all([
    ticket.inventoryStatus === 'available' ? listClientOptions() : Promise.resolve([]),
    canReassign
      ? listClientOptions(undefined, undefined, { sellerId: ticket.sellerId })
      : Promise.resolve([]),
    // Solo los abonos de ESTA boleta, filtrados en la base (I-156): antes eran
    // los 100 mas recientes del cliente, elegidos despues en el navegador.
    ticket.clientId ? listTicketPayments(ticket.id, ticket.clientId) : Promise.resolve([]),
    getWhatsappSettings(),
  ])

  const reason = blockedReason(ticket.inventoryStatus, ticket.raffleStatus)
  const canAssign = ticket.inventoryStatus === 'available' && reason === null
  const canEditSalePrice =
    ticket.inventoryStatus === 'assigned' &&
    ticket.salePrice !== null &&
    ticket.raffleStatus === 'active'
  const canEditNumbers =
    ticket.inventoryStatus === 'draft' || ticket.inventoryStatus === 'pending_approval'
  // El mismo criterio de siempre: solo se ofrece cobrar lo que de verdad falta.
  const canRegisterPayment =
    ticket.inventoryStatus === 'assigned' &&
    ticket.clientId !== null &&
    ticket.salePrice !== null &&
    ticket.salePrice > ticket.paidAmount
  const newPaymentHref =
    ticket.clientId !== null
      ? paymentNewHref({
          from: 'ticket',
          clientId: ticket.clientId,
          ticketId: ticket.id,
        })
      : undefined

  return (
    <div className="space-y-5 md:space-y-6">
      {/* EL ENCABEZADO SOLO DICE DONDE ESTAS (D-126). Decia los dos numeros y
          debajo la rifa, y las tres cosas se repetian a un dedo de distancia:
          los numeros, en las dos cajas grandes de la tarjeta de abajo; la
          rifa, ahora en «Detalles de la boleta». La boleta se sigue nombrando
          por sus numeros donde hace falta nombrarla —el listado, el dialogo de
          venta, el aviso de exito— (BR-N11); esto es un titulo de pantalla, no
          un nombre.

          Cobrar es la accion principal de esta pantalla y por eso sube al
          encabezado, donde se alcanza sin recorrer el historial. */}
      <PageHeader
        title="Detalle boleta"
        backHref="/seller/tickets"
        compactAction={
          canRegisterPayment && newPaymentHref ? (
            <Button asChild size="touch" className="w-full sm:w-auto">
              <Link
                // `from=ticket` y el id de ESTA boleta viajan para que el
                // formulario devuelva aqui, no al listado ni al cliente
                // (D-135). El id tambien marca cual fila se cubre primero
                // en el reparto; el dinero lo sigue decidiendo quien cobra.
                href={newPaymentHref}
                // En pantalla dice «Registrar abono», que es lo que cabe en un
                // telefono; quien lo oye necesita saber de quien es el abono.
                aria-label={`Registrar un abono de ${ticket.clientName ?? 'este cliente'}`}
              >
                <PlusIcon className="size-4" aria-hidden />
                Registrar abono
              </Link>
            </Button>
          ) : undefined
        }
        actions={
          <>
            {canAssign ? (
              <AssignTicketDialog
                ticketId={ticket.id}
                ticketNumbers={ticketLabel(ticket)}
                rafflePrice={ticket.raffleTicketPrice}
                minSalePrice={ticket.minSalePrice}
                clients={clients}
                whatsappSettings={whatsappSettings}
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

      {/* POR QUE UN `Notice` Y NO UN PARRAFO PINTADO A MANO. Esto explica una
          situacion de la pantalla mientras su condicion sea cierta —la boleta no
          se puede vender todavia—, que es literalmente la responsabilidad del
          componente. Antes era un ambar escrito a mano con su pareja para el
          modo oscuro; el tono `warning` lo dice con los roles del sistema y sin
          que la pantalla tenga que saber en que tema esta. La geometria no
          cambia: `default` ya era `rounded-lg px-4 py-3 text-sm`. */}
      {reason ? <Notice tone="warning">{reason}</Notice> : null}

      {/* LA COMPOSICION (D-231): seis tarjetas, y el HTML va en el orden del
          TELEFONO —numeros, cliente, venta, estado, abonos, detalles—, que es
          tambien el orden de lectura y de foco en los tres anchos. No hay
          posiciones absolutas ni bloques repetidos con `hidden`.

            telefono   una columna, en ese orden;
            `md`       dos columnas: numeros | cliente, venta | estado, y
                       abonos y detalles a lo ancho, cada uno en su fila;
            `xl`       dos columnas que se apilan por su cuenta: a la izquierda
                       lo de la boleta (numeros, cliente, venta), a la derecha
                       el cobro (estado, abonos, detalles).

          LOS DOS ENVOLTORIOS SON `contents` HASTA `xl`, y no es un truco de
          estilo. En tableta las seis tarjetas tienen que ser hijas de la
          MISMA rejilla para emparejarse por filas; en escritorio cada columna
          crece sola, sin que una tarjeta corta deje un hueco por quedarse en
          la fila de una larga. `display: contents` es lo unico que da las dos
          cosas sin cambiar el orden del HTML. Son `div` sin rol, asi que no
          se pierde ninguna semantica al «desaparecer».

          `grid-cols-1` NO es decorativo (I-076, D-125): una columna `auto` se
          estira hasta el MINIMO de su contenido, y el nombre del cliente lleva
          `truncate`. `minmax(0, …)` en las columnas de escritorio, por lo mismo. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-[minmax(0,22.5rem)_minmax(0,1fr)]">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
          <TicketNumbersCard dailyNumber={ticket.dailyNumber} weeklyNumber={ticket.weeklyNumber} />

          <TicketDetailCard title="Cliente">
            <CardContent>
              {ticket.clientId ? (
                <ClientLinkCard
                  href={`/seller/clients/${ticket.clientId}`}
                  name={ticket.clientName ?? 'Cliente'}
                  phone={ticket.clientPhone}
                  // Corregir el cliente y liberar la boleta van DEBAJO de la
                  // fila, fuera del enlace (D-168, D-169). Cuando no se puede,
                  // en su lugar va la explicacion: un boton que falla al
                  // pulsarlo es peor que no tenerlo.
                  action={
                    hasTicketClientActions(ticket) ? (
                      <TicketClientActions ticket={ticket} clients={reassignClients} />
                    ) : undefined
                  }
                />
              ) : (
                <ClientEmptyCard description="Todavía no la has vendido." />
              )}
            </CardContent>
          </TicketDetailCard>

          <TicketDetailCard title="Información de venta">
            <CardContent>
              {/* Una fila por dato, separadas por una linea: rotulo arriba y
                  valor debajo. Sin iconos a la izquierda, como en Figma. */}
              <div className="divide-y">
                <SaleRow label="Precio de venta">
                  {ticket.salePrice === null ? (
                    <p className="text-muted-foreground text-sm">
                      Sin vender (precio vigente {formatCOP(ticket.raffleTicketPrice)})
                    </p>
                  ) : (
                    <TicketSalePrice
                      ticketId={ticket.id}
                      salePrice={ticket.salePrice}
                      basePrice={ticket.basePrice}
                      minSalePrice={ticket.minSalePrice}
                      paidAmount={ticket.paidAmount}
                      canEdit={canEditSalePrice}
                      size="lg"
                    />
                  )}
                </SaleRow>

                <SaleRow label="Fecha de venta">
                  {ticket.saleDate ? (
                    <p className="text-base font-medium">{formatDateEs(ticket.saleDate)}</p>
                  ) : (
                    <p className="text-muted-foreground text-sm">Todavía no</p>
                  )}
                </SaleRow>

                {/* LA ENTREGA DEL PAZ Y SALVO (D-170). Va junto al precio y a
                    la fecha de venta —es lo que le dio a esa persona ese dia—,
                    y no al final entre lo administrativo: es una tarea diaria,
                    no un dato de archivo. Su titulo es el rotulo de la fila: no
                    se escribe otro encima, que se leeria dos veces.

                    Sobre una boleta ANULADA se enseña lo que quedara registrado,
                    sin interruptor: ya no hay nada que entregar (BR-I06). Y
                    sobre una que ni siquiera se ha vendido no se enseña nada,
                    porque no hay entrega de la que hablar. */}
                {canEditClearanceReceipt(ticket) ? (
                  <div className="py-3 last:pb-0">
                    <ClearanceReceiptField
                      /* EL `key` NO ES DECORATIVO. El interruptor guarda en estado
                         lo que le respondio el servidor, para no parpadear
                         mientras llega la revalidacion. Pero el dato tambien
                         cambia SIN que nadie lo toque: cambiar de cliente y
                         liberar la boleta lo devuelven a pendiente desde la base
                         (BR-I15). Sin `key`, React conserva el estado viejo y la
                         pantalla seguiria diciendo «entregado» sobre una fila que
                         ya no lo esta. Con el, un valor nuevo del servidor
                         remonta el componente y gana siempre. Es la forma que
                         documenta React para reiniciar estado al cambiar una
                         prop, sin efectos ni `setState` en render (D-085). */
                      key={`${ticket.clientId}:${ticket.clearanceDeliveredAt ?? 'pendiente'}`}
                      ticketId={ticket.id}
                      clearanceDeliveredAt={ticket.clearanceDeliveredAt}
                      clearanceAssumedDelivered={ticket.clearanceAssumedDelivered}
                    />
                  </div>
                ) : clearanceState(ticket) !== null ? (
                  <SaleRow label="Paz y salvo">
                    <ClearanceReceiptReadOnly ticket={ticket} />
                  </SaleRow>
                ) : null}
              </div>
            </CardContent>
          </TicketDetailCard>
        </div>

        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
          <TicketPaymentSummary
            className={TICKET_DETAIL_CARD}
            inventoryStatus={ticket.inventoryStatus}
            paymentStatus={ticket.paymentStatus}
            salePrice={ticket.salePrice}
            paidAmount={ticket.paidAmount}
          />

          {ticket.inventoryStatus === 'assigned' ? (
            <TicketPaymentsCard
              className={cn(TICKET_DETAIL_CARD, 'md:col-span-2')}
              payments={payments}
              ticketId={ticket.id}
              salePrice={ticket.salePrice}
              paidAmount={ticket.paidAmount}
            />
          ) : null}

          {/* Lo administrativo, al final: hace falta alguna vez, pero no
              compite con la boleta, el cliente ni el cobro. */}
          <TicketDetailCard title="Detalles de la boleta" className="md:col-span-2">
            <CardContent>
              <dl className="divide-y text-sm">
                {/* La rifa BAJA aqui desde el encabezado (D-126). No se pierde:
                    un vendedor casi siempre trabaja una sola rifa a la vez, asi
                    que es contexto, no identidad. */}
                <DetailLine
                  label="Rifa"
                  value={`${ticket.raffleShortCode} — ${ticket.raffleName}`}
                />
                <DetailLine label="Creada" value={<DateTime value={ticket.createdAt} />} />
                <DetailLine
                  label="Aprobada"
                  value={ticket.approvedAt ? <DateTime value={ticket.approvedAt} /> : 'Todavía no'}
                />
                <DetailLine
                  label="Asignada"
                  value={
                    ticket.assignedAt ? (
                      <>
                        <DateTime value={ticket.assignedAt} />
                        {ticket.clientName ? ` a ${ticket.clientName}` : ''}
                      </>
                    ) : (
                      'Todavía no'
                    )
                  }
                />
                {ticket.cancelledAt ? (
                  <DetailLine
                    label="Anulada"
                    value={
                      <>
                        <DateTime value={ticket.cancelledAt} />
                        {ticket.cancelReason ? ` — ${ticket.cancelReason}` : ''}
                      </>
                    }
                  />
                ) : null}
                <DetailLine label="Código interno" value={ticket.internalCode} mono />
              </dl>
              <InternalCodeNote />
            </CardContent>
          </TicketDetailCard>
        </div>
      </div>
    </div>
  )
}

/** Una fila de «Información de venta»: rotulo arriba y valor debajo. */
function SaleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 py-3 first:pt-0 last:pb-0">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      {children}
    </div>
  )
}
