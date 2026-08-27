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
import { CommissionModelField } from '@/features/team/components/CommissionModelField'
import type { CommissionTier } from '@/features/commissions/queries'
import { createTeamMemberSchema } from '@/features/team/schemas'
import { ROLE_LABELS, type CommissionModel } from '@/lib/constants'
import { cn } from '@/lib/utils'

import { createUser, updateUser } from '../actions'
import { userFormDefaults, type ManageableRole, type UserFormInput } from '../schemas'

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
  submit: (values: UserDialogValues) => Promise<{ ok: true } | { error: string }>
  title: string
  description: string
  success: (email: string) => string
}

/**
 * Los datos que necesita la seccion «Cómo le vas a pagar» (BR-G24, D-127).
 *
 * Su presencia es lo que la enciende: el alta del portal administrativo no la
 * pasa y no la ve, porque un vendedor de la organizacion cobra la mitad del
 * precio y no hay nada que elegir (BR-G13). Solo el alta de un integrante de
 * equipo la pasa.
 */
export type CommissionOptions = {
  tiers: CommissionTier[]
  /** La mitad del precio de la rifa: el tope. `null` si no hay ninguna rifa. */
  maxFixed: number | null
}

/**
 * Lo que sale del formulario.
 *
 * SIEMPRE lleva los campos de comision, tambien cuando la seccion no se dibuja,
 * y esa es la decision que mantiene UN solo formulario: con dos esquemas segun
 * el caso habria dos tipos de valores, dos resolvers y dos ramas de envio para
 * cuatro campos que son identicos. Sin la seccion, `commissionModel` se queda en
 * su valor por defecto —`tiered`, que es tambien el de la columna— y la accion
 * que recibe los valores los descarta al validar con SU propio esquema.
 */
export type UserDialogValues = UserFormInput & {
  commissionModel: CommissionModel
  fixedCommissionAmount?: number | null
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
  /** Presente solo en el alta de un integrante de equipo (BR-G24). */
  commission?: CommissionOptions
}

/**
 * Alta y edicion de usuarios.
 *
 * El formulario vive en un componente aparte que Radix monta y desmonta con el
 * dialogo: cada apertura empieza con valores frescos sin necesidad de
 * sincronizar estado con un efecto.
 */
export function UserDialog({
  open,
  onOpenChange,
  role,
  user,
  create,
  edit,
  commission,
}: UserDialogProps) {
  const isEdit = user !== undefined
  const roleLabel = ROLE_LABELS[role].toLowerCase()

  const title = isEdit ? 'Editar datos' : (create?.title ?? `Nuevo ${roleLabel}`)
  const description = isEdit
    ? (edit?.description ?? 'El correo no se puede cambiar desde aquí.')
    : (create?.description ??
      'Se enviará una invitación por correo. La contraseña la define la propia persona.')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Con la seccion de ganancia el dialogo necesita el doble de ancho para
          que las dos tarjetas quepan lado a lado en escritorio; en telefono se
          apilan igual. Sin ella se queda como estaba. */}
      <DialogContent
        className={cn('max-h-[90dvh] overflow-y-auto', commission ? 'sm:max-w-2xl' : 'sm:max-w-md')}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <UserDialogForm
          role={role}
          user={user}
          create={create}
          edit={edit}
          commission={commission}
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
  commission,
  onDone,
}: {
  role: ManageableRole
  user?: EditableUser
  create?: CreateOverride
  edit?: EditOverride
  commission?: CommissionOptions
  onDone: () => void
}) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEdit = user !== undefined
  const emailLocked = isEdit && edit?.emailEditable !== true

  // UN solo esquema para los dos usos, por lo mismo que hay un solo formulario:
  // el del integrante es el superconjunto, y con `commissionModel` en `tiered`
  // —su valor por defecto— valida exactamente igual que el del portal
  // administrativo. Ver `UserDialogValues`.
  const form = useForm<UserDialogValues>({
    resolver: zodResolver(createTeamMemberSchema),
    defaultValues: user
      ? {
          fullName: user.fullName,
          alias: user.alias ?? '',
          phone: user.phone,
          email: user.email,
          commissionModel: 'tiered',
        }
      : { ...userFormDefaults, commissionModel: 'tiered' },
  })

  const commissionModel = useWatch({ control: form.control, name: 'commissionModel' })
  const fixedAmount = useWatch({ control: form.control, name: 'fixedCommissionAmount' })

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

  function onSubmit(values: UserDialogValues) {
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

        {/* Va DESPUES de los datos de contacto y no antes: primero se dice a
            quien se esta agregando y luego cuanto se le paga. Solo en el alta —
            cambiarselo a alguien que ya vende recalcula dinero hacia atras y
            eso pide su propio aviso, asi que vive en su propio dialogo
            (`TeamCommissionDialog`). */}
        {commission && !isEdit ? (
          <CommissionModelField
            value={commissionModel}
            onChange={(value) => {
              form.setValue('commissionModel', value)
              // Cambiar a tramos deja el importe fuera del envio: es la misma
              // regla que la restriccion de la base de datos, aplicada aqui
              // para que la pantalla no muestre un error de un campo que ya no
              // se ve.
              if (value === 'tiered') form.setValue('fixedCommissionAmount', null)
              form.clearErrors('fixedCommissionAmount')
            }}
            amount={fixedAmount ?? null}
            onAmountChange={(value) => form.setValue('fixedCommissionAmount', value)}
            tiers={commission.tiers}
            maxFixed={commission.maxFixed}
            disabled={isPending}
            error={form.formState.errors.fixedCommissionAmount?.message}
          />
        ) : null}

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
