'use client'

import { useState, type ReactNode } from 'react'

import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ticketLabel } from '@/lib/tickets'

import { allEligible, countEligible, ineligibleFor, whyNot, type BulkAction } from '../eligibility'
import type { TicketEligibility } from '../eligibility'

/**
 * Envoltura comun de los dialogos de accion masiva (secciones 27, 28 y 31 del
 * encargo).
 *
 * Hace tres cosas que ninguno de ellos deberia resolver por su cuenta:
 *
 * 1. DECIR QUE VA A PASAR Y SOBRE CUANTAS. Antes de confirmar, la persona ve el
 *    numero y puede desplegar la lista de boletas afectadas.
 * 2. EXPLICAR CUANDO NO SE PUEDE. Si una sola boleta del grupo no admite la
 *    accion, el boton se deshabilita y se dice cuales estorban y por que. No se
 *    ejecuta «sobre las que se pueda»: eso es lo que la seccion 28 prohibe.
 * 3. AVISAR DE LAS QUE YA NO ESTAN. Si entre seleccionar y abrir el dialogo
 *    alguien anulo o elimino una, deja de venir en la respuesta y aqui se
 *    cuenta como incompatible en vez de desaparecer sin mas.
 */

export type BulkActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: BulkAction
  title: string
  /** Una frase: que va a pasar. */
  description: string
  /** Elegibilidad de lo seleccionado. `null` mientras se consulta. */
  eligibility: TicketEligibility[] | null
  loading: boolean
  /** Seleccionadas que ya no existen o dejaron de ser visibles. */
  missingCount: number
  selectedCount: number
  confirmLabel: string
  destructive?: boolean
  pending: boolean
  error: string | null
  /** Campos propios de cada accion: motivo, vendedor, cliente... */
  children?: ReactNode
  /** Requisitos propios del formulario, ademas de la elegibilidad. */
  confirmDisabled?: boolean
  onConfirm: () => void
}

/** A partir de aqui la lista va plegada: un dialogo no debe medir varios metros. */
const INLINE_LIMIT = 12

export function BulkActionDialog({
  open,
  onOpenChange,
  action,
  title,
  description,
  eligibility,
  loading,
  missingCount,
  selectedCount,
  confirmLabel,
  destructive = false,
  pending,
  error,
  children,
  confirmDisabled = false,
  onConfirm,
}: BulkActionDialogProps) {
  const rows = eligibility ?? []
  const blocked = ineligibleFor(rows, action)
  const eligible = countEligible(rows, action)
  const ready = !loading && missingCount === 0 && allEligible(rows, action)

  return (
    <Dialog open={open} onOpenChange={pending ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground py-2 text-sm" aria-live="polite">
            Revisando las boletas seleccionadas...
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" aria-live="polite">
              <strong className="tabular-nums">{selectedCount}</strong> seleccionadas ·{' '}
              <strong className="tabular-nums">{eligible}</strong> se pueden procesar
            </p>

            <TicketList
              rows={rows.filter((row) => row.can[action])}
              emptyLabel="Ninguna de las boletas seleccionadas admite esta acción."
            />

            {/* EL AVISO ES UN `Notice`, Y ES POLITE (D-171). El ambar escrito a
                mano —con su pareja para el modo oscuro— era el tono `warning` del
                sistema con otro nombre, y la geometria `compact` ya coincidia:
                `rounded-md px-3 py-2`.

                Lo que cambia de verdad es el anuncio. Llevaba `role="alert"`, que
                es una region ASERTIVA: interrumpe la lectura en curso, y aqui
                aparecia a la vez que el recuento de arriba —que ya es `polite`—,
                asi que las dos hablaban encima. `live` lo pone en la cola educada
                detras del recuento, que es el orden en el que se leen. Es la
                regla del propio componente, no una excepcion de esta pantalla. */}
            {missingCount > 0 || blocked.length > 0 ? (
              <Notice tone="warning" density="compact" live>
                <div className="space-y-2">
                  <p className="font-medium">No se puede continuar todavía.</p>
                  {blocked.length > 0 ? <BlockedList rows={blocked} action={action} /> : null}
                  {missingCount > 0 ? (
                    <p>
                      {missingCount === 1
                        ? '1 boleta seleccionada ya no está disponible.'
                        : `${missingCount} boletas seleccionadas ya no están disponibles.`}{' '}
                      Quítalas de la selección y vuelve a intentarlo.
                    </p>
                  ) : null}
                </div>
              </Notice>
            ) : null}
          </div>
        )}

        {children}

        {error ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            size="touch"
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            size="touch"
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending || !ready || confirmDisabled}
          >
            {pending ? 'Procesando...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Las boletas afectadas. Pocas se ven; muchas se despliegan (seccion 31). */
function TicketList({ rows, emptyLabel }: { rows: TicketEligibility[]; emptyLabel: string }) {
  const [expanded, setExpanded] = useState(false)

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>
  }

  const collapsed = rows.length > INLINE_LIMIT && !expanded

  return (
    <div className="space-y-2">
      {collapsed ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
          Ver las {rows.length} boletas
        </Button>
      ) : (
        <ul className="max-h-48 overflow-y-auto rounded-md border p-2 text-sm">
          {rows.map((row) => (
            <li key={row.ticketId} className="font-mono tabular-nums">
              {ticketLabel(row)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Las que estorban, cada una con su motivo. Sin motivo no se puede corregir. */
function BlockedList({ rows, action }: { rows: TicketEligibility[]; action: BulkAction }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows : rows.slice(0, 5)

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {visible.map((row) => (
          <li key={row.ticketId}>
            <span className="font-mono tabular-nums">{ticketLabel(row)}</span>
            {' — '}
            {whyNot(row, action)}
          </li>
        ))}
      </ul>
      {!expanded && rows.length > visible.length ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
          Ver las {rows.length} incompatibles
        </Button>
      ) : null}
    </div>
  )
}
