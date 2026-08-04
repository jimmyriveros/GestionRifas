'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClientFormFields } from '@/features/clients/components/ClientFormFields'
import {
  clientFormDefaults,
  clientFormSchema,
  type ClientFormInput,
} from '@/features/clients/schemas'
import type { ClientOption } from '@/features/clients/queries'
import { todayBogota } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { assignTicket, assignTicketToNewClient } from '../actions'

type AssignTicketDialogProps = {
  ticketId: string
  ticketCode: string
  /** Precio VIGENTE de la rifa: es el que quedara congelado en la boleta. */
  rafflePrice: number
  clients: ClientOption[]
}

/**
 * Asignar una boleta: elegir un cliente existente o crear uno sin salir del
 * flujo (CLAUDE.md 17). Pensado para usarse con el pulgar: buscador primero,
 * lista de resultados grande y una sola accion visible.
 */
export function AssignTicketDialog({
  ticketId,
  ticketCode,
  rafflePrice,
  clients,
}: AssignTicketDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Asignar a un cliente
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar la boleta {ticketCode}</DialogTitle>
            <DialogDescription>
              Se registrara la venta por {formatCOP(rafflePrice)}, el precio vigente de la rifa. Ese
              valor queda fijo aunque la rifa cambie de precio despues.
            </DialogDescription>
          </DialogHeader>

          <AssignTicketForm ticketId={ticketId} clients={clients} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function AssignTicketForm({
  ticketId,
  clients,
  onDone,
}: {
  ticketId: string
  clients: ClientOption[]
  onDone: () => void
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'existing' | 'new'>(clients.length > 0 ? 'existing' : 'new')
  const [saleDate, setSaleDate] = useState(todayBogota())
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: clientFormDefaults,
  })

  // BR-C08: se busca por nombre, alias y telefono. La lista ya viene filtrada
  // por RLS a la cartera del vendedor, asi que filtrar en memoria es correcto.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (term === '') return clients.slice(0, 50)
    return clients
      .filter((client) =>
        [client.name, client.alias ?? '', client.phone].some((value) =>
          value.toLowerCase().includes(term),
        ),
      )
      .slice(0, 50)
  }, [clients, search])

  function assignExisting() {
    if (!selectedId) {
      setError('Selecciona un cliente.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await assignTicket({ ticketId, clientId: selectedId, saleDate })
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success('Boleta asignada.')
      onDone()
      router.refresh()
    })
  }

  function assignNew(values: ClientFormInput) {
    setError(null)
    startTransition(async () => {
      const result = await assignTicketToNewClient({ ticketId, saleDate, client: values })
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(`${values.name} registrado y boleta asignada.`)
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
          <div className="space-y-1.5">
            <Label htmlFor="client-search-assign">Buscar</Label>
            <Input
              id="client-search-assign"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, alias o telefono"
              inputMode="search"
              disabled={isPending}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Ningun cliente coincide. Usa la pestana «Cliente nuevo».
            </p>
          ) : (
            <ul className="max-h-56 divide-y overflow-y-auto rounded-md border" role="listbox">
              {filtered.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedId === client.id}
                    onClick={() => setSelectedId(client.id)}
                    disabled={isPending}
                    className={cn(
                      'hover:bg-accent w-full px-3 py-3 text-left text-sm transition-colors',
                      selectedId === client.id && 'bg-primary text-primary-foreground',
                    )}
                  >
                    <span className="font-medium">{client.name}</span>
                    <span
                      className={cn(
                        'block text-xs',
                        selectedId === client.id
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground',
                      )}
                    >
                      {client.alias ? `${client.alias} · ` : ''}
                      {client.phone}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="button" onClick={assignExisting} disabled={isPending || !selectedId}>
              {isPending ? 'Asignando...' : 'Asignar boleta'}
            </Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="new">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(assignNew)} className="space-y-4" noValidate>
              <ClientFormFields form={form} disabled={isPending} compact />

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
