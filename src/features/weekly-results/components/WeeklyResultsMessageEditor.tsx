'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { saveWeeklyResultsMessage } from '../actions'
import type { WeeklyResultsShareCopy } from '../copy'
import { WEEKLY_RESULTS_MESSAGE_MAX_LENGTH } from '../message'

/**
 * El mensaje propio, dentro de «Mensaje para tu grupo» (BR-H09, D-197).
 *
 * ES EL PATRÓN DE `WhatsappSettingsForm` Y DEL MENSAJE DE LOS RECORDATORIOS, sin
 * mezclar sus dominios: un interruptor, un área de texto que apagada enseña el
 * predeterminado sin dejar escribir, «Volver al mensaje predeterminado» y
 * «Guardar cambios». Tampoco usa `react-hook-form`, por lo mismo que aquel: son
 * dos campos que se leen entre sí en cada pulsación.
 *
 * EL TEXTO NO ES ESTADO SUYO. Vive en `WeeklyResultsShare`, porque lo usan la
 * vista previa, «Copiar mensaje» y «Compartir imagen»: así lo que se ve, lo que
 * se copia y lo que se comparte son UNA cadena. Aquí solo viven el error y el
 * guardado.
 *
 * NADA SE DA POR GUARDADO SIN QUE EL SERVIDOR LO DIGA (D-116): el aviso de éxito
 * sale solo con `ok`, y un fallo de red se explica sin tumbar la pantalla. La
 * frase del mensaje vacío se adelanta aquí; la que manda es la de la acción, la
 * RPC y el CHECK.
 */
export function WeeklyResultsMessageEditor({
  labelledBy,
  defaultMessage,
  useCustomMessage,
  customMessage,
  onUseCustomMessageChange,
  onCustomMessageChange,
  copy,
}: {
  /** El `id` del título de la sección, que nombra también el área de texto. */
  labelledBy: string
  /** `weeklyResultsMessage(week)`, ya compuesto en el servidor. */
  defaultMessage: string
  useCustomMessage: boolean
  customMessage: string
  onUseCustomMessageChange: (value: boolean) => void
  onCustomMessageChange: (value: string) => void
  copy: WeeklyResultsShareCopy
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const toggleId = `${labelledBy}-propio`
  const hintId = `${labelledBy}-ayuda`
  const errorId = `${labelledBy}-error`
  const messageIsEmpty = useCustomMessage && customMessage.trim() === ''

  function toggle(checked: boolean) {
    onUseCustomMessageChange(checked)
    setError(null)
    // Al encender sin texto propio se arranca con el predeterminado que se está
    // viendo: retocar un texto es más fácil que escribirlo en blanco. Apagar no
    // borra nada, así que encender otra vez devuelve lo escrito.
    if (checked && customMessage.trim() === '') onCustomMessageChange(defaultMessage)
  }

  function restore() {
    // Apaga el interruptor Y vacía el texto. Dejar guardada una copia del
    // predeterminado congelaría su fecha y dejaría de recibir las mejoras de la
    // redacción (BR-H06).
    onUseCustomMessageChange(false)
    onCustomMessageChange('')
    setError(null)
  }

  function save() {
    if (messageIsEmpty) {
      setError(copy.messageEmpty)
      return
    }
    setError(null)

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveWeeklyResultsMessage>>
      try {
        result = await saveWeeklyResultsMessage({ useCustomMessage, customMessage })
      } catch {
        // Sin respuesta no se sabe si guardó: se dice, y lo escrito sigue en el
        // campo para volver a intentarlo.
        setError(copy.messageSaveFailed)
        return
      }
      if ('error' in result) {
        setError(result.error)
        return
      }
      // Lo que quedó guardado, recortado por el servidor: la pantalla enseña eso
      // y no una suposición.
      onUseCustomMessageChange(result.data.useCustomMessage)
      onCustomMessageChange(result.data.customMessage ?? '')
      toast.success(copy.messageSaved)
    })
  }

  return (
    <div className="space-y-3" data-slot="weekly-results-message-editor">
      {/*
        La etiqueta ocupa la fila entera y envuelve el interruptor: tocar
        cualquier punto de sus 44 px lo cambia, aunque el interruptor se vea
        pequeño (la misma idea que `SelectionCheckbox`).
      */}
      <Label
        htmlFor={toggleId}
        className="min-h-11 cursor-pointer justify-between gap-3"
        data-slot="weekly-results-message-toggle"
      >
        <span>{copy.messageToggle}</span>
        <Switch
          id={toggleId}
          checked={useCustomMessage}
          onCheckedChange={toggle}
          disabled={isPending}
        />
      </Label>

      <div className="space-y-1.5">
        <Textarea
          aria-labelledby={labelledBy}
          aria-describedby={error === null ? hintId : `${hintId} ${errorId}`}
          aria-invalid={messageIsEmpty}
          // Apagado enseña el predeterminado y no deja escribir: se ve cuál es el
          // mensaje que se está usando, sin poder cambiarlo por error.
          value={useCustomMessage ? customMessage : defaultMessage}
          onChange={(event) => {
            onCustomMessageChange(event.target.value)
            if (error !== null) setError(null)
          }}
          readOnly={!useCustomMessage}
          disabled={isPending}
          rows={6}
          maxLength={WEEKLY_RESULTS_MESSAGE_MAX_LENGTH}
          className={cn(!useCustomMessage && 'bg-muted text-muted-foreground')}
        />
        <p id={hintId} className="text-body-small text-muted-foreground">
          {useCustomMessage ? copy.messageCustomHint : copy.messageDefaultHint}
        </p>
        {error === null ? null : (
          <p
            id={errorId}
            role="alert"
            className="bg-destructive/10 text-destructive text-body-small rounded-md px-3 py-2"
          >
            {error}
          </p>
        )}
      </div>

      {/* Diana de 44 px en todos los anchos, como el resto de la sección (D-161). */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          disabled={isPending}
          onClick={save}
        >
          {isPending ? copy.messageSaving : copy.messageSave}
        </Button>
        {useCustomMessage ? (
          // A 320 px la frase no cabe en una línea: se parte, no se desborda.
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-11 w-full text-center whitespace-normal sm:w-auto"
            disabled={isPending}
            onClick={restore}
          >
            {copy.messageRestore}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
