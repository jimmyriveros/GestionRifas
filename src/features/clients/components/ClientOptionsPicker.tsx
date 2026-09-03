'use client'

import { OptionList, OptionListItem } from '@/components/form/OptionList'
import { Button } from '@/components/ui/button'
import type { ClientOption } from '@/features/clients/queries'
import { SearchInput } from '@/features/search/components/SearchInput'
import type { RemoteSearch } from '@/features/search/use-remote-search'

/**
 * Elegir un cliente de una lista que se busca en el servidor.
 *
 * Es la mitad de arriba del dialogo de venta, extraida cuando la correccion de
 * cliente (D-168) necesito exactamente lo mismo: campo de busqueda, estado de
 * error con reintento, estado vacio y `OptionList` con la eleccion marcada.
 * Copiarla habria dejado dos versiones del mismo comportamiento delicado —el
 * `aria-busy` que no vacia la lista, el reintento que no pierde lo escrito— y
 * tarde o temprano se habrian separado.
 *
 * QUIEN BUSCA NO SE DECIDE AQUI. El `RemoteSearch` llega ya montado por quien
 * llama, porque la consulta es distinta en cada caso: la venta busca en toda la
 * cartera visible; la correccion, solo en la del vendedor de esa boleta
 * (BR-C05). Este componente pinta; no elige a quien se le pregunta.
 */
export function ClientOptionsPicker({
  inputId,
  search,
  selectedId,
  onSelect,
  disabled = false,
  emptyMessage,
  excludeClientId,
  listClassName = 'max-h-56 overflow-y-auto',
}: {
  /** Id del campo de busqueda: dos dialogos distintos no pueden compartirlo. */
  inputId: string
  search: RemoteSearch<ClientOption>
  selectedId: string | null
  onSelect: (clientId: string) => void
  disabled?: boolean
  /** Que se dice cuando la busqueda no encuentra a nadie. */
  emptyMessage: string
  /**
   * Cliente que NO se ofrece. Lo usa la correccion de cliente: proponer al que
   * ya tiene la boleta seria ofrecer una opcion que la base va a rechazar.
   */
  excludeClientId?: string | null
  listClassName?: string
}) {
  const results = excludeClientId
    ? search.results.filter((client) => client.id !== excludeClientId)
    : search.results

  // `search.isEmpty` habla de lo que devolvio el servidor. Si lo unico que
  // volvio fue el cliente excluido, la lista tambien queda vacia y hay que
  // decirlo igual, o se veria un recuadro sin nada dentro.
  const isEmpty = search.isEmpty || (search.status !== 'searching' && results.length === 0)

  return (
    <div className="space-y-3">
      <SearchInput
        id={inputId}
        label="Buscar"
        placeholder="Nombre, alias o teléfono"
        value={search.term}
        onChange={search.onTermChange}
        onSubmit={search.submitNow}
        onClear={search.clear}
        loading={search.showSpinner}
        hint={search.hint}
      />

      {search.status === 'error' ? (
        <div className="space-y-2 py-4 text-center">
          <p className="text-destructive text-sm">{search.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={search.retry}>
            Reintentar
          </Button>
        </div>
      ) : isEmpty ? (
        <p className="text-muted-foreground py-4 text-center text-sm">{emptyMessage}</p>
      ) : (
        /*
          La lista anterior se mantiene mientras llega la nueva: vaciarla en
          cada tecla haria que el dialogo pegara saltos. `aria-busy` avisa a
          un lector de pantalla de que lo que hay se esta actualizando.
        */
        <OptionList label="Clientes" className={listClassName} busy={search.status === 'searching'}>
          {results.map((client) => (
            <OptionListItem
              key={client.id}
              title={client.name}
              description={`${client.alias ? `${client.alias} · ` : ''}${client.phone}`}
              selected={selectedId === client.id}
              disabled={disabled}
              onSelect={() => onSelect(client.id)}
            />
          ))}
        </OptionList>
      )}
    </div>
  )
}
