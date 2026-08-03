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
import { ROLE_LABELS } from '@/lib/constants'

import { createUser, updateUser } from '../actions'
import {
  userFormDefaults,
  userFormSchema,
  type ManageableRole,
  type UserFormInput,
} from '../schemas'

export type EditableUser = {
  profileId: string
  fullName: string
  alias: string | null
  phone: string
  email: string
}

type UserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: ManageableRole
  /** Presente en modo edicion. */
  user?: EditableUser
}

/**
 * Alta e edicion de usuarios.
 *
 * El formulario vive en un componente aparte que Radix monta y desmonta con el
 * dialogo: cada apertura empieza con valores frescos sin necesidad de
 * sincronizar estado con un efecto.
 */
export function UserDialog({ open, onOpenChange, role, user }: UserDialogProps) {
  const isEdit = user !== undefined
  const roleLabel = ROLE_LABELS[role].toLowerCase()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar datos' : `Nuevo ${roleLabel}`}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'El correo no se puede cambiar desde aqui.'
              : 'Se enviara una invitacion por correo. La contrasena la define la propia persona.'}
          </DialogDescription>
        </DialogHeader>

        <UserDialogForm role={role} user={user} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function UserDialogForm({
  role,
  user,
  onDone,
}: {
  role: ManageableRole
  user?: EditableUser
  onDone: () => void
}) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEdit = user !== undefined

  const form = useForm<UserFormInput>({
    resolver: zodResolver(userFormSchema),
    defaultValues: user
      ? { fullName: user.fullName, alias: user.alias ?? '', phone: user.phone, email: user.email }
      : userFormDefaults,
  })

  function onSubmit(values: UserFormInput) {
    setServerError(null)
    startTransition(async () => {
      const result = user
        ? await updateUser({
            profileId: user.profileId,
            fullName: values.fullName,
            alias: values.alias,
            phone: values.phone,
          })
        : await createUser({ ...values, role })

      if ('error' in result) {
        setServerError(result.error)
        return
      }

      toast.success(
        user
          ? 'Datos actualizados.'
          : `Invitacion enviada a ${values.email}. La persona definira su contrasena desde el enlace.`,
      )
      onDone()
      router.refresh()
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre completo</FormLabel>
              <FormControl>
                <Input autoComplete="name" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="alias"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Alias (opcional)</FormLabel>
              <FormControl>
                <Input disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefono</FormLabel>
              <FormControl>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="3001234567"
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo electronico</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  disabled={isPending || isEdit}
                  readOnly={isEdit}
                  {...field}
                />
              </FormControl>
              {!isEdit ? (
                <FormDescription>A esta direccion llegara la invitacion.</FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Enviar invitacion'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
