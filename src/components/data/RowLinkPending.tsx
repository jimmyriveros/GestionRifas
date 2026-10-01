'use client'

import { Loader2Icon } from 'lucide-react'
import { useLinkStatus } from 'next/link'

import { RowChevron } from '@/components/data/RowChevron'
import { cn } from '@/lib/utils'

/**
 * El aviso de «se está abriendo» de un `RowLink` (D-244).
 *
 * POR QUE HACE FALTA
 *
 * `RowLink` no precarga (D-104) y las fichas de detalle no tienen `loading.tsx`,
 * así que entre el clic y la pantalla nueva sigue viéndose la anterior, quieta.
 * Con una respuesta rápida no se nota; con una lenta, la persona ve la misma
 * lista y cree que el clic no hizo nada. Es el recurso del menú (`NavIcon`,
 * `BottomNavIcon`): `useLinkStatus` se enciende en el mismo clic, sin crear
 * ningún fallback de Suspense, así que no añade la espera de ~300 ms que
 * costaba un `loading.tsx`. La precarga NO cambia.
 *
 * Tiene que ir DENTRO del enlace: `useLinkStatus` solo ve el `Link` que lo
 * contiene. Fuera de un enlace devuelve siempre «no pendiente».
 *
 * LO QUE SE OYE. Estos enlaces llevan `aria-label` («Revisar la cuenta de
 * Carlos Ruiz»), así que su contenido no forma parte del nombre y cambiar el
 * texto no se anunciaría. Por eso cada aviso trae una región `role="status"`
 * que está siempre en el árbol —vacía— y recibe el texto al encenderse: es lo
 * que la hace audible. Las dos presentaciones de una lista (tabla y tarjetas)
 * nunca se ven a la vez, y la oculta no está en el árbol de accesibilidad: no se
 * anuncia dos veces.
 *
 * `data-link-pending` lo lee el propio enlace con `has-[...]` para cambiar de
 * fondo, y lo leen las pruebas.
 */

function PendingAnnouncement({ pending, text }: { pending: boolean; text: string }) {
  return (
    <span role="status" className="sr-only">
      {pending ? text : ''}
    </span>
  )
}

function Spinner({ className }: { className?: string }) {
  return (
    <Loader2Icon
      aria-hidden
      className={cn('size-4 shrink-0 animate-spin motion-reduce:animate-none', className)}
    />
  )
}

/**
 * Texto de un enlace con forma de botón («Revisar cuenta») que pasa a
 * «Abriendo cuenta…» con su icono girando mientras se abre.
 *
 * LOS DOS TEXTOS OCUPAN SIEMPRE EL MISMO SITIO: están apilados en la misma
 * celda y solo cambia cuál se ve. El botón mide desde el principio lo que mide
 * el más ancho, así que encenderse no mueve la columna ni la fila (la guía de
 * `useLinkStatus` lo advierte: un aviso en línea desplaza el contenido).
 */
export function RowLinkPendingLabel({
  label,
  pendingLabel,
  announcement,
}: {
  label: string
  pendingLabel: string
  /** Lo que se anuncia: con de quién es, porque no hay fila a la vista que lo diga. */
  announcement: string
}) {
  const { pending } = useLinkStatus()

  return (
    <span data-link-pending={pending} className="inline-grid place-items-center">
      <span className={cn('col-start-1 row-start-1', pending && 'invisible')}>{label}</span>
      <span
        aria-hidden
        className={cn(
          'col-start-1 row-start-1 inline-flex items-center gap-1.5',
          !pending && 'invisible',
        )}
      >
        {pending ? <Spinner /> : <span className="size-4 shrink-0" />}
        {pendingLabel}
      </span>
      <PendingAnnouncement pending={pending} text={announcement} />
    </span>
  )
}

/**
 * La flecha del final de una fila (`RowChevron`) que se convierte en el icono
 * girando mientras se abre: el mismo recurso que el icono del menú, en el mismo
 * hueco, así que la tarjeta no cambia de tamaño.
 */
export function RowLinkPendingChevron({
  announcement,
  className,
}: {
  announcement: string
  className?: string
}) {
  const { pending } = useLinkStatus()

  return (
    <span data-link-pending={pending} className={cn('flex shrink-0', className)}>
      {pending ? <Spinner className="text-foreground" /> : <RowChevron />}
      <PendingAnnouncement pending={pending} text={announcement} />
    </span>
  )
}
