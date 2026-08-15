'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
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

/**
 * Alta con otro destino y otras palabras, mismo formulario.
 *
 * Lo usa el alta de integrantes de equipo (BR-E04), donde quien crea es un
 * vendedor y no el personal: cambia la Server Action y el texto, no los campos
 * ni su validacion. Es un solo prop opcional a proposito — el encargo pedia que
 * NO existieran dos formularios distintos para crear un vendedor.
 */
export type CreateOverride = {
  submit: (values: UserFormInput) => Promise<{ ok: true } | { error: string }>
  title: string
  description: string
  success: (email: string) => string
}

/**
 * Edicion con otro destino, mismo formulario. Gemelo de `CreateOverride`, y por
 * el mismo motivo: el encargo pedia que no existieran dos formularios distintos
 * para lo mismo.
 *
 * `emailEditable` es la unica diferencia real de comportamiento: mientras la
 * invitacion siga pendiente, el correo se puede corregir (BR-E16). Es una
 * comodidad de la interfaz, no una barrera —quien decide es
 * `team_update_member`—, asi que la pantalla puede reflejarla sin cargar con la
 * responsabilidad de defenderla.
 */
export type EditOverride = {
  submit: (values: UserFormInput) => Promise<{ ok: true } | { error: string }>
  emailEditable: boolean
  description: string
}

type UserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: ManageableRole
  /** Presente en modo edicion. */
  user?: EditableUser
  /** Presente cuando el alta no es la del portal administrativo. */
  create?: CreateOverride
  /** Presente cuando la edicion no es la del portal administrativo. */
  edit?: EditOverride
}

/**
 * Alta y edicion de usuarios.
 *
 * El formulario vive en un componente aparte que Radix monta y desmonta con el
 * dialogo: cada apertura empieza con valores frescos sin necesidad de
 * sincronizar estado con un efecto.
 */
export function UserDialog({ open, onOpenChange, role, user, create, edit }: UserDialogProps) {
  const isEdit = user !== undefined
  const roleLabel = ROLE_LABELS[role].toLowerCase()

  const title = isEdit ? 'Editar datos' : (create?.title ?? `Nuevo ${roleLabel}`)
  const description = isEdit
    ? (edit?.description ?? 'El correo no se puede cambiar desde aquí.')
    : (create?.description ??
      'Se enviará una invitación por correo. La contraseña la define la propia persona.')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <UserDialogForm
          role={role}
          user={user}
          create={create}
          edit={edit}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function UserDialogForm({
  role,
  user,
  create,
  edit,
  onDone,
}: {
  role: ManageableRole
  user?: EditableUser
  create?: CreateOverride
  edit?: EditOverride
  onDone: () => void
}) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEdit = user !== undefined
  const emailLocked = isEdit && edit?.emailEditable !== true

  const form = useForm<UserFormInput>({
    resolver: zodResolver(userFormSchema),
    defaultValues: user
      ? { fullName: user.fullName, alias: user.alias ?? '', phone: user.phone, email: user.email }
      : userFormDefaults,
  })

  // El correo que se esta escribiendo, para avisar EN EL MOMENTO en que deja de
  // ser el de siempre. Un aviso permanente se lee como decorado; uno que
  // aparece justo al cambiar el dato se lee como lo que es.
  //
  // `useWatch` y no `form.watch()`: el segundo devuelve una funcion que el
  // compilador de React no puede memorizar, y usarlo hacia que este componente
  // dejara de memorizarse entero (aviso `react-hooks/incompatible-library`).
  const emailValue = useWatch({ control: form.control, name: 'email' })
  const emailChanged =
    isEdit &&
    edit?.emailEditable === true &&
    emailValue.trim().toLowerCase() !== user.email.toLowerCase()

  function onSubmit(values: UserFormInput) {
    setServerError(null)
    startTransition(async () => {
      const result = user
        ? edit
          ? await edit.submit(values)
          : await updateUser({
              profileId: user.profileId,
              fullName: values.fullName,
              alias: values.alias,
              phone: values.phone,
            })
        : create
          ? await create.submit(values)
          : await createUser({ ...values, role })

      if ('error' in result) {
        setServerError(result.error)
        return
      }

      toast.success(
        user
          ? emailChanged
            ? `Datos actualizados. Enviamos una invitación nueva a ${values.email}.`
            : 'Datos actualizados.'
          : create
            ? create.success(values.email)
            : `Invitación enviada a ${values.email}. La persona definirá su contraseña desde el enlace.`,
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
              <FormLabel>Teléfono</FormLabel>
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
              <FormLabel>Correo electrónico</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  disabled={isPending || emailLocked}
                  readOnly={emailLocked}
                  {...field}
                />
              </FormControl>
              {!isEdit ? (
                <FormDescription>A esta dirección llegará la invitación.</FormDescription>
              ) : null}
              {emailChanged ? (
                <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Se enviará una invitación nueva a este correo y el enlace anterior dejará de
                  funcionar.
                </p>
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
            {isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Enviar invitación'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
