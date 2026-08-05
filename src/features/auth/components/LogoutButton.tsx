'use client'

import { LogOutIcon } from 'lucide-react'
import { useTransition } from 'react'

import { logout } from '@/features/auth/actions'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

export function LogoutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <DropdownMenuItem
      disabled={isPending}
      onSelect={(event) => {
        event.preventDefault()
        startTransition(() => {
          void logout()
        })
      }}
    >
      <LogOutIcon />
      Cerrar sesión
    </DropdownMenuItem>
  )
}
