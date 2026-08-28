'use client'

import { Loader2Icon } from 'lucide-react'
import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { isNavItemActive } from '@/components/layout/nav-active'
import type { NavItem } from '@/components/layout/nav-items'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type NavLinksProps = {
  items: NavItem[]
  onNavigate?: () => void
  /**
   * La barra esta en modo «solo iconos» (D-131). Lo que se VE no depende de
   * esto —de eso se encarga el CSS, que ya conoce el ancho de la ventana en el
   * primer pintado—, solo el globo con el nombre de cada icono, que sin
   * JavaScript no existiria de todos modos.
   *
   * Con `collapsed` hacen falta globos, y Radix los exige dentro de un
   * `TooltipProvider`: lo pone `AppSidebar`, que es quien pasa esta prop.
   */
  collapsed?: boolean
}

/**
 * Icono de la opcion, que se convierte en «se esta abriendo» al pulsarla.
 *
 * POR QUE AQUI Y NO UN `loading.tsx` (D-104)
 *
 * Un `loading.tsx` es un fallback de Suspense, y React impone una espera minima
 * de unos 300 ms desde que muestra un fallback hasta que lo reemplaza —para que
 * no parpadee—. Medido en un build de produccion: la respuesta del servidor
 * estaba lista a los 85 ms y la pantalla no aparecia hasta los 352 ms. Los 250
 * ms de diferencia eran espera pura, con la CPU parada y los datos ya en el
 * navegador.
 *
 * `useLinkStatus` da el mismo aviso inmediato —se enciende en el mismo clic—
 * sin crear ningun fallback, asi que la pantalla nueva se pinta en cuanto
 * llega. La pantalla anterior sigue visible mientras tanto, que es como se
 * comporta la web de siempre y lo que ya hacian las fichas de detalle.
 *
 * EL AVISO OCUPA EL SITIO DEL ICONO, no un hueco al final del enlace como hasta
 * D-131: con la barra cerrada no hay tal hueco —el enlace mide 39 px— y con la
 * barra abierta reservarlo obligaba a 28 px de ancho que solo se usaban durante
 * la fraccion de segundo que tarda en abrirse una pantalla. Es el mismo recurso
 * que ya usaba la barra inferior del telefono (`BottomNavIcon`), por la misma
 * razon: alli tampoco sobra un pixel.
 */
function NavIcon({ icon }: { icon: ReactNode }) {
  const { pending } = useLinkStatus()

  if (pending) {
    return (
      <>
        <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
        <span className="sr-only">Abriendo…</span>
      </>
    )
  }

  return (
    <span aria-hidden className="flex shrink-0 [&>svg]:size-4">
      {icon}
    </span>
  )
}

export function NavLinks({ items, onNavigate, collapsed = false }: NavLinksProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = isNavItemActive(pathname, item.href)
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              // Las tres variables son el interruptor de `globals.css`: con la
              // barra cerrada el hueco y el relleno valen 0 y el icono queda
              // centrado, sin que este componente tenga que saber nada.
              'flex min-h-9 items-center [justify-content:var(--sidebar-content-justify)]',
              'gap-[var(--sidebar-item-gap)] rounded-md px-[var(--sidebar-item-px)] py-2',
              'text-sm font-medium transition-colors',
              // Estados excluyentes: el enlace de la pantalla actual trae su
              // propio hover, para que pasar por encima no lo devuelva nunca al
              // aspecto de un enlace cualquiera (misma regla que `OptionList`).
              isActive
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <NavIcon icon={item.icon} />
            {/*
              El nombre no se quita nunca del HTML: con la barra cerrada pasa a
              `sr-only` (D-131), asi que el enlace conserva su nombre para quien
              escucha la pantalla y para las pruebas.
            */}
            <span data-slot="sidebar-label" className="truncate">
              {item.label}
            </span>
          </Link>
        )

        // Con la barra abierta el nombre ya se lee al lado del icono: un globo
        // que lo repita solo estorba.
        if (!collapsed) return link

        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" className="pointer-events-none">
              {item.label}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}
