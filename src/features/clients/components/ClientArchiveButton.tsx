'use client'

import { ArchiveIcon, ArchiveRestoreIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'

import { setClientArchived } from '../actions'

type ClientArchiveButtonProps = {
  clientId: string
  clientName: string
  archived: boolean
  /** Boletas asignadas: se avisa de que el historial se conserva. */
  ticketsCount: number
  /** La ficha del cliente le da el alto y el ancho que necesita el telefono. */
  className?: string
}

/** BR-C06: archivar, nunca eliminar. Es reversible. */
export function ClientArchiveButton({
  clientId,
  clientName,
  archived,
  ticketsCount,
  className,
}: ClientArchiveButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await setClientArchived({ clientId, archived: !archived })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(archived ? 'Cliente restaurado.' : 'Cliente archivado.')
        router.refresh()
      }
      setOpen(false)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className={className}
      >
        {archived ? (
          <ArchiveRestoreIcon className="size-4" aria-hidden />
        ) : (
          <ArchiveIcon className="size-4" aria-hidden />
        )}
        {archived ? 'Restaurar cliente' : 'Archivar cliente'}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={archived ? 'Restaurar cliente' : 'Archivar cliente'}
        description={
          archived
            ? `${clientName} volverá a aparecer en la lista y podrás asignarle boletas de nuevo.`
            : `${clientName} dejará de aparecer al asignar boletas. ${
                ticketsCount > 0
                  ? `Sus ${ticketsCount} boleta(s) y todo su historial se conservan.`
                  : 'Podrás restaurarlo cuando quieras.'
              }`
        }
        confirmLabel={archived ? 'Restaurar' : 'Archivar'}
        pending={isPending}
        onConfirm={confirm}
      />
    </>
  )
}
