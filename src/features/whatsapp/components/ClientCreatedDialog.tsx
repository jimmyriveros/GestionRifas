'use client'

import { CheckIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { INVITE_DIALOG_COPY, inviteBlocker, inviteUrl, type WhatsappSettings } from '../invite'

/**
 * Lo que acaba de pasar. Es lo unico que distingue los dos flujos (BR-W06).
 *
 * `tickets: null` es «Mis clientes → Nuevo cliente»: solo se creo el cliente y
 * el dialogo NO puede mencionar ninguna boleta, porque no hubo ninguna.
 */
export type ClientCreatedOutcome = {
  clientId: string
  clientName: string
  clientPhone: string
  tickets: {
    count: number
    /** Los dos numeros, ya formateados (`ticketLabel`, BR-N11). `null` si son varias. */
    label: string | null
  } | null
}

/**
 * «¡Cliente creado!» / «¡Boleta asignada!», con la salida a WhatsApp (BR-W05).
 *
 * POR QUE ESTE DIALOGO NO SE PUEDE CERRAR SIN QUERER
 *
 * No es un aviso: es una bifurcacion. Quien acaba de registrar un cliente tiene
 * que decidir conscientemente entre terminar o invitarlo al grupo, y un dialogo
 * que se cierra al tocar fuera se cierra solo en un telefono, con el pulgar, sin
 * que nadie haya decidido nada.
 *
 * `AlertDialog` —y no `Dialog`— porque Radix ya le quita las dos salidas
 * accidentales: no trae boton de cerrar en la esquina y no se cierra al pulsar
 * el fondo. La tercera, `Escape`, se bloquea aqui explicitamente. Lo que NO se
 * toca es la trampa de foco ni la navegacion por teclado: se puede recorrer con
 * Tab y las dos acciones son botones de verdad (seccion 4 del encargo).
 *
 * WHATSAPP SOLO SE ABRE CON UN CLIC. Nunca al montar, nunca en un efecto,
 * nunca despues de guardar. Ademas de ser lo que pide el encargo, es lo que
 * hace que el navegador no lo tome por una ventana emergente y lo bloquee
 * (seccion 17).
 *
 * NO CONSULTA NADA AL ABRIRSE. La configuracion llega ya resuelta desde el
 * servidor, con el HTML de la pantalla: abrir este dialogo no dispara ninguna
 * peticion (seccion 21).
 */
export function ClientCreatedDialog({
  outcome,
  settings,
  onClose,
}: {
  /** `null` mientras no hay nada que celebrar: el dialogo esta cerrado. */
  outcome: ClientCreatedOutcome | null
  settings: WhatsappSettings
  /** Que hacer al terminar. Lo decide quien llama: cada flujo va a un sitio. */
  onClose: (outcome: ClientCreatedOutcome) => void
}) {
  const router = useRouter()

  if (outcome === null) return null

  // A una `const` si le dura el estrechamiento dentro de `invite()`. Con el
  // parametro directamente haria falta un `!`, que es lo que este proyecto
  // evita: una asercion no nula es una promesa que nadie comprueba.
  const created = outcome

  const blocker = inviteBlocker(settings, created.clientPhone)
  const url = inviteUrl(settings, created.clientPhone)

  const title =
    created.tickets === null
      ? INVITE_DIALOG_COPY.clientOnly.title
      : INVITE_DIALOG_COPY.withTickets.title(created.tickets.count)

  const body =
    created.tickets === null
      ? INVITE_DIALOG_COPY.clientOnly.body(created.clientName)
      : INVITE_DIALOG_COPY.withTickets.body(
          created.clientName,
          created.tickets.label,
          created.tickets.count,
        )

  function invite() {
    if (url === null) return
    // `noopener` obligatorio: sin el, la pestaña que se abre puede reescribir
    // la nuestra con `window.opener`.
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    // Bloqueado por el navegador. Se dice, en vez de dejar creer que se abrio y
    // que el mensaje salio: la regla de siempre (D-116).
    if (opened === null) {
      toast.error(INVITE_DIALOG_COPY.popupBlocked)
      return
    }
    onClose(created)
  }

  return (
    <AlertDialog open>
      <AlertDialogContent
        // La tercera salida accidental. Las otras dos ya no existen en un
        // AlertDialog: no hay «X» y el fondo no cierra.
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          {/* Los tokens de estado del sistema de diseño, los mismos que pinta
              `StatusBadge` en tono `success`. Ningun color suelto. */}
          <AlertDialogMedia className="bg-status-success-surface text-status-success-icon">
            <CheckIcon aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {body}
            {blocker !== null ? (
              <>
                {' '}
                <span className="block pt-2">{INVITE_DIALOG_COPY.blocked[blocker]}</span>
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/*
          En el telefono los dos botones se apilan y ocupan el ancho —es lo que
          hace `AlertDialogFooter` con `flex-col-reverse`—, asi que «Cerrar»
          queda debajo y la accion principal arriba, bajo el pulgar. Desde `sm`
          vuelven a la fila. Ninguno reduce su diana: los dos son botones del
          sistema de diseño.
        */}
        <AlertDialogFooter>
          {/*
            `size="touch"`: 44 px de alto en el telefono y los 36 de siempre
            desde `sm`. Este dialogo se decide de pie y con una mano, y con el
            tamaño por defecto los dos botones se quedaban en 36 px — por
            debajo de la diana minima (CLAUDE.md 27, seccion 20 del encargo).
            Lo destapo la prueba de 320 px, no la vista.
          */}
          <AlertDialogCancel size="touch" onClick={() => onClose(created)}>
            {INVITE_DIALOG_COPY.close}
          </AlertDialogCancel>

          {blocker === 'sin-grupo' ? (
            // No se ofrece una accion que va a fallar: se cambia por la que
            // lleva a arreglarlo. El cliente ya quedo creado y NO se deshace
            // nada al salir de aqui (seccion 14 del encargo).
            <AlertDialogAction size="touch" onClick={() => router.push('/seller/settings')}>
              {INVITE_DIALOG_COPY.configure}
            </AlertDialogAction>
          ) : blocker === null ? (
            <AlertDialogAction
              size="touch"
              onClick={(event) => {
                // El dialogo lo cierra `invite()` cuando WhatsApp abrio de
                // verdad; si el navegador lo bloqueo se queda abierto para
                // poder reintentar.
                event.preventDefault()
                invite()
              }}
            >
              {INVITE_DIALOG_COPY.invite}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
