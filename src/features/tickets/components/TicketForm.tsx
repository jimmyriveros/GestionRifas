'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { FormNoScriptNotice, HydratedSubmitButton } from '@/components/form/HydratedSubmitButton'
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

import {
  LEGACY_NUMBER_FORMAT,
  numberGroupTitle,
  ticketNumbersProblem,
  type RaffleNumberFormat,
} from '@/lib/ticket-number-format'

import { createTicket } from '../actions'
import { createTicketSchema, type CreateTicketInput } from '../schemas'
import { ticketNumbersHelp } from './TicketNumberFields'

type TicketFormProps = {
  /** D-261: cada rifa con sus números; los campos siguen a la elegida. */
  raffles: { id: string; name: string; shortCode: string; numberFormat?: RaffleNumberFormat }[]
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

  const raffleId = useWatch({ control: form.control, name: 'raffleId' })
  const format = raffles.find((raffle) => raffle.id === raffleId)?.numberFormat ?? LEGACY_NUMBER_FORMAT
  const [firstGroup, secondGroup] = format.groups

  function onSubmit(values: CreateTicketInput) {
    setServerError(null)
    // D-261: las cifras exactas de la rifa elegida, con la frase de la base.
    const weekly = secondGroup ? values.weeklyNumber : ''
    const problem = ticketNumbersProblem(format, values.dailyNumber, weekly || null, true)
    if (problem) {
      setServerError(problem)
      return
    }
    startTransition(async () => {
      const result = await createTicket({ ...values, weeklyNumber: weekly })
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
      {/* `method="post"` y el botón de abajo: antes de hidratar, nada de lo escrito puede ir en la
          URL (I-204, D-249). */}
      <form
        method="post"
        onSubmit={form.handleSubmit(onSubmit)}
        className="max-w-xl space-y-5"
        noValidate
      >
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

        <div className={secondGroup ? 'grid grid-cols-2 gap-4' : 'grid grid-cols-1 gap-4'}>
          <FormField
            control={form.control}
            name="dailyNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{numberGroupTitle(firstGroup.name)}</FormLabel>
                <FormControl>
                  <TicketNumberInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    maxDigits={firstGroup.digits}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {secondGroup ? (
            <FormField
              control={form.control}
              name="weeklyNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{numberGroupTitle(secondGroup.name)}</FormLabel>
                  <FormControl>
                    <TicketNumberInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      maxDigits={secondGroup.digits}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>

        <p className="text-muted-foreground text-sm">
          {ticketNumbersHelp(format)}{' '}
          {secondGroup
            ? 'La combinación completa no puede repetirse dentro de la misma rifa, ni siquiera entre vendedores.'
            : 'El número no puede repetirse dentro de la misma rifa, ni siquiera entre vendedores.'}
        </p>

        <FormNoScriptNotice className="mb-5" />

        <div className="flex flex-wrap gap-2">
          <HydratedSubmitButton pending={isPending} pendingLabel="Creando...">
            Crear boleta
          </HydratedSubmitButton>
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
