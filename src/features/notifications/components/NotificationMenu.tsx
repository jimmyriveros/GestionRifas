'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

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
import { notificationMessage } from '../text'

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
 */
export function NotificationMenu({ items, unreadCount, icon }: NotificationMenuProps) {
  const router = useRouter()
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
    <DropdownMenu>
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

      <DropdownMenuContent align="end" className="w-80">
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
            {items.map((item) => (
              <li
                key={item.id}
                className={`border-b px-2 py-2 last:border-0 ${item.isRead ? '' : 'bg-accent/50'}`}
              >
                <p className="text-sm">{notificationMessage(item.kind, item.data)}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {formatDateTimeEs(item.createdAt)}
                  {item.isRead ? '' : ' · Sin leer'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
