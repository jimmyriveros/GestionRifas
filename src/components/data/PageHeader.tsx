import type { ReactNode } from 'react'

import { tourTarget } from '@/features/tour/tours'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
}

// Marcar aqui el encabezado y sus acciones le da a TODAS las pantallas un punto
// estable al que apuntar desde el recorrido guiado, sin repetir el atributo
// pagina por pagina (src/features/tour/tours.ts).
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div
      {...tourTarget('page-header')}
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {actions ? (
        <div {...tourTarget('page-actions')} className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
