import { AwardIcon } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

import { PRIZE_AWARDS_COPY as COPY, clientPrizeSummaryLine } from '../copy'
import type { PrizeAwardTotalsResult } from '../queries'
import { prizeAwardsHref } from '../schemas'

/**
 * Los premios de UN cliente, en su ficha (D-208, Etapa 2).
 *
 * UN RESUMEN, NO EL HISTORIAL. Cuántos premios, cuánto dinero cierto y cuántos
 * con el valor pendiente, en una línea; el detalle vive en «Premios ganados»,
 * y «Ver premios» lleva allí ya filtrado por este cliente. Duplicar la lista
 * aquí sería tener dos versiones de lo mismo.
 *
 * Las cifras las calcula `seller_prize_award_totals` con el filtro del cliente:
 * aquí solo se escriben. Un fallo se dice como fallo —nunca «sin premios»— y
 * sin enlace, que llevaría a una pantalla que tampoco sabría contestar.
 */
export function ClientPrizeSummary({
  clientId,
  clientName,
  result,
}: {
  clientId: string
  clientName: string
  result: PrizeAwardTotalsResult
}) {
  const hasPrizes = result.kind === 'ready' && result.totals.prizes > 0
  const line =
    result.kind === 'error'
      ? COPY.clientSummary.error
      : hasPrizes
        ? clientPrizeSummaryLine(result.totals)
        : COPY.clientSummary.none

  return (
    <Card data-slot="client-prize-summary" className="gap-0 py-0">
      <CardContent className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5"
            aria-hidden
          >
            <AwardIcon />
          </span>
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-heading-h4">{COPY.clientSummary.title}</h2>
            <p className="text-muted-foreground text-sm break-words">{line}</p>
          </div>
        </div>

        {hasPrizes ? (
          <Button asChild variant="outline" size="touch" className="w-full sm:w-auto">
            <Link
              href={prizeAwardsHref('/seller/prizes', { clientId })}
              aria-label={COPY.clientSummary.linkLabel(clientName)}
            >
              {COPY.clientSummary.link}
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
