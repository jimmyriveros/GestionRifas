'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'

import { createClientRecord, updateClientRecord } from '../actions'
import { clientFormDefaults, clientFormSchema, type ClientFormInput } from '../schemas'
import { ClientFormFields } from './ClientFormFields'

type ClientFormProps = {
  client?: ClientFormInput & { id: string }
}

export function ClientForm({ client }: ClientFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: client ?? clientFormDefaults,
  })

  function onSubmit(values: ClientFormInput) {
    setServerError(null)
    startTransition(async () => {
      if (client) {
        const result = await updateClientRecord({ ...values, clientId: client.id })
        if ('error' in result) {
          setServerError(result.error)
          return
        }
        toast.success('Cliente actualizado.')
        router.push(`/seller/clients/${client.id}`)
      } else {
        const result = await createClientRecord(values)
        if ('error' in result) {
          setServerError(result.error)
          return
        }
        toast.success(`${result.data.name} quedo registrado.`)
        router.push(`/seller/clients/${result.data.id}`)
      }
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

        <ClientFormFields form={form} disabled={isPending} />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Guardando...' : client ? 'Guardar cambios' : 'Crear cliente'}
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
