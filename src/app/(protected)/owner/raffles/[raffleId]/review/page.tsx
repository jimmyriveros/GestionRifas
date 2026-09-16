import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { RaffleReview } from '@/features/raffle-prizes/components/RaffleReview'
import { PRIZE_PANEL_COPY, RAFFLE_WIZARD_COPY } from '@/features/raffle-prizes/copy'
import { getPrizeRaffleContext, listRafflePrizes } from '@/features/raffle-prizes/queries'
import { RaffleWizardSteps } from '@/features/raffles/components/RaffleWizardSteps'
import { requireStaff } from '@/lib/auth/guards'
import { roleHasCapability } from '@/lib/auth/capabilities'

/** Paso 3: revisar la configuracion y activar la rifa (D-202). */
export default async function RaffleReviewPage({
  params,
}: {
  params: Promise<{ raffleId: string }>
}) {
  const { raffleId } = await params
  const membership = await requireStaff()
  const raffle = await getPrizeRaffleContext(raffleId)

  if (!raffle) notFound()
  if (raffle.prizeMode === 'legacy') notFound()

  const canManage = roleHasCapability(membership.role, 'raffles.prizes.manage')
  const prizes = canManage ? await listRafflePrizes(raffle.id) : []

  return (
    <div className="space-y-6">
      <PageHeader
        title={RAFFLE_WIZARD_COPY.reviewTitle}
        description={`${raffle.name} · ${RAFFLE_WIZARD_COPY.reviewDescription}`}
        backHref={`/owner/raffles/${raffle.id}/prizes`}
      />

      <RaffleWizardSteps current={3} />

      {canManage ? (
        <RaffleReview raffle={raffle} prizes={prizes} />
      ) : (
        <Notice tone="neutral">{PRIZE_PANEL_COPY.noCapability}</Notice>
      )}
    </div>
  )
}
