'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { OptionList, OptionListItem } from '@/components/form/OptionList'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { searchClientOptions } from '@/features/clients/actions'
import { ClientFormFields } from '@/features/clients/components/ClientFormFields'
import type { ClientOption } from '@/features/clients/queries'
import {
  clientFormDefaults,
  clientFormSchema,
  type ClientFormInput,
} from '@/features/clients/schemas'
import { SearchInput } from '@/features/search/components/SearchInput'
import { useRemoteSearch } from '@/features/search/use-remote-search'
import { todayBogota } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { SEARCH_MIN_CHARS } from '@/lib/search'

import { assignTickets, assignTicketsToNewClient } from '../actions'

/**
 * El formulario de venta: elegir cliente o crearlo, fecha y confirmar.
 *
 * UNO SOLO para vender una boleta o veinte (seccion 29 del encargo). Recibe
 * SIEMPRE una lista de ids; con un elemento se comporta exactamente como antes.
 * Construir un segundo flujo de asignacion para el caso masivo habria duplicado
 * las reglas y, tarde o temprano, las habria separado.
 *
 * El precio no se calcula aqui: llega ya sumado con el precio vigente de la
 * rifa de cada boleta, porque una organizacion puede tener rifas a precios
 * distintos (seccion 30).
 */
export function AssignTicketsForm({
  ticketIds,
  totalAmount,
  clients,
  onDone,
}: {
  ticketIds: string[]
  /** Suma del precio vigente de la rifa de cada boleta. */
  totalAmount: number
  clients: ClientOption[]
  onDone: () => void
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'existing' | 'new'>(clients.length > 0 ? 'existing' : 'new')
  const [saleDate, setSaleDate] = useState(todayBogota())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const count = ticketIds.length

  const form = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: clientFormDefaults,
  })

  /**
   * Un fallo del servidor tiene que llegar al hook como excepcion: es lo que
   * dispara su estado de error y el boton de reintentar. Devolver una lista
   * vacia haria creer que no hay clientes con ese nombre.
   */
  const searchClients = useCallback(async (term: string) => {
    const result = await searchClientOptions(term)
    if ('error' in result) throw new Error(result.error)
    return result.data
  }, [])

  /**
   * BR-C08: se busca por nombre, alias y telefono, EN EL SERVIDOR.
   *
   * Antes se filtraba en memoria sobre los clientes precargados, y como esa
   * precarga tenia tope, un vendedor con muchos clientes no podia encontrar a
   * los ultimos por mucho que escribiera su nombre (I-036). La RLS sigue
   * limitando el resultado a su cartera; lo que cambia es que ya no hay techo.
   */
  const search = useRemoteSearch({
    search: searchClients,
    initialResults: clients,
    minChars: SEARCH_MIN_CHARS.people,
  })

  function assignExisting() {
    if (!selectedId) {
      setError('Selecciona un cliente.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await assignTickets({ ticketIds, clientId: selectedId, saleDate })
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(result.data.message)
      onDone()
      router.refresh()
    })
  }

  function assignNew(values: ClientFormInput) {
    setError(null)
    startTransition(async () => {
      const result = await assignTicketsToNewClient({ ticketIds, saleDate, client: values })
      if ('error' in result) {
        setError(result.error)
        return
      }
      // Una sola frase para las dos cosas que acaban de pasar: el cliente quedó
      // guardado y las boletas quedaron vendidas.
      const asignadas =
        result.data.count === 1 ? 'boleta asignada' : `${result.data.count} boletas asignadas`
      toast.success(`${values.name} registrado y ${asignadas}.`)
      onDone()
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="sale-date">Fecha de venta</Label>
        <Input
          id="sale-date"
          type="date"
          value={saleDate}
          onChange={(event) => setSaleDate(event.target.value)}
          disabled={isPending}
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as 'existing' | 'new')}>
        <TabsList className="w-full">
          <TabsTrigger value="existing" className="flex-1" disabled={clients.length === 0}>
            Cliente existente
          </TabsTrigger>
          <TabsTrigger value="new" className="flex-1">
            Cliente nuevo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="existing" className="space-y-3">
          <SearchInput
            id="client-search-assign"
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
          ) : search.isEmpty ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Ningún cliente coincide. Usa la pestaña «Cliente nuevo».
            </p>
          ) : (
            /*
              La lista anterior se mantiene mientras llega la nueva: vaciarla en
              cada tecla haria que el dialogo pegara saltos. `aria-busy` avisa a
              un lector de pantalla de que lo que hay se esta actualizando.
            */
            <OptionList
              label="Clientes"
              className="max-h-56 overflow-y-auto"
              busy={search.status === 'searching'}
            >
              {search.results.map((client) => (
                <OptionListItem
                  key={client.id}
                  title={client.name}
                  description={`${client.alias ? `${client.alias} · ` : ''}${client.phone}`}
                  selected={selectedId === client.id}
                  disabled={isPending}
                  onSelect={() => setSelectedId(client.id)}
                />
              ))}
            </OptionList>
          )}

          <SaleSummary count={count} totalAmount={totalAmount} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="button" onClick={assignExisting} disabled={isPending || !selectedId}>
              {isPending ? 'Asignando...' : assignLabel(count)}
            </Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="new">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(assignNew)} className="space-y-4" noValidate>
              <ClientFormFields form={form} disabled={isPending} compact />

              <SaleSummary count={count} totalAmount={totalAmount} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Guardando...' : 'Crear cliente y asignar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function assignLabel(count: number): string {
  return count === 1 ? 'Asignar boleta' : `Asignar ${count} boletas`
}

/** Cuantas boletas y por cuanto: lo ultimo que se lee antes de confirmar. */
function SaleSummary({ count, totalAmount }: { count: number; totalAmount: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span>{count === 1 ? '1 boleta' : `${count} boletas`}</span>
      <span className="font-medium tabular-nums">{formatCOP(totalAmount)}</span>
    </div>
  )
}
