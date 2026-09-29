'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { saveCommissionTemplate } from '../actions'
import { EARNINGS_COPY } from '../copy'
import { commissionTemplateFormSchema, type CommissionTemplateFormInput } from '../schemas'
import { sameTiers, type EditableTier, type Tier } from '../tiers'
import { TierListEditor } from './TierListEditor'

const COPY = EARNINGS_COPY.template

function isComplete(tiers: readonly EditableTier[]): tiers is Tier[] {
  return tiers.every((tier) => tier.minTickets !== null && tier.rate !== null)
}

/**
 * La lista general de tramos, editable (BR-G29, D-237).
 *
 * SE GUARDA ENTERA. Agregar, cambiar o quitar tramos se hace en pantalla, y el
 * boton manda la lista completa en una sola llamada: la base la valida y crea
 * una version nueva, o ninguna si es igual a la vigente. No existe «guardar un
 * tramo»: una lista a medias no pasa nunca por la base.
 *
 * LO QUE PASA AL GUARDAR SE DICE ANTES. El aviso ambar aparece en cuanto la
 * lista deja de ser la guardada —el mismo recurso que el cambio de ganancia—, y
 * dice lo unico que no se ve: que nadie que ya cobra por tramos cambia de
 * lista. Guardar no recalcula a nadie.
 *
 * La pagina lo monta con `key` = version: al guardar una nueva, `router.refresh`
 * trae la version siguiente y el formulario vuelve a empezar desde ella.
 */
export function CommissionTemplateForm({
  template,
}: {
  template: { version: number; savedAt: string; tiers: Tier[] } | null
}) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const saved: EditableTier[] = template
    ? template.tiers.map((tier) => ({ minTickets: tier.minTickets, rate: tier.rate }))
    : [{ minTickets: 1, rate: null }]

  const form = useForm<CommissionTemplateFormInput>({
    resolver: zodResolver(commissionTemplateFormSchema),
    defaultValues: { tiers: saved },
  })

  const tiers = useWatch({ control: form.control, name: 'tiers' })
  const changed =
    template === null || !(isComplete(tiers) && sameTiers(template.tiers, tiers))

  function onSubmit(values: CommissionTemplateFormInput) {
    setServerError(null)
    startTransition(async () => {
      const result = await saveCommissionTemplate({ tiers: values.tiers })

      if ('error' in result) {
        setServerError(result.error)
        return
      }

      if (result.changed) {
        toast.success(COPY.saved(result.version))
        router.refresh()
      } else {
        toast.info(COPY.unchanged)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <h2>{COPY.cardTitle}</h2>
        </CardTitle>
        {template ? (
          <CardDescription>{COPY.version(template.version, template.savedAt)}</CardDescription>
        ) : null}
      </CardHeader>

      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="text-muted-foreground text-body-small space-y-2">
            <p>{COPY.howItWorks}</p>
            <p>{COPY.teamCount}</p>
            <p>{COPY.newVersion}</p>
          </div>

          {template === null ? (
            <Notice tone="info" density="compact">
              {COPY.missing}
            </Notice>
          ) : null}

          {serverError ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
            >
              {serverError}
            </p>
          ) : null}

          <TierListEditor
            value={tiers}
            onChange={(next) => form.setValue('tiers', next, { shouldDirty: true })}
            idPrefix="lista-general"
            // Los errores de cada tramo, despues del primer intento de guardar.
            showErrors={form.formState.submitCount > 0}
            disabled={isPending}
          />

          {/* Region permanente: ver `TeamCommissionDialog` para el porque. */}
          <div role="status" className="empty:sr-only">
            {changed && template !== null ? (
              <Notice tone="warning" density="compact">
                {COPY.changedNotice}
              </Notice>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {template !== null ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={isPending || !changed}
                onClick={() => {
                  form.reset({ tiers: saved })
                  setServerError(null)
                }}
              >
                {COPY.discard}
              </Button>
            ) : null}
            <Button type="submit" size="touch" disabled={isPending || !changed}>
              {isPending ? COPY.saving : COPY.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
