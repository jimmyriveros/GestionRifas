'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'

import { REPORT_LABELS, type ReportKey } from '../schemas'

/**
 * Selector de reporte.
 *
 * Son ENLACES, no pestanas con estado de React: cada reporte es una direccion
 * distinta que se puede compartir, guardar en favoritos y abrir en otra pestana.
 * Al cambiar de reporte se conservan los filtros que ese reporte entiende y se
 * descarta la pagina, que ya no significa lo mismo.
 */
export function ReportNav({
  reports,
  current,
  basePath,
}: {
  reports: readonly ReportKey[]
  current: ReportKey
  basePath: string
}) {
  const searchParams = useSearchParams()

  function hrefFor(report: ReportKey): string {
    const params = new URLSearchParams(searchParams.toString())
    params.set('report', report)
    params.delete('page')
    return `${basePath}?${params.toString()}`
  }

  return (
    <nav aria-label="Reportes disponibles">
      <ul className="flex w-full gap-2 overflow-x-auto pb-1">
        {reports.map((report) => {
          const isCurrent = report === current
          return (
            <li key={report}>
              <Link
                href={hrefFor(report)}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'inline-flex rounded-md border px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                  isCurrent
                    ? 'bg-primary text-primary-foreground border-primary font-medium hover:bg-primary/90'
                    : 'hover:bg-muted',
                )}
              >
                {REPORT_LABELS[report]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
