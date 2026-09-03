'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { MoneyInput } from '@/components/form/MoneyInput'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { searchClientOptions } from '@/features/clients/actions'
import { ClientFormFields } from '@/features/clients/components/ClientFormFields'
import { ClientOptionsPicker } from '@/features/clients/components/ClientOptionsPicker'
import type { ClientOption } from '@/features/clients/queries'
import {
  clientFormDefaults,
  clientFormSchema,
  type ClientFormInput,
} from '@/features/clients/schemas'
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
 *
 * REBAJAR EL PRECIO (BR-P09, D-099). Cuando todas las boletas del lote comparten
 * precio oficial y limite, aparece la casilla «Precio de venta», precargada con
 * el precio oficial. Quien no quiera rebajar nada no tiene que tocarla: vender
 * al precio de la rifa sigue siendo el camino de en medio, sin pasos nuevos
 * (seccion 6 del encargo).
 *
 * Lo que se valida aqui es para AVISAR, no para autorizar: el limite de verdad
 * lo aplica `assign_ticket_row` contra la forma de pago real del vendedor y con
 * la fila bloqueada.
 */
export function AssignTicketsForm({
  ticketIds,
  totalAmount,
  clients,
  onDone,
  showSummary = true,
  priceRange = null,
  onUnitPriceChange,
}: {
  ticketIds: string[]
  /** Suma del precio vigente de la rifa de cada boleta. */
  totalAmount: number
  clients: ClientOption[]
  onDone: () => void
  /** Oculta el resumen de cantidad/total antes de los botones: quien llama ya
   *  lo muestra en otro lugar (BulkAssignDialog, seccion superior del modal). */
  showSummary?: boolean
  /** Precio oficial y precio minimo comunes a TODAS las boletas del lote. `null`
   *  cuando no coinciden —una seleccion de varias rifas—: entonces no hay un
   *  precio unico que proponer y cada boleta se vende al de su rifa. */
  priceRange?: { basePrice: number; minSalePrice: number } | null
  /** Avisa del precio elegido a quien muestre un total FUERA del formulario
   *  (BulkAssignDialog, resumen superior). Sin esto habria dos totales en el
   *  mismo modal y el de arriba se quedaria con el precio sin rebajar. El
   *  valor sigue viviendo aqui: esto solo lo comunica. */
  onUnitPriceChange?: (unitPrice: number | null) => void
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'existing' | 'new'>(clients.length > 0 ? 'existing' : 'new')
  const [saleDate, setSaleDate] = useState(todayBogota())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [salePrice, setSalePrice] = useState<number | null>(priceRange?.basePrice ?? null)

  const count = ticketIds.length

  const priceError = priceRange ? checkPrice(salePrice, priceRange) : null
  const unitPrice = priceRange ? (salePrice ?? 0) : null
  const discount = priceRange && salePrice !== null ? priceRange.basePrice - salePrice : 0
  const total = unitPrice === null ? totalAmount : unitPrice * count

  /** Lo que se manda al servidor: nada cuando no hay casilla que enviar. */
  const priceToSend = priceRange && salePrice !== null ? salePrice : undefined

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
    if (priceError) {
      setError(priceError)
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await assignTickets({
        ticketIds,
        clientId: selectedId,
        saleDate,
        salePrice: priceToSend,
      })
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
    if (priceError) {
      setError(priceError)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await assignTicketsToNewClient({
        ticketIds,
        saleDate,
        salePrice: priceToSend,
        client: values,
      })
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

      {priceRange ? (
        <PriceField
          value={salePrice}
          onChange={(value) => {
            setSalePrice(value)
            onUnitPriceChange?.(value)
          }}
          range={priceRange}
          error={priceError}
          disabled={isPending}
        />
      ) : null}

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
          <ClientOptionsPicker
            inputId="client-search-assign"
            search={search}
            selectedId={selectedId}
            onSelect={setSelectedId}
            disabled={isPending}
            emptyMessage="Ningún cliente coincide. Usa la pestaña «Cliente nuevo»."
          />

          {showSummary ? (
            <SaleSummary count={count} totalAmount={total} discount={discount} />
          ) : null}

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

              {showSummary ? (
                <SaleSummary count={count} totalAmount={total} discount={discount} />
              ) : null}

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

/**
 * Por que no vale el precio escrito, en las palabras de quien lo escribio.
 *
 * Devuelve `null` cuando esta bien. Es lo MISMO que comprueba
 * `assign_ticket_row`, dicho antes de pulsar el boton para no gastarle un viaje
 * al servidor a alguien que solo se paso de rebaja.
 */
function checkPrice(
  value: number | null,
  range: { basePrice: number; minSalePrice: number },
): string | null {
  if (value === null || value <= 0) return 'Escribe el precio de venta.'
  if (value > range.basePrice) {
    return `El precio de la rifa es ${formatCOP(range.basePrice)}. Puedes vender más barato, no más caro.`
  }
  if (value < range.minSalePrice) {
    return `Es más barato de lo que puedes rebajar. El precio más bajo es ${formatCOP(range.minSalePrice)}.`
  }
  return null
}

/**
 * «Precio de venta»: la casilla que permite hacer una rebaja (seccion 6 del
 * encargo).
 *
 * Llega precargada con el precio de la rifa y la mayoria de las ventas no la
 * tocan. Lo que se explica debajo es la CONSECUENCIA —de donde sale la
 * rebaja—, porque es lo unico que la persona no puede deducir mirando la
 * pantalla.
 */
function PriceField({
  value,
  onChange,
  range,
  error,
  disabled,
}: {
  value: number | null
  onChange: (value: number | null) => void
  range: { basePrice: number; minSalePrice: number }
  error: string | null
  disabled: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="sale-price">Precio de venta</Label>
      <MoneyInput
        id="sale-price"
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={error !== null}
        aria-describedby="sale-price-hint"
      />
      <p
        id="sale-price-hint"
        className={error ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}
        role={error ? 'alert' : undefined}
      >
        {error ??
          `Puedes rebajarlo hasta ${formatCOP(range.minSalePrice)}. Lo que rebajes sale de la ganancia del vendedor.`}
      </p>
    </div>
  )
}

/**
 * Cuantas boletas y por cuanto: lo ultimo que se lee antes de confirmar.
 *
 * La rebaja solo aparece cuando existe. Anunciar «descuento $0» en la venta
 * normal seria ruido en la pantalla que mas se usa (seccion 11 del encargo).
 */
function SaleSummary({
  count,
  totalAmount,
  discount = 0,
}: {
  count: number
  totalAmount: number
  discount?: number
}) {
  return (
    <div className="space-y-1 rounded-md border px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <span>{count === 1 ? '1 boleta' : `${count} boletas`}</span>
        <span className="font-medium tabular-nums">{formatCOP(totalAmount)}</span>
      </div>
      {discount > 0 ? (
        <p className="text-muted-foreground text-xs">
          Rebaja de {formatCOP(discount)} {count === 1 ? 'en la boleta' : 'en cada boleta'}.
        </p>
      ) : null}
    </div>
  )
}
