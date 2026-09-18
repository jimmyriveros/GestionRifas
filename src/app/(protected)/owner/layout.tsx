import {
  AwardIcon,
  BarChart3Icon,
  LayoutDashboardIcon,
  ShieldCheckIcon,
  TicketIcon,
  TrophyIcon,
  UsersIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import type { NavItem } from '@/components/layout/nav-items'
import { requireRole } from '@/lib/auth/guards'

// Una sola lista para las tres barras del portal (D-106): la lateral de
// escritorio la pinta entera; la inferior del telefono, solo las `primary`; y el
// menu de usuario del telefono, las demas. El icono va sin tamano: lo pone quien
// lo pinta.
//
// SIN «Clientes» NI «Pagos» (D-198, BR-Q01). La cartera es de cada vendedor y el
// personal no la consulta: las dos entradas se retiran de las tres barras a la
// vez, porque salen de esta lista, y sus rutas ya no existen. En el telefono
// quedan dos opciones abajo en vez de cuatro; el resto sigue en el menu de
// usuario, igual que antes.
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
  // Los premios que ganaron los clientes de cada vendedor, sin un solo dato de
  // cliente (D-208). No confundir con los premios de una rifa, que se
  // configuran dentro de «Rifas».
  { href: '/owner/prizes', label: 'Premios ganados', icon: <AwardIcon /> },
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
