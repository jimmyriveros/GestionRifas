import { KeyRoundIcon } from 'lucide-react'
import Link from 'next/link'

import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ROLE_LABELS, type AppRole } from '@/lib/constants'

type UserMenuProps = {
  fullName: string
  email: string
  role: AppRole
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + second).toUpperCase() || '?'
}

export function UserMenu({ fullName, email, role }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initialsFor(fullName)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-medium md:inline">{fullName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="truncate text-sm font-medium">{fullName}</span>
            <span className="text-muted-foreground truncate text-xs">{email}</span>
            <span className="text-muted-foreground text-xs">{ROLE_LABELS[role]}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account/password">
            <KeyRoundIcon />
            Cambiar contrasena
          </Link>
        </DropdownMenuItem>
        <LogoutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
