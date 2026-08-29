'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

import { OptionList, OptionListItem } from '@/components/form/OptionList'
import { Button } from '@/components/ui/button'
import { searchClientsWithBalance } from '@/features/clients/actions'
import { SearchInput } from '@/features/search/components/SearchInput'
import { useRemoteSearch } from '@/features/search/use-remote-search'
import { formatCOP } from '@/lib/money'
import { SEARCH_MIN_CHARS } from '@/lib/search'

import type { ClientWithBalance } from '../queries'

/**
 * Elegir a quien se le registra el abono. Escribe el cliente en la URL para que
 * el RSC cargue sus boletas: sin peticiones desde el navegador y con una
 * direccion que se puede compartir o recargar.
 *
 * La BUSQUEDA si va al servidor (`useRemoteSearch`): antes se filtraban en
 * memoria los 200 clientes precargados, asi que a partir de ahi no habia manera
 * de encontrar a nadie (I-036).
 */
export function ClientPicker({ clients }: { clients: ClientWithBalance[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const searchClients = useCallback(async (term: string) => {
    const result = await searchClientsWithBalance(term)
    if ('error' in result) throw new Error(result.error)
    return result.data
  }, [])

  const search = useRemoteSearch({
    search: searchClients,
    initialResults: clients,
    minChars: SEARCH_MIN_CHARS.people,
  })

  function select(clientId: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('clientId', clientId)
    // `replace` deja el selector fuera del historial (D-135): atras desde el
    // formulario vuelve al origen (pagos, panel), no a esta lista intermedia.
    // «Cambiar de cliente» sigue siendo el camino para elegir a otro.
    startTransition(() => router.replace(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="space-y-3">
      <SearchInput
        id="payment-client-search"
        label="Buscar cliente"
        placeholder="Nombre, alias o teléfono"
        value={search.term}
        onChange={search.onTermChange}
        onSubmit={search.submitNow}
        onClear={search.clear}
        loading={search.showSpinner}
        hint={search.hint}
      />

      {search.status === 'error' ? (
        <div className="space-y-2 py-6 text-center">
          <p className="text-destructive text-sm">{search.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={search.retry}>
            Reintentar
          </Button>
        </div>
      ) : search.isEmpty ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Ningún cliente con saldo pendiente coincide con la búsqueda.
        </p>
      ) : (
        // Sin `selected`: aqui elegir un cliente lleva al paso siguiente, asi
        // que no hay una eleccion que quede marcada en la lista.
        <OptionList
          label="Clientes con saldo pendiente"
          className="rounded-lg"
          busy={search.status === 'searching'}
        >
          {search.results.map((client) => (
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
