'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { PhoneInput } from '@/components/form/PhoneInput'
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
import { BANK_ACCOUNT_TYPE_LABELS, PAYMENT_ACCOUNT_KIND_LABELS } from '@/lib/constants'

import { createPaymentAccount, updatePaymentAccount } from '../actions'
import {
  ACCOUNT_COPY,
  BANK_ACCOUNT_TYPES,
  PAYMENT_ACCOUNT_KINDS,
  type PaymentAccount,
} from '../accounts'
import { paymentAccountDefaults, paymentAccountSchema, type PaymentAccountInput } from '../schemas'

/**
 * Agregar o corregir una cuenta para recibir pagos (BR-M04, D-188).
 *
 * UN formulario para las dos cosas, parametrizado por `account`, como
 * `UserDialog` hace con el alta y la edicion: los campos, sus mensajes y su
 * validacion son los mismos y no hay dos sitios donde arreglar lo mismo.
 *
 * EL TIPO NO SE PUEDE CAMBIAR AL EDITAR, y la pantalla lo enseña en vez de
 * ofrecerlo: un Nequi que pasa a ser una cuenta bancaria es otra cuenta, y
 * dejarlo cambiar obligaria a vaciar y rellenar cuatro campos en la misma
 * operacion. La RPC tampoco lo recibe.
 *
 * El formulario vive en un componente aparte que Radix monta y desmonta con el
 * dialogo: cada apertura empieza con valores frescos, sin sincronizar estado
 * con un efecto (el patron de `UserDialog`).
 */
export function PaymentAccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: PaymentAccount
}) {
  const isEdit = account !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? ACCOUNT_COPY.form.editTitle : ACCOUNT_COPY.form.createTitle}
          </DialogTitle>
          <DialogDescription>{ACCOUNT_COPY.description}</DialogDescription>
        </DialogHeader>

        <PaymentAccountForm account={account} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function PaymentAccountForm({
  account,
  onDone,
}: {
  account?: PaymentAccount
  onDone: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEdit = account !== undefined

  const form = useForm<PaymentAccountInput>({
    resolver: zodResolver(paymentAccountSchema),
    defaultValues: account
      ? {
          kind: account.kind,
          holderName: account.holderName,
          phone: account.phone ?? '',
          bankName: account.bankName ?? '',
          accountType: account.accountType,
          accountNumber: account.accountNumber ?? '',
          label: account.label ?? '',
        }
      : paymentAccountDefaults,
  })

  // `useWatch` y no `form.watch()`: el segundo devuelve una funcion que el
  // compilador de React no puede memorizar (la lección de `UserDialog`).
  const kind = useWatch({ control: form.control, name: 'kind' })
  const isBank = kind === 'bank'

  function onSubmit(values: PaymentAccountInput) {
    setServerError(null)
    startTransition(async () => {
      const result = account
        ? await updatePaymentAccount({ ...values, accountId: account.id })
        : await createPaymentAccount(values)

      if ('error' in result) {
        setServerError(result.error)
        return
      }
      toast.success(isEdit ? ACCOUNT_COPY.updated : ACCOUNT_COPY.created)
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

        {/* ------------------------------------------------ ¿Dónde te pagan? -- */}
        {isEdit ? (
          // Al editar, el tipo es un DATO, no una decision: se enseña y no se
          // ofrece cambiarlo.
          <div className="space-y-1.5">
            <p className="text-label-medium">{ACCOUNT_COPY.form.kind}</p>
            <p className="text-body-small text-muted-foreground">
              {PAYMENT_ACCOUNT_KIND_LABELS[account.kind]}
            </p>
          </div>
        ) : (
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{ACCOUNT_COPY.form.kind}</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isPending}
                >
                  <FormControl>
                    <SelectTrigger size="touch" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PAYMENT_ACCOUNT_KINDS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {PAYMENT_ACCOUNT_KIND_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* ------------------------------------------ Nequi o Daviplata ------ */}
        {isBank ? null : (
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{ACCOUNT_COPY.form.phone}</FormLabel>
                <FormControl>
                  {/*
                    El MISMO campo de teléfono de todo el producto (D-184):
                    muestra «300 123 4567» mientras se escribe y no reescribe lo
                    guardado por el hecho de verlo. `autoComplete="off"` porque
                    este no es el teléfono de quien rellena el formulario, igual
                    que el WhatsApp del catálogo.
                  */}
                  <PhoneInput
                    size="touch"
                    autoComplete="off"
                    disabled={isPending}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormDescription>
                  {ACCOUNT_COPY.form.phoneHelp(kind === 'daviplata' ? 'daviplata' : 'nequi')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* ----------------------------------------------- Cuenta bancaria --- */}
        {isBank ? (
          <>
            <FormField
              control={form.control}
              name="bankName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{ACCOUNT_COPY.form.bankName}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      size="touch"
                      autoComplete="off"
                      placeholder={ACCOUNT_COPY.form.bankPlaceholder}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{ACCOUNT_COPY.form.accountType}</FormLabel>
                  <Select
                    value={field.value ?? undefined}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger size="touch" className="w-full">
                        <SelectValue placeholder={ACCOUNT_COPY.form.accountType} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BANK_ACCOUNT_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {BANK_ACCOUNT_TYPE_LABELS[value]}
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
              name="accountNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{ACCOUNT_COPY.form.accountNumber}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      size="touch"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>{ACCOUNT_COPY.form.accountNumberHelp}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : null}

        {/* ------------------------------------------------------- Titular --- */}
        <FormField
          control={form.control}
          name="holderName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{ACCOUNT_COPY.form.holder}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  size="touch"
                  autoComplete="off"
                  placeholder={ACCOUNT_COPY.form.holderPlaceholder}
                  disabled={isPending}
                />
              </FormControl>
              <FormDescription>{ACCOUNT_COPY.form.holderHelp}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ------------------------------------------- Nombre para reconocerla */}
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{ACCOUNT_COPY.form.label}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  size="touch"
                  autoComplete="off"
                  placeholder={ACCOUNT_COPY.form.labelPlaceholder}
                  disabled={isPending}
                />
              </FormControl>
              <FormDescription>{ACCOUNT_COPY.form.labelHelp}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/*
          `size="touch"` en los dos botones: el pie de un `Dialog` es un `div` y
          no los renderiza, asi que el suelo tactil de 44 px lo pone cada
          pantalla (D-178).
        */}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={onDone}
            disabled={isPending}
          >
            {ACCOUNT_COPY.form.cancel}
          </Button>
          <Button type="submit" size="touch" disabled={isPending}>
            {isPending
              ? 'Guardando...'
              : isEdit
                ? ACCOUNT_COPY.form.submitEdit
                : ACCOUNT_COPY.form.submitCreate}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
