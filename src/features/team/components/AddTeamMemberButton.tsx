'use client'

import { UserPlusIcon } from 'lucide-react'
import { useState } from 'react'

import { UserDialog, type CommissionOptions } from '@/features/users/components/UserDialog'
import { Button } from '@/components/ui/button'

import { createTeamMember } from '../actions'

/**
 * «Agregar vendedor»: abre el MISMO formulario que usa el portal
 * administrativo, con otro destino, otras palabras y una seccion mas (BR-E04).
 *
 * Esa seccion —«Cómo le vas a pagar»— es la unica diferencia de campos entre
 * las dos altas, y existe solo aqui porque solo aqui hay algo que elegir: un
 * vendedor dado de alta por el personal cobra la mitad del precio y no depende
 * de nadie (BR-G13, BR-G24).
 */
export function AddTeamMemberButton({
  label = 'Agregar vendedor',
  variant = 'default',
  commission,
}: {
  label?: string
  variant?: 'default' | 'outline'
  commission: CommissionOptions
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
        commission={commission}
        create={{
          submit: createTeamMember,
          title: 'Agregar vendedor a tu equipo',
          description:
            'Se enviará una invitación por correo. Esta persona venderá sus propias boletas y tú ganarás por cada una que cobre.',
          // La membresia se crea junto con la invitacion, asi que el integrante
          // aparece en la lista de inmediato; lo que le falta es la contrasena.
          success: (email) =>
            `Ya está en tu equipo. Enviamos la invitación a ${email} para que cree su contraseña e ingrese.`,
        }}
      />
    </>
  )
}
