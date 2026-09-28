import { UserRoundIcon } from 'lucide-react'

import { RecordLinkCard } from '@/components/data/RecordLinkCard'

/**
 * El cliente de una boleta, como una fila que lleva a su ficha (D-101).
 *
 * Antes el nombre era un enlace suelto dentro de la rejilla de datos: se
 * distinguia de los demas campos solo al pasar el raton por encima, y en un
 * telefono —que es donde trabaja el vendedor— no se distinguia de nada. Aqui la
 * fila ENTERA es el enlace, que es la diana mas grande posible, y la flecha de
 * la derecha dice a donde va sin gastar una linea de texto en decirlo.
 *
 * La ficha a la que lleva es la MISMA de «Mis clientes» (`/seller/clients/...`):
 * desde D-198 solo el vendedor ve clientes. Volver desde
 * ahi con la flecha del encabezado devuelve a esta boleta, porque `BackButton`
 * usa el historial real de la sesion (D-089).
 *
 * Se navega SIEMPRE por el `id` del cliente: dos personas pueden llamarse
 * igual, y el nombre no identifica a nadie.
 *
 * La fila la pinta `RecordLinkCard` desde D-234, que es la misma forma que usa
 * el detalle administrativo para el vendedor y la rifa. El HTML no cambio: el
 * nombre y el telefono se siguen recortando (D-125).
 */
export function ClientLinkCard({
  href,
  name,
  phone,
  action,
}: {
  href: string
  name: string
  /** Puede faltar en un cliente antiguo; entonces la fila se queda en una linea. */
  phone?: string | null
  /**
   * Accion sobre este cliente —hoy, «Cambiar cliente» (D-168)—.
   *
   * Se pinta DEBAJO de la fila y FUERA del enlace, nunca dentro: un boton
   * anidado en un enlace es HTML invalido y deja la diana grande de la fila
   * ejecutando dos cosas distintas segun donde caiga el dedo.
   */
  action?: React.ReactNode
}) {
  return (
    <RecordLinkCard
      href={href}
      icon={<UserRoundIcon className="size-5" />}
      label="Cliente"
      title={name}
      detail={phone}
      action={action}
    />
  )
}

/**
 * El mismo hueco cuando la boleta todavia no se ha vendido.
 *
 * Se pinta con el borde de la tarjeta pero SIN enlace ni flecha: la diferencia
 * entre «toca aqui» y «aqui no hay nada» tiene que verse antes de tocar, no
 * despues. No hay ficha de nadie a la que ir.
 */
export function ClientEmptyCard({ description }: { description: string }) {
  return (
    <div className="flex h-full items-center gap-3 rounded-lg border border-dashed p-3">
      <span
        aria-hidden
        className="text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed"
      >
        <UserRoundIcon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Cliente</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  )
}
