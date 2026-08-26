'use client'

import { MoreHorizontalIcon } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ClientOption } from '@/features/clients/queries'
import { BULK_SELECTION_MAX } from '@/lib/constants'

import { resolveTicketSelection } from '../actions'
import { countEligible, type BulkAction } from '../eligibility'
import type { TicketSelectionFiltersInput } from '../schemas'
import { useTicketSelection } from '../TicketSelectionContext'

/**
 * LOS CINCO DIALOGOS LLEGAN APARTE (D-120).
 *
 * Son ~600 lineas que solo hacen falta despues de marcar boletas Y elegir una
 * accion, pero viajaban en el fragmento de «Boletas» —la pantalla que mas se
 * abre y la que mas prisa tiene— y se descargaban aunque nadie seleccionara
 * nada. Con `next/dynamic` cada uno es su propio fragmento.
 *
 * Cargarlos al pulsar dejaria un hueco visible en una conexion lenta, asi que se
 * piden en cuanto hay ALGO seleccionado (`useEffect` mas abajo): a esas alturas
 * la intencion ya esta declarada y quedan varios segundos —los de terminar de
 * marcar— para que lleguen sin que nadie espere.
 */
const BulkApproveDialog = dynamic(() =>
  import('./BulkApproveDialog').then((module) => module.BulkApproveDialog),
)
const BulkAssignDialog = dynamic(() =>
  import('./BulkAssignDialog').then((module) => module.BulkAssignDialog),
)
const BulkCancelDialog = dynamic(() =>
  import('./BulkCancelDialog').then((module) => module.BulkCancelDialog),
)
const BulkChangeSellerDialog = dynamic(() =>
  import('./BulkChangeSellerDialog').then((module) => module.BulkChangeSellerDialog),
)
const BulkDeleteDialog = dynamic(() =>
  import('./BulkDeleteDialog').then((module) => module.BulkDeleteDialog),
)

/** Los que puede necesitar cada portal. El vendedor solo asigna. */
function preloadDialogs(portal: 'owner' | 'seller') {
  if (portal === 'seller') {
    void import('./BulkAssignDialog')
    return
  }
  void import('./BulkApproveDialog')
  void import('./BulkCancelDialog')
  void import('./BulkChangeSellerDialog')
  void import('./BulkDeleteDialog')
}

/**
 * Lo que rodea a la seleccion una vez empezada: contar, revisar y actuar
 * (secciones 4, 10, 12, 13, 14, 15 y 16 del encargo). Entrar y salir del modo
 * es del boton de al lado de «Filtros» (`TicketSelectionModeButton`, D-108).
 *
 * DOS PRESENTACIONES, UNA SOLA LISTA DE ACCIONES. En escritorio los botones van
 * en linea junto a la tabla; en el telefono, en una barra pegada abajo con una
 * accion principal y un menu para el resto, porque cuatro botones pequenos en
 * fila no se aciertan con el pulgar (seccion 14). Las dos leen el mismo arreglo
 * `actions`, asi que no pueden acabar ofreciendo cosas distintas.
 *
 * «LIMPIAR SELECCION» NO ES «LIMPIAR FILTROS» (seccion 12). Este boton vacia la
 * seleccion y no toca la busqueda; el de los filtros vacia la busqueda y no toca
 * la seleccion. Estan separados a proposito y cada uno dice exactamente lo que
 * hace.
 */

type ToolbarAction = {
  key: BulkAction
  label: string
  /** La que se ofrece como boton grande en el telefono. */
  primary?: boolean
  destructive?: boolean
  open: () => void
}

export function TicketSelectionToolbar({
  portal,
  total,
  filters,
  sellers = [],
  clients = [],
  rafflePrices,
}: {
  portal: 'owner' | 'seller'
  /** Boletas que coinciden con los filtros actuales, no las de esta pagina. */
  total: number
  filters: TicketSelectionFiltersInput
  sellers?: { id: string; fullName: string }[]
  clients?: ClientOption[]
  rafflePrices: Record<string, number>
}) {
  const selection = useTicketSelection()
  const [dialog, setDialog] = useState<BulkAction | null>(null)
  /**
   * El ultimo dialogo que se abrio sigue MONTADO despues de cerrarse, para que
   * su animacion de salida termine en vez de desaparecer de golpe. Solo puede
   * haber uno abierto a la vez, asi que basta con recordar cual (D-120).
   */
  const [mountedDialog, setMountedDialog] = useState<BulkAction | null>(null)
  const [resolving, startResolving] = useTransition()

  const count = selection.selectedCount
  const rows = selection.eligibility ?? []

  // Traer los dialogos en cuanto hay algo marcado. Ver la nota de arriba.
  const hasSelection = count > 0
  useEffect(() => {
    if (hasSelection) preloadDialogs(portal)
  }, [hasSelection, portal])

  function openDialog(action: BulkAction) {
    setMountedDialog(action)
    setDialog(action)
  }

  const actions: ToolbarAction[] =
    portal === 'seller'
      ? [
          {
            key: 'assign',
            label: 'Asignar a un cliente',
            primary: true,
            open: () => openDialog('assign'),
          },
        ]
      : [
          { key: 'approve', label: 'Aprobar boletas', open: () => openDialog('approve') },
          {
            key: 'cancel',
            label: 'Anular boletas',
            primary: true,
            destructive: true,
            open: () => openDialog('cancel'),
          },
          {
            key: 'changeSeller',
            label: 'Cambiar vendedor',
            open: () => openDialog('changeSeller'),
          },
          {
            key: 'delete',
            label: 'Eliminar boletas',
            destructive: true,
            open: () => openDialog('delete'),
          },
        ]

  /** «12 seleccionadas · 10 elegibles» (seccion 27). */
  function hint(action: BulkAction): string {
    if (selection.eligibilityLoading || selection.eligibility === null) return ''
    const eligible = countEligible(rows, action)
    if (eligible === count && selection.missingCount === 0) return ''
    return ` (${eligible} de ${count})`
  }

  /**
   * «Seleccionar las 537 boletas» (seccion 16).
   *
   * Nunca es lo que hace la casilla del encabezado: esa marca lo que se ve. Solo
   * despues de este segundo paso, explicito, se considera seleccionada toda la
   * coleccion filtrada.
   */
  function selectAllMatching() {
    startResolving(async () => {
      const result = await resolveTicketSelection(filters)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      selection.addMany(result.data.ids)
      if (result.data.total > result.data.ids.length) {
        toast.warning(
          `Se seleccionaron ${result.data.ids.length} boletas, el máximo que se puede procesar de una vez. Acota los filtros para trabajar con el resto.`,
        )
      }
    })
  }

  // Solo tiene sentido ofrecer el resto si la página entera ya está marcada,
  // hay más de las que se ven y aún cabe alguna más.
  const offerSelectAll =
    selection.pageAllSelected &&
    total > selection.pageIds.length &&
    count < total &&
    !selection.atLimit

  /** Si algo de este bloque tiene contenido visible ahora mismo. */
  const hasStatus = selection.selectionMode || count > 0 || offerSelectAll || selection.atLimit

  return (
    <>
      {/* CUANDO NO HAY NADA QUE DECIR, ESTE BLOQUE SALE DEL FLUJO PERO NO DEL
          DOM (D-108). Desmontarlo dejaria la region `aria-live` sin montar
          justo antes de cambiar, que es cuando un lector de pantalla necesita
          encontrarla; dejarlo visible con el texto vacio sumaba dos huecos de
          24 px entre los filtros y la primera boleta. `sr-only` lo saca del
          flujo y lo conserva anunciable. */}
      <div className={hasStatus ? 'space-y-3' : 'sr-only'}>
        <div className="flex flex-wrap items-center gap-2">
          {/* La entrada al modo seleccion NO se dibuja aqui: vive en la fila de
              «Filtros», que es donde esta su sitio en pantalla (D-108). Ver
              `TicketSelectionModeButton`. */}

          {/* `role="status"` ademas de `aria-live`: el recuento es el unico
              aviso de que marcar una fila hizo algo, y un lector de pantalla
              debe anunciarlo sin robar el foco. */}
          <p className="text-muted-foreground text-sm" role="status" aria-live="polite">
            {count === 0
              ? selection.selectionMode
                ? 'Toca las boletas que quieras seleccionar.'
                : ''
              : `${count} ${count === 1 ? 'seleccionada' : 'seleccionadas'}`}
          </p>

          {count > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => selection.setViewingSelected(!selection.viewingSelected)}
              >
                {selection.viewingSelected ? 'Volver a los resultados' : 'Ver seleccionadas'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={selection.clear}>
                Limpiar selección
              </Button>
            </>
          ) : null}

          {/* Acciones en linea: escritorio (seccion 15). */}
          {count > 0 ? (
            <div className="ml-auto hidden flex-wrap gap-2 md:flex">
              {actions.map((action) => (
                <Button
                  key={action.key}
                  type="button"
                  size="sm"
                  variant={action.destructive ? 'destructive' : 'default'}
                  onClick={action.open}
                >
                  {action.label}
                  {hint(action.key)}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {offerSelectAll ? (
          <div className="bg-muted/50 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
            <span>Están seleccionadas las {selection.pageIds.length} boletas de esta página.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={resolving}
              onClick={selectAllMatching}
            >
              {resolving
                ? 'Seleccionando...'
                : `Seleccionar las ${Math.min(total, BULK_SELECTION_MAX)} boletas del filtro`}
            </Button>
          </div>
        ) : null}

        {selection.atLimit ? (
          <p className="text-muted-foreground text-sm">
            Llegaste al máximo de {BULK_SELECTION_MAX} boletas por operación. Procesa estas y sigue
            con las demás.
          </p>
        ) : null}
      </div>

      {/* Barra pegada abajo: telefono (seccion 14). Deja de estorbar sola
          cuando no hay nada seleccionado.

          Se apoya JUSTO ENCIMA de la barra de navegacion inferior, sin taparla
          (D-106): `--bottom-nav-space` es la misma medida que usa el armazon
          para reservar el hueco, asi que las dos no pueden descuadrarse. Se
          apilan en vez de excluirse porque la seleccion sobrevive al cambio de
          pantalla, y esconder la navegacion mientras hay boletas marcadas
          dejaria al vendedor atrapado en la lista.

          EL HUECO PARA QUE NO TAPE NADA SE PIDE, NO SE DIBUJA (D-110). Basta
          con marcarse `data-selection-bar`: `globals.css` traduce esa marca a
          `--selection-bar-space` y `AppShell` la suma al fondo de la pagina.
          Antes lo reservaba un div vacio de 80 px escrito aqui mismo, y ese es
          el problema: caia donde esta escrito este componente —encima de la
          lista— en vez de al final, asi que abria un hueco en blanco entre el
          recuento y la primera boleta y dejaba la paginacion igual de tapada. */}
      {count > 0 ? (
        /* `contents` NO ES DECORACION (D-110). Este componente se dibuja dentro
           de un `space-y-6`, que separa a sus hijos con un margen inferior, y
           ese margen tambien le tocaba a la barra: en un elemento fijo con
           `bottom`, el margen inferior CUENTA para colocarlo, asi que la barra
           quedaba 24 px por encima de la navegacion y por esa rendija se veia
           pasar la lista. La envoltura recibe el margen y, al no generar caja,
           no hace nada con el; la barra deja de ser hija directa y se posa
           donde dice `bottom`. Se prefiere a un `!important` —que dependeria
           del orden de las utilidades— y a un portal, que la sacaria del orden
           de lectura y de tabulacion, justo detras de los botones que la
           acompanan. */
        <div className="contents">
          <div
            data-selection-bar
            // Areas seguras laterales, por lo mismo que la barra de navegacion
            // de debajo: en horizontal con muesca, el boton principal quedaria
            // parcialmente tapado (D-119). Valen 0 en todo lo demas.
            className="bg-background fixed inset-x-0 bottom-[var(--bottom-nav-space)] z-40 border-t p-3 ps-[calc(0.75rem_+_var(--safe-left))] pe-[calc(0.75rem_+_var(--safe-right))] shadow-lg md:hidden"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums">
                {count} {count === 1 ? 'seleccionada' : 'seleccionadas'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {actions
                  .filter((action) => action.primary)
                  .map((action) => (
                    <Button
                      key={action.key}
                      type="button"
                      size="sm"
                      variant={action.destructive ? 'destructive' : 'default'}
                      onClick={action.open}
                    >
                      {action.label}
                    </Button>
                  ))}
                {actions.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm">
                        <MoreHorizontalIcon className="size-4" aria-hidden />
                        <span className="sr-only">Más acciones</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {actions
                        .filter((action) => !action.primary)
                        .map((action) => (
                          <DropdownMenuItem key={action.key} onSelect={action.open}>
                            {action.label}
                            {hint(action.key)}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/*
        Cada dialogo se monta la primera vez que se abre y se queda montado
        (`mountedDialog`), de modo que sigue habiendo animacion de cierre. Lo que
        cambia frente a antes es que ya no se monta ninguno hasta que hace falta.
      */}
      {mountedDialog === 'approve' ? (
        <BulkApproveDialog
          open={dialog === 'approve'}
          onOpenChange={(open) => setDialog(open ? 'approve' : null)}
        />
      ) : null}
      {mountedDialog === 'cancel' ? (
        <BulkCancelDialog
          open={dialog === 'cancel'}
          onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
        />
      ) : null}
      {mountedDialog === 'changeSeller' ? (
        <BulkChangeSellerDialog
          open={dialog === 'changeSeller'}
          onOpenChange={(open) => setDialog(open ? 'changeSeller' : null)}
          sellers={sellers}
        />
      ) : null}
      {mountedDialog === 'delete' ? (
        <BulkDeleteDialog
          open={dialog === 'delete'}
          onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        />
      ) : null}
      {mountedDialog === 'assign' ? (
        <BulkAssignDialog
          open={dialog === 'assign'}
          onOpenChange={(open) => setDialog(open ? 'assign' : null)}
          clients={clients}
          rafflePrices={rafflePrices}
        />
      ) : null}
    </>
  )
}
