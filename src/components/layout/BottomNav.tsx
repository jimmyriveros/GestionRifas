'use client'

import { Loader2Icon } from 'lucide-react'
import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { isNavItemActive } from '@/components/layout/nav-active'
import type { NavItem } from '@/components/layout/nav-items'
import { tourTarget } from '@/features/tour/tours'
import { cn } from '@/lib/utils'

type BottomNavProps = {
  items: NavItem[]
}

/**
 * Icono de la opcion, que se convierte en «se esta abriendo» al tocarla.
 *
 * Mismo recurso que `NavPending` en la barra lateral y por la misma razon
 * (D-104): `useLinkStatus` avisa en el mismo toque sin crear un fallback de
 * Suspense, asi que la pantalla nueva aparece en cuanto llega en vez de esperar
 * los ~300 ms que React impone a cualquier `loading.tsx`. Aqui el aviso ocupa
 * el sitio del icono porque en la barra inferior no sobra ni un pixel al lado.
 */
function BottomNavIcon({ icon }: { icon: ReactNode }) {
  const { pending } = useLinkStatus()

  if (pending) {
    return (
      <>
        <Loader2Icon className="size-6 animate-spin" aria-hidden />
        <span className="sr-only">Abriendo…</span>
      </>
    )
  }

  return (
    <span aria-hidden className="[&>svg]:size-6">
      {icon}
    </span>
  )
}

/**
 * Barra de navegacion inferior del telefono (D-106).
 *
 * Sustituye al cajon lateral que se abria con el boton de menu: en el telefono
 * la aplicacion se usa de pie y con una mano, y los cuatro sitios a los que se
 * vuelve todo el dia no pueden estar detras de dos toques. En escritorio no
 * existe —`md:hidden`—, donde manda la barra lateral de siempre.
 *
 * NO CONSULTA NADA. Recibe los mismos `navItems` que ya arma cada portal y
 * decide lo activo con `usePathname()`, que Next ya tiene en memoria. No hay
 * peticion, ni estado, ni efecto.
 *
 * ALTO Y AREA SEGURA. El alto visible son los 56 px de `--bottom-nav-height`,
 * el mismo del encabezado. Debajo se suma `env(safe-area-inset-bottom)` para
 * que en un iPhone la barra no quede detras del indicador del sistema. El hueco
 * que necesita el contenido para no quedar tapado sale de la misma variable
 * (`--bottom-nav-space`, en `globals.css`) y lo reserva el armazon una vez, no
 * cada pantalla por su cuenta.
 */
export function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname()

  if (items.length === 0) return null

  return (
    <nav
      {...tourTarget('nav-mobile')}
      aria-label="Navegación principal"
      // Los laterales solo importan con el telefono en horizontal y muesca
      // (D-119): sin ellos, la primera y la ultima opcion quedan debajo de la
      // muesca y no se pueden tocar. Valen 0 el resto del tiempo.
      className="bg-background fixed inset-x-0 bottom-0 z-40 border-t ps-[var(--safe-left)] pe-[var(--safe-right)] pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      <ul className="grid h-[var(--bottom-nav-height)] auto-cols-fr grid-flow-col">
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, item.href)
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                // Toda la celda es la diana, icono y etiqueta incluidos: a 320
                // px son ~80 x 56 px, bastante mas que los 44 px minimos.
                className={cn(
                  'relative flex size-full flex-col items-center justify-center gap-1 px-1',
                  'active:bg-accent/60 transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {/*
                  Marca de «estas aqui». Es una raya, no solo un color: quien no
                  distinga el verde ve igualmente la forma, y ademas la etiqueta
                  pasa a negrita (CLAUDE.md §27, nunca solo el color).
                */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-0 top-0 mx-auto h-0.5 w-8 rounded-b-full',
                    isActive ? 'bg-success' : 'bg-transparent',
                  )}
                />
                <BottomNavIcon icon={item.icon} />
                <span
                  className={cn(
                    // `leading-4` y no `leading-none`: `truncate` recorta lo que
                    // se salga de la caja, y con interlineado 1 la cola de la
                    // «g» de «Pagos» queda cortada por abajo.
                    'w-full truncate text-center text-[11px] leading-4',
                    isActive ? 'font-semibold' : 'font-medium',
                  )}
                >
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
