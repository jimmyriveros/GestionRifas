'use client'

import { Loader2Icon } from 'lucide-react'
import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'

import type { NavItem } from '@/components/layout/nav-items'
import { cn } from '@/lib/utils'

type NavLinksProps = {
  items: NavItem[]
  onNavigate?: () => void
}

/**
 * Señal de «esta pantalla se está abriendo», dentro de la entrada pulsada.
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
 */
function NavPending() {
  const { pending } = useLinkStatus()

  if (!pending) return null

  return (
    <>
      <Loader2Icon className="ml-auto size-4 shrink-0 animate-spin" aria-hidden />
      <span className="sr-only">Abriendo…</span>
    </>
  )
}

export function NavLinks({ items, onNavigate }: NavLinksProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              // Estados excluyentes: el enlace de la pantalla actual trae su
              // propio hover, para que pasar por encima no lo devuelva nunca al
              // aspecto de un enlace cualquiera (misma regla que `OptionList`).
              isActive
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {item.icon}
            {item.label}
            <NavPending />
          </Link>
        )
      })}
    </nav>
  )
}
