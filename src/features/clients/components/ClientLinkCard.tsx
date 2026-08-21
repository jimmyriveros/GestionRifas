import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'

/**
 * El cliente de una boleta, como una fila que lleva a su ficha (D-101).
 *
 * Antes el nombre era un enlace suelto dentro de la rejilla de datos: se
 * distinguia de los demas campos solo al pasar el raton por encima, y en un
 * telefono —que es donde trabaja el vendedor— no se distinguia de nada. Aqui la
 * fila ENTERA es el enlace, que es la diana mas grande posible, y la flecha de
 * la derecha dice a donde va sin gastar una linea de texto en decirlo.
 *
 * La ficha a la que lleva es la MISMA de «Clientes»: `href` cambia de portal
 * (`/owner/clients/...` o `/seller/clients/...`), no de pantalla. Volver desde
 * ahi con la flecha del encabezado devuelve a esta boleta, porque `BackButton`
 * usa el historial real de la sesion (D-089).
 *
 * Se navega SIEMPRE por el `id` del cliente: dos personas pueden llamarse
 * igual, y el nombre no identifica a nadie.
 *
 * Las clases son las mismas de las tarjetas del equipo (`TeamMemberList`), para
 * que «esto se puede tocar» se vea igual en toda la aplicacion.
 */
export function ClientLinkCard({
  href,
  name,
  phone,
}: {
  href: string
  name: string
  /** Puede faltar en un cliente antiguo; entonces la fila se queda en una linea. */
  phone?: string | null
}) {
  return (
    <Link
      href={href}
      className="bg-card hover:bg-accent focus-visible:ring-ring flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Cliente</p>
        <p className="truncate font-medium">{name}</p>
        {phone ? <p className="text-muted-foreground truncate text-sm">{phone}</p> : null}
      </div>
      <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </Link>
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
    <div className="rounded-lg border border-dashed p-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Cliente</p>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  )
}
