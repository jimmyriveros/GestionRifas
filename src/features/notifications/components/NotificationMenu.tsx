'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDateTimeEs } from '@/lib/dates'

import { markNotificationsRead } from '../actions'
import type { NotificationItem } from '../queries'
import { notificationHref, notificationMessage } from '../text'

type NotificationMenuProps = {
  items: NotificationItem[]
  unreadCount: number
  icon: ReactNode
}

/**
 * La bandeja que se abre desde la campanita.
 *
 * El numero de no leidos no viaja solo en el punto rojo: va tambien en el
 * `aria-label` del boton, porque un contador que solo se ve no existe para
 * quien usa un lector de pantalla (CLAUDE.md §27: nunca depender solo del
 * color, ni solo de lo visual).
 *
 * ALGUNOS AVISOS LLEVAN A UN SITIO Y OTROS NO (D-189). El del recordatorio de
 * pago es accionable —hay un mensaje esperando a que lo copien— y por eso su
 * fila es un enlace; los demas cuentan algo que ya paso. El menu se controla
 * desde aqui para poder CERRARLO al navegar: sin eso se quedaria abierto encima
 * de la pantalla nueva.
 */
export function NotificationMenu({ items, unreadCount, icon }: NotificationMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const label =
    unreadCount === 0
      ? 'Novedades: no tienes avisos sin leer'
      : `Novedades: ${unreadCount} sin leer`

  function markRead() {
    startTransition(async () => {
      await markNotificationsRead()
      router.refresh()
    })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label={label}>
          {icon}
          {unreadCount > 0 ? (
            <span
              aria-hidden
              className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      {/*
        `w-80` son 320 px exactos: en un telefono de 320 la bandeja se salia 42
        px por el lado. El tope la deja caber siempre, dejando margen a los dos
        lados, y en pantallas grandes no cambia nada.
      */}
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)]">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Novedades</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={markRead}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground text-xs font-normal underline underline-offset-2 disabled:opacity-50"
            >
              Marcar como leídas
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">
            Aquí verás lo que pase en tu equipo.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {items.map((item) => {
              const href = notificationHref(item.kind)
              const content = (
                <>
                  <p className="text-sm">{notificationMessage(item.kind, item.data)}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatDateTimeEs(item.createdAt)}
                    {item.isRead ? '' : ' · Sin leer'}
                  </p>
                </>
              )

              return (
                <li
                  key={item.id}
                  className={`border-b last:border-0 ${item.isRead ? '' : 'bg-accent/50'}`}
                >
                  {href === null ? (
                    <div className="px-2 py-2">{content}</div>
                  ) : (
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className="hover:bg-accent focus-visible:ring-ring block px-2 py-2 focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {content}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
