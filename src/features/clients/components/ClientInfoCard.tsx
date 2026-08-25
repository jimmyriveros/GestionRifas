import {
  ArchiveIcon,
  CalendarDaysIcon,
  CircleCheckIcon,
  MailIcon,
  PhoneIcon,
  UserRoundIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { ClientStatusBadge } from '@/components/data/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateEs } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * «Información general» de la ficha del cliente (D-113).
 *
 * Una tira horizontal en vez del bloque alto de antes: teléfono, correo, alta y
 * estado son cuatro datos cortos que se consultan de un vistazo, no una lista
 * que haya que leer. En el teléfono se reparten en dos columnas y en escritorio
 * quedan en una sola fila separada por lineas —el mismo recurso que ya usa la
 * ficha de la boleta (`xl:border-l`)—, porque un separador vertical dentro de
 * una columna estrecha corta el texto en vez de ordenarlo.
 *
 * No calcula ni consulta nada: recibe lo que la pagina ya tenia de
 * `getClientDetail`.
 */

type ClientInfoCardProps = {
  phone: string
  email: string | null
  createdAt: string
  archivedAt: string | null
  notes: string | null
  /**
   * Portal administrativo: de quien es este cliente. El vendedor no lo necesita
   * —todos los suyos son suyos— y por eso se omite en su ficha.
   */
  sellerName?: string
  className?: string
}

export function ClientInfoCard({
  phone,
  email,
  createdAt,
  archivedAt,
  notes,
  sellerName,
  className,
}: ClientInfoCardProps) {
  const archived = archivedAt !== null

  const items: { label: string; icon: ReactNode; value: ReactNode }[] = [
    {
      label: 'Teléfono',
      icon: <PhoneIcon className="size-5" aria-hidden />,
      // Enlace `tel:`: en un teléfono llamar al cliente es la accion mas
      // probable desde esta pantalla, y ya era asi antes del rediseño.
      value: (
        <a href={`tel:${phone}`} className="text-sm font-medium hover:underline">
          {phone}
        </a>
      ),
    },
    {
      label: 'Correo',
      icon: <MailIcon className="size-5" aria-hidden />,
      // Un correo largo no tiene espacios donde partirse: sin `break-all` se
      // saldria de su columna.
      value: <p className="text-sm font-medium break-all">{email ?? '—'}</p>,
    },
    {
      label: 'Alta',
      icon: <CalendarDaysIcon className="size-5" aria-hidden />,
      value: <p className="text-sm font-medium">{formatDateEs(createdAt)}</p>,
    },
  ]

  if (sellerName !== undefined) {
    items.push({
      label: 'Vendedor',
      icon: <UserRoundIcon className="size-5" aria-hidden />,
      value: <p className="truncate text-sm font-medium">{sellerName}</p>,
    })
  }

  items.push({
    label: 'Estado',
    // Un cliente archivado con un visto bueno al lado diria lo contrario de lo
    // que pasa: el icono cambia con el estado, como la insignia.
    icon: archived ? (
      <ArchiveIcon className="size-5" aria-hidden />
    ) : (
      <CircleCheckIcon className="size-5" aria-hidden />
    ),
    value: <ClientStatusBadge archived={archived} />,
  })

  return (
    <Card className={cn('py-4 sm:py-5', className)}>
      <CardContent className="px-4 sm:px-6">
        <div
          className={cn(
            'grid gap-5 sm:grid-cols-2 lg:gap-0',
            items.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
          )}
        >
          {items.map((item, index) => (
            <div
              key={item.label}
              className={cn('flex items-start gap-3', index > 0 && 'lg:border-l lg:pl-6')}
            >
              <span className="text-muted-foreground mt-0.5 shrink-0">{item.icon}</span>
              <div className="min-w-0 space-y-1">
                <p className="text-muted-foreground text-xs font-medium">{item.label}</p>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Las notas no caben en la tira —son texto libre— pero pertenecen a la
            misma tarjeta: se quedan debajo, separadas por una linea. */}
        {notes ? (
          <div className="mt-5 border-t pt-4">
            <p className="text-muted-foreground text-xs font-medium">Notas</p>
            <p className="mt-1 text-sm">{notes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
