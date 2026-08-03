'use client'

import { useState, type ReactNode } from 'react'

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

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  pending?: boolean
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
  onConfirm,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground text-sm">{description}</div>
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
            {pending ? 'Procesando...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Estado minimo para abrir/cerrar un ConfirmDialog sin repetirlo en cada pantalla. */
export function useConfirmDialog() {
  const [open, setOpen] = useState(false)
  return { open, setOpen, openDialog: () => setOpen(true), closeDialog: () => setOpen(false) }
}
