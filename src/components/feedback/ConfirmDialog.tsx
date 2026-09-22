'use client'

import { useEffect, useRef, type ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { focusTargetAfterClose, restoreFocus } from '@/components/feedback/restore-focus'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  pending?: boolean
  /**
   * Lo que dice el boton mientras se procesa. El predeterminado sirve para casi
   * todo; se cambia cuando la accion tiene un gerundio propio que dice mas
   * —«Liberando...» (D-169)— que un «Procesando...» generico.
   */
  pendingLabel?: string
  onConfirm: () => void
  /** Contenido extra dentro del dialogo, p. ej. el campo de motivo. */
  children?: ReactNode
  confirmDisabled?: boolean
}

/** Confirmacion de acciones sensibles: anular, desactivar, aprobar (CLAUDE.md 27). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  pending = false,
  pendingLabel = 'Procesando...',
  onConfirm,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  /**
   * Quien tenia el foco justo antes de abrir (I-152).
   *
   * SE APUNTA MIENTRAS EL DIALOGO ESTA CERRADO, no en el momento de abrirlo.
   * Mirar `document.activeElement` desde un efecto no sirve: el efecto del
   * hijo —el contenido de Radix, que enfoca «Cancelar»— corre ANTES que el del
   * padre, asi que lo que se leia era el propio boton del dialogo. Medido.
   *
   * Escuchando `focusin` mientras esta cerrado, el ultimo apuntado es siempre
   * el control de la pantalla que tenia el foco al abrir, sin depender del
   * orden de los efectos. El oyente se quita al abrir: a partir de ahi el foco
   * vive dentro del dialogo y no interesa.
   */
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) return

    const apuntar = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof HTMLElement) openerRef.current = target
    }

    document.addEventListener('focusin', apuntar)
    return () => document.removeEventListener('focusin', apuntar)
  }, [open])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        /*
          Radix devuelve el foco a su `AlertDialogTrigger`, y aqui no hay
          ninguno: el dialogo es controlado. Sin esto, cerrar —cancelar,
          Escape o confirmar— deja el foco en `body`.
        */
        onCloseAutoFocus={(event) => {
          const contenido = document.querySelector('main')
          const target = focusTargetAfterClose(openerRef.current, contenido)
          if (target === null) return
          event.preventDefault()
          // El contenido va tambien como red: si el abridor se desmonta al
          // refrescarse la pantalla, el foco no puede quedarse en `body`.
          restoreFocus(target, contenido)
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground text-body-small">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || confirmDisabled}
            onClick={(event) => {
              // La confirmacion la cierra la accion cuando termina, no el clic:
              // asi el dialogo puede mostrar el estado "procesando".
              event.preventDefault()
              onConfirm()
            }}
            className={cn(destructive && buttonVariants({ variant: 'destructive' }))}
          >
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Estado minimo para abrir/cerrar un ConfirmDialog sin repetirlo en cada pantalla. */
