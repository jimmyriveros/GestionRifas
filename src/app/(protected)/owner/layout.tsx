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

const NAV_ITEMS: NavItem[] = [
  { href: '/owner/dashboard', label: 'Panel', icon: <LayoutDashboardIcon className="size-4" /> },
  { href: '/owner/raffles', label: 'Rifas', icon: <TrophyIcon className="size-4" /> },
  { href: '/owner/tickets', label: 'Boletas', icon: <TicketIcon className="size-4" /> },
  { href: '/owner/sellers', label: 'Vendedores', icon: <UsersIcon className="size-4" /> },
  { href: '/owner/clients', label: 'Clientes', icon: <UserRoundIcon className="size-4" /> },
  { href: '/owner/payments', label: 'Pagos', icon: <WalletIcon className="size-4" /> },
  { href: '/owner/reports', label: 'Reportes', icon: <BarChart3Icon className="size-4" /> },
  { href: '/owner/users', label: 'Administradores', icon: <ShieldCheckIcon className="size-4" /> },
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
