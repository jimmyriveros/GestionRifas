import type { ReactNode } from 'react'

import { MobileNav } from '@/components/layout/MobileNav'
import { NavLinks } from '@/components/layout/NavLinks'
import type { NavItem } from '@/components/layout/nav-items'
import { UserMenu } from '@/components/layout/UserMenu'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { TourProvider } from '@/features/tour/components/TourProvider'
import { tourTarget } from '@/features/tour/tours'
import type { AppRole } from '@/lib/constants'

type AppShellProps = {
  orgName: string
  role: AppRole
  profileId: string
  fullName: string
  email: string
  navItems: NavItem[]
  children: ReactNode
}

export function AppShell({
  orgName,
  role,
  profileId,
  fullName,
  email,
  navItems,
  children,
}: AppShellProps) {
  return (
    <TourProvider role={role} profileId={profileId}>
      <AppShellLayout
        orgName={orgName}
        role={role}
        fullName={fullName}
        email={email}
        navItems={navItems}
      >
        {children}
      </AppShellLayout>
    </TourProvider>
  )
}

function AppShellLayout({
  orgName,
  role,
  fullName,
  email,
  navItems,
  children,
}: Omit<AppShellProps, 'profileId'>) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside
        {...tourTarget('nav-sidebar')}
        className="bg-background hidden w-64 shrink-0 border-r md:flex md:flex-col"
      >
        <div className="flex h-14 items-center border-b px-4">
          <span className="truncate font-semibold">{orgName}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks items={navItems} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4">
          <MobileNav orgName={orgName} items={navItems} />
          <span className="truncate font-semibold md:hidden">{orgName}</span>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu fullName={fullName} email={email} role={role} />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
