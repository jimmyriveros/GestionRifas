'use client'

import { PencilIcon, Trash2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { UserDialog } from '@/features/users/components/UserDialog'

import { deleteTeamMember, updateTeamMember } from '../actions'
import type { TeamMember } from '../queries'

/**
 * Lo que un vendedor padre puede hacer con un integrante de su equipo.
 *
 * Las dos acciones cambian segun el estado de la cuenta (BR-E15..BR-E17):
 *
 *   Invitacion pendiente -> se puede corregir todo, incluido el correo, y se
 *                           puede eliminar el alta entera.
 *   Cuenta activa        -> nombre, alias y celular; el correo es suyo y
 *                           eliminar deja de existir.
 *
 * Ocultar «Eliminar» no es la proteccion: `team_delete_member` rechaza el
 * intento aunque alguien llame a la accion a mano. Aqui se oculta para no
 * ofrecer algo que va a fallar, que es el mismo criterio de `UserRowActions`.
 */
export function TeamMemberActions({ member }: { member: TeamMember }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const pending = member.activatedAt === null

  function remove() {
    startTransition(async () => {
      const result = await deleteTeamMember({ memberId: member.profileId })
      if ('error' in result) {
        toast.error(result.error)
        setConfirmOpen(false)
        return
      }
      toast.success(`${member.fullName} ya no está en tu equipo.`)
      // Su pantalla de detalle deja de existir: se vuelve al equipo.
      router.replace('/seller/team')
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
        <PencilIcon className="size-4" aria-hidden />
        Editar datos
      </Button>

      {pending ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
        >
          <Trash2Icon className="size-4" aria-hidden />
          Eliminar vendedor
        </Button>
      ) : null}

      <UserDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        role="seller"
        user={{
          profileId: member.profileId,
          fullName: member.fullName,
          alias: member.alias,
          phone: member.phone,
          email: member.email,
        }}
        edit={{
          submit: (values) => updateTeamMember({ ...values, memberId: member.profileId }),
          emailEditable: pending,
          description: pending
            ? 'Todavía no ha ingresado, así que puedes corregir cualquier dato.'
            : 'Ya ingresó a la aplicación, así que su correo solo lo puede cambiar esa persona.',
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eliminar vendedor"
        description={`${member.fullName} saldrá de tu equipo y la invitación que le enviamos dejará de funcionar. Como nunca ingresó, no se pierde ninguna venta.`}
        confirmLabel="Eliminar vendedor"
        destructive
        pending={isPending}
        onConfirm={remove}
      />
    </>
  )
}
