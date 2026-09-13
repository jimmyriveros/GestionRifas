'use client'

import { CopyIcon, ExternalLinkIcon } from 'lucide-react'
import Link from 'next/link'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { PaymentAccount } from '@/features/payment-accounts/accounts'
// Se reutiliza el gancho del catalogo en vez de copiarlo: lo que importa de el
// no es copiar, sino su FALLO —`navigator.clipboard` no existe en contexto
// inseguro y puede estar bloqueado por permisos—, y esa parte ya esta resuelta
// y probada ahi (BR-K13, D-161).
import { useClipboard } from '@/features/catalog/use-clipboard'
import { formatDateTimeEs } from '@/lib/dates'

import { markReminderOccurrenceAttended } from '../actions'
import {
  buildReminderMessage,
  REMINDER_COPY,
  sortOccurrences,
  type PaymentReminderOccurrence,
} from '../reminders'

/**
 * «Para enviar ahora»: el flujo copiar → abrir → atender (BR-S14, D-189).
 *
 * RIFAS NO MANDA NADA A WHATSAPP, y esta pantalla es el sitio donde eso se
 * nota. Prepara el mensaje, lo pone en el portapapeles y abre el grupo; pegar y
 * enviar lo hace una persona con su dedo. Por eso los tres textos describen
 * actos LOCALES y ninguno dice «enviado» ni «entregado» (BR-W08, D-116).
 *
 * El mensaje se compone AQUI, al pintar, con las cuentas que el vendedor tiene
 * ahora mismo (BR-S08): corregir el numero de una cuenta arregla el mensaje que
 * esta esperando, sin tocar el recordatorio ni la ocurrencia.
 *
 * No consulta nada: las ocurrencias llegan del servidor y lo que cambia lo
 * refresca `revalidatePath`. Sin sondeo y sin Realtime (D-185, decision 10).
 *
 * LA TARJETA SE DESTACA con el tono de exito, que es el mismo verde de la
 * marca en claro y en oscuro: es lo unico de la pantalla que pide hacer algo
 * ya. El fondo va al 40 % para que el texto secundario de dentro conserve su
 * contraste, y el mensaje se lee sobre la superficie de una tarjeta normal,
 * que es justo lo que se va a copiar.
 *
 * LOS TRES BOTONES VAN SIEMPRE EN ESTE ORDEN —copiar, abrir o configurar,
 * atender—, que es el orden en que se hacen. En el telefono se apilan a ancho
 * completo, con su diana de 44 px; desde `sm` comparten la fila a partes
 * iguales, y si alguno no cabe baja entero en vez de desbordar.
 */
export function PendingReminderOccurrences({
  occurrences,
  accounts,
  groupUrl,
}: {
  occurrences: PaymentReminderOccurrence[]
  accounts: PaymentAccount[]
  groupUrl: string | null
}) {
  const { copy } = useClipboard()
  const [isPending, startTransition] = useTransition()

  // Sin nada pendiente no se escribe nada: una seccion vacia que dijera «no
  // tienes mensajes por enviar» seria ruido en la pantalla de configuracion.
  if (occurrences.length === 0) return null

  const pending = sortOccurrences(occurrences)

  async function copyMessage(message: string) {
    const ok = await copy(message)
    // Nunca se da por copiado lo que no se copio (D-116).
    if (ok) toast.success(REMINDER_COPY.due.copied)
    else toast.error(REMINDER_COPY.due.copyFailed)
  }

  function openGroup() {
    if (groupUrl === null) return
    // `noopener` obligatorio: sin el, la pestaña que se abre puede reescribir la
    // nuestra con `window.opener`.
    const opened = window.open(groupUrl, '_blank', 'noopener,noreferrer')
    // Bloqueado por el navegador: se dice, en vez de dejar creer que se abrio.
    if (opened === null) toast.error(REMINDER_COPY.due.openBlocked)
  }

  function attend(occurrenceId: string) {
    startTransition(async () => {
      const result = await markReminderOccurrenceAttended({ occurrenceId })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(REMINDER_COPY.due.attended)
    })
  }

  return (
    <section className="space-y-3" aria-labelledby="recordatorios-por-enviar">
      <div className="space-y-1">
        <h2 id="recordatorios-por-enviar" className="text-heading-h4">
          {REMINDER_COPY.due.title}
        </h2>
        <p className="text-body-small text-muted-foreground">{REMINDER_COPY.due.description}</p>
      </div>

      <ul className="space-y-3">
        {pending.map((occurrence) => {
          const message = buildReminderMessage(occurrence.reminder, accounts)

          return (
            <li key={occurrence.id}>
              <Card className="border-status-success-border bg-status-success-surface/40 py-4 sm:py-6">
                <CardContent className="space-y-3 px-4 sm:px-6">
                  {/*
                    `text-balance` reparte la fecha en dos renglones parejos
                    cuando no cabe en uno: sin el, a 320 px la hora se partia
                    entre «p.» y «m.», que se lee como una errata.
                  */}
                  <p className="text-label-medium text-balance">
                    {REMINDER_COPY.due.scheduled(formatDateTimeEs(occurrence.scheduledFor))}
                  </p>

                  {/*
                    `whitespace-pre-wrap` conserva los saltos de linea tal como
                    se escribieron. Es un nodo de TEXTO: nada de lo que el
                    vendedor escriba se interpreta como HTML. `break-words`
                    parte una palabra que no quepa —un enlace pegado, un numero
                    largo— en vez de sacarla de la tarjeta.
                  */}
                  <div className="bg-surface-card text-body-small sm:text-body-medium rounded-md border px-3 py-2 break-words whitespace-pre-wrap">
                    {message}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      type="button"
                      size="touch"
                      className="w-full sm:w-auto sm:flex-1"
                      onClick={() => void copyMessage(message)}
                      disabled={isPending}
                    >
                      <CopyIcon className="size-4" aria-hidden />
                      {REMINDER_COPY.due.copy}
                    </Button>

                    {/*
                      Sin grupo configurado NO se ofrece «Abrir grupo»: se cambia
                      la accion por la que esa persona si puede tomar desde aqui
                      (BR-W05, la misma regla que el dialogo de invitacion).
                    */}
                    {groupUrl === null ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        className="w-full sm:w-auto sm:flex-1"
                        asChild
                      >
                        <Link href="/seller/settings/whatsapp">
                          {REMINDER_COPY.due.noGroupAction}
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        className="w-full sm:w-auto sm:flex-1"
                        onClick={openGroup}
                        disabled={isPending}
                      >
                        <ExternalLinkIcon className="size-4" aria-hidden />
                        {REMINDER_COPY.due.open}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      className="w-full sm:w-auto sm:flex-1"
                      onClick={() => attend(occurrence.id)}
                      disabled={isPending}
                    >
                      {isPending ? REMINDER_COPY.due.attending : REMINDER_COPY.due.attend}
                    </Button>
                  </div>

                  {groupUrl === null ? (
                    <p className="text-body-small text-muted-foreground">
                      {REMINDER_COPY.due.noGroup}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
