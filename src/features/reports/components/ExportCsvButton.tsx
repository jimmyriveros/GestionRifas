import { DownloadIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { ReportFilters } from '../schemas'

/**
 * Descarga del reporte visible en CSV (CLAUDE.md §24).
 *
 * Es un enlace normal a un Route Handler, no un boton con JavaScript: la
 * descarga la gestiona el navegador, funciona con «abrir en pestana nueva» y no
 * hay que mantener en memoria un archivo que puede tener decenas de miles de
 * filas.
 *
 * Lleva los MISMOS filtros que la pantalla —salvo `page`, porque el archivo
 * incluye todas las filas—, de modo que lo que se descarga es exactamente lo
 * que se esta viendo.
 */
export function ExportCsvButton({ filters }: { filters: ReportFilters }) {
  const params = new URLSearchParams({ report: filters.report })
  if (filters.raffleId) params.set('raffleId', filters.raffleId)
  if (filters.sellerId) params.set('sellerId', filters.sellerId)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  if (filters.method) params.set('method', filters.method)
  if (filters.status) params.set('status', filters.status)

  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/reports/export?${params.toString()}`} download>
        <DownloadIcon className="size-4" aria-hidden />
        Exportar CSV
      </a>
    </Button>
  )
}
