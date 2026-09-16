import { PencilIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { RaffleStatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PrizeList } from '@/features/raffle-prizes/components/PrizeList'
import { PRIZE_PANEL_COPY } from '@/features/raffle-prizes/copy'
import { listRafflePrizes } from '@/features/raffle-prizes/queries'
import { draftActivation } from '@/features/raffle-prizes/review'
import { RaffleStatusActions } from '@/features/raffles/components/RaffleStatusActions'
import { raffleEditHref } from '@/features/raffles/edit-origin'
import { getAdminRaffleDetail } from '@/features/raffles/queries'
import { hasCapability } from '@/lib/auth/capability-resolver'
import { requireStaff } from '@/lib/auth/guards'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

/**
 * Detalle de una rifa. Sus datos y los recuentos de sus boletas; lo vendido, lo
 * recaudado y el saldo ya no se ensenan al personal (D-198, BR-Q08).
 */
export default async function RaffleDetailPage({
  params,
}: {
  params: Promise<{ raffleId: string }>
}) {
  const { raffleId } = await params
  const membership = await requireStaff()
  const raffle = await getAdminRaffleDetail(raffleId)

  if (!raffle) notFound()

  const editable = raffle.status === 'draft' || raffle.status === 'active'

  // Los premios SOLO se leen cuando la rifa los usa: una rifa heredada no
  // gasta ni una consulta en algo que no tiene (BR-J13, D-202). La capacidad
  // la decide el resolvedor central con la membresia completa, no el rol.
  const canManagePrizes = await hasCapability(membership, 'raffles.prizes.manage')
  const showPrizes = raffle.prizeMode === 'configurable' && canManagePrizes
  const prizes = showPrizes ? await listRafflePrizes(raffle.id) : []
  const activePrizes = prizes.filter((prize) => prize.status === 'active')

  return (
    <div className="space-y-6">
      <PageHeader
        title={raffle.name}
        titleBadge={<RaffleStatusBadge status={raffle.status} />}
        description={raffle.description ?? undefined}
        backHref="/owner/raffles"
        actions={
          <>
            {editable ? (
              <Button asChild variant="outline">
                <Link href={raffleEditHref(raffle.id)}>
                  <PencilIcon className="size-4" aria-hidden />
                  Editar
                </Link>
              </Button>
            ) : null}
            {/* Un borrador configurable se activa desde la revisión (D-202). */}
            <RaffleStatusActions
              raffleId={raffle.id}
              status={raffle.status}
              role={membership.role}
              draftActivation={draftActivation(raffle, canManagePrizes)}
            />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <h2>Datos de la rifa</h2>
          </CardTitle>
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

      {showPrizes ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{PRIZE_PANEL_COPY.title}</h2>
            <Button asChild variant="outline">
              <Link href={`/owner/raffles/${raffle.id}/prizes`}>Configurar premios</Link>
            </Button>
          </div>
          <PrizeList prizes={activePrizes} />
        </section>
      ) : null}

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
