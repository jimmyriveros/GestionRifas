import { KeyboardIcon, Rows3Icon } from 'lucide-react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

import { INVENTORY_COPY } from '../copy'

/**
 * Las dos formas de crear boletas en lote, una al lado de la otra (D-257):
 * escribir los numeros —para un vendedor, hasta 1.000— o generarlos por rangos
 * —al inventario comun, hasta 100.000—. Son dos ENLACES y no pestanas: cada
 * modo es su propia pantalla, con su propia direccion y su boton Atras.
 *
 * La que se esta viendo lleva `aria-current="page"` y no parece pulsable.
 */
export function CreationModeSwitch({
  current,
  raffleId,
}: {
  current: 'write' | 'generate'
  raffleId?: string
}) {
  const query = raffleId ? `?raffleId=${encodeURIComponent(raffleId)}` : ''
  const items = [
    {
      key: 'write' as const,
      href: `/owner/tickets/bulk${query}`,
      label: INVENTORY_COPY.generator.modeWrite,
      icon: <KeyboardIcon className="size-4" aria-hidden />,
    },
    {
      key: 'generate' as const,
      href: `/owner/tickets/generate${query}`,
      label: INVENTORY_COPY.generator.modeGenerate,
      icon: <Rows3Icon className="size-4" aria-hidden />,
    },
  ]

  return (
    <nav aria-label={INVENTORY_COPY.generator.modeLabel}>
      <ul className="bg-muted/50 inline-flex w-full gap-1 rounded-lg border p-1 sm:w-auto">
        {items.map((item) => {
          const active = item.key === current
          return (
            <li key={item.key} className="grow sm:grow-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:h-9',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
