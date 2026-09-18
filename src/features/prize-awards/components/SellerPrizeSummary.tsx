import Link from 'next/link'

import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'

import { PRIZE_AWARDS_COPY as COPY } from '../copy'
import type { PrizeAwardTotalsResult } from '../queries'
import { prizeAwardsHref } from '../schemas'
import { PrizeAwardsSummary } from './PrizeAwardsSummary'

/**
 * Los premios de UN vendedor, en su ficha del portal administrativo (D-208,
 * Etapa 2; BR-J21).
 *
 * Los mismos cuatro indicadores del historial, calculados por
 * `admin_prize_award_totals` con el filtro del vendedor —también de uno
 * desactivado—. «Clientes con premio» es un NÚMERO: el personal no recibe
 * ningún dato de esos clientes, ni aquí ni en el historial al que lleva el
 * enlace.
 */
export function SellerPrizeSummary({
  sellerId,
  result,
}: {
  sellerId: string
  result: PrizeAwardTotalsResult
}) {
  return (
    <section
      data-slot="seller-prize-summary"
      aria-labelledby="seller-prizes-title"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="seller-prizes-title" className="text-lg font-semibold">
          {COPY.sellerSummary.title}
        </h2>
        {result.kind === 'ready' ? (
          <Button asChild variant="outline" size="touch">
            <Link href={prizeAwardsHref('/owner/prizes', { sellerId })}>
              {COPY.sellerSummary.link}
            </Link>
          </Button>
        ) : null}
      </div>

      {result.kind === 'ready' ? (
        <PrizeAwardsSummary totals={result.totals} />
      ) : (
        <Notice tone="neutral">{COPY.sellerSummary.error}</Notice>
      )}
    </section>
  )
}
