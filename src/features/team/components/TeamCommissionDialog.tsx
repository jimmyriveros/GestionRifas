'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Form } from '@/components/ui/form'
import { TierTable } from '@/features/commissions/components/TierTable'
import { EARNINGS_COPY } from '@/features/commissions/copy'
import type { Tier } from '@/features/commissions/tiers'
import type { CommissionModel } from '@/lib/constants'

import { setTeamCommission } from '../actions'
import { setTeamCommissionSchema, type SetTeamCommissionInput } from '../schemas'
import { CommissionModelField } from './CommissionModelField'

/**
 * Cambiar como se le paga a un integrante que YA vende (BR-G25, D-127).
 *
 * VIVE APARTE DE «Editar datos» a proposito. Corregir un teléfono no tiene
 * consecuencias; cambiar la ganancia recalcula hacia atras todas las boletas que
 * esa persona ya cobro, y puede subirle o bajarle lo acumulado. Mezclar las dos
 * cosas en un mismo boton significaria o bien avisar de un recalculo a quien
 * solo venia a arreglar un alias, o bien no avisar a quien si lo necesita.
 *
 * LA CONFIRMACION ES EL PAR AVISO + BOTON QUE NOMBRA LA ACCION, no un segundo
 * dialogo encima del primero. El aviso ambar aparece EN EL MOMENTO en que la
 * eleccion deja de ser la que estaba guardada —el mismo recurso que usa el
 * cambio de correo en `UserDialog`— y el boton dice «Guardar y recalcular», de
 * modo que no se puede confirmar sin haber leido que hay un recalculo. Un
 * `ConfirmDialog` encima habria tapado la cifra que se acaba de escribir, que es
 * justo lo que hay que poder revisar antes de decir que si.
 *
 * LO QUE SE OFRECE SALE DE LA BASE (BR-G28, D-237): el tope de la cifra y si la
 * lista general cabe en el acuerdo del propio vendedor padre llegan en
 * `options`, leidos de `team_commission_limits`. Seguir por tramos no cambia
 * la version que el integrante ya tiene, y por eso la tarjeta de tramos ensena
 * SUS tramos mientras los conserve y la lista general solo si se pasa a ella.
 */
export type TeamCommissionOptions = {
  /** Los tramos que tiene hoy, si cobra por tramos. */
  currentTiers: Tier[] | null
  /** La lista general vigente: la que recibiria al pasar a tramos. */
  template: Tier[] | null
  maxFixed: number | null
  /** Si el vendedor padre cobra por tramos: cambia como se dice el tope. */
  parentTiered: boolean
  /** Por que no puede pasar a tramos, o `null`. */
  templateProblem: string | null
}

export function TeamCommissionDialog({
  open,
  onOpenChange,
  member,
  options,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: {
    profileId: string
    fullName: string
    commissionModel: CommissionModel
    fixedCommissionAmount: number | null
  }
  options: TeamCommissionOptions
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cambiar la ganancia de {member.fullName}</DialogTitle>
          <DialogDescription>
            Elige cómo le pagas por cada boleta que cobre completa.
          </DialogDescription>
        </DialogHeader>

        {/* El formulario en un componente aparte que Radix monta y desmonta con
            el dialogo: cada apertura empieza con lo que hay guardado, sin
            sincronizar estado con un efecto (mismo patron que `UserDialog`). */}
        <CommissionForm member={member} options={options} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CommissionForm({
  member,
  options,
  onDone,
}: {
  member: {
    profileId: string
    fullName: string
    commissionModel: CommissionModel
    fixedCommissionAmount: number | null
  }
  options: TeamCommissionOptions
  onDone: () => void
}) {
  // Quien ya cobra por tramos los conserva al «seguir» por tramos; quien no,
  // recibiria la lista general vigente, y esa es la que se ensena.
  const staysTiered = member.commissionModel === 'tiered'
  const cardTiers = staysTiered ? (options.currentTiers ?? []) : (options.template ?? [])
  const tieredBlocked = staysTiered
    ? null
    : options.template === null
      ? EARNINGS_COPY.field.noTemplate
      : options.templateProblem

  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<SetTeamCommissionInput>({
    resolver: zodResolver(setTeamCommissionSchema),
    defaultValues: {
      memberId: member.profileId,
      commissionModel: member.commissionModel,
      fixedCommissionAmount: member.fixedCommissionAmount,
    },
  })

  const model = useWatch({ control: form.control, name: 'commissionModel' })
  const amount = useWatch({ control: form.control, name: 'fixedCommissionAmount' })

  // Cambio de verdad respecto a lo guardado: el modelo, o la cifra dentro del
  // mismo modelo fijo. Sin esto el aviso saldria siempre y se leeria como
  // decorado (I-033 en espiritu: un aviso permanente deja de avisar).
  const changed =
    model !== member.commissionModel ||
    (model === 'fixed_per_ticket' && (amount ?? null) !== member.fixedCommissionAmount)

  function onSubmit(values: SetTeamCommissionInput) {
    setServerError(null)
    startTransition(async () => {
      const result = await setTeamCommission(values)

      if ('error' in result) {
        setServerError(result.error)
        return
      }

      toast.success(
        values.commissionModel === 'fixed_per_ticket'
          ? `Listo. ${member.fullName} gana una cantidad fija por cada boleta que cobre.`
          : `Listo. ${member.fullName} vuelve a ganar por tramos.`,
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

        <CommissionModelField
          value={model}
          onChange={(value) => {
            form.setValue('commissionModel', value)
            form.setValue(
              'fixedCommissionAmount',
              value === 'tiered' ? null : member.fixedCommissionAmount,
            )
            form.clearErrors('fixedCommissionAmount')
          }}
          amount={amount ?? null}
          onAmountChange={(value) => form.setValue('fixedCommissionAmount', value)}
          tieredCardContent={<TierTable tiers={cardTiers} className="mt-1" />}
          tieredDisabledReason={tieredBlocked}
          note={EARNINGS_COPY.field.teamNote}
          fixedHint={
            options.maxFixed === null
              ? null
              : EARNINGS_COPY.field.teamCap(options.maxFixed, options.parentTiered)
          }
          disabled={isPending}
          error={form.formState.errors.fixedCommissionAmount?.message}
        />

        {/*
          La region VIVE SIEMPRE y el aviso entra y sale de ella. Antes nacian
          las dos a la vez, y una region que aparece ya escrita no se anuncia de
          forma fiable: el lector de pantalla tiene que estar vigilandola desde
          antes de que cambie.

          `role="status"` se conserva tal cual. No es lo mismo que
          `aria-live="polite"`: ademas implica `aria-atomic`, o sea que se lee la
          frase entera y no solo lo que cambio. Por eso dentro no va nada mas.

          `empty:sr-only` es lo que evita que la region vacia deje un hueco: la
          saca del flujo sin usar `display:none`, que si la borraria del arbol de
          accesibilidad y nos devolveria al problema de partida.
        */}
        <div role="status" className="empty:sr-only">
          {changed ? (
            <Notice tone="warning" density="compact">
              Al guardar, volvemos a calcular las boletas que {member.fullName} ya cobró con esta
              nueva ganancia. Lo que lleva acumulado puede subir o bajar, y lo tuyo también.
            </Notice>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            size="touch"
            type="button"
            variant="outline"
            onClick={onDone}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button size="touch" type="submit" disabled={isPending || !changed}>
            {isPending ? 'Guardando...' : 'Guardar y recalcular'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
