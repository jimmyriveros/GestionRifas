'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { PaymentAccount } from '@/features/payment-accounts/accounts'
import { activeAccounts } from '@/features/payment-accounts/accounts'
import { WEEKDAY_LABELS } from '@/lib/constants'

import { createPaymentReminder, updatePaymentReminder } from '../actions'
import {
  buildReminderMessage,
  DEFAULT_REMINDER_MESSAGE,
  REMINDER_COPY,
  REMINDER_MESSAGE_MAX_LENGTH,
  type PaymentReminder,
} from '../reminders'
import {
  paymentReminderDefaults,
  paymentReminderSchema,
  type PaymentReminderInput,
} from '../schemas'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

/**
 * Crear o corregir un recordatorio de pago (BR-S02, BR-S06, BR-S07, D-188).
 *
 * UN formulario para las dos cosas, como `PaymentAccountDialog`. El formulario
 * vive en un componente aparte que Radix monta y desmonta con el dialogo: cada
 * apertura empieza con valores frescos.
 */
export function PaymentReminderDialog({
  open,
  onOpenChange,
  reminder,
  accounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  reminder?: PaymentReminder
  accounts: PaymentAccount[]
}) {
  const isEdit = reminder !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? REMINDER_COPY.form.editTitle : REMINDER_COPY.form.createTitle}
          </DialogTitle>
          <DialogDescription>{REMINDER_COPY.description}</DialogDescription>
        </DialogHeader>

        <PaymentReminderForm
          reminder={reminder}
          accounts={accounts}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function PaymentReminderForm({
  reminder,
  accounts,
  onDone,
}: {
  reminder?: PaymentReminder
  accounts: PaymentAccount[]
  onDone: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEdit = reminder !== undefined
  const active = activeAccounts(accounts)

  const form = useForm<PaymentReminderInput>({
    resolver: zodResolver(paymentReminderSchema),
    defaultValues: reminder
      ? {
          weekday: reminder.weekday,
          // `HH:MM:SS` de PostgreSQL → `HH:MM`, que es lo que entiende el campo.
          timeOfDay: reminder.timeOfDay.slice(0, 5),
          useCustomMessage: reminder.useCustomMessage,
          customMessage: reminder.customMessage ?? '',
        }
      : paymentReminderDefaults,
  })

  const useCustom = useWatch({ control: form.control, name: 'useCustomMessage' })
  const customMessage = useWatch({ control: form.control, name: 'customMessage' })

  /**
   * LO QUE DE VERDAD VAN A LEER EN EL GRUPO, ahora mismo.
   *
   * Esta vista previa es la pieza que sostiene toda la decision de BR-S07, igual
   * que la de WhatsApp sostiene BR-W04: como las cuentas se añaden siempre al
   * final y nunca se escriben dentro del texto, la unica forma de que eso no sea
   * una promesa a ciegas es enseñar el mensaje COMPLETO mientras se escribe.
   */
  const preview = buildReminderMessage(
    {
      id: reminder?.id ?? '',
      weekday: 1,
      timeOfDay: '00:00:00',
      status: 'active',
      useCustomMessage: useCustom,
      customMessage: customMessage ?? '',
    },
    accounts,
  )

  function onSubmit(values: PaymentReminderInput) {
    setServerError(null)
    startTransition(async () => {
      const result = reminder
        ? await updatePaymentReminder({ ...values, reminderId: reminder.id })
        : await createPaymentReminder(values)

      if ('error' in result) {
        setServerError(result.error)
        return
      }
      toast.success(isEdit ? REMINDER_COPY.updated : REMINDER_COPY.created)
      onDone()
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

        {/* ------------------------------------------------- Día y hora ------ */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="weekday"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{REMINDER_COPY.form.weekday}</FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(value) => field.onChange(Number(value))}
                  disabled={isPending}
                >
                  <FormControl>
                    <SelectTrigger size="touch" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {WEEKDAYS.map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {WEEKDAY_LABELS[day]}
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
            name="timeOfDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{REMINDER_COPY.form.time}</FormLabel>
                <FormControl>
                  <Input {...field} type="time" size="touch" disabled={isPending} />
                </FormControl>
                <FormDescription>{REMINDER_COPY.form.timeHelp}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* --------------------------------------------------- El mensaje ---- */}
        <div className="space-y-3">
          <FormField
            control={form.control}
            name="useCustomMessage"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-3">
                <FormLabel htmlFor="reminder-custom-toggle" className="cursor-pointer">
                  {REMINDER_COPY.form.toggle}
                </FormLabel>
                <FormControl>
                  <Switch
                    id="reminder-custom-toggle"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked)
                      // Al encender por primera vez se arranca del
                      // predeterminado: retocar un texto es mucho mas facil que
                      // escribir uno en blanco, y evita el area vacia que el
                      // propio formulario tendria que rechazar despues (la misma
                      // decision que el mensaje de WhatsApp).
                      if (checked && (customMessage ?? '').trim() === '') {
                        form.setValue('customMessage', DEFAULT_REMINDER_MESSAGE)
                      }
                    }}
                    disabled={isPending}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="customMessage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{REMINDER_COPY.form.message}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    // Apagado enseña el predeterminado y no deja escribir: se ve
                    // cual es el texto que se esta usando, sin poder cambiarlo
                    // por error.
                    value={useCustom ? field.value : DEFAULT_REMINDER_MESSAGE}
                    readOnly={!useCustom}
                    disabled={isPending}
                    rows={6}
                    maxLength={REMINDER_MESSAGE_MAX_LENGTH}
                    className={useCustom ? undefined : 'bg-muted text-muted-foreground'}
                  />
                </FormControl>
                <FormDescription>
                  {useCustom ? REMINDER_COPY.form.customHint : REMINDER_COPY.form.defaultHint}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {useCustom ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                // Vuelve al predeterminado y APAGA el interruptor. Las dos
                // cosas: dejarlo encendido con una copia del predeterminado
                // guardaria un texto que dejaria de mejorar cuando mejore el
                // original (BR-S06, como BR-W02).
                form.setValue('useCustomMessage', false)
                form.setValue('customMessage', '')
              }}
            >
              {REMINDER_COPY.form.restore}
            </Button>
          ) : null}
        </div>

        {/* ------------------------------------------------- Vista previa ---- */}
        <div className="space-y-1.5">
          <p className="text-label-medium">{REMINDER_COPY.form.preview}</p>
          {/*
            `whitespace-pre-wrap` conserva los saltos de linea tal como se
            escribieron. Es un nodo de TEXTO: lo que se escriba arriba no se
            interpreta como HTML aqui ni en ningun otro sitio.
          */}
          <div className="bg-muted/50 text-body-small rounded-md border px-3 py-2 whitespace-pre-wrap">
            {preview}
          </div>

          {/*
            Sin cuentas activas el mensaje sale sin ellas, y se dice FUERA de la
            vista previa: dentro seria meter un aviso del sistema en un texto que
            lee un cliente. Con la salida a mano (D-188).
          */}
          {active.length === 0 ? (
            <p className="text-body-small text-muted-foreground">
              {REMINDER_COPY.form.noAccounts}{' '}
              <Link href="/seller/settings/accounts" className="underline underline-offset-2">
                {REMINDER_COPY.form.noAccountsAction}
              </Link>
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={onDone}
            disabled={isPending}
          >
            {REMINDER_COPY.form.cancel}
          </Button>
          <Button type="submit" size="touch" disabled={isPending}>
            {isPending
              ? 'Guardando...'
              : isEdit
                ? REMINDER_COPY.form.submitEdit
                : REMINDER_COPY.form.submitCreate}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
