import { cookies } from 'next/headers'
import type { ReactNode } from 'react'

import { AppSidebar } from '@/components/layout/AppSidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import {
  CompactHeaderActionTarget,
  CompactHeaderProvider,
  CompactHeaderStart,
} from '@/components/layout/CompactHeader'
import type { NavItem } from '@/components/layout/nav-items'
import {
  parseSidebarPreference,
  SIDEBAR_COOKIE,
  type SidebarPreference,
} from '@/components/layout/sidebar-preference'
import { UserMenu } from '@/components/layout/UserMenu'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { TourProvider } from '@/features/tour/components/TourProvider'
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

export async function AppShell({
  orgName,
  role,
  profileId,
  fullName,
  email,
  navItems,
  children,
}: AppShellProps) {
  // La preferencia de la barra lateral viaja en una cookie para que el HTML del
  // servidor salga ya con el ancho correcto y no haya un parpadeo al hidratar
  // (D-131, `sidebar-preference.ts`).
  const sidebarPreference = parseSidebarPreference((await cookies()).get(SIDEBAR_COOKIE)?.value)

  return (
    <TourProvider role={role} profileId={profileId}>
      <CompactHeaderProvider>
        <AppShellLayout
          orgName={orgName}
          role={role}
          fullName={fullName}
          email={email}
          navItems={navItems}
          sidebarPreference={sidebarPreference}
        >
          {children}
        </AppShellLayout>
      </CompactHeaderProvider>
    </TourProvider>
  )
}

/**
 * Armazon de los dos portales.
 *
 * ESCRITORIO: barra lateral fija + contenido, como siempre.
 * TELEFONO:   contenido + barra inferior fija. Las dos NO conviven (D-106): la
 *             lateral esta oculta bajo `md` y la inferior sobre `md`.
 *
 * De la MISMA lista `navItems` salen las dos barras y el menu de usuario. Las
 * cuatro entradas marcadas `primary` son la barra inferior; el resto —reportes
 * siempre, y ademas rifas, vendedores y administradores en el portal
 * administrativo— se lee en el telefono desde el menu de usuario, que en
 * escritorio no las repite porque ya estan en la lateral. No hay una segunda
 * lista de rutas que mantener en sincronia.
 */
function AppShellLayout({
  orgName,
  role,
  fullName,
  email,
  navItems,
  sidebarPreference,
  children,
}: Omit<AppShellProps, 'profileId'> & { sidebarPreference: SidebarPreference }) {
  const primaryItems = navItems.filter((item) => item.primary)
  const secondaryItems = navItems.filter((item) => !item.primary)

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/*
        La barra lateral se ocupa de su propio ancho (D-131): entre 208 y 232 px
        abierta y 56 px cuando solo caben los iconos, sea porque la persona la
        cerro o porque la ventana no da para mas. `pe-[var(--safe-right)]` en la
        columna de contenido y `ps-[var(--safe-left)]` dentro de la barra son las
        dos unicas caras que tocan el borde de la pantalla (D-119).
      */}
      <AppSidebar orgName={orgName} navItems={navItems} preference={sidebarPreference} />

      <div className="flex min-w-0 flex-1 flex-col ps-[var(--safe-left)] pe-[var(--safe-right)] md:ps-0">
        <header
          data-app-header
          className="bg-background sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4"
        >
          <CompactHeaderStart orgName={orgName} />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <NotificationBell />
            <CompactHeaderActionTarget />
            <UserMenu fullName={fullName} email={email} role={role} navItems={secondaryItems} />
          </div>
        </header>

        {/*
          El hueco de las barras fijas se reserva AQUI, una sola vez, y sale de
          las mismas variables que fijan su alto (`globals.css`). Asi ninguna
          pantalla tiene que acordarse de dejar margen abajo, y la ultima fila de
          una lista o el ultimo boton de un formulario nunca quedan tapados.
          Sobre `md` las dos variables valen 0 y manda `md:p-6`.

          Son DOS sumandos porque son dos barras que se apilan: la navegacion
          inferior, que esta siempre, y la de seleccion multiple, que aparece
          solo mientras hay boletas marcadas y entonces vale su alto (D-110).
          Antes esa segunda reservaba su hueco con un div vacio dentro de la
          pagina, que caia donde estuviera escrito —en medio de la lista— en vez
          de al final: dejaba 80 px en blanco arriba y seguia tapando la
          paginacion abajo.
        */}
        <main className="flex-1 p-4 pb-[calc(1rem_+_var(--bottom-nav-space)_+_var(--selection-bar-space))] md:p-6">
          {children}
        </main>
      </div>

      <BottomNav items={primaryItems} />
    </div>
  )
}
