import { UserRoundIcon } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

/**
 * Quien recibe el abono, debajo del titulo (D-138).
 *
 * El titulo de la pantalla es solo «Registrar abono»: el nombre del cliente no
 * cabe junto a la flecha y a «Cambiar» en un telefono. Aqui el nombre es lo
 * primero que se reconoce, con un boton compacto a la derecha que hace lo
 * mismo que hacia «Cambiar de cliente».
 *
 * `min-w-0` y `line-clamp-2` evitan que un nombre largo empuje el boton fuera
 * o provoque scroll horizontal (D-125).
 */
export function PaymentClientBanner({ name, changeHref }: { name: string; changeHref: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full"
      >
        <UserRoundIcon className="size-6" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">Abono para</p>
        <p className="line-clamp-2 text-xl font-bold break-words">{name}</p>
      </div>

      <Button asChild variant="outline" size="sm" className="h-9 shrink-0 px-3">
        <Link href={changeHref} aria-label="Cambiar de cliente">
          Cambiar
        </Link>
      </Button>
    </div>
  )
}
