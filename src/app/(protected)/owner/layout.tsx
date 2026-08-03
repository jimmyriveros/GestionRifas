import { LayoutDashboardIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/nav-items'
import { requireRole } from '@/lib/auth/guards'

const NAV_ITEMS: NavItem[] = [
  { href: '/owner/dashboard', label: 'Panel', icon: <LayoutDashboardIcon className="size-4" /> },
]

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const membership = await requireRole(['owner', 'admin'])

  return (
    <AppShell
      orgName={membership.organizationName}
      role={membership.role}
      fullName={membership.fullName}
      email={membership.email}
      navItems={NAV_ITEMS}
    >
      {children}
    </AppShell>
  )
}
