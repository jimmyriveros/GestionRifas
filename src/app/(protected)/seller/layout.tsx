import {
  BarChart3Icon,
  LayoutDashboardIcon,
  TicketIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/nav-items'
import { requireRole } from '@/lib/auth/guards'

// Una sola lista para las tres barras del portal (D-106). En la barra inferior
// del telefono cada opcion dispone de unos 72 px, asi que las cuatro primarias
// llevan `shortLabel` sin el posesivo: el termino del glosario sigue siendo el
// mismo —boleta, cliente, pago—, solo se cae el «Mis» que ahi no cabe.
const NAV_ITEMS: NavItem[] = [
  {
    href: '/seller/dashboard',
    label: 'Panel',
    icon: <LayoutDashboardIcon />,
    primary: true,
  },
  {
    href: '/seller/tickets',
    label: 'Mis boletas',
    shortLabel: 'Boletas',
    icon: <TicketIcon />,
    primary: true,
  },
  {
    href: '/seller/clients',
    label: 'Mis clientes',
    shortLabel: 'Clientes',
    icon: <UserRoundIcon />,
    primary: true,
  },
  // Siempre visible, tenga equipo o no (BR-E01): que un vendedor descubra que
  // puede armar equipo no puede depender de que ya lo tenga.
  { href: '/seller/team', label: 'Mi equipo', icon: <UsersIcon /> },
  {
    href: '/seller/payments',
    label: 'Mis pagos',
    shortLabel: 'Pagos',
    icon: <WalletIcon />,
    primary: true,
  },
  { href: '/seller/reports', label: 'Reportes', icon: <BarChart3Icon /> },
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
