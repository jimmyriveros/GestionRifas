'use client'

import { UserPlusIcon } from 'lucide-react'
import { useState } from 'react'

import { UserDialog } from '@/features/users/components/UserDialog'
import { Button } from '@/components/ui/button'

import { createTeamMember } from '../actions'

/**
 * «Agregar vendedor»: abre el MISMO formulario que usa el portal
 * administrativo, con otro destino y otras palabras (BR-E04).
 */
export function AddTeamMemberButton({
  label = 'Agregar vendedor',
  variant = 'default',
}: {
  label?: string
  variant?: 'default' | 'outline'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        <UserPlusIcon className="size-4" aria-hidden />
        {label}
      </Button>

      <UserDialog
        open={open}
        onOpenChange={setOpen}
        role="seller"
        create={{
          submit: createTeamMember,
          title: 'Agregar vendedor a tu equipo',
          description:
            'Se enviará una invitación por correo. Esta persona venderá sus propias boletas y tú verás cómo le va.',
          // La membresia se crea junto con la invitacion, asi que el integrante
          // aparece en la lista de inmediato; lo que le falta es la contrasena.
          success: (email) =>
            `Ya está en tu equipo. Enviamos la invitación a ${email} para que cree su contraseña e ingrese.`,
        }}
      />
    </>
  )
}
