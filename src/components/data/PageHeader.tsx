import type { ReactNode } from 'react'

import { BackButton } from '@/components/data/BackButton'
import { tourTarget } from '@/features/tour/tours'

type PageHeaderProps = {
  title: string
  description?: string
  /**
   * Insignia de estado a la derecha del titulo: «Activo», «Archivado». Va junto
   * al nombre y no perdida en una tarjeta de abajo, porque es lo que cambia el
   * significado de todo lo demas que se ve en la pantalla.
   *
   * Envuelve por su cuenta cuando el nombre es largo: en un telefono, un nombre
   * de tres palabras y la insignia no caben en la misma linea.
   */
  titleBadge?: ReactNode
  actions?: ReactNode
  /**
   * Telefono: la accion principal sube a la MISMA fila que el titulo, en vez de
   * quedar suelta debajo de la descripcion (D-108).
   *
   * Es opcional a proposito. Solo cabe cuando hay UNA accion y el titulo es
   * corto: a 320 px quedan 288 px de ancho y un boton con icono se lleva 132.
   * Una pantalla con dos acciones —«Crear en lote» y «Nueva boleta»— las sigue
   * queriendo debajo. Pensado ademas para pantallas de listado, que no llevan
   * flecha de volver.
   *
   * En escritorio no cambia nada: las acciones ya iban a la derecha del titulo.
   */
  inlineActions?: boolean
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
//
// DOS DISPOSICIONES (D-108). La de siempre apila titulo, descripcion y acciones
// en el telefono. `inlineActions` usa una rejilla en la que el titulo y la
// accion comparten la primera fila y la descripcion ocupa entera la segunda:
// asi la accion sube junto al titulo SIN estrechar la descripcion, que es lo
// que pasaria metiendo las dos en la misma columna. La colocacion automatica de
// CSS hace el resto —la descripcion cae en la fila 2 porque la 1 ya esta
// ocupada—, de modo que no hay que declarar filas a mano.
//
// Se conservan las dos y no una sola generalizada porque el arbol de la de
// siempre lo comparten 27 pantallas, y cualquier retoque las movia a todas.
export function PageHeader({
  title,
  description,
  titleBadge,
  actions,
  inlineActions = false,
  backHref,
  backLabel,
}: PageHeaderProps) {
  // La insignia va JUNTO al `h1`, nunca dentro: el nombre accesible del
  // encabezado tiene que seguir siendo el nombre y nada mas. Y la fila envuelve,
  // de modo que un nombre largo empuja la insignia a la linea de abajo en vez de
  // estrujarla.
  const heading = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <h1 className="min-w-0 text-2xl font-semibold tracking-tight">{title}</h1>
      {titleBadge}
    </div>
  )

  if (inlineActions) {
    return (
      <div
        {...tourTarget('page-header')}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1"
      >
        <div className="col-start-1 row-start-1 flex min-w-0 items-start gap-2">
          {backHref ? <BackButton fallbackHref={backHref} label={backLabel} /> : null}
          {heading}
        </div>

        {description ? (
          <p className="text-muted-foreground col-span-2 text-sm text-pretty sm:col-span-1 sm:col-start-1">
            {description}
          </p>
        ) : null}

        {actions ? (
          <div
            {...tourTarget('page-actions')}
            className="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2"
          >
            {actions}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      {...tourTarget('page-header')}
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex items-start gap-2">
        {backHref ? <BackButton fallbackHref={backHref} label={backLabel} /> : null}
        <div className="min-w-0 space-y-1">
          {heading}
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
      </div>
      {/* El contenedor no impone tamano a las acciones. Una pantalla que quiera
          la fila de ancho completo del telefono se lo pide a SUS botones
          —`h-11 grow md:h-9 md:grow-0`, como hace `/owner/tickets` (D-109)—, y
          asi la decision se lee junto al boton al que afecta en vez de a traves
          de un selector de hijo en el componente que comparten 27 pantallas. */}
      {actions ? (
        <div {...tourTarget('page-actions')} className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
