'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { createPrize, publishPrizeVersion } from '../actions'
import {
  PRIZE_CATEGORY_LABELS,
  PRIZE_CATEGORY_VALUES,
  PRIZE_COPY,
  PRIZE_DIGITS_FULL_LABELS,
  PRIZE_FORM_COPY,
  PRIZE_NUMBER_FIELD_LABELS,
  PRIZE_PANEL_COPY,
} from '../copy'
import { singleDateRule } from '../schedule'
import { prizeFormDefaults, prizeFormSchema, type PrizeFormInput } from '../schemas'
import { PrizeRewardField } from './PrizeRewardField'
import { PrizeScheduleField } from './PrizeScheduleField'

import type { PrizeListItem } from '../queries'

/**
 * Agregar o corregir un premio (BR-J01, BR-J09, D-202).
 *
 * UN formulario para las dos cosas, como `PaymentAccountDialog`: los campos,
 * sus mensajes y su validación son los mismos, y editar no es otra pantalla
 * sino publicar una versión nueva. El formulario vive en un componente aparte
 * que Radix monta y desmonta con el diálogo, así que cada apertura empieza con
 * valores frescos sin sincronizar estado con un efecto.
 *
 * CONTROL OPTIMISTA (BR-J09): al editar se manda la versión que se estaba
 * viendo. Si alguien la cambió mientras tanto, la base rechaza con su frase y
 * aquí se recargan los datos en vez de sobrescribir lo que hizo el otro.
 */
export function PrizeDialog({
  open,
  onOpenChange,
  raffle,
  prize,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  raffle: { id: string; startDate: string; endDate: string }
  prize?: PrizeListItem
}) {
  const isEdit = prize !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? PRIZE_FORM_COPY.editTitle : PRIZE_FORM_COPY.createTitle}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? PRIZE_FORM_COPY.editDescription : PRIZE_FORM_COPY.createDescription}
          </DialogDescription>
        </DialogHeader>

        <PrizeForm raffle={raffle} prize={prize} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function PrizeForm({
  raffle,
  prize,
  onDone,
}: {
  raffle: { id: string; startDate: string; endDate: string }
  prize?: PrizeListItem
  onDone: () => void
}) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEdit = prize !== undefined

  const form = useForm<PrizeFormInput>({
    resolver: zodResolver(prizeFormSchema),
    defaultValues: prize
      ? {
          title: prize.title,
          category: prize.category,
          conditions: prize.conditions ?? '',
          reward: prize.reward,
          numberField: prize.numberField,
          digits: prize.digits,
          rules: prize.rules,
        }
      : // Un premio nuevo arranca con UN periodo —el primer dia de la rifa—: sin
        // el, el boton diria «Agregar otro periodo» sin haber ninguno.
        { ...prizeFormDefaults, rules: [singleDateRule(raffle.startDate)] },
  })

  function onSubmit(values: PrizeFormInput) {
    setServerError(null)
    startTransition(async () => {
      if (prize) {
        const result = await publishPrizeVersion({
          ...values,
          prizeId: prize.id,
          expectedVersionId: prize.versionId,
        })
        if ('error' in result) {
          setServerError(result.error)
          // La versión que se estaba viendo pudo quedar vieja: se recarga lo
          // que hay de verdad en vez de insistir sobre ello (BR-J09).
          router.refresh()
          return
        }
        toast.success(
          result.data.versionNumber === prize.versionNumber
            ? PRIZE_PANEL_COPY.unchanged
            : PRIZE_PANEL_COPY.updated,
        )
      } else {
        const result = await createPrize({ ...values, raffleId: raffle.id })
        if ('error' in result) {
          setServerError(result.error)
          return
        }
        toast.success(PRIZE_PANEL_COPY.created)
      }

      onDone()
      router.refresh()
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {serverError ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {serverError}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{PRIZE_FORM_COPY.titleLabel}</FormLabel>
                <FormControl>
                  <Input
                    size="touch"
                    placeholder={PRIZE_FORM_COPY.titlePlaceholder}
                    disabled={isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{PRIZE_FORM_COPY.categoryLabel}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                  <FormControl>
                    <SelectTrigger size="touch" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PRIZE_CATEGORY_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {PRIZE_CATEGORY_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{PRIZE_FORM_COPY.categoryHelp}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <PrizeRewardField disabled={isPending} />

        <fieldset className="space-y-4 rounded-lg border p-4" disabled={isPending}>
          <legend className="text-body-medium px-1 font-medium">
            {PRIZE_FORM_COPY.numberLegend}
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="numberField"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{PRIZE_FORM_COPY.numberFieldLabel}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <FormControl>
                      <SelectTrigger size="touch" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(['daily_number', 'weekly_number'] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {PRIZE_NUMBER_FIELD_LABELS[value]}
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
              name="digits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{PRIZE_FORM_COPY.digitsLabel}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <FormControl>
                      <SelectTrigger size="touch" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(['four', 'last_three'] as const).map((value) => (
                        <SelectItem key={value} value={value}>
                          {PRIZE_DIGITS_FULL_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{PRIZE_FORM_COPY.digitsHelp}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        <PrizeScheduleField raffle={raffle} disabled={isPending} />

        <FormField
          control={form.control}
          name="conditions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{PRIZE_FORM_COPY.conditionsLabel}</FormLabel>
              <FormControl>
                <Textarea rows={3} disabled={isPending} {...field} />
              </FormControl>
              <FormDescription>{PRIZE_COPY.form.conditionsNotice}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="submit" size="touch" disabled={isPending} className="w-full sm:w-auto">
            {isPending
              ? PRIZE_FORM_COPY.pending
              : isEdit
                ? PRIZE_FORM_COPY.submitEdit
                : PRIZE_FORM_COPY.submitCreate}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={isPending}
            onClick={onDone}
            className="w-full sm:w-auto"
          >
            {PRIZE_FORM_COPY.cancel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
