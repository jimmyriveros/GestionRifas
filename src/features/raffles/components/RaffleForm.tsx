'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { Notice } from '@/components/feedback/Notice'
import { MoneyInput } from '@/components/form/MoneyInput'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { RAFFLE_WIZARD_COPY } from '@/features/raffle-prizes/copy'
import { DEFAULT_TICKET_PRICE, type RaffleStatus } from '@/lib/constants'
import { todayBogota } from '@/lib/dates'
import { hasInternalHistory } from '@/lib/navigation-history'

import { createRaffle, updateRaffle } from '../actions'
import { RAFFLE_DATE_CHANGE_NOTICE, raffleDateChangeAnnounced } from '../date-change'
import { createRaffleSchema, raffleFormDefaults, type CreateRaffleInput } from '../schemas'

type RaffleFormProps = {
  raffle?: CreateRaffleInput & { id: string }
  /**
   * El estado de la rifa que se EDITA. Con una activa, cambiar sus fechas avisa
   * a las demás personas de la organización, y el formulario lo dice antes de
   * guardar (BR-R12, D-206).
   */
  status?: RaffleStatus
  /**
   * A dónde se vuelve al guardar o cancelar una EDICIÓN: el detalle, o los
   * premios si se abrió desde el proceso de crear la rifa (D-202). Lo compone la
   * página con un origen cerrado (`edit-origin.ts`); el formulario no lee la URL.
   */
  returnHref?: string
}

export function RaffleForm({ raffle, status, returnHref }: RaffleFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEdit = raffle !== undefined
  const leaveHref = raffle ? (returnHref ?? `/owner/raffles/${raffle.id}`) : '/owner/raffles'

  const form = useForm<CreateRaffleInput>({
    resolver: zodResolver(createRaffleSchema),
    defaultValues: raffle ?? { ...raffleFormDefaults, startDate: todayBogota() },
  })

  // `useWatch` y no `form.watch()`, como en PaymentAccountDialog: el compilador de
  // React no puede memorizar lo que devuelve el segundo.
  const [startDate, endDate] = useWatch({ control: form.control, name: ['startDate', 'endDate'] })
  const announcesDates =
    raffle !== undefined &&
    status !== undefined &&
    raffleDateChangeAnnounced({ status, saved: raffle, current: { startDate, endDate } })

  function onSubmit(values: CreateRaffleInput) {
    setServerError(null)
    startTransition(async () => {
      if (raffle) {
        const result = await updateRaffle({ ...values, id: raffle.id })
        if ('error' in result) {
          setServerError(result.error)
          return
        }
        toast.success('Rifa actualizada.')
        router.push(leaveHref)
      } else {
        const result = await createRaffle(values)
        if ('error' in result) {
          setServerError(result.error)
          return
        }
        // La rifa nueva nace en BORRADOR y en modo configurable (D-202): el
        // proceso sigue en sus premios, que es lo que le falta para activarse.
        toast.success(RAFFLE_WIZARD_COPY.created)
        router.push(`/owner/raffles/${result.data.id}/prizes`)
      }
      router.refresh()
    })
  }

  /**
   * Cancelar hace lo mismo que la flecha de `PageHeader` (D-089): con historial
   * interno vuelve atrás, que conserva el desplazamiento de la pantalla de la
   * que se vino; sin él —recarga, enlace pegado—, va al origen cerrado.
   */
  function leaveWithoutSaving() {
    if (hasInternalHistory()) router.back()
    else router.push(leaveHref)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-5" noValidate>
        {serverError ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {serverError}
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de la rifa</FormLabel>
              <FormControl>
                <Input placeholder="Rifa Navidad 2026" disabled={isPending} {...field} />
              </FormControl>
              <FormDescription>Debe ser único dentro de la organización.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción (opcional)</FormLabel>
              <FormControl>
                <Textarea rows={3} disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="ticketPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Precio de la boleta</FormLabel>
              <FormControl>
                <MoneyInput
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? undefined)}
                  onBlur={field.onBlur}
                  name={field.name}
                  disabled={isPending}
                />
              </FormControl>
              <FormDescription>
                Predeterminado {DEFAULT_TICKET_PRICE.toLocaleString('es-CO')} pesos. Cambiarlo no
                altera el precio de las boletas ya vendidas.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de inicio</FormLabel>
                <FormControl>
                  <Input type="date" disabled={isPending} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de fin</FormLabel>
                <FormControl>
                  <Input type="date" disabled={isPending} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/*
          La region vive siempre y el aviso entra y sale de ella, como el de
          recalcular la ganancia (TeamCommissionDialog): una region que aparece ya
          escrita no se anuncia de forma fiable.
        */}
        <div role="status" className="empty:sr-only">
          {announcesDates ? (
            <Notice tone="info" density="compact">
              {RAFFLE_DATE_CHANGE_NOTICE}
            </Notice>
          ) : null}
        </div>

        <FormField
          control={form.control}
          name="allowSellerTicketCreation"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <FormLabel>Permitir que los vendedores creen boletas</FormLabel>
                <FormDescription>
                  Las boletas que cree un vendedor quedan pendientes de aprobación hasta que un
                  administrador las apruebe.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isPending}
                  aria-label="Permitir que los vendedores creen boletas"
                />
              </FormControl>
            </FormItem>
          )}
        />

        {/*
          En el telefono las dos acciones ocupan el ancho y miden 44 px, igual
          que en el formulario de cliente: enviar no puede depender de acertar
          un boton pequeño al final de la pagina. Desde `sm` vuelven a su
          tamaño de siempre, uno al lado del otro.
        */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="submit" size="touch" disabled={isPending} className="w-full sm:w-auto">
            {isPending
              ? isEdit
                ? 'Guardando...'
                : 'Creando...'
              : isEdit
                ? 'Guardar cambios'
                : 'Crear rifa'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={leaveWithoutSaving}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  )
}
