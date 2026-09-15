import { AlertTriangleIcon } from 'lucide-react'
import Link from 'next/link'

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
import { ADMIN_TICKET_PAYMENT_STATE_PLURAL_LABELS, ROLE_LABELS } from '@/lib/constants'

/**
 * Panel del dueno y del administrador.
 *
 * SIN DINERO (D-198, BR-Q08). La cartera es de cada vendedor: el panel ya no
 * dice cuanto se vendio, cuanto se recaudo ni cuanto falta, ni ensena los pagos
 * recientes con sus clientes. Lo que queda es lo que el personal administra —el
 * inventario, las boletas por aprobar y las loterias— y cuantas boletas vendidas
 * estan pagadas o sin pagar, contadas en SQL y en dos estados.
 *
 * El recuadro de loterias NO se espera aqui (D-155): entra por
 * `LotteryResultsSection`, que lo aisla en su propio limite de Suspense.
 */
export default async function OwnerDashboardPage() {
  const membership = await requireStaff()
  const dashboard = await getAdminDashboard()
  const { totals } = dashboard

  // LOS VENDEDORES QUE APARECEN, Y EN QUE ORDEN (D-183, ajustado por D-198).
  //
  // Se ordenaban por saldo pendiente —quien va atrasado—, y esa cifra ya no
  // existe para el personal. Ahora, por boletas vendidas y despues por nombre:
  // es la pregunta que el inventario si responde. SOBRE UNA COPIA, porque `sort`
  // ordena en el sitio y la lista sale de una lectura memoizada por peticion.
  const VENDEDORES_EN_EL_PANEL = 5
  const vendedoresDelPanel = [...dashboard.sellers]
    .sort(
      (a, b) => b.ticketsAssigned - a.ticketsAssigned || a.fullName.localeCompare(b.fullName, 'es'),
    )
    .slice(0, VENDEDORES_EN_EL_PANEL)
  const hayMasVendedores = dashboard.sellers.length > VENDEDORES_EN_EL_PANEL

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

      {/* SIGUE EN `full` (D-180). Desde D-198 la consulta del personal es
          `admin_lottery_matches`: las coincidencias llegan sin cliente. */}
      <LotteryResultsSection audience="staff" ticketBasePath="/owner/tickets" />

      {/*
        NIVEL 2, en dos columnas desde `lg` (D-183). La tabla de vendedores
        tiene ahora cuatro columnas en vez de seis, asi que cabe con holgura
        en las 7 columnas de la izquierda desde el primer escalon de `lg`.
      */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <section {...tourTarget('seller-summary')} className="min-w-0 space-y-3 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-heading-h4">Resumen por vendedor</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/owner/sellers">Ver todos</Link>
            </Button>
          </div>

          {/* CUANDO NO CABEN TODOS, SE DICE. La tabla enseña como mucho cinco
              filas, y sin esta linea las cinco se leerian como la plantilla
              entera. Se escribe solo cuando de verdad sobran vendedores. */}
          {hayMasVendedores ? (
            <p className="text-muted-foreground text-body-small">
              Los {VENDEDORES_EN_EL_PANEL} con más boletas vendidas, de {dashboard.sellers.length}.
            </p>
          ) : null}
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
                    <TableHead className="text-right">Por aprobar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendedoresDelPanel.map((seller) => (
                    <TableRow key={seller.profileId}>
                      <TableCell>
                        <Link
                          href={`/owner/sellers/${seller.profileId}`}
                          className="font-medium hover:underline"
                        >
                          {seller.fullName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {seller.ticketsTotal}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {seller.ticketsAssigned}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {seller.ticketsPendingApproval}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="min-w-0 lg:col-span-5">
          <h2 className="text-heading-h4 mb-3">Inventario</h2>
          {/* «Registradas» cuenta todas, incluidas borradores, pendientes y
              anuladas (D-182). «Pagadas» y «Sin pagar» reparten las ASIGNADAS
              en los dos estados administrativos: juntas suman lo mismo que
              «Asignadas», y ninguna dice cuánto se abonó (D-198). */}
          <div {...tourTarget('metrics-inventory')} className="grid grid-cols-2 gap-4">
            <MetricCard label="Vendedores activos" value={dashboard.activeSellers} />
            <MetricCard label="Registradas" value={totals.ticketsTotal} />
            <MetricCard label="Disponibles" value={totals.ticketsAvailable} />
            <MetricCard label="Asignadas" value={totals.ticketsAssigned} />
            <MetricCard
              label={ADMIN_TICKET_PAYMENT_STATE_PLURAL_LABELS.paid}
              value={totals.ticketsPaid}
            />
            <MetricCard
              label={ADMIN_TICKET_PAYMENT_STATE_PLURAL_LABELS.unpaid}
              value={totals.ticketsNotPaid}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
