import { AlertTriangleIcon } from 'lucide-react'
import Link from 'next/link'

import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { RaffleStatusBadge } from '@/components/data/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getAdminDashboard } from '@/features/dashboard/queries'
import { requireStaff } from '@/lib/auth/guards'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateEs, formatDateTimeEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

export default async function OwnerDashboardPage() {
  const membership = await requireStaff()
  const dashboard = await getAdminDashboard()
  const { totals, activeRaffle } = dashboard

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hola, ${membership.fullName}`}
        description={membership.organizationName}
        actions={<Badge variant="secondary">{ROLE_LABELS[membership.role]}</Badge>}
      />

      {totals.ticketsPendingApproval > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
          <p className="flex items-center gap-2 text-sm">
            <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
            Hay {totals.ticketsPendingApproval} boleta(s) pendientes de aprobación.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/owner/tickets?inventoryStatus=pending_approval">Revisar</Link>
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Rifa activa</CardTitle>
          {activeRaffle ? <RaffleStatusBadge status={activeRaffle.status} /> : null}
        </CardHeader>
        <CardContent>
          {activeRaffle ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link
                  href={`/owner/raffles/${activeRaffle.id}`}
                  className="text-lg font-semibold hover:underline"
                >
                  {activeRaffle.name}
                </Link>
                <p className="text-muted-foreground text-sm">
                  Boleta a {formatCOP(activeRaffle.ticketPrice)} · {activeRaffle.ticketsTotal}{' '}
                  boleta(s)
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/owner/tickets?raffleId=${activeRaffle.id}`}>Ver sus boletas</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">Todavía no hay ninguna rifa creada.</p>
              <Button asChild size="sm">
                <Link href="/owner/raffles/new">Crear la primera rifa</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Inventario</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <MetricCard label="Vendedores activos" value={dashboard.activeSellers} />
          <MetricCard label="Total de boletas" value={totals.ticketsTotal} />
          <MetricCard label="Disponibles" value={totals.ticketsAvailable} />
          <MetricCard label="Asignadas" value={totals.ticketsAssigned} />
          <MetricCard label="Pendientes de aprobación" value={totals.ticketsPendingApproval} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Cobranza</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Sin pagar" value={totals.ticketsUnpaid} />
          <MetricCard label="Abonadas" value={totals.ticketsPartial} />
          <MetricCard label="Pagadas" value={totals.ticketsPaid} />
          <MetricCard label="Total vendido" value={formatCOP(totals.totalSold)} />
          <MetricCard label="Total recaudado" value={formatCOP(totals.totalCollected)} />
          <MetricCard label="Saldo pendiente" value={formatCOP(totals.pendingAmount)} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Resumen por vendedor</h2>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pagos recientes</h2>
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

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Boletas creadas recientemente</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/owner/tickets">Ver todas</Link>
            </Button>
          </div>
          {dashboard.recentTickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no se ha creado ninguna boleta.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {dashboard.recentTickets.map((ticket) => (
                <li key={ticket.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Link
                    href={`/owner/tickets/${ticket.id}`}
                    className="font-mono text-sm hover:underline"
                  >
                    {ticket.internalCode}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTimeEs(ticket.createdAt)}
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
