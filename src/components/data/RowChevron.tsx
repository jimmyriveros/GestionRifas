import { ChevronRightIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * La flecha del final de una fila o de una tarjeta: «esto se abre».
 *
 * ES DECORATIVA A PROPOSITO (`aria-hidden`). Quien abre la fila es la fila
 * entera —o el enlace del numero, que ya se llama «Ver la boleta 1234 / 5678»—,
 * asi que un segundo enlace con el mismo destino solo añadiria una parada de
 * teclado que dice lo mismo. La flecha es la pista visual de que ahi hay algo
 * que tocar; el nombre accesible lo pone el enlace de al lado.
 */
export function RowChevron({ className }: { className?: string }) {
  return (
    <ChevronRightIcon
      className={cn('text-muted-foreground size-4 shrink-0', className)}
      aria-hidden
    />
  )
}
