'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

import { OptionList, OptionListItem } from '@/components/form/OptionList'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCOP } from '@/lib/money'

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
          placeholder="Nombre, alias o teléfono"
          inputMode="search"
          disabled={isPending}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Ningún cliente con saldo pendiente coincide con la búsqueda.
        </p>
      ) : (
        // Sin `selected`: aqui elegir un cliente lleva al paso siguiente, asi
        // que no hay una eleccion que quede marcada en la lista.
        <OptionList label="Clientes con saldo pendiente" className="rounded-lg">
          {filtered.map((client) => (
            <OptionListItem
              key={client.id}
              title={client.name}
              description={`${client.alias ? `${client.alias} · ` : ''}${client.phone} · ${client.ticketsCount} boleta(s)`}
              trailing={`debe ${formatCOP(client.pendingAmount)}`}
              disabled={isPending}
              onSelect={() => select(client.id)}
            />
          ))}
        </OptionList>
      )}
    </div>
  )
}
