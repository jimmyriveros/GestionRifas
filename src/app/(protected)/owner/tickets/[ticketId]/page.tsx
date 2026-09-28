import { TrophyIcon, UserRoundIcon } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { PageHeader } from '@/components/data/PageHeader'
import { RecordLinkCard } from '@/components/data/RecordLinkCard'
import { AdminPaymentStateBadge, InventoryStatusBadge } from '@/components/data/StatusBadge'
import { CardContent } from '@/components/ui/card'
import { listActiveSellerOptions } from '@/features/sellers/queries'
import { getAdminTicketDetail, type AdminTicketDetail } from '@/features/tickets/admin-queries'
import { ClearanceReceiptReadOnly } from '@/features/tickets/components/ClearanceReceiptReadOnly'
import { TicketActions } from '@/features/tickets/components/TicketActions'
import {
  DateTime,
  DetailLine,
  InternalCodeNote,
  TicketDetailCard,
  TicketNumbersCard,
} from '@/features/tickets/components/TicketDetailParts'
import { formatDateEs } from '@/lib/dates'

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
 *
 * LA COMPOSICION (D-234) es la del detalle del vendedor (D-231) adaptada a lo
 * que el personal si ve: cuatro tarjetas y no seis, porque la venta y el cobro
 * no son suyos. Comparte con el vendedor las piezas (`TicketDetailParts`), no la
 * pagina.
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

  const approval = approvalValue(ticket)

  return (
    <div className="space-y-5 md:space-y-6">
      {/* EL ENCABEZADO SOLO DICE DONDE ESTAS (D-126). Los dos numeros estan en
          la primera tarjeta, a un dedo de distancia. La boleta se sigue
          nombrando por sus numeros donde hace falta nombrarla (BR-N11) — esto
          es un titulo de pantalla, no un nombre.

          Las acciones llegan a ser cinco y van en su propia fila hasta `lg`
          (`stackActions`, D-234): junto al titulo no caben en una tableta. */}
      <PageHeader
        title="Detalle boleta"
        backHref={`/owner/tickets?raffleId=${ticket.raffleId}`}
        stackActions
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

      {/* LA COMPOSICION (D-234): cuatro tarjetas, y el HTML va en el orden del
          TELEFONO —numeros, vendedor y rifa, estado y venta, detalles—, que es
          tambien el orden de lectura y de foco en todos los anchos.

            hasta `lg`   una columna, en ese orden, con las tarjetas a lo ancho;
            desde `lg`   dos columnas que se apilan por su cuenta: a la
                         izquierda la boleta (numeros, vendedor y rifa, a 360 px
                         como en el vendedor), a la derecha su estado y su
                         registro.

          NO SE EMPAREJAN TARJETAS EN TABLETA, a diferencia del vendedor. Aqui la
          pareja natural seria numeros | vendedor y rifa, y las dos miden
          distinto: la fila estiraba «Números» con 60 px en blanco bajo las
          cifras —140 con un nombre largo—, y hacer crecer las dos cajas para
          llenarlos las dejaba en bloques de color vacios. A lo ancho, cada
          tarjeta mide lo suyo y aprovecha el ancho con sus propias columnas.

          Y LAS DOS COLUMNAS EMPIEZAN EN `lg`, no en `xl` como en el vendedor:
          alli el corte lo pone su tabla de abonos, que aqui no existe. A 1.024
          px la columna derecha tiene 492 px de contenido y las fechas de
          «Detalles» caben en una linea.

          `grid-cols-1` y `minmax(0, …)` no son decorativos (I-076, D-125): una
          columna `auto` no baja del minimo de su contenido. */}
      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,22.5rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <TicketNumbersCard dailyNumber={ticket.dailyNumber} weeklyNumber={ticket.weeklyNumber} />

          {/* DE QUIEN ES Y DE QUE RIFA. Son la otra respuesta a «que boleta es
              esta» para el personal, que ve varias rifas a la vez (D-126), y
              cada una lleva a su ficha: la misma fila pulsable que el vendedor
              usa para su cliente. Los nombres se PARTEN en vez de recortarse:
              recortado, el nombre largo de una rifa perderia justo lo que la
              distingue de la siguiente. Con la tarjeta ancha —una tableta— las
              dos filas van lado a lado. */}
          <TicketDetailCard title="Vendedor y rifa">
            <CardContent className="@container">
              <div className="grid grid-cols-1 gap-2 @min-[36rem]:grid-cols-2">
                <RecordLinkCard
                  href={`/owner/sellers/${ticket.sellerId}`}
                  icon={<UserRoundIcon className="size-5" />}
                  label="Vendedor"
                  title={ticket.sellerName}
                  wrap
                />
                <RecordLinkCard
                  href={`/owner/raffles/${ticket.raffleId}`}
                  icon={<TrophyIcon className="size-5" />}
                  label="Rifa"
                  title={`${ticket.raffleShortCode} — ${ticket.raffleName}`}
                  wrap
                />
              </div>
            </CardContent>
          </TicketDetailCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          {/* EL ESTADO Y, SI SE VENDIO, LA VENTA. Arriba los dos estados, como
              en el vendedor; debajo, separada por una linea, lo unico de la
              venta que el personal ve: su fecha y el paz y salvo (BR-Q02).

              El pago tiene DOS estados para el personal, «Pagada» y «Sin
              pagar», nunca «Abonada» (BR-Q04, D-198); sin venta no hay estado
              de pago y se dice «Sin venta».

              Las columnas las decide el ancho de la TARJETA, no el de la
              ventana: a partir de 22 rem de contenido cabe «Pendiente de
              aprobación» —la insignia mas larga— al lado de su pareja. Por
              debajo, que es un telefono, una debajo de otra: en dos columnas de
              147 px la insignia se montaba sobre la de al lado. */}
          <TicketDetailCard title="Estado y venta">
            <CardContent className="@container space-y-5">
              <dl className="grid grid-cols-1 gap-4 @min-[22rem]:grid-cols-2">
                <Field label="Estado">
                  <InventoryStatusBadge status={ticket.inventoryStatus} />
                </Field>
                <Field label="Estado de pago">
                  {ticket.paymentState === null ? (
                    <span className="text-muted-foreground text-sm">Sin venta</span>
                  ) : (
                    <AdminPaymentStateBadge state={ticket.paymentState} />
                  )}
                </Field>
              </dl>

              {ticket.saleDate !== null || ticket.clearanceState !== null ? (
                <dl className="grid grid-cols-1 gap-4 border-t pt-5 @min-[22rem]:grid-cols-2">
                  {ticket.saleDate !== null ? (
                    <Field label="Fecha de venta">
                      <p className="text-base font-medium">{formatDateEs(ticket.saleDate)}</p>
                    </Field>
                  ) : null}
                  {/* SOLO PARA MIRAR (D-170). El paz y salvo lo registra el
                      vendedor que lo entregó; el personal lo consulta para saber
                      a quién reclamarle un desprendible. El estado llega ya
                      resuelto por SQL, sin el cliente (D-198). */}
                  {ticket.clearanceState !== null ? (
                    <Field label="Paz y salvo">
                      <ClearanceReceiptReadOnly
                        state={ticket.clearanceState}
                        deliveredAt={ticket.clearanceDeliveredAt}
                      />
                    </Field>
                  ) : null}
                </dl>
              ) : null}
            </CardContent>
          </TicketDetailCard>

          {/* LO ADMINISTRATIVO, AL FINAL, y ya sin tarjeta propia para el
              codigo interno: son las fechas del registro de la boleta, su
              identificador y, si se anulo, por que. Una fila solo aparece
              cuando dice algo: ni «Anulada —» en una boleta viva ni «Aprobada
              —» en una que nunca necesito aprobacion. */}
          <TicketDetailCard title="Detalles de la boleta">
            <CardContent>
              <dl className="divide-y text-sm">
                <DetailLine label="Creada" value={<DateTime value={ticket.createdAt} />} />
                {approval !== null ? <DetailLine label="Aprobada" value={approval} /> : null}
                {ticket.cancelledAt ? (
                  <DetailLine label="Anulada" value={<DateTime value={ticket.cancelledAt} />} />
                ) : null}
                {ticket.cancelReason ? (
                  <DetailLine label="Motivo de anulación" value={ticket.cancelReason} long />
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

/**
 * Que decir en «Aprobada», o `null` para no escribir la fila.
 *
 * Aprobar es el paso de una boleta `pending_approval`, la que crea un VENDEDOR
 * (CLAUDE.md §16, BR-I09). Las que crea el personal nacen listas y no tienen
 * fecha de aprobacion: escribir «Todavía no» en ellas diria que falta algo que
 * no falta. Por eso «Todavía no» solo se
 * dice de una pendiente de aprobacion, que es la unica que la espera.
 */
function approvalValue(ticket: AdminTicketDetail): ReactNode | null {
  if (ticket.approvedAt) return <DateTime value={ticket.approvedAt} />
  if (ticket.inventoryStatus === 'pending_approval') return 'Todavía no'
  return null
}

/**
 * Un dato de «Estado y venta»: el rotulo encima y el valor debajo, como los
 * estados del detalle del vendedor. Es un par de una lista de definiciones: el
 * `div` que los agrupa es valido dentro de un `dl`.
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
