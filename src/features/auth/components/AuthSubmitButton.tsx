'use client'

import { useSyncExternalStore, type ReactNode } from 'react'

import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'

/**
 * El botón de enviar de los formularios de acceso y de contraseña (I-204, D-247).
 *
 * QUÉ IMPIDE. Estos formularios se envían con `onSubmit` de react-hook-form, que solo existe
 * cuando React ha hidratado. Antes, pulsar antes de eso hacía el envío NATIVO del navegador por
 * GET y la contraseña quedaba en la dirección (`/login?email=…&password=…`): en el historial y en
 * los registros. Por eso la protección tiene que estar en el HTML del SERVIDOR, no en un manejador:
 *
 *   · el botón llega DESACTIVADO, y un botón por defecto desactivado impide también el envío con
 *     Enter desde un campo (es la regla del envío implícito de HTML);
 *   · cada formulario lleva además `method="post"`: si algo lo enviara de forma nativa —una
 *     extensión que llama a `form.submit()`—, los datos viajarían en el cuerpo, nunca en la URL.
 *
 * QUÉ SE VE. Mientras no está listo, el botón dice «Preparando el formulario…»: es la misma regla
 * del «Ingresando…» de siempre, dentro del botón, así que nada se mueve al activarse. Con
 * JavaScript desactivado nunca va a estar listo: entonces el botón conserva su texto y un aviso
 * dentro de `<noscript>` dice qué hacer. El cambio de texto lo hace CSS (`noscript:`, que es
 * `@media (scripting: none)`), porque sin JavaScript no hay nada más que pueda hacerlo.
 */

const PREPARING = 'Preparando el formulario…'
const NEEDS_JAVASCRIPT =
  'Este formulario necesita JavaScript y tu navegador lo tiene desactivado. Actívalo o abre Rifas en otro navegador.'

const noop = () => () => {}

/** `false` en el HTML del servidor y durante la hidratación; `true` en cuanto React la termina. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}

type AuthSubmitButtonProps = {
  /** El texto del botón listo para usarse: «Ingresar», «Cambiar contraseña»… */
  children: ReactNode
  /** Mientras se envía: «Ingresando...», «Guardando...». */
  pendingLabel: string
  pending: boolean
  className?: string
}

export function AuthSubmitButton({
  children,
  pendingLabel,
  pending,
  className,
}: AuthSubmitButtonProps) {
  const hydrated = useHydrated()

  return (
    <>
      <noscript>
        {/*
          `<noscript>` es un elemento EN LÍNEA: el `space-y-4` del formulario no le da margen, y el
          aviso quedaba pegado al botón. El espacio lo pone este bloque, que solo existe sin JavaScript.
        */}
        <div className="mb-4">
          <Notice tone="warning" density="compact">
            {NEEDS_JAVASCRIPT}
          </Notice>
        </div>
      </noscript>
      <Button type="submit" size="touch" className={className} disabled={pending || !hydrated}>
        {pending ? (
          pendingLabel
        ) : hydrated ? (
          children
        ) : (
          <>
            <span className="noscript:hidden">{PREPARING}</span>
            <span className="hidden noscript:inline">{children}</span>
          </>
        )}
      </Button>
    </>
  )
}
