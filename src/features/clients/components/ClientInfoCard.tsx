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
 * Una cuadricula en vez del bloque alto de antes: teléfono, correo, alta y
 * estado son cuatro datos cortos que se consultan de un vistazo, no una lista
 * que haya que leer.
 *
 * NUNCA se apilan de uno en uno. En el teléfono van **2 x 2** y en escritorio
 * pasan a una sola fila; lo que los separa son lineas, no huecos, que es lo que
 * mantiene la tarjeta baja. Apilados ocupaban cuatro renglones —media pantalla
 * de móvil antes de llegar a la primera cifra— para decir lo mismo.
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
      icon: <PhoneIcon aria-hidden />,
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
      icon: <MailIcon aria-hidden />,
      // Un correo largo no tiene espacios donde partirse: sin `break-all` se
      // saldria de su columna.
      value: <p className="text-sm font-medium break-all">{email ?? '—'}</p>,
    },
    {
      label: 'Alta',
      icon: <CalendarDaysIcon aria-hidden />,
      value: <p className="text-sm font-medium">{formatDateEs(createdAt)}</p>,
    },
  ]

  if (sellerName !== undefined) {
    items.push({
      label: 'Vendedor',
      icon: <UserRoundIcon aria-hidden />,
      value: <p className="truncate text-sm font-medium">{sellerName}</p>,
    })
  }

  items.push({
    label: 'Estado',
    // Un cliente archivado con un visto bueno al lado diria lo contrario de lo
    // que pasa: el icono cambia con el estado, como la insignia.
    icon: archived ? <ArchiveIcon aria-hidden /> : <CircleCheckIcon aria-hidden />,
    value: <ClientStatusBadge archived={archived} />,
  })

  return (
    <Card className={cn('py-0', className)}>
      <CardContent className="px-0">
        {/*
          DOS COLUMNAS DESDE EL PRIMER PIXEL. Apilados, estos cuatro datos se
          llevaban cuatro renglones y media pantalla de telefono antes de la
          primera cifra; en cuadricula ocupan dos y se leen igual de bien,
          porque son cuatro valores CORTOS con su rotulo encima.

          Las lineas hacen el trabajo del hueco: en vez de separar con aire —que
          es lo que alargaba la tarjeta—, cada celda se delimita con un borde, y
          por eso la rejilla no lleva `gap`.
        */}
        <div
          className={cn(
            'grid grid-cols-2',
            items.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
          )}
        >
          {items.map((item, index) => (
            <div
              key={item.label}
              className={cn(
                'flex items-center gap-2 p-3 sm:gap-3 sm:p-4 lg:p-5',
                // La columna derecha lleva su linea vertical; la segunda fila,
                // la horizontal. En `lg` los cuatro (o cinco) vuelven a una sola
                // fila, asi que solo queda la vertical.
                index % 2 === 1 && 'border-l',
                index >= 2 && 'border-t lg:border-t-0',
                index > 0 && 'lg:border-l',
                // Impar (el portal administrativo, con cinco datos): el ultimo
                // ocupa la fila entera en vez de dejar media vacia a su derecha.
                items.length % 2 === 1 && index === items.length - 1 && 'col-span-2 lg:col-span-1',
              )}
            >
              {/* El icono en su cuadrado, como en las tarjetas de cifras de
                  debajo: las dos piezas se leen como una sola familia. Mide 32
                  px en el telefono —con 40, «3229654618» no cabe en 320 px— y
                  sube a 40 a partir de `sm`. */}
              <span
                className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-xl sm:size-10 [&>svg]:size-4 sm:[&>svg]:size-5"
                aria-hidden
              >
                {item.icon}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-muted-foreground truncate text-xs font-medium">{item.label}</p>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* Las notas no caben en la cuadricula —son texto libre— pero pertenecen
            a la misma tarjeta: se quedan debajo, separadas por una linea. */}
        {notes ? (
          <div className="border-t p-3 sm:p-4 lg:px-5">
            <p className="text-muted-foreground text-xs font-medium">Notas</p>
            <p className="mt-1 text-sm">{notes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
