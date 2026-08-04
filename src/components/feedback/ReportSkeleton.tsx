import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueleto de una pantalla de reporte: encabezado, selector de reporte,
 * filtros, tarjetas de metricas y tabla (CLAUDE.md §27).
 *
 * Reproduce la ALTURA de lo que va a aparecer para que el contenido no salte
 * cuando termine de cargar.
 */
export function ReportSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-32" />
        ))}
      </div>

      <Skeleton className="h-24 w-full" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  )
}
