import { Suspense } from 'react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { OfflineRetry } from '@/features/pwa/components/OfflineRetry'
import { getWhatsappSettings } from '@/features/whatsapp/queries'

import { WEEKLY_RESULTS_COPY as COPY, weeklyResultsMessage } from '../copy'
import { getWeeklyResults, getWeeklyResultsRaffle } from '../queries'
import { weeklyResultsImageUrl } from '../share'
import { formatWeekLong, weeklyResultsFileName, type ResultsWeek } from '../week'
import { WeeklyResultsShare } from './WeeklyResultsShare'
import { WeeklyResultsSummary } from './WeeklyResultsSummary'

type WeeklyResultsSectionProps = {
  profileId: string
  week: ResultsWeek
}

/**
 * El hueco mientras llegan las lecturas: la semana —que ya se sabe— y la forma
 * de lo que va a llegar. Las barras son decoración; lo que se anuncia es el
 * texto para lector de pantalla, con `aria-busy` (el mismo recurso que D-155).
 */
export function WeeklyResultsFallback({ week }: { week: ResultsWeek }) {
  return (
    <div className="space-y-6" aria-busy="true" data-slot="weekly-results-loading">
      <Card className="gap-4">
        <CardHeader>
          <h2 className="text-heading-h4">{COPY.week.heading(formatWeekLong(week))}</h2>
        </CardHeader>
        <CardContent>
          <span className="sr-only" role="status">
            {COPY.week.loading}
          </span>
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
                  <Skeleton className="h-3 w-40 motion-reduce:animate-none" />
                </div>
                <Skeleton className="h-7 w-16 shrink-0 motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Skeleton
            aria-hidden
            className="mx-auto aspect-[4/5] w-full max-w-sm rounded-xl motion-reduce:animate-none"
          />
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * No se pudo leer: se dice, y se ofrece volver a intentarlo recargando.
 *
 * Solo cae esta sección. La cabecera, la flecha de volver y el resto de
 * Configuración siguen funcionando (BR-H02).
 */
export function WeeklyResultsError() {
  return (
    <Card data-slot="weekly-results-error" className="gap-4">
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-heading-h4">{COPY.week.errorTitle}</h2>
          <p className="text-body-small text-muted-foreground">{COPY.week.errorDescription}</p>
        </div>
        {/* 44 px también desde `sm`: `size="touch"` bajaría a 36 (D-161). */}
        <OfflineRetry href="/seller/settings/weekly-results" className="sm:h-11" />
      </CardContent>
    </Card>
  )
}

/**
 * TRES LECTURAS EN PARALELO, y ninguna genera la imagen: la rifa del catálogo,
 * los seis resultados y el grupo de WhatsApp. El PNG lo pide el navegador DESPUÉS,
 * y solo cuando hay rifa y seis resultados confirmados (BR-H03).
 */
export async function WeeklyResultsContent({ profileId, week }: WeeklyResultsSectionProps) {
  const [raffle, results, whatsapp] = await Promise.all([
    getWeeklyResultsRaffle(profileId),
    getWeeklyResults(week),
    getWhatsappSettings(),
  ])

  if (raffle.kind === 'error' || results.kind === 'error') return <WeeklyResultsError />

  const ready = raffle.kind === 'ready' && results.kind === 'ready'
  const unavailableText =
    raffle.kind === 'none'
      ? COPY.share.previewNoRaffle
      : results.kind === 'pending'
        ? COPY.share.previewPending
        : null

  return (
    <div className="space-y-6">
      <WeeklyResultsSummary
        results={results}
        raffleName={raffle.kind === 'ready' ? raffle.name : null}
      />
      <WeeklyResultsShare
        imageUrl={ready ? weeklyResultsImageUrl(week) : null}
        fileName={weeklyResultsFileName(week)}
        imageAlt={COPY.week.imageAlt(formatWeekLong(week))}
        message={ready ? weeklyResultsMessage(week) : null}
        unavailableText={unavailableText}
        groupUrl={whatsapp.groupUrl}
        copy={COPY.share}
      />
    </div>
  )
}

/**
 * La sección entera, con su propio límite de Suspense: el encabezado de la
 * pantalla se envía sin esperar a ninguna de las tres lecturas.
 */
export function WeeklyResultsSection(props: WeeklyResultsSectionProps) {
  return (
    <Suspense fallback={<WeeklyResultsFallback week={props.week} />}>
      <WeeklyResultsContent {...props} />
    </Suspense>
  )
}
