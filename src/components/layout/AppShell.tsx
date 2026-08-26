import type { ReactNode } from 'react'

import { BottomNav } from '@/components/layout/BottomNav'
import { NavLinks } from '@/components/layout/NavLinks'
import type { NavItem } from '@/components/layout/nav-items'
import { UserMenu } from '@/components/layout/UserMenu'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { InstallPrompt } from '@/features/pwa/components/InstallPrompt'
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
  children,
}: Omit<AppShellProps, 'profileId'>) {
  const primaryItems = navItems.filter((item) => item.primary)
  const secondaryItems = navItems.filter((item) => !item.primary)

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/*
        `ps-[var(--safe-left)]` en la barra lateral y `pe-[var(--safe-right)]` en
        la columna de contenido: son las dos unicas caras que tocan el borde de
        la pantalla (D-119). Las variables valen 0 salvo en un telefono con
        muesca puesto en horizontal, asi que en escritorio no cambia nada.
      */}
      <aside
        {...tourTarget('nav-sidebar')}
        className="bg-background hidden w-64 shrink-0 border-r ps-[var(--safe-left)] md:flex md:flex-col"
      >
        <div className="flex h-14 items-center border-b px-4">
          <span className="truncate font-semibold">{orgName}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks items={navItems} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col ps-[var(--safe-left)] pe-[var(--safe-right)] md:ps-0">
        <header className="bg-background sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4">
          <span className="truncate font-semibold md:hidden">{orgName}</span>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
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
          {/*
            El ofrecimiento de instalar va AQUI, al final del contenido y dentro
            del flujo normal (D-117). No es una ventana ni una banda flotante:
            no tapa nada, no empuja nada al aparecer y se decide solo —se pinta
            unicamente en los dos paneles, y solo si el navegador confirma que
            la instalacion es posible—.
          */}
          <InstallPrompt />
        </main>
      </div>

      <BottomNav items={primaryItems} />
    </div>
  )
}
