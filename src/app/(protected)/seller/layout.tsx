import { BarChart3Icon, LayoutDashboardIcon, TicketIcon, UsersIcon, WalletIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/nav-items'
import { requireRole } from '@/lib/auth/guards'

const NAV_ITEMS: NavItem[] = [
  { href: '/seller/dashboard', label: 'Panel', icon: <LayoutDashboardIcon className="size-4" /> },
  { href: '/seller/tickets', label: 'Mis boletas', icon: <TicketIcon className="size-4" /> },
  { href: '/seller/clients', label: 'Mis clientes', icon: <UsersIcon className="size-4" /> },
  { href: '/seller/payments', label: 'Mis pagos', icon: <WalletIcon className="size-4" /> },
  { href: '/seller/reports', label: 'Reportes', icon: <BarChart3Icon className="size-4" /> },
]

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const membership = await requireRole(['seller'])

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
