'use client'

import type { ReactNode } from 'react'

import { FormNoScriptNotice, HydratedSubmitButton } from '@/components/form/HydratedSubmitButton'

/**
 * El botón de enviar de los formularios de acceso y de contraseña (I-204, D-247).
 *
 * Es `HydratedSubmitButton` —desactivado hasta hidratar, «Preparando el formulario…» mientras
 * tanto— con el aviso sin JavaScript justo encima, que es lo que estos cuatro formularios
 * necesitan: el botón ocupa su propia fila. Lo que impide y por qué se explica en
 * `components/form/HydratedSubmitButton.tsx`; los formularios de página usan las mismas piezas
 * (D-249). El HTML que sale es el mismo que antes de separarlas.
 */

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
  return (
    <>
      <FormNoScriptNotice className="mb-4" />
      <HydratedSubmitButton
        size="touch"
        className={className}
        pending={pending}
        pendingLabel={pendingLabel}
      >
        {children}
      </HydratedSubmitButton>
    </>
  )
}
