import { PencilIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { RaffleStatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RaffleStatusActions } from '@/features/raffles/components/RaffleStatusActions'
import { getRaffleDetail } from '@/features/raffles/queries'
import { requireStaff } from '@/lib/auth/guards'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

export default async function RaffleDetailPage({
  params,
}: {
  params: Promise<{ raffleId: string }>
}) {
  const { raffleId } = await params
  const membership = await requireStaff()
  const raffle = await getRaffleDetail(raffleId)

  if (!raffle) notFound()

  const editable = raffle.status === 'draft' || raffle.status === 'active'

  return (
    <div className="space-y-6">
      <PageHeader
        title={raffle.name}
        description={raffle.description ?? undefined}
        actions={
          <>
            {editable ? (
              <Button asChild variant="outline">
                <Link href={`/owner/raffles/${raffle.id}/edit`}>
                  <PencilIcon className="size-4" aria-hidden />
                  Editar
                </Link>
              </Button>
            ) : null}
            <RaffleStatusActions
              raffleId={raffle.id}
              status={raffle.status}
              role={membership.role}
            />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la rifa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Código">
            <span className="font-mono">{raffle.shortCode}</span>
          </Field>
          <Field label="Estado">
            <RaffleStatusBadge status={raffle.status} />
          </Field>
          <Field label="Precio de la boleta">{formatCOP(raffle.ticketPrice)}</Field>
          <Field label="Inicio">{formatDateEs(raffle.startDate)}</Field>
          <Field label="Fin">{formatDateEs(raffle.endDate)}</Field>
          <Field label="Los vendedores pueden crear boletas">
            {raffle.allowSellerTicketCreation ? 'Si' : 'No'}
          </Field>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Boletas de esta rifa</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <MetricCard label="Total" value={raffle.ticketsTotal} />
          <MetricCard label="Disponibles" value={raffle.ticketsAvailable} />
          <MetricCard label="Asignadas" value={raffle.ticketsAssigned} />
          <MetricCard label="Pendientes de aprobación" value={raffle.ticketsPendingApproval} />
          <MetricCard label="Anuladas" value={raffle.ticketsCancelled} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Dinero</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Total vendido" value={formatCOP(raffle.totalSold)} />
          <MetricCard label="Total recaudado" value={formatCOP(raffle.totalCollected)} />
          <MetricCard label="Saldo pendiente" value={formatCOP(raffle.pendingAmount)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/owner/tickets?raffleId=${raffle.id}`}>Ver boletas de la rifa</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/owner/tickets/bulk?raffleId=${raffle.id}`}>Crear boletas en lote</Link>
        </Button>
      </div>
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
