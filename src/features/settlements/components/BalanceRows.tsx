import type { ReactNode } from 'react'

import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Las lineas del calculo de una cuenta (D-241): una etiqueta y una cifra, en una
 * lista de definiciones.
 *
 * ES LA «Balance Row» DE LA PROPUESTA DE FIGMA (`325:5`), que alli se marco como
 * pieza LOCAL del modulo y no como componente del nucleo: por eso vive aqui y no
 * en `components/`. Si otra pantalla la necesita, se sube entonces (§10.55 del
 * relevo del sistema de diseño).
 *
 * LAS CIFRAS LLEGAN HECHAS. Ninguna linea suma ni resta: pinta lo que la base
 * devolvio. El signo de una resta va escrito —«− $900.000»— y ademas se oye:
 * el guion largo no lo lee igual cada lector de pantalla, asi que viaja un
 * «menos» en `sr-only` y el signo visible queda `aria-hidden`. El color nunca es
 * la unica señal (CLAUDE.md §27).
 *
 * LA RAYA DE UN SUBTOTAL ES UN BORDE DE LA FILA (`divided`), no un elemento
 * suelto: dentro de un `<dl>` solo caben grupos de `<dt>` y `<dd>`.
 */

type Sign = 'minus' | 'plus'

export function BalanceList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('space-y-3', className)}>{children}</dl>
}

export function BalanceRow({
  label,
  amount,
  sign,
  hint,
  emphasis,
  divided = false,
}: {
  label: string
  amount: number
  sign?: Sign
  /** Una linea de apoyo bajo la etiqueta, en pequeño: «Carlos: $900.000 · Integrantes: $450.000». */
  hint?: string
  /** `total` para el resultado de un bloque; `brand` para lo que falta, como en la propuesta. */
  emphasis?: 'total' | 'brand'
  /** Una raya encima: empieza un subtotal. */
  divided?: boolean
}) {
  // Una rejilla y no dos cajas anidadas: el grupo de un `<dl>` solo admite su
  // `<dt>` y sus `<dd>`. La pista es un segundo `<dd>` que ocupa las dos columnas.
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1',
        divided && 'border-border border-t pt-3',
      )}
    >
      <dt
        className={cn(
          'text-body-small text-pretty',
          emphasis === 'brand'
            ? 'text-text-brand'
            : emphasis === 'total'
              ? 'text-foreground'
              : 'text-muted-foreground',
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          'text-label-medium text-right whitespace-nowrap tabular-nums',
          emphasis === 'brand' && 'text-text-brand',
        )}
      >
        {sign ? (
          <>
            <span className="sr-only">{sign === 'minus' ? 'menos ' : 'más '}</span>
            <span aria-hidden>{sign === 'minus' ? '− ' : '+ '}</span>
          </>
        ) : null}
        {formatCOP(amount)}
      </dd>
      {hint ? (
        <dd className="text-caption-regular text-muted-foreground col-span-2 text-pretty">
          {hint}
        </dd>
      ) : null}
    </div>
  )
}
