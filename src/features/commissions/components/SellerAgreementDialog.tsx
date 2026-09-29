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
import { CommissionModelField } from '@/features/team/components/CommissionModelField'
import type { CommissionModel } from '@/lib/constants'

import { setSellerAgreement } from '../actions'
import type { Agreement } from '../agreement'
import { EARNINGS_COPY } from '../copy'
import { sellerAgreementFormSchema } from '../schemas'
import { sameTiers, type EditableTier, type Tier } from '../tiers'
import { AgreementTiersBlock, type TierSource } from './AgreementTiersBlock'

const COPY = EARNINGS_COPY.change

/** Una rifa que el cambio recalcula, con sus boletas cobradas (BR-G31). */
export type RecalculatedRaffle = { name: string; count: number }

export type SellerAgreementDialogProps = {
  seller: { profileId: string; fullName: string }
  /** Su acuerdo ADMINISTRATIVO: el que el personal puede cambiar. */
  current: Agreement
  /** La lista general vigente. */
  template: { id: string; tiers: Tier[] } | null
  /** Las rifas donde hay algo que recalcular. Vacio si no ha cobrado nada. */
  recalculated: RecalculatedRaffle[]
  /** Si tiene equipo: el recalculo alcanza tambien lo que gana por el. */
  hasTeam: boolean
}

type FormValues = {
  sellerId: string
  commissionModel: CommissionModel | null
  fixedCommissionAmount?: number | null
  customTiers?: EditableTier[] | null
}

function toEditable(tiers: readonly Tier[]): EditableTier[] {
  return tiers.map((tier) => ({ minTickets: tier.minTickets, rate: tier.rate }))
}

function isComplete(tiers: readonly EditableTier[]): tiers is Tier[] {
  return tiers.every((tier) => tier.minTickets !== null && tier.rate !== null)
}

/**
 * Cambiar el acuerdo administrativo de un vendedor (BR-G31, D-237).
 *
 * ES EXPLICITO Y SE ANUNCIA ANTES. El aviso ambar aparece EN EL MOMENTO en que
 * la eleccion deja de ser la guardada —el mismo recurso que el cambio de
 * ganancia de un integrante (`TeamCommissionDialog`)— y dice que se recalcula:
 * en que rifas, con cuantas boletas cobradas y, si tiene equipo, que tambien lo
 * que gana por el. El boton lo nombra: «Guardar y recalcular».
 *
 * LA MITAD NO SE OFRECE (BR-G30). Quien la tiene abre el dialogo sin ninguna
 * tarjeta elegida y con un aviso de lo que pierde si cambia. Elegir por el una
 * tarjeta por defecto seria decidir sin que nadie lo haya pedido.
 *
 * NADA SE GUARDA SI NO CAMBIO NADA. El boton espera a que haya un cambio de
 * verdad, y aun asi la base no escribe nada si recibe lo mismo que ya habia
 * (`changed = false`): un doble clic no recalcula dos veces.
 */
export function SellerAgreementDialog({
  open,
  onOpenChange,
  ...props
}: SellerAgreementDialogProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{COPY.title(props.seller.fullName)}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        {/* Montado y desmontado con el dialogo: cada apertura empieza con lo
            que hay guardado, sin sincronizar estado con un efecto. */}
        <AgreementForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function AgreementForm({
  seller,
  current,
  template,
  recalculated,
  hasTeam,
  onDone,
}: SellerAgreementDialogProps & { onDone: () => void }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // De donde salen sus tramos hoy: la general vigente, o unos que conserva.
  const currentList = current.mode === 'tiered' ? current.list : null
  const keptTiers =
    currentList !== null && currentList.id !== template?.id ? currentList.tiers : null
  const [source, setSource] = useState<TierSource>(keptTiers ? 'kept' : 'template')

  const form = useForm<FormValues>({
    resolver: zodResolver(sellerAgreementFormSchema),
    defaultValues: {
      sellerId: seller.profileId,
      commissionModel: current.mode === 'half_price' ? null : current.mode,
      fixedCommissionAmount: current.fixedAmount,
      customTiers: keptTiers ? toEditable(keptTiers) : null,
    },
  })

  const model = useWatch({ control: form.control, name: 'commissionModel' })
  const amount = useWatch({ control: form.control, name: 'fixedCommissionAmount' })
  const customTiers = useWatch({ control: form.control, name: 'customTiers' })

  // Cambio de verdad respecto a lo guardado. Sin esto el aviso saldria siempre
  // y se leeria como decorado (I-033 en espiritu).
  const changed = (() => {
    if (model === null) return false
    if (model !== current.mode) return true
    if (model === 'fixed_per_ticket') return (amount ?? null) !== current.fixedAmount
    if (source === 'kept') return false
    if (source === 'template') return currentList?.id !== template?.id
    const tiers = customTiers ?? []
    return !(currentList !== null && isComplete(tiers) && sameTiers(currentList.tiers, tiers))
  })()

  const willRecalculate = recalculated.length > 0

  function changeSource(next: TierSource, tiers: EditableTier[]) {
    setSource(next)
    form.setValue(
      'customTiers',
      next === 'template' ? null : next === 'kept' && keptTiers ? toEditable(keptTiers) : tiers,
    )
  }

  function onSubmit(values: FormValues) {
    setServerError(null)
    startTransition(async () => {
      const result = await setSellerAgreement({
        sellerId: values.sellerId,
        commissionModel: values.commissionModel,
        fixedCommissionAmount:
          values.commissionModel === 'fixed_per_ticket' ? values.fixedCommissionAmount : null,
        // La general vigente viaja SIN tramos: la base toma la version mas alta
        // en ese instante. Los que conserva o los escritos aqui, con ellos.
        customTiers:
          values.commissionModel === 'tiered' && source !== 'template'
            ? (values.customTiers ?? null)
            : null,
      })

      if ('error' in result) {
        setServerError(result.error)
        return
      }

      if (result.changed) {
        toast.success(COPY.saved(seller.fullName, result.raffles))
      } else {
        toast.info(COPY.unchanged)
      }
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

        {current.mode === 'half_price' ? (
          <Notice tone="info" density="compact">
            {COPY.halfNotice}
          </Notice>
        ) : null}

        <CommissionModelField
          value={model}
          onChange={(value) => {
            form.setValue('commissionModel', value)
            form.setValue(
              'fixedCommissionAmount',
              value === 'fixed_per_ticket' ? current.fixedAmount : null,
            )
            form.clearErrors(['fixedCommissionAmount', 'commissionModel'])
          }}
          amount={amount ?? null}
          onAmountChange={(value) => form.setValue('fixedCommissionAmount', value)}
          tieredDisabledReason={
            template === null && keptTiers === null ? EARNINGS_COPY.field.noTemplateStaff : null
          }
          tieredDetails={
            <AgreementTiersBlock
              template={template?.tiers ?? null}
              kept={keptTiers}
              source={source}
              customTiers={customTiers ?? []}
              onChange={changeSource}
              showErrors={form.formState.submitCount > 0}
              disabled={isPending}
              idPrefix="cambio-ganancia"
            />
          }
          // Con equipo, lo que pasa con el vale para las dos tarjetas; sin el, la
          // nota habla del tramo y solo se dice con los tramos elegidos.
          note={
            hasTeam
              ? EARNINGS_COPY.agreement.teamHeadChoice
              : model === 'tiered'
                ? EARNINGS_COPY.field.staffTeamNote
                : null
          }
          disabled={isPending}
          error={form.formState.errors.fixedCommissionAmount?.message}
        />

        {form.formState.errors.commissionModel?.message ? (
          <p className="text-destructive text-sm">{form.formState.errors.commissionModel.message}</p>
        ) : null}

        {/* La region VIVE SIEMPRE y el aviso entra y sale de ella: una region
            que aparece ya escrita no se anuncia de forma fiable. Ver
            `TeamCommissionDialog` para el porque de `role="status"`. */}
        <div role="status" className="empty:sr-only">
          {changed ? (
            <Notice tone="warning" density="compact">
              {willRecalculate
                ? COPY.recalculates(
                    seller.fullName,
                    recalculated.map((raffle) => COPY.raffleWithCount(raffle.name, raffle.count)),
                    hasTeam,
                  )
                : COPY.nothingToRecalculate(seller.fullName)}
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
            {COPY.cancel}
          </Button>
          <Button size="touch" type="submit" disabled={isPending || !changed}>
            {isPending ? COPY.saving : willRecalculate ? COPY.saveAndRecalculate : COPY.save}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
