'use client'

import { ExternalLinkIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { saveWhatsappSettings } from '../actions'
import {
  buildInviteMessage,
  DEFAULT_INVITE_MESSAGE,
  INVITE_MESSAGE_MAX_LENGTH,
  isValidGroupUrl,
  WHATSAPP_COPY,
  type WhatsappSettings,
} from '../invite'

/**
 * «Grupo de WhatsApp», dentro de Configuración (BR-W01..BR-W03, D-176).
 *
 * NO USA `react-hook-form` A PROPOSITO, y es la excepcion razonada al patron
 * del proyecto. Son tres campos que se leen entre si en cada pulsacion —la
 * vista previa se rehace con lo que hay escrito, el interruptor decide si el
 * area de texto esta viva, el enlace decide si «Abrir el grupo» aparece— y para
 * eso `useState` es mas corto y mas claro que registrar campos y observarlos.
 * La validacion NO se pierde: `whatsappSettingsSchema` corre en la Server
 * Action, la RPC la repite y el CHECK de la 0050 es el que manda.
 *
 * LA VISTA PREVIA ES LA PIEZA QUE SOSTIENE TODA LA DECISION DEL ENLACE (BR-W04,
 * D-176). Como el enlace del grupo se anade siempre al final y nunca se escribe
 * dentro del texto, la unica forma de que eso no sea una promesa a ciegas es
 * enseñar el mensaje COMPLETO, con el enlace ya puesto, mientras se escribe.
 * Quien lo vea entiende de una sola mirada que no tiene que pegar nada — y si
 * lo pega igual, lo ve duplicado ahi mismo y lo quita.
 */
export function WhatsappSettingsForm({ settings }: { settings: WhatsappSettings }) {
  const [groupUrl, setGroupUrl] = useState(settings.groupUrl ?? '')
  const [useCustom, setUseCustom] = useState(settings.useCustomMessage)
  const [customMessage, setCustomMessage] = useState(settings.customMessage ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const trimmedUrl = groupUrl.trim()
  const urlIsValid = trimmedUrl === '' || isValidGroupUrl(trimmedUrl)
  const messageIsEmpty = useCustom && customMessage.trim() === ''

  /** Lo que de verdad recibiria un cliente ahora mismo. */
  const preview = buildInviteMessage({
    groupUrl: trimmedUrl === '' ? null : trimmedUrl,
    useCustomMessage: useCustom,
    customMessage,
  })

  function save() {
    if (!urlIsValid) {
      setError(WHATSAPP_COPY.groupField.invalid)
      return
    }
    if (messageIsEmpty) {
      setError(WHATSAPP_COPY.messageField.empty)
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await saveWhatsappSettings({
        groupUrl,
        useCustomMessage: useCustom,
        customMessage,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(WHATSAPP_COPY.saved)
    })
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {/* ------------------------------------------------------- El enlace -- */}
      <div className="space-y-1.5">
        <Label htmlFor="whatsapp-group-url">{WHATSAPP_COPY.groupField.label}</Label>
        <Input
          id="whatsapp-group-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={groupUrl}
          onChange={(event) => setGroupUrl(event.target.value)}
          placeholder={WHATSAPP_COPY.groupField.placeholder}
          disabled={isPending}
          aria-invalid={!urlIsValid}
          aria-describedby="whatsapp-group-url-hint"
        />
        <p
          id="whatsapp-group-url-hint"
          className={urlIsValid ? 'text-muted-foreground text-sm' : 'text-destructive text-sm'}
          role={urlIsValid ? undefined : 'alert'}
        >
          {urlIsValid ? WHATSAPP_COPY.groupField.help : WHATSAPP_COPY.groupField.invalid}
        </p>

        {/*
          «Abrir el grupo» solo aparece cuando hay un enlace que abrir de verdad
          — la misma regla que la tarjeta del catalogo (D-161): un boton hacia
          una pagina que no existe es peor que no tener boton. Es un enlace de
          verdad, no un `router.push`: se puede abrir en otra pestaña y tiene
          menu contextual. No guarda nada ni cambia nada.
        */}
        {urlIsValid && trimmedUrl !== '' ? (
          <Button asChild variant="outline" size="sm" className="mt-1">
            <a href={trimmedUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="size-4" aria-hidden />
              {WHATSAPP_COPY.groupField.open}
            </a>
          </Button>
        ) : null}
      </div>

      {/* ------------------------------------------------------ El mensaje -- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="whatsapp-custom-toggle" className="cursor-pointer">
            {WHATSAPP_COPY.messageField.toggle}
          </Label>
          <Switch
            id="whatsapp-custom-toggle"
            checked={useCustom}
            onCheckedChange={(checked) => {
              setUseCustom(checked)
              setError(null)
              // Al encender por primera vez, el area de texto arranca con el
              // mensaje predeterminado: es mucho mas facil retocar un texto que
              // escribir uno en blanco, y evita el area vacia que el propio
              // formulario tendria que rechazar despues.
              if (checked && customMessage.trim() === '') setCustomMessage(DEFAULT_INVITE_MESSAGE)
            }}
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="whatsapp-message">{WHATSAPP_COPY.messageField.label}</Label>
          <Textarea
            id="whatsapp-message"
            // Apagado enseña el predeterminado y no deja escribir: se ve cual es
            // el texto que se esta usando, sin poder cambiarlo por error.
            value={useCustom ? customMessage : DEFAULT_INVITE_MESSAGE}
            onChange={(event) => setCustomMessage(event.target.value)}
            readOnly={!useCustom}
            disabled={isPending}
            rows={6}
            maxLength={INVITE_MESSAGE_MAX_LENGTH}
            aria-invalid={messageIsEmpty}
            aria-describedby="whatsapp-message-hint"
            className={useCustom ? undefined : 'bg-muted text-muted-foreground'}
          />
          <p id="whatsapp-message-hint" className="text-muted-foreground text-sm">
            {useCustom
              ? WHATSAPP_COPY.messageField.customHint
              : WHATSAPP_COPY.messageField.defaultHint}
          </p>

          {useCustom ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                // Vuelve al predeterminado y APAGA el interruptor. Las dos
                // cosas: dejarlo encendido con el texto predeterminado copiado
                // dentro guardaria una copia que dejaria de mejorar cuando
                // mejore el original (seccion 8 del encargo).
                setUseCustom(false)
                setCustomMessage('')
                setError(null)
              }}
            >
              {WHATSAPP_COPY.messageField.restore}
            </Button>
          ) : null}
        </div>
      </div>

      {/* ---------------------------------------------------- Vista previa -- */}
      <div className="space-y-1.5">
        <p className="text-label-medium">{WHATSAPP_COPY.messageField.preview}</p>
        {/*
          `whitespace-pre-wrap` conserva los saltos de linea tal como se
          escribieron. Es un nodo de TEXTO: lo que se escriba arriba no se
          interpreta como HTML aqui ni en ningun otro sitio (seccion 22).
        */}
        <div className="bg-muted/50 text-body-small rounded-md border px-3 py-2 whitespace-pre-wrap">
          {preview}
        </div>
      </div>

      <Button
        type="button"
        size="touch"
        onClick={save}
        disabled={isPending}
        className="w-full sm:w-auto"
      >
        {isPending ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </div>
  )
}
