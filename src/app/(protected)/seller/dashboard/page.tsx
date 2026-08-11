import { AlertTriangleIcon, PlusIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'

import { CollectionSummaryCard } from '@/components/data/CollectionSummaryCard'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getSellerDashboard } from '@/features/dashboard/seller-queries'
import { tourTarget } from '@/features/tour/tours'
import { requireRole } from '@/lib/auth/guards'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateEs, formatDateTimeEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'

export default async function SellerDashboardPage() {
  const membership = await requireRole(['seller'])
  const dashboard = await getSellerDashboard()
  const { totals } = dashboard

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hola, ${membership.fullName}`}
        description={membership.organizationName}
        actions={<Badge variant="secondary">{ROLE_LABELS[membership.role]}</Badge>}
      />

      {/* Acciones principales, arriba y grandes: es lo que se usa desde el telefono. */}
      <div {...tourTarget('quick-actions')} className="grid gap-3 sm:grid-cols-2">
        <Button asChild size="lg" className="h-auto justify-start py-4">
          <Link href="/seller/tickets?inventoryStatus=available">
            <SearchIcon className="size-5" aria-hidden />
            <span className="text-left">
              Vender una boleta
              <span className="block text-xs font-normal opacity-80">
                {totals.ticketsAvailable} disponible(s)
              </span>
            </span>
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-auto justify-start py-4">
          <Link href="/seller/clients/new">
            <PlusIcon className="size-5" aria-hidden />
            <span className="text-left">
              Nuevo cliente
              <span className="block text-xs font-normal opacity-80">
                {dashboard.clientsCount} en tu cartera
              </span>
            </span>
          </Link>
        </Button>
      </div>

      {totals.ticketsPendingApproval > 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
          Tienes {totals.ticketsPendingApproval} boleta(s) esperando la aprobación de tu
          administrador. Todavía no puedes venderlas.
        </p>
      ) : null}

      <CollectionSummaryCard
        totalSold={totals.totalSold}
        totalCollected={totals.totalCollected}
        pendingAmount={totals.pendingAmount}
        pendingTicketsCount={totals.ticketsUnpaid + totals.ticketsPartial}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Mis boletas</h2>
        <div
          {...tourTarget('metrics-inventory')}
          className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
        >
          <MetricCard label="Total" value={totals.ticketsTotal} />
          <MetricCard label="Disponibles" value={totals.ticketsAvailable} />
          <MetricCard label="Vendidas" value={totals.ticketsAssigned} />
          <MetricCard label="Pendientes de aprobación" value={totals.ticketsPendingApproval} />
          <MetricCard label="Clientes" value={dashboard.clientsCount} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Cobranza</h2>
        <div {...tourTarget('metrics-collection')} className="grid grid-cols-3 gap-4">
          <MetricCard label="Sin pagar" value={totals.ticketsUnpaid} />
          <MetricCard label="Abonadas" value={totals.ticketsPartial} />
          <MetricCard label="Pagadas" value={totals.ticketsPaid} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ventas recientes</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/seller/tickets?inventoryStatus=assigned">Ver todas</Link>
            </Button>
          </div>
          {dashboard.recentTickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no has vendido ninguna boleta.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {dashboard.recentTickets.map((ticket) => (
                <li key={ticket.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/seller/tickets/${ticket.id}`}
                      className="font-mono text-sm hover:underline"
                    >
                      {ticketLabel(ticket)}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {ticket.clientName ?? 'Sin cliente'}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDateTimeEs(ticket.assignedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Clientes recientes</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/seller/clients">Ver todos</Link>
            </Button>
          </div>
          {dashboard.recentClients.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no tienes clientes.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {dashboard.recentClients.map((client) => (
                <li key={client.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/seller/clients/${client.id}`}
                      className="font-medium hover:underline"
                    >
                      {client.name}
                    </Link>
                    <p className="text-muted-foreground text-xs tabular-nums">{client.phone}</p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDateEs(client.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pagos recientes</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/seller/payments">Ver todos</Link>
          </Button>
        </div>
        {dashboard.recentPayments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no has registrado ningún abono.{' '}
            <Link href="/seller/payments/new" className="underline">
              Registra el primero
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {dashboard.recentPayments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/seller/clients/${payment.clientId}`}
                    className="font-medium hover:underline"
                  >
                    {payment.clientName}
                  </Link>
                  <p className="text-muted-foreground truncate text-xs">
                    {formatDateEs(payment.paymentDate)} ·{' '}
                    {payment.allocations.length === 1
                      ? '1 boleta'
                      : `${payment.allocations.length} boletas`}
                  </p>
                </div>
                <span
                  className={
                    payment.isActive
                      ? 'shrink-0 text-sm font-medium tabular-nums'
                      : 'text-muted-foreground shrink-0 text-sm tabular-nums line-through'
                  }
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
  )
}
