'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

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
import { DEFAULT_TICKET_PRICE } from '@/lib/constants'
import { todayBogota } from '@/lib/dates'

import { createRaffle, updateRaffle } from '../actions'
import { createRaffleSchema, raffleFormDefaults, type CreateRaffleInput } from '../schemas'

type RaffleFormProps = {
  raffle?: CreateRaffleInput & { id: string }
}

export function RaffleForm({ raffle }: RaffleFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEdit = raffle !== undefined

  const form = useForm<CreateRaffleInput>({
    resolver: zodResolver(createRaffleSchema),
    defaultValues: raffle ?? { ...raffleFormDefaults, startDate: todayBogota() },
  })

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
        router.push(`/owner/raffles/${raffle.id}`)
      } else {
        const result = await createRaffle(values)
        if ('error' in result) {
          setServerError(result.error)
          return
        }
        toast.success('Rifa creada. Activala cuando este lista para vender.')
        router.push(`/owner/raffles/${result.data.id}`)
      }
      router.refresh()
    })
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
              <FormDescription>Debe ser unico dentro de la organizacion.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripcion (opcional)</FormLabel>
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

        <FormField
          control={form.control}
          name="allowSellerTicketCreation"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <FormLabel>Permitir que los vendedores creen boletas</FormLabel>
                <FormDescription>
                  Las boletas que cree un vendedor quedan pendientes de aprobacion hasta que un
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

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear rifa'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  )
}
