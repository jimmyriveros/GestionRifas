'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { useClientCreated } from '@/features/whatsapp/components/ClientCreatedProvider'
import type { WhatsappSettings } from '@/features/whatsapp/invite'

import { createClientRecord, updateClientRecord } from '../actions'
import { clientFormDefaults, clientFormSchema, type ClientFormInput } from '../schemas'
import { ClientFormFields } from './ClientFormFields'

type ClientFormProps = {
  client?: ClientFormInput & { id: string }
  /**
   * Configuracion de WhatsApp del vendedor (D-176). Solo la recibe el ALTA: al
   * editar un cliente que ya existe no hay nada que celebrar ni a quien invitar.
   */
  whatsappSettings?: WhatsappSettings
}

export function ClientForm({ client, whatsappSettings }: ClientFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  /**
   * El aviso sube al proveedor del layout (D-179): la navegacion a la ficha del
   * cliente desmontaria este formulario, y con el se iria el dialogo de exito.
   * Por eso tambien es el proveedor quien navega, y solo al cerrarse.
   */
  const showClientCreated = useClientCreated()

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

        // Sin configuracion de WhatsApp —no deberia pasar en el portal del
        // vendedor, pero este formulario podria montarse en otro sitio— se
        // conserva EXACTAMENTE el comportamiento de siempre: a la ficha.
        if (!whatsappSettings) {
          router.push(`/seller/clients/${result.data.id}`)
          router.refresh()
          return
        }

        // `tickets: null` = solo se creo el cliente. El dialogo NO puede
        // mencionar ninguna boleta desde aqui (BR-W06).
        //
        // NO se navega aqui, ni se refresca: las dos cosas desmontarian este
        // formulario y con el, antes de D-179, se iba el dialogo. Ahora las
        // hace el proveedor cuando la persona cierra (D-179).
        showClientCreated({
          outcome: {
            clientId: result.data.id,
            clientName: result.data.name,
            clientPhone: result.data.phone,
            tickets: null,
          },
          settings: whatsappSettings,
          redirectTo: `/seller/clients/${result.data.id}`,
        })
        return
      }
      router.refresh()
    })
  }

  return (
    <>
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

          {/*
          En el telefono las dos acciones ocupan el ancho y miden 44 px, para
          que enviar el formulario no dependa de acertar un boton pequeño al
          final de la pagina. Desde `sm` vuelven a su tamaño de siempre, uno
          al lado del otro. No hay barra fija: nada en el producto la usa.
        */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="submit" size="touch" disabled={isPending} className="w-full sm:w-auto">
              {isPending
                ? client
                  ? 'Guardando...'
                  : 'Creando...'
                : client
                  ? 'Guardar cambios'
                  : 'Crear cliente'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => router.back()}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}
