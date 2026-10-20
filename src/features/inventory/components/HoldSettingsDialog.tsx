'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { saveHoldSettings } from '../actions'
import { INVENTORY_COPY } from '../copy'
import { holdSettingsSchema } from '../schemas'

const C = INVENTORY_COPY.settings

/**
 * Cambiar la duracion y el cupo de los apartados de una rifa (BR-I27).
 *
 * Solo lo monta la pagina cuando quien mira tiene `raffles.holds.manage` —el
 * Dueño—; la accion y `set_raffle_hold_settings` lo vuelven a comprobar. Lo que
 * importa decir antes de guardar es a QUE afecta: a los apartados nuevos. Los
 * vigentes conservan su hora, y bajar el cupo no le quita nada a nadie.
 */
export function HoldSettingsDialog({
  raffleId,
  durationMinutes,
  maxActivePerSeller,
}: {
  raffleId: string
  durationMinutes: number
  maxActivePerSeller: number
}) {
  const router = useRouter()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(String(durationMinutes))
  const [maxActive, setMaxActive] = useState(String(maxActivePerSeller))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setDuration(String(durationMinutes))
      setMaxActive(String(maxActivePerSeller))
      setError(null)
    }
  }

  function save() {
    const parsed = holdSettingsSchema.safeParse({
      raffleId,
      durationMinutes: duration.trim() === '' ? Number.NaN : Number(duration),
      maxActivePerSeller: maxActive.trim() === '' ? Number.NaN : Number(maxActive),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los valores.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await saveHoldSettings(parsed.data)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(C.saved)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="touch" onClick={() => onOpenChange(true)}>
        {C.change}
        {/* Se ve «Cambiar»; se oye qué se cambia (D-114). */}
        <span className="sr-only"> {C.changeSubject}</span>
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{C.dialogTitle}</DialogTitle>
            <DialogDescription>{C.dialogDescription}</DialogDescription>
          </DialogHeader>

          {error ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
            >
              {error}
            </p>
          ) : null}

          <div className="grid gap-4">
            <div className="grid content-start gap-2">
              <Label htmlFor={`${id}-duration`}>{C.durationLabel}</Label>
              <Input
                id={`${id}-duration`}
                type="text"
                inputMode="numeric"
                value={duration}
                onChange={(event) =>
                  setDuration(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))
                }
                aria-describedby={`${id}-duration-hint`}
                disabled={isPending}
              />
              <p id={`${id}-duration-hint`} className="text-muted-foreground text-sm">
                {C.durationHint}
              </p>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor={`${id}-max`}>{C.maxActiveLabel}</Label>
              <Input
                id={`${id}-max`}
                type="text"
                inputMode="numeric"
                value={maxActive}
                onChange={(event) =>
                  setMaxActive(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))
                }
                aria-describedby={`${id}-max-hint`}
                disabled={isPending}
              />
              <p id={`${id}-max-hint`} className="text-muted-foreground text-sm">
                {C.maxActiveHint}
              </p>
            </div>
            <p className="text-muted-foreground text-sm">{C.lowerCapNote}</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              size="touch"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="button" size="touch" onClick={save} disabled={isPending}>
              {isPending ? C.saving : C.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
