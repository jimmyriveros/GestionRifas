'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import type { ClientWithBalance } from '../queries'

/**
 * Elegir a quien se le registra el abono. Escribe el cliente en la URL para que
 * el RSC cargue sus boletas: sin peticiones desde el navegador y con una
 * direccion que se puede compartir o recargar.
 */
export function ClientPicker({ clients }: { clients: ClientWithBalance[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()

  const term = search.trim().toLowerCase()
  const filtered =
    term === ''
      ? clients.slice(0, 50)
      : clients
          .filter((client) =>
            [client.name, client.alias ?? '', client.phone].some((value) =>
              value.toLowerCase().includes(term),
            ),
          )
          .slice(0, 50)

  function select(clientId: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('clientId', clientId)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="payment-client-search">Buscar cliente</Label>
        <Input
          id="payment-client-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nombre, alias o telefono"
          inputMode="search"
          disabled={isPending}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Ningun cliente con saldo pendiente coincide con la busqueda.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border" role="listbox">
          {filtered.map((client) => (
            <li key={client.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => select(client.id)}
                disabled={isPending}
                className={cn(
                  'hover:bg-accent flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                )}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{client.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {client.alias ? `${client.alias} · ` : ''}
                    {client.phone} · {client.ticketsCount} boleta(s)
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  debe {formatCOP(client.pendingAmount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
