import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import { RafflePrizesPanel } from '@/features/raffle-prizes/components/RafflePrizesPanel'
import { PRIZE_PANEL_COPY, RAFFLE_WIZARD_COPY } from '@/features/raffle-prizes/copy'
import { getPrizeRaffleContext, listRafflePrizes } from '@/features/raffle-prizes/queries'
import { RaffleWizardSteps } from '@/features/raffles/components/RaffleWizardSteps'
import { raffleEditHref } from '@/features/raffles/edit-origin'
import { hasCapability } from '@/lib/auth/capability-resolver'
import { requireStaff } from '@/lib/auth/guards'

/**
 * Paso 2 de crear una rifa, y la pantalla de configuracion de sus premios
 * (D-202). Se llega desde el proceso y tambien desde el detalle de la rifa.
 *
 * QUIEN ENTRA: personal con la capacidad `raffles.prizes.manage` (D-200), segun
 * el resolvedor central. Sin ella se explica, no se pinta un panel que la base
 * va a rechazar. La frontera real siguen siendo la RLS y las RPC.
 */
export default async function RafflePrizesPage({
  params,
}: {
  params: Promise<{ raffleId: string }>
}) {
  const { raffleId } = await params
  const membership = await requireStaff()
  const raffle = await getPrizeRaffleContext(raffleId)

  if (!raffle) notFound()

  const canManage = await hasCapability(membership, 'raffles.prizes.manage')
  const isDraft = raffle.status === 'draft'

  if (raffle.prizeMode === 'legacy') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={PRIZE_PANEL_COPY.title}
          description={raffle.name}
          backHref={`/owner/raffles/${raffle.id}`}
        />
        <Notice tone="neutral">{PRIZE_PANEL_COPY.legacyNotice}</Notice>
      </div>
    )
  }

  const prizes = canManage ? await listRafflePrizes(raffle.id) : []

  return (
    <div className="space-y-6">
      <PageHeader
        title={PRIZE_PANEL_COPY.title}
        description={`${raffle.name} · ${PRIZE_PANEL_COPY.description}`}
        backHref={`/owner/raffles/${raffle.id}`}
      />

      {isDraft ? <RaffleWizardSteps current={2} /> : null}

      {canManage ? (
        <>
          <RafflePrizesPanel raffle={raffle} prizes={prizes} />

          {isDraft ? (
            <div className="flex flex-col gap-2 border-t pt-6 sm:flex-row sm:flex-wrap">
              <Button asChild size="touch" className="w-full sm:w-auto">
                <Link href={`/owner/raffles/${raffle.id}/review`}>
                  {RAFFLE_WIZARD_COPY.prizesNext}
                </Link>
              </Button>
              {/* Corregir los datos no saca del proceso: se vuelve aquí (D-202). */}
              <Button asChild variant="outline" size="touch" className="w-full sm:w-auto">
                <Link href={raffleEditHref(raffle.id, 'prizes')}>
                  {RAFFLE_WIZARD_COPY.prizesBack}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="touch" className="w-full sm:w-auto">
                <Link href="/owner/raffles">{RAFFLE_WIZARD_COPY.saveForLater}</Link>
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <Notice tone="neutral">{PRIZE_PANEL_COPY.noCapability}</Notice>
      )}
    </div>
  )
}
