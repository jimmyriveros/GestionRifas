import type { ReactNode } from 'react'

import { BackButton } from '@/components/data/BackButton'
import { tourTarget } from '@/features/tour/tours'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  /**
   * Activa la flecha de volver, a la izquierda del titulo. Es el destino de
   * repuesto para cuando no hay una pantalla anterior real en esta sesion:
   * URL abierta directamente, pestana nueva o enlace externo (D-089). Las
   * pantallas de listado no lo pasan y no cambian de aspecto.
   */
  backHref?: string
  /** Nombre accesible del boton, solo si "Volver" a secas no basta. */
  backLabel?: string
}

// Marcar aqui el encabezado y sus acciones le da a TODAS las pantallas un punto
// estable al que apuntar desde el recorrido guiado, sin repetir el atributo
// pagina por pagina (src/features/tour/tours.ts).
export function PageHeader({ title, description, actions, backHref, backLabel }: PageHeaderProps) {
  return (
    <div
      {...tourTarget('page-header')}
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex items-start gap-2">
        {backHref ? <BackButton fallbackHref={backHref} label={backLabel} /> : null}
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
      </div>
      {actions ? (
        <div {...tourTarget('page-actions')} className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
