import { KeyRoundIcon } from 'lucide-react'
import Link from 'next/link'

import { LogoutButton } from '@/features/auth/components/LogoutButton'
import type { NavItem } from '@/components/layout/nav-items'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InstallMenuItem } from '@/features/pwa/components/InstallMenuItem'
import { TourLauncher } from '@/features/tour/components/TourLauncher'
import { tourTarget } from '@/features/tour/tours'
import { ROLE_LABELS, type AppRole } from '@/lib/constants'

type UserMenuProps = {
  fullName: string
  email: string
  role: AppRole
  /**
   * Lo que no cabe en la barra inferior del telefono (D-106): reportes, y en el
   * portal administrativo tambien rifas, vendedores y administradores.
   *
   * Se pinta SOLO bajo `md`. En escritorio estas mismas entradas siguen en la
   * barra lateral, y repetirlas aqui seria pedirle al usuario que elija entre
   * dos caminos identicos. Las rutas y los permisos son los de siempre: esto
   * cambia desde donde se entra, nada mas.
   */
  navItems?: NavItem[]
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + second).toUpperCase() || '?'
}

export function UserMenu({ fullName, email, role, navItems = [] }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
          El nombre se oculta bajo `md` para ganar espacio en el telefono, asi
          que sin `aria-label` el boton se anunciaria solo como sus iniciales
          ("CR"), que no significan nada para quien no ve el avatar.
          (CLAUDE.md §27: accesible, no solo visualmente claro.)
        */}
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-label={`Menú de usuario: ${fullName}`}
          {...tourTarget('user-menu')}
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs" aria-hidden>
              {initialsFor(fullName)}
            </AvatarFallback>
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
        {navItems.length > 0 ? (
          <>
            <DropdownMenuSeparator className="md:hidden" />
            <DropdownMenuGroup className="md:hidden">
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                Ir a
              </DropdownMenuLabel>
              {navItems.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} className="[&>svg]:size-4">
                    {item.icon}
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <TourLauncher />
        <InstallMenuItem />
        <DropdownMenuItem asChild>
          <Link href="/account/password">
            <KeyRoundIcon />
            Cambiar contraseña
          </Link>
        </DropdownMenuItem>
        <LogoutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
