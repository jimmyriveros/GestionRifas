import { PageHeader } from '@/components/data/PageHeader'
import { WeeklyResultsSection } from '@/features/weekly-results/components/WeeklyResultsSection'
import { WEEKLY_RESULTS_COPY } from '@/features/weekly-results/copy'
import { lastCompletedWeek } from '@/features/weekly-results/week'
import { requireRole } from '@/lib/auth/guards'
import { todayBogota } from '@/lib/dates'

/**
 * «Resultados de la semana» (BR-H01..BR-H08, D-194).
 *
 * El vendedor ve los seis números mayores de la última semana terminada, la
 * imagen lista para su grupo y el mensaje que la acompaña. Rifas prepara las dos
 * cosas y abre las herramientas del teléfono; quien envía es la persona (BR-W08).
 *
 * EL ENCABEZADO NO ESPERA: la semana se calcula aquí, sin consultar nada, y el
 * resto llega por su propio límite de Suspense con un hueco accesible mientras
 * tanto —el mismo recurso que el recuadro de loterías del panel (D-155)—.
 *
 * El layout de este portal ya exige el rol; se vuelve a pedir aquí porque hace
 * falta el `profileId` y la función está memoizada por petición.
 */
export default async function WeeklyResultsPage() {
  const membership = await requireRole(['seller'])
  const week = lastCompletedWeek(todayBogota())

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={WEEKLY_RESULTS_COPY.title}
        description={WEEKLY_RESULTS_COPY.description}
        backHref="/seller/settings"
        backLabel="Volver a Configuración"
      />

      <WeeklyResultsSection profileId={membership.profileId} week={week} />
    </div>
  )
}
