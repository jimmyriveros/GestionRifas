'use client'

import { useSyncExternalStore, type ComponentProps, type ReactNode } from 'react'

import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'

/**
 * El botón de enviar de un formulario que llega en el HTML del servidor (I-204; D-247 y D-249).
 *
 * QUÉ IMPIDE. Estos formularios se envían con `onSubmit` de react-hook-form, que solo existe
 * cuando React ha hidratado. Antes, pulsar antes de eso hacía el envío NATIVO del navegador por
 * GET y lo escrito quedaba en la dirección —la contraseña en `/login?email=…&password=…`, o el
 * nombre y el teléfono de un cliente en `/seller/clients/new?name=…&phone=…`—: en el historial y en
 * los registros. Por eso la protección tiene que estar en el HTML del SERVIDOR, no en un manejador:
 *
 *   · el botón llega DESACTIVADO, y un botón por defecto desactivado impide también el envío con
 *     Enter desde un campo (es la regla del envío implícito de HTML);
 *   · cada formulario lleva además `method="post"`: si algo lo enviara de forma nativa —una
 *     extensión que llama a `form.submit()`—, los datos viajarían en el cuerpo, nunca en la URL.
 *
 * QUÉ SE VE. Mientras no está listo, el botón dice «Preparando el formulario…»: es la misma regla
 * del «Creando…» de siempre, dentro del botón. Con JavaScript desactivado nunca va a estar listo:
 * entonces el botón conserva su texto y `FormNoScriptNotice` dice qué hacer. El cambio de texto lo
 * hace CSS (`noscript:`, que es `@media (scripting: none)`), porque sin JavaScript no hay nada más
 * que pueda hacerlo.
 *
 * DOS PIEZAS Y NO UNA (D-249). El aviso y el botón van por separado porque no siempre son
 * vecinos: en los formularios de acceso el botón ocupa su propia fila (`AuthSubmitButton` los
 * junta), y en los de página comparte fila con «Cancelar», así que el aviso va encima de esa fila.
 */

/** Los textos, una sola vez (Anexo B de la guía de textos). */
export const FORM_PREPARING_LABEL = 'Preparando el formulario…'
export const FORM_NEEDS_JAVASCRIPT =
  'Este formulario necesita JavaScript y tu navegador lo tiene desactivado. Actívalo o abre Rifas en otro navegador.'

const noop = () => () => {}

/** `false` en el HTML del servidor y durante la hidratación; `true` en cuanto React la termina. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}

/**
 * El aviso para quien tiene JavaScript desactivado. Solo existe sin JavaScript: con él, el
 * navegador no pinta nada de lo que hay dentro de `<noscript>`.
 *
 * `<noscript>` es un elemento EN LÍNEA: el `space-y-*` del formulario no le da margen, y el aviso
 * quedaba pegado al botón. El espacio lo pone el bloque de dentro, con la clase que reciba.
 */
export function FormNoScriptNotice({ className }: { className?: string }) {
  return (
    <noscript>
      <div className={className}>
        <Notice tone="warning" density="compact">
          {FORM_NEEDS_JAVASCRIPT}
        </Notice>
      </div>
    </noscript>
  )
}

type HydratedSubmitButtonProps = Omit<
  ComponentProps<typeof Button>,
  'type' | 'children' | 'disabled' | 'asChild'
> & {
  /** El texto del botón listo para usarse: «Ingresar», «Crear cliente»… */
  children: ReactNode
  /** Mientras se envía: «Ingresando...», «Creando...». */
  pendingLabel: string
  pending: boolean
  /** Otra razón, del propio formulario, para no dejar enviar. */
  disabled?: boolean
}

export function HydratedSubmitButton({
  children,
  pendingLabel,
  pending,
  disabled = false,
  ...buttonProps
}: HydratedSubmitButtonProps) {
  const hydrated = useHydrated()

  return (
    <Button {...buttonProps} type="submit" disabled={pending || disabled || !hydrated}>
      {pending ? (
        pendingLabel
      ) : hydrated ? (
        children
      ) : (
        <>
          <span className="noscript:hidden">{FORM_PREPARING_LABEL}</span>
          <span className="hidden noscript:inline">{children}</span>
        </>
      )}
    </Button>
  )
}
