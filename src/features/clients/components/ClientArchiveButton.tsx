'use client'

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
}

/** BR-C06: archivar, nunca eliminar. Es reversible. */
export function ClientArchiveButton({
  clientId,
  clientName,
  archived,
  ticketsCount,
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
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={isPending}>
        {archived ? 'Restaurar cliente' : 'Archivar cliente'}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={archived ? 'Restaurar cliente' : 'Archivar cliente'}
        description={
          archived
            ? `${clientName} volvera a aparecer en la lista y podras asignarle boletas de nuevo.`
            : `${clientName} dejara de aparecer al asignar boletas. ${
                ticketsCount > 0
                  ? `Sus ${ticketsCount} boleta(s) y todo su historial se conservan.`
                  : 'Podras restaurarlo cuando quieras.'
              }`
        }
        confirmLabel={archived ? 'Restaurar' : 'Archivar'}
        pending={isPending}
        onConfirm={confirm}
      />
    </>
  )
}
