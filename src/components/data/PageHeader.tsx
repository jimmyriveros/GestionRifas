import type { ReactNode } from 'react'

import { BackButton } from '@/components/data/BackButton'
import {
  CompactActionSlot,
  PageHeaderBack,
  PageHeaderSentinel,
} from '@/components/layout/CompactHeader'
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
   * Accion principal que puede subir a la cabecera fija cuando este encabezado
   * sale de la vista (D-150). Es un contrato explicito: no se deduce de la
   * variante del boton. La misma instancia se mueve con un portal, asi que no
   * hay dos CTAs alcanzables a la vez.
   *
   * Se pinta en el mismo sitio que `actions` mientras el encabezado se ve, y
   * delante de ellas. Si el orden visual tiene que ser otro —p. ej. un boton
   * secundario a la izquierda del CTA—, envuelve el CTA con `CompactActionSlot`
   * dentro de `actions` y no pases esta prop.
   */
  compactAction?: ReactNode
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
  compactAction,
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

  // LA FLECHA SE ALINEA CON LA PRIMERA LINEA DEL TITULO, no con el bloque
  // entero (D-126). Aqui es el sitio: el tamano del titulo se declara tres
  // lineas mas arriba y de el salen los dos numeros.
  //
  //   Vertical. `text-2xl` da una linea de 32 px y el boton mide 44: con la
  //   alineacion al borde superior el icono quedaba 6 px MAS ABAJO que el
  //   texto —medido: centro del icono en y = 102, centro del titulo en y = 96—.
  //   `-my-1.5` saca del flujo esos 6 px de arriba y los 6 de abajo, asi que
  //   para la maquetacion el boton mide los mismos 32 px que la linea y su
  //   centro coincide con el del titulo. Lo que NO cambia es la caja pintada ni
  //   la pulsable: siguen midiendo 44 x 44 (D-085), porque un margen negativo
  //   no encoge el elemento, solo su hueco.
  //
  //   Que sea la PRIMERA linea, y no el centro de todo, es deliberado: el
  //   bloque de la derecha crece con la descripcion y con un titulo de dos
  //   lineas, y una flecha que bajara con el ya no acompanaria al nombre.
  //
  //   Horizontal. El icono mide 20 px dentro de un boton de 44, o sea que se
  //   pinta 12 px por dentro. Sin corregirlo, la flecha empezaba 12 px a la
  //   derecha del margen de la pagina y parecia desplazada respecto de las
  //   tarjetas de abajo; `-ms-3` devuelve esos 12 px y la deja a plomo con
  //   ellas. Con la caja ya descontada, `gap-1` deja 16 px entre la punta de la
  //   flecha y la primera letra —antes 20—, que es lo que hace que se lean como
  //   una sola pieza.
  //
  //   Los margenes negativos van en `PageHeaderBack` (D-150), no en el boton:
  //   el envoltorio es el item del flex y tiene que seguir midiendo 32 px en
  //   el flujo para que la flecha compacta pueda inertizar esta sin romper
  //   la alineacion.
  const back = backHref ? (
    <PageHeaderBack>
      <BackButton fallbackHref={backHref} label={backLabel} />
    </PageHeaderBack>
  ) : null

  const primary = compactAction ? <CompactActionSlot>{compactAction}</CompactActionSlot> : null
  const actionNodes =
    primary || actions ? (
      <>
        {primary}
        {actions}
      </>
    ) : null

  if (inlineActions) {
    return (
      <PageHeaderSentinel
        title={title}
        backHref={backHref}
        backLabel={backLabel}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1"
      >
        <div className="col-start-1 row-start-1 flex min-w-0 items-start gap-1">
          {back}
          {heading}
        </div>

        {description ? (
          <p className="text-muted-foreground col-span-2 text-sm text-pretty sm:col-span-1 sm:col-start-1">
            {description}
          </p>
        ) : null}

        {actionNodes ? (
          <div
            {...tourTarget('page-actions')}
            className="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2"
          >
            {actionNodes}
          </div>
        ) : null}
      </PageHeaderSentinel>
    )
  }

  return (
    <PageHeaderSentinel
      title={title}
      backHref={backHref}
      backLabel={backLabel}
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex items-start gap-1">
        {back}
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
      {actionNodes ? (
        <div {...tourTarget('page-actions')} className="flex flex-wrap items-center gap-2">
          {actionNodes}
        </div>
      ) : null}
    </PageHeaderSentinel>
  )
}
