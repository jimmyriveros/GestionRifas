import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Una fila que lleva a la ficha de OTRO registro: el cliente de una boleta en
 * el portal del vendedor (`ClientLinkCard`, D-101), y su vendedor y su rifa en
 * el administrativo (D-234).
 *
 * LA FILA ENTERA ES EL ENLACE, que es la diana mas grande posible, y la flecha
 * de la derecha dice a donde va sin gastar una linea de texto en decirlo. El
 * circulo de la izquierda no aporta informacion —es decorativo—: esta para que
 * la fila se lea de un vistazo como «una persona» o «una rifa» entre las cifras
 * de la boleta. El nombre accesible del enlace es su texto: el rotulo y el
 * nombre, «Vendedor Laura Moreno».
 *
 * Nacio dentro de `ClientLinkCard` y se saco aqui cuando el detalle
 * administrativo necesito la misma forma para otros registros. No podia
 * importarse desde alli: el portal administrativo no importa nada de
 * `features/clients` (D-198, `tests/unit/admin-privacy.test.ts`). Con
 * `truncate` —lo de siempre— el HTML que produce es exactamente el de antes.
 */
export function RecordLinkCard({
  href,
  icon,
  label,
  title,
  detail,
  action,
  wrap = false,
}: {
  href: string
  /** Icono de 20 px para el circulo. Es decorativo: el circulo ya va `aria-hidden`. */
  icon: ReactNode
  /** Que es el registro, en mayusculas pequeñas encima del nombre: «Cliente», «Rifa». */
  label: string
  title: string
  /** Una segunda linea, como el telefono del cliente. Sin ella la fila se queda en una. */
  detail?: string | null
  /**
   * Accion sobre este registro —hoy, «Cambiar cliente» (D-168)—.
   *
   * Se pinta DEBAJO de la fila y FUERA del enlace, nunca dentro: un boton
   * anidado en un enlace es HTML invalido y deja la diana grande de la fila
   * ejecutando dos cosas distintas segun donde caiga el dedo.
   */
  action?: ReactNode
  /**
   * `true` parte el nombre en varias lineas en vez de recortarlo con puntos
   * suspensivos. Es lo que necesita un nombre que IDENTIFICA —el de una rifa
   * con su codigo, el de un vendedor—: recortado se perderia justo la parte
   * que los distingue, y un `title` no se ve en un telefono. Sin el, el nombre
   * se recorta, como el del cliente desde D-125.
   */
  wrap?: boolean
}) {
  const row = (
    <Link
      href={href}
      className={cn(
        'bg-muted/40 hover:bg-accent focus-visible:ring-ring flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none',
        // Sola, la fila ocupa toda la altura de su columna: es la diana mas
        // grande posible. Con una accion debajo, la altura la reparte el
        // contenedor y `h-full` la haria desbordar.
        action ? 'flex-1' : 'h-full',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="bg-background text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full border"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </p>
          <p className={wrap ? 'font-medium break-words' : 'truncate font-medium'}>{title}</p>
          {detail ? (
            <p
              className={
                wrap
                  ? 'text-muted-foreground text-sm break-words'
                  : 'text-muted-foreground truncate text-sm'
              }
            >
              {detail}
            </p>
          ) : null}
        </div>
      </div>
      <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </Link>
  )

  // Sin accion, el arbol de HTML es EXACTAMENTE el de siempre: las pantallas
  // que no la pasan no cambian ni un nodo.
  if (!action) return row

  return (
    <div className="flex h-full flex-col gap-2">
      {row}
      {action}
    </div>
  )
}
