import { AlertTriangleIcon } from 'lucide-react'
import Link from 'next/link'

import { CollectionSummaryCard } from '@/components/data/CollectionSummaryCard'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { InstallPrompt } from '@/features/pwa/components/InstallPrompt'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getAdminDashboard } from '@/features/dashboard/queries'
import { LotteryResultsSection } from '@/features/lottery/components/LotteryResultsSection'
import { tourTarget } from '@/features/tour/tours'
import { requireStaff } from '@/lib/auth/guards'
import { ROLE_LABELS, TICKET_PAYMENT_STATUS_PLURAL_LABELS } from '@/lib/constants'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

/**
 * Panel del dueno y del administrador.
 *
 * El recuadro de loterias NO se espera aqui (D-155): entra por
 * `LotteryResultsSection`, que lo aisla en su propio limite de Suspense. Todo lo
 * demas de esta pantalla se envia en cuanto responde `getAdminDashboard`.
 */
export default async function OwnerDashboardPage() {
  const membership = await requireStaff()
  const dashboard = await getAdminDashboard()
  const { totals } = dashboard

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hola, ${membership.fullName}`}
        description={membership.organizationName}
        actions={<Badge variant="secondary">{ROLE_LABELS[membership.role]}</Badge>}
      />

      {totals.ticketsPendingApproval > 0 ? (
        <Notice
          tone="warning"
          icon={<AlertTriangleIcon />}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/owner/tickets?inventoryStatus=pending_approval">Revisar</Link>
            </Button>
          }
        >
          Hay {totals.ticketsPendingApproval} boleta(s) pendientes de aprobación.
        </Notice>
      ) : null}

      {/* Arriba, no al final (D-123). Después del aviso ámbar: aprobar boletas
          corre más prisa que instalar nada. */}
      <InstallPrompt />

      {/* SIGUE EN `full`, y se evaluo pasarlo a `compact` como el del vendedor.
          No se hizo, por tres razones medidas: (1) en una organizacion sin
          sorteos programados las dos formas pintan el MISMO estado vacio, asi
          que el ahorro real fue de 32 px, no de los ~150 que se esperaban;
          (2) quien verifica un resultado y paga un premio es justamente el
          personal, que es para quien esta pensado el numero grande con su
          procedencia a la vista; y (3) el vendedor ya usa `compact`, asi que
          cambiar este dejaria la forma `full` sin un solo consumidor. D-180
          decidio que este portal la conserva, y no hay evidencia para
          reabrirlo. Lo que si sobra son los ~230 px del estado vacio, y eso es
          otra decision. */}
      <LotteryResultsSection audience="staff" ticketBasePath="/owner/tickets" />

      <CollectionSummaryCard
        totalSold={totals.totalSold}
        totalCollected={totals.totalCollected}
        pendingAmount={totals.pendingAmount}
        pendingTicketsCount={totals.ticketsUnpaid + totals.ticketsPartial}
      />

      <section>
        <h2 className="text-heading-h4 mb-3">Inventario</h2>
        {/* CUATRO cifras, no cinco. «Pendientes de aprobación» se fue: el aviso
            ambar de arriba ya las cuenta Y ofrece «Revisar», asi que aqui se
            contaban dos veces (misma regla que D-172 en el panel del vendedor).
            Y «Total de boletas» pasa a llamarse «Registradas», porque cuenta
            ademas borradores, pendientes y anuladas: decia 30 al lado de 17 y 8,
            y esas cinco no se explicaban en ninguna parte de la pantalla. */}
        <div {...tourTarget('metrics-inventory')} className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard label="Vendedores activos" value={dashboard.activeSellers} />
          <MetricCard label="Registradas" value={totals.ticketsTotal} />
          <MetricCard label="Disponibles" value={totals.ticketsAvailable} />
          <MetricCard label="Asignadas" value={totals.ticketsAssigned} />
        </div>
      </section>

      <section>
        {/* «Cobranza» a secas esta en la columna «nunca usar» del glosario, y
            ademas no decia de que boletas hablaba. Estas tres SI suman las
            asignadas de arriba, que es justo lo que el titulo promete. Es el
            mismo nombre que usa el panel del vendedor para este reparto. */}
        <h2 className="text-heading-h4 mb-3">Boletas vendidas según su pago</h2>
        <div {...tourTarget('metrics-collection')} className="grid grid-cols-3 gap-4">
          <MetricCard
            label={TICKET_PAYMENT_STATUS_PLURAL_LABELS.unpaid}
            value={totals.ticketsUnpaid}
          />
          <MetricCard
            label={TICKET_PAYMENT_STATUS_PLURAL_LABELS.partial}
            value={totals.ticketsPartial}
          />
          <MetricCard label={TICKET_PAYMENT_STATUS_PLURAL_LABELS.paid} value={totals.ticketsPaid} />
        </div>
      </section>

      <section {...tourTarget('seller-summary')} className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-heading-h4">Resumen por vendedor</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/owner/sellers">Ver todos</Link>
          </Button>
        </div>
        {dashboard.sellers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no hay vendedores.{' '}
            <Link href="/owner/sellers" className="underline">
              Invita al primero
            </Link>
            .
          </p>
        ) : (
          <div className="w-full overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Boletas</TableHead>
                  <TableHead className="text-right">Vendidas</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="text-right">Recaudado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.sellers.map((seller) => (
                  <TableRow key={seller.profileId}>
                    <TableCell>
                      <Link
                        href={`/owner/sellers/${seller.profileId}`}
                        className="font-medium hover:underline"
                      >
                        {seller.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{seller.ticketsTotal}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {seller.ticketsAssigned}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCOP(seller.totalSold)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCOP(seller.totalCollected)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCOP(seller.pendingAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* «Boletas creadas recientemente» se retiro: listaba las cinco ultimas
          con su hora, que en la practica es lo que la persona acaba de importar
          o crear en lote —lo sabe, porque viene de hacerlo—. Es la misma razon
          por la que D-112 dejo UNA lista en el panel del vendedor en vez de
          tres: repetir aqui lo que ya tiene su pantalla convierte el panel en un
          indice. «Ver todas» sigue estando en el menu, en «Boletas». */}
      <div className="grid gap-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-heading-h4">Pagos recientes</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/owner/payments">Ver todos</Link>
            </Button>
          </div>
          {dashboard.recentPayments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no se ha registrado ningún abono.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {dashboard.recentPayments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/owner/clients/${payment.clientId}`}
                      className="font-medium hover:underline"
                    >
                      {payment.clientName}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {payment.sellerName ?? 'Otro vendedor'} · {formatDateEs(payment.paymentDate)}
                    </p>
                  </div>
                  <span
                    className={
                      payment.isActive
                        ? 'shrink-0 text-sm font-medium tabular-nums'
                        : 'text-muted-foreground shrink-0 text-sm tabular-nums line-through'
                    }
                    // El texto es lo que informa, no el tachado (CLAUDE.md 27).
                    title={payment.isActive ? undefined : 'Pago anulado'}
                  >
                    {formatCOP(payment.totalAmount)}
                    {payment.isActive ? '' : ' (anulado)'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
