'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { UserRoundIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
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
import { ClientOptionsPicker } from '@/features/clients/components/ClientOptionsPicker'
import type { ClientOption } from '@/features/clients/queries'
import {
  clientFormDefaults,
  clientFormSchema,
  type ClientFormInput,
} from '@/features/clients/schemas'
import { useRemoteSearch } from '@/features/search/use-remote-search'
import { SEARCH_MIN_CHARS } from '@/lib/search'

import {
  reassignTicketClient,
  reassignTicketToNewClient,
  searchTicketClientOptions,
} from '../actions'
import { reassignTicketClientSchema } from '../schemas'

/** Minimo del motivo. El mismo que exigen el esquema Zod y la RPC. */
const REASON_MIN = 5

type ReassignTicketClientDialogProps = {
  ticketId: string
  /** Los dos numeros, ya formateados: «1234 / 5678» (BR-N11). */
  ticketNumbers: string
  /** A quien pertenece HOY la boleta. Viaja al servidor como `expectedClientId`. */
  currentClientId: string
  currentClientName: string
  currentClientPhone: string | null
  /** Primer bloque de la cartera del vendedor de la boleta, ya acotado en SQL. */
  clients: ClientOption[]
}

/**
 * Corregir el cliente de una boleta vendida (BR-I13, D-168).
 *
 * UN dialogo para los dos portales, como `EditSalePriceDialog`: lo unico que
 * cambia entre el vendedor y el personal es de donde salen los clientes, y eso
 * lo decide el servidor a partir de la boleta, no este componente.
 *
 * NO reutiliza `AssignTicketsForm`. Ese formulario vende: pide fecha de venta y
 * precio, y los tres campos volverian a preguntar por cosas que aqui no
 * cambian. Lo que si se reutiliza es la pieza que de verdad se comparte —elegir
 * o crear un cliente— a traves de `ClientOptionsPicker` y `ClientFormFields`.
 *
 * El motivo y el cliente elegido SOBREVIVEN a un rechazo del servidor: el
 * estado no se limpia al fallar, solo al cerrar.
 */
export function ReassignTicketClientDialog({
  ticketId,
  ticketNumbers,
  currentClientId,
  currentClientName,
  currentClientPhone,
  clients,
}: ReassignTicketClientDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* En el telefono ocupa el ancho y mide 44 px de alto: se pulsa con el
          dedo, igual que las demas acciones de esta pantalla (D-085). El
          texto va SIEMPRE visible junto al icono.

          `sm:w-auto` desde D-169: comparte fila con «Liberar boleta», y dos
          botones que declaran `width: 100%` no reparten bien ese espacio. */}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full sm:h-9 sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <UserRoundIcon className="size-4" aria-hidden />
        Cambiar cliente
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open ? (
            <ReassignFields
              ticketId={ticketId}
              ticketNumbers={ticketNumbers}
              currentClientId={currentClientId}
              currentClientName={currentClientName}
              currentClientPhone={currentClientPhone}
              clients={clients}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ReassignFields({
  ticketId,
  ticketNumbers,
  currentClientId,
  currentClientName,
  currentClientPhone,
  clients,
  onClose,
}: ReassignTicketClientDialogProps & { onClose: () => void }) {
  const router = useRouter()
  const [tab, setTab] = useState<'existing' | 'new'>('existing')
  // Se guarda el cliente ENTERO, no su id: si luego se escribe otra búsqueda,
  // el elegido deja de estar en `search.results` y el resumen de «La boleta
  // pasará a…» se quedaría en blanco con el botón todavía activo.
  const [selected, setSelected] = useState<ClientOption | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: clientFormDefaults,
  })

  /**
   * Un fallo del servidor tiene que llegar al hook como excepcion: es lo que
   * dispara su estado de error y el boton de reintentar. Devolver una lista
   * vacia haria creer que no hay clientes con ese nombre.
   */
  const searchClients = useCallback(
    async (term: string) => {
      const result = await searchTicketClientOptions({ ticketId, term })
      if ('error' in result) throw new Error(result.error)
      return result.data
    },
    [ticketId],
  )

  const search = useRemoteSearch({
    search: searchClients,
    initialResults: clients,
    minChars: SEARCH_MIN_CHARS.people,
  })

  const reasonTooShort = reason.trim().length < REASON_MIN

  function reassignExisting() {
    const parsed = reassignTicketClientSchema.safeParse({
      ticketId,
      expectedClientId: currentClientId,
      newClientId: selected?.id ?? null,
      reason,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await reassignTicketClient(parsed.data)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(
        `La boleta ${ticketNumbers} quedó a nombre de ${selected?.name ?? 'el cliente'}.`,
      )
      onClose()
      router.refresh()
    })
  }

  function reassignNew(values: ClientFormInput) {
    if (reasonTooShort) {
      setError('Explica el motivo con al menos 5 caracteres.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await reassignTicketToNewClient({
        ticketId,
        expectedClientId: currentClientId,
        reason,
        client: values,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(`${values.name} registrado y la boleta ${ticketNumbers} quedó a su nombre.`)
      onClose()
      router.refresh()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cambiar el cliente de la boleta {ticketNumbers}</DialogTitle>
        {/* Lo unico que la pantalla no ensena: que NO cambia nada mas. */}
        <DialogDescription>
          Elige el cliente correcto. Solo cambia el cliente: el precio, la fecha de venta y los
          números de la boleta siguen igual.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {error ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        {/* Quien la tiene AHORA. Sin esto, quien abre el dialogo tendria que
            recordar de memoria a quien se la puso por error. */}
        <div className="bg-muted/40 rounded-lg border px-3 py-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Ahora la tiene
          </p>
          <p className="truncate font-medium">{currentClientName}</p>
          {currentClientPhone ? (
            <p className="text-muted-foreground truncate text-sm">{currentClientPhone}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reassign-reason">Motivo de la corrección</Label>
          <Input
            id="reassign-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isPending}
            maxLength={500}
            placeholder="Ejemplo: la vendí a Ana, no a Carlos"
            aria-describedby="reassign-reason-hint"
          />
          <p id="reassign-reason-hint" className="text-muted-foreground text-xs">
            Queda guardado en el historial de la boleta.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as 'existing' | 'new')}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">
              Cliente existente
            </TabsTrigger>
            <TabsTrigger value="new" className="flex-1">
              Cliente nuevo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-3">
            <ClientOptionsPicker
              inputId="client-search-reassign"
              search={search}
              selectedId={selected?.id ?? null}
              onSelect={(id) =>
                setSelected(search.results.find((client) => client.id === id) ?? null)
              }
              disabled={isPending}
              excludeClientId={currentClientId}
              // Vale con y sin búsqueda: el mismo hueco aparece cuando el
              // vendedor solo tiene a este cliente y cuando lo que se escribió
              // no encontró a nadie más.
              emptyMessage="No encontramos otro cliente de este vendedor. Usa la pestaña «Cliente nuevo»."
            />

            {/* Lo ultimo que se lee antes de confirmar: a quien va a pasar. */}
            {selected ? (
              <p className="rounded-md border px-3 py-2 text-sm">
                La boleta pasará a <span className="font-medium">{selected.name}</span>.
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
                className="h-11 sm:h-9"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={reassignExisting}
                disabled={isPending || selected === null || reasonTooShort}
                className="h-11 sm:h-9"
              >
                {isPending ? 'Guardando...' : 'Cambiar cliente'}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="new">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(reassignNew)} className="space-y-4" noValidate>
                <ClientFormFields form={form} disabled={isPending} compact />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={isPending}
                    className="h-11 sm:h-9"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending || reasonTooShort}
                    className="h-11 sm:h-9"
                  >
                    {isPending ? 'Guardando...' : 'Crear cliente y cambiar'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
