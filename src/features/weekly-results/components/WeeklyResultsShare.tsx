'use client'

import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  Share2Icon,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { isShareCancelled } from '@/features/catalog/share'
import { useClipboard } from '@/features/catalog/use-clipboard'
import { OfflineRetry } from '@/features/pwa/components/OfflineRetry'
import { isValidGroupUrl } from '@/features/whatsapp/invite'
import { cn } from '@/lib/utils'

import type { WeeklyResultsShareCopy } from '../copy'
import {
  activeWeeklyResultsMessage,
  EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS,
  type WeeklyResultsMessageSettingsResult,
} from '../message'
import { canShareFile, imageShareData, saveFile } from '../share'
import { WeeklyResultsMessageEditor } from './WeeklyResultsMessageEditor'

type ImageState =
  | { kind: 'unavailable' }
  | { kind: 'loading' }
  | { kind: 'ready'; blob: Blob; url: string; shareable: boolean }
  | { kind: 'failed' }

/**
 * Imagen, mensaje y grupo: lo que el vendedor manda a su grupo (BR-H06, BR-H07,
 * BR-H09).
 *
 * LA IMAGEN SE PIDE UNA SOLA VEZ y se guarda en memoria. La vista previa, el
 * botón de compartir y el de descargar usan ESE mismo archivo, así que lo que se
 * descarga es exactamente lo que se está viendo, byte a byte, y no una segunda
 * composición.
 *
 * COMPARTIR NECESITA EL GESTO de la persona: `navigator.share()` se llama dentro
 * del clic y sin esperar a nada, o Safari lo rechaza. Por eso el botón se activa
 * cuando la imagen ya está en memoria. Descargar, en cambio, sí puede esperar: si
 * se pulsa mientras llega, dice «Descargando…» y la guarda en cuanto está.
 *
 * EL MENSAJE ES UNA SOLA CADENA (D-197). El predeterminado de la semana llega ya
 * escrito, y si el vendedor usa uno propio, ese lo sustituye entero. El texto
 * vive aquí y no en el editor porque lo leen tres cosas —la vista previa,
 * «Copiar mensaje» y «Compartir imagen»— y las tres usan exactamente la misma,
 * esté guardada o no: lo que se ve es lo que se copia y lo que se comparte.
 *
 * NADA SE DA POR HECHO SIN QUE OCURRA (D-116, BR-W08). Cancelar el menú no es un
 * error y no se avisa; un fallo de verdad lo dice y propone descargar. Ningún
 * texto dice que algo se envió: Rifas abre el menú del teléfono, y quien elige el
 * chat y envía es la persona.
 */
export function WeeklyResultsShare({
  imageUrl,
  fileName,
  imageAlt,
  defaultMessage,
  messageReady,
  messageSettings,
  unavailableText,
  groupUrl,
  copy,
}: {
  /** `null` cuando no hay imagen que pedir: sin rifa o sin los seis resultados. */
  imageUrl: string | null
  fileName: string
  imageAlt: string
  /** `weeklyResultsMessage(week)`, ya compuesto. Solo depende de la semana: siempre existe. */
  defaultMessage: string
  /**
   * `false` mientras falten la rifa o los seis resultados. El mensaje se puede
   * preparar igual, pero no se presenta como listo, ni se copia, ni se comparte
   * (BR-H03).
   */
  messageReady: boolean
  /** La configuración del mensaje del vendedor, o que no se pudo leer (BR-H09). */
  messageSettings: WeeklyResultsMessageSettingsResult
  /** Por qué no hay imagen, cuando no la hay. */
  unavailableText: string | null
  groupUrl: string | null
  copy: WeeklyResultsShareCopy
}) {
  const [image, setImage] = useState<ImageState>(
    imageUrl === null ? { kind: 'unavailable' } : { kind: 'loading' },
  )
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState<'sharing' | 'downloading' | null>(null)
  const downloadWhenReady = useRef(false)
  const { copy: copyText, copied } = useClipboard()

  // Sin la configuración leída se usa el predeterminado y el editor no se
  // ofrece: guardar desde ahí pisaría un mensaje propio que nadie ha visto.
  const initialMessage =
    messageSettings.kind === 'ready'
      ? messageSettings.settings
      : EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS
  const [useCustomMessage, setUseCustomMessage] = useState(initialMessage.useCustomMessage)
  const [customMessage, setCustomMessage] = useState(initialMessage.customMessage ?? '')

  /** Lo que se ve, se copia y se comparte. `null` mientras la semana no esté lista. */
  const message = messageReady
    ? activeWeeklyResultsMessage({ useCustomMessage, customMessage }, defaultMessage)
    : null

  useEffect(() => {
    if (imageUrl === null) return
    const controller = new AbortController()
    let objectUrl: string | null = null

    void fetch(imageUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !type.startsWith('image/png')) throw new Error('imagen no disponible')
        const blob = await response.blob()
        if (controller.signal.aborted) return

        const url = URL.createObjectURL(blob)
        objectUrl = url
        const shareable = canShareFile(navigator, new File([blob], fileName, { type: 'image/png' }))
        setImage({ kind: 'ready', blob, url, shareable })

        if (downloadWhenReady.current) {
          downloadWhenReady.current = false
          saveFile(url, fileName)
          setBusy(null)
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setImage({ kind: 'failed' })
        if (downloadWhenReady.current) {
          downloadWhenReady.current = false
          setBusy(null)
          toast.error(copy.previewFailed)
        }
      })

    return () => {
      controller.abort()
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [imageUrl, fileName, attempt, copy.previewFailed])

  function retry() {
    setImage({ kind: 'loading' })
    setAttempt((current) => current + 1)
  }

  function share() {
    if (image.kind !== 'ready' || !image.shareable || message === null) return
    const file = new File([image.blob], fileName, { type: 'image/png' })
    setBusy('sharing')
    navigator
      .share(imageShareData(navigator, file, copy.shareTitle, message))
      .catch((error: unknown) => {
        // Cerrar el menú a propósito no es un error: ni se avisa ni se descarga nada.
        if (!isShareCancelled(error)) toast.error(copy.shareFailed)
      })
      .finally(() => setBusy(null))
  }

  function download() {
    if (image.kind === 'ready') {
      saveFile(image.url, fileName)
      return
    }
    if (image.kind !== 'loading') return
    downloadWhenReady.current = true
    setBusy('downloading')
  }

  async function copyMessage() {
    if (message === null) return
    // Nunca se da por copiado lo que no se copió (D-116, BR-K13).
    if (await copyText(message)) toast.success(copy.copied)
    else toast.error(copy.copyFailed)
  }

  const shareUnavailable = image.kind === 'ready' && !image.shareable
  const canShareNow = image.kind === 'ready' && image.shareable && message !== null && busy === null
  const group = groupUrl !== null && isValidGroupUrl(groupUrl) ? groupUrl : null

  // Lo que oye quien no ve la pantalla. El texto visible de «sin imagen» ya se
  // lee en su sitio; aquí solo lo que CAMBIA mientras se trabaja.
  const announcement =
    busy === 'sharing'
      ? copy.sharing
      : busy === 'downloading'
        ? copy.downloading
        : image.kind === 'loading'
          ? copy.previewLoading
          : image.kind === 'ready'
            ? copy.previewReady
            : image.kind === 'failed'
              ? copy.previewFailed
              : ''

  return (
    <Card data-slot="weekly-results-share" className="gap-4">
      <CardHeader className="space-y-1">
        <h2 className="text-heading-h4">{copy.title}</h2>
        <p className="text-body-small text-muted-foreground">{copy.description}</p>
      </CardHeader>

      <CardContent className="space-y-6">
        <p className="sr-only" role="status">
          {announcement}
        </p>

        <section className="space-y-3" aria-labelledby="resultados-semana-imagen">
          <h3 id="resultados-semana-imagen" className="text-label-medium">
            {copy.imageTitle}
          </h3>

          {/*
            4:5 siempre, del ancho que haya: a 320 px la vista previa ocupa la
            tarjeta entera y en escritorio no pasa de `max-w-sm`, para que la
            imagen no empuje los botones fuera de la pantalla.
          */}
          <div
            data-slot="weekly-results-preview"
            data-state={image.kind}
            aria-busy={image.kind === 'loading'}
            className="bg-surface-skeleton relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-xl border"
          >
            {image.kind === 'ready' ? (
              <Image
                src={image.url}
                alt={imageAlt}
                fill
                unoptimized
                sizes="(min-width: 640px) 384px, 100vw"
                className="object-cover"
              />
            ) : null}

            {image.kind === 'loading' ? (
              <>
                <Skeleton
                  className="absolute inset-0 rounded-none motion-reduce:animate-none"
                  aria-hidden
                />
                <p
                  aria-hidden
                  className="text-body-small text-muted-foreground absolute inset-0 flex items-center justify-center p-6 text-center"
                >
                  {copy.previewLoading}
                </p>
              </>
            ) : null}

            {image.kind === 'unavailable' ? (
              <p className="text-body-small text-muted-foreground absolute inset-0 flex items-center justify-center p-6 text-center text-balance">
                {unavailableText}
              </p>
            ) : null}

            {image.kind === 'failed' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-body-small text-balance">{copy.previewFailed}</p>
                <Button type="button" variant="outline" className="h-11" onClick={retry}>
                  <RefreshCwIcon aria-hidden />
                  {copy.retry}
                </Button>
              </div>
            ) : null}
          </div>

          {/*
            Diana de 44 px en TODOS los anchos (`h-11`), no `size="touch"`, que
            baja a 36 px desde `sm`: esta pantalla se usa con el teléfono en la
            mano, y no solo en el teléfono (D-161).
          */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shareUnavailable ? null : (
              <Button type="button" className="h-11 w-full" disabled={!canShareNow} onClick={share}>
                <Share2Icon aria-hidden />
                {busy === 'sharing' ? copy.sharing : copy.shareImage}
              </Button>
            )}
            <Button
              type="button"
              variant={shareUnavailable ? 'default' : 'outline'}
              className={cn('h-11 w-full', shareUnavailable && 'sm:col-span-2')}
              disabled={image.kind === 'unavailable' || image.kind === 'failed' || busy !== null}
              onClick={download}
            >
              <DownloadIcon aria-hidden />
              {busy === 'downloading' ? copy.downloading : copy.downloadImage}
            </Button>
          </div>

          {shareUnavailable ? (
            <Notice tone="info" density="compact">
              {copy.shareUnavailable}
            </Notice>
          ) : null}
        </section>

        <section className="space-y-3" aria-labelledby="resultados-semana-mensaje">
          <h3 id="resultados-semana-mensaje" className="text-label-medium">
            {copy.messageTitle}
          </h3>

          {/*
            El mensaje se puede preparar aunque la semana no esté lista: el texto
            no depende de los resultados. Lo que espera es la vista previa, copiar
            y compartir (BR-H03, BR-H09).
          */}
          {messageSettings.kind === 'ready' ? (
            <WeeklyResultsMessageEditor
              labelledBy="resultados-semana-mensaje"
              defaultMessage={defaultMessage}
              useCustomMessage={useCustomMessage}
              customMessage={customMessage}
              onUseCustomMessageChange={setUseCustomMessage}
              onCustomMessageChange={setCustomMessage}
              copy={copy}
            />
          ) : (
            <Notice
              tone="warning"
              density="compact"
              action={<OfflineRetry href="/seller/settings/weekly-results" className="sm:h-11" />}
            >
              {copy.messageLoadFailed}
            </Notice>
          )}

          {message === null ? (
            <p className="text-body-small text-muted-foreground">{copy.messagePending}</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-body-small text-muted-foreground">{copy.messagePreview}</p>
              {/* Nodo de TEXTO con sus saltos de línea: nada se interpreta como HTML. */}
              <div
                data-slot="weekly-results-message"
                className="bg-surface-card text-body-small sm:text-body-medium rounded-md border px-3 py-2 break-words whitespace-pre-wrap"
              >
                {message}
              </div>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full sm:w-auto"
            disabled={message === null}
            onClick={() => void copyMessage()}
          >
            {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
            {copy.copyMessage}
          </Button>
        </section>

        <section className="space-y-3 border-t pt-4" aria-label={copy.groupLabel}>
          {group === null ? (
            <>
              <p className="text-body-small text-muted-foreground">{copy.noGroup}</p>
              <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
                <Link href="/seller/settings/whatsapp">{copy.configureGroup}</Link>
              </Button>
            </>
          ) : (
            // Un enlace de verdad a otra pestaña, con `noopener noreferrer`: la
            // pestaña del grupo no puede tocar esta ni saber de dónde viene.
            <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
              <a href={group} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon aria-hidden />
                {copy.openGroup}
              </a>
            </Button>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
