import {
  BarChart3Icon,
  LayoutDashboardIcon,
  ShieldCheckIcon,
  TicketIcon,
  TrophyIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/nav-items'
import { requireRole } from '@/lib/auth/guards'

// Una sola lista para las tres barras del portal (D-106): la lateral de
// escritorio la pinta entera; la inferior del telefono, solo las cuatro
// `primary`; y el menu de usuario del telefono, las demas. El icono va sin
// tamano: lo pone quien lo pinta.
const NAV_ITEMS: NavItem[] = [
  {
    href: '/owner/dashboard',
    label: 'Panel',
    icon: <LayoutDashboardIcon />,
    primary: true,
  },
  { href: '/owner/raffles', label: 'Rifas', icon: <TrophyIcon /> },
  { href: '/owner/tickets', label: 'Boletas', icon: <TicketIcon />, primary: true },
  { href: '/owner/sellers', label: 'Vendedores', icon: <UsersIcon /> },
  { href: '/owner/clients', label: 'Clientes', icon: <UserRoundIcon />, primary: true },
  { href: '/owner/payments', label: 'Pagos', icon: <WalletIcon />, primary: true },
  { href: '/owner/reports', label: 'Reportes', icon: <BarChart3Icon /> },
  { href: '/owner/users', label: 'Administradores', icon: <ShieldCheckIcon /> },
]

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const membership = await requireRole(['owner', 'admin'])

  return (
    <AppShell
      orgName={membership.organizationName}
      role={membership.role}
      profileId={membership.profileId}
      fullName={membership.fullName}
      email={membership.email}
      navItems={NAV_ITEMS}
    >
      {children}
    </AppShell>
  )
}
