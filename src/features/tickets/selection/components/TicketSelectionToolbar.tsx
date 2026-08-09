'use client'

import { CheckSquareIcon, MoreHorizontalIcon, XIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
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
import { BulkApproveDialog } from './BulkApproveDialog'
import { BulkAssignDialog } from './BulkAssignDialog'
import { BulkCancelDialog } from './BulkCancelDialog'
import { BulkChangeSellerDialog } from './BulkChangeSellerDialog'
import { BulkDeleteDialog } from './BulkDeleteDialog'

/**
 * Todo lo que rodea a la seleccion: entrar y salir del modo, contar, revisar y
 * actuar (secciones 4, 10, 12, 13, 14, 15 y 16 del encargo).
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
  const [resolving, startResolving] = useTransition()

  const count = selection.selectedCount
  const rows = selection.eligibility ?? []

  const actions: ToolbarAction[] =
    portal === 'seller'
      ? [
          {
            key: 'assign',
            label: 'Asignar a un cliente',
            primary: true,
            open: () => setDialog('assign'),
          },
        ]
      : [
          { key: 'approve', label: 'Aprobar boletas', open: () => setDialog('approve') },
          {
            key: 'cancel',
            label: 'Anular boletas',
            primary: true,
            destructive: true,
            open: () => setDialog('cancel'),
          },
          {
            key: 'changeSeller',
            label: 'Cambiar vendedor',
            open: () => setDialog('changeSeller'),
          },
          {
            key: 'delete',
            label: 'Eliminar boletas',
            destructive: true,
            open: () => setDialog('delete'),
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

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Entrada visible al modo seleccion. Solo en el telefono: en
              escritorio la columna de casillas ya esta siempre (seccion 4). */}
          {selection.selectionMode ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={selection.exitSelectionMode}
            >
              <XIcon className="size-4" aria-hidden />
              Cancelar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={() => selection.startSelectionMode()}
            >
              <CheckSquareIcon className="size-4" aria-hidden />
              Seleccionar
            </Button>
          )}

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
            <span>
              Están seleccionadas las {selection.pageIds.length} boletas de esta página.
            </span>
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
          cuando no hay nada seleccionado. */}
      {count > 0 ? (
        <>
          {/* Hueco para que la ultima fila no quede tapada por la barra. */}
          <div className="h-20 md:hidden" aria-hidden />
          <div className="bg-background fixed inset-x-0 bottom-0 z-40 border-t p-3 shadow-lg md:hidden">
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
        </>
      ) : null}

      {portal === 'owner' ? (
        <>
          <BulkApproveDialog
            open={dialog === 'approve'}
            onOpenChange={(open) => setDialog(open ? 'approve' : null)}
          />
          <BulkCancelDialog
            open={dialog === 'cancel'}
            onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
          />
          <BulkChangeSellerDialog
            open={dialog === 'changeSeller'}
            onOpenChange={(open) => setDialog(open ? 'changeSeller' : null)}
            sellers={sellers}
          />
          <BulkDeleteDialog
            open={dialog === 'delete'}
            onOpenChange={(open) => setDialog(open ? 'delete' : null)}
          />
        </>
      ) : (
        <BulkAssignDialog
          open={dialog === 'assign'}
          onOpenChange={(open) => setDialog(open ? 'assign' : null)}
          clients={clients}
          rafflePrices={rafflePrices}
        />
      )}
    </>
  )
}
