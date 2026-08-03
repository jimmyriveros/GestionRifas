'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { TicketNumberInput } from '@/components/form/TicketNumberInput'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { createTicket } from '../actions'
import { createTicketSchema, type CreateTicketInput } from '../schemas'

type TicketFormProps = {
  raffles: { id: string; name: string; shortCode: string }[]
  sellers: { id: string; fullName: string }[]
  defaultRaffleId?: string
  defaultSellerId?: string
}

/** Creacion individual de una boleta por parte de Owner o Admin. */
export function TicketForm({
  raffles,
  sellers,
  defaultRaffleId,
  defaultSellerId,
}: TicketFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      raffleId: defaultRaffleId ?? raffles[0]?.id ?? '',
      sellerId: defaultSellerId ?? sellers[0]?.id ?? '',
      dailyNumber: '',
      weeklyNumber: '',
    },
  })

  function onSubmit(values: CreateTicketInput) {
    setServerError(null)
    startTransition(async () => {
      const result = await createTicket(values)
      if ('error' in result) {
        setServerError(result.error)
        return
      }
      toast.success('Boleta creada y disponible para asignar.')
      router.push(`/owner/tickets/${result.data.id}`)
      router.refresh()
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl space-y-5" noValidate>
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
          name="raffleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rifa</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona una rifa" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {raffles.map((raffle) => (
                    <SelectItem key={raffle.id} value={raffle.id}>
                      {raffle.shortCode} — {raffle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sellerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vendedor</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un vendedor" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {sellers.map((seller) => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="dailyNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Numero diario</FormLabel>
                <FormControl>
                  <TicketNumberInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="weeklyNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Numero semanal</FormLabel>
                <FormControl>
                  <TicketNumberInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <p className="text-muted-foreground text-sm">
          Entre 1 y 4 digitos cada uno. Los ceros iniciales se conservan y la combinacion completa
          no puede repetirse dentro de la misma rifa, ni siquiera entre vendedores.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creando...' : 'Crear boleta'}
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
