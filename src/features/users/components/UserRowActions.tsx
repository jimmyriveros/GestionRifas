'use client'

import { MoreHorizontalIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AppRole } from '@/lib/constants'

import { resendInvitation, setUserActive } from '../actions'
import type { OrgMember } from '../queries'
import { UserDialog } from './UserDialog'

type UserRowActionsProps = {
  member: OrgMember
  /** Rol de quien esta usando la aplicacion. */
  currentRole: AppRole
  currentProfileId: string
}

/**
 * BR-U02/BR-U03: un Admin no puede editar ni desactivar al Owner. La regla se
 * aplica en RLS (`profiles_update_staff`, `memberships_update_staff`); aqui
 * solo se oculta lo que de todas formas seria rechazado, para no ofrecer
 * acciones que van a fallar.
 */
function canManage(target: OrgMember, currentRole: AppRole): boolean {
  return target.role !== 'owner' || currentRole === 'owner'
}

export function UserRowActions({ member, currentRole, currentProfileId }: UserRowActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const manageable = canManage(member, currentRole)
  const isSelf = member.profileId === currentProfileId

  function toggleActive() {
    startTransition(async () => {
      const result = await setUserActive({
        profileId: member.profileId,
        isActive: !member.isActive,
      })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(member.isActive ? 'Usuario desactivado.' : 'Usuario activado.')
        router.refresh()
      }
      setConfirmOpen(false)
    })
  }

  function resend() {
    startTransition(async () => {
      const result = await resendInvitation({ profileId: member.profileId })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(`Se envio un enlace de acceso a ${member.email}.`)
      }
    })
  }

  if (!manageable) {
    return <span className="text-muted-foreground text-xs">Sin acciones</span>
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Acciones para ${member.fullName}`}>
            <MoreHorizontalIcon className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>Editar datos</DropdownMenuItem>
          <DropdownMenuItem onSelect={resend} disabled={isPending}>
            Reenviar acceso por correo
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmOpen(true)}
            disabled={isPending || (isSelf && member.isActive)}
            variant={member.isActive ? 'destructive' : 'default'}
          >
            {member.isActive ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        role={member.role === 'seller' ? 'seller' : 'admin'}
        user={{
          profileId: member.profileId,
          fullName: member.fullName,
          alias: member.alias,
          phone: member.phone,
          email: member.email,
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={member.isActive ? 'Desactivar usuario' : 'Activar usuario'}
        description={
          member.isActive
            ? `${member.fullName} dejara de poder ingresar de inmediato, incluso con una sesion abierta. Sus boletas, clientes y pagos se conservan.`
            : `${member.fullName} podra volver a ingresar con su correo y contrasena.`
        }
        confirmLabel={member.isActive ? 'Desactivar' : 'Activar'}
        destructive={member.isActive}
        pending={isPending}
        onConfirm={toggleActive}
      />
    </>
  )
}
