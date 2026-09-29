'use client'

import { PencilIcon, RotateCcwIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { EARNINGS_COPY } from '../copy'
import type { EditableTier, Tier } from '../tiers'
import { TierListEditor } from './TierListEditor'
import { TierTable } from './TierTable'

const COPY = EARNINGS_COPY.field

/**
 * De donde salen los tramos del acuerdo:
 *
 *   `template` — la lista general vigente (se envia sin tramos y la base toma
 *                la version mas alta en ese instante);
 *   `kept`     — los que ya tiene, cuando no son la general vigente: una
 *                version anterior o unos personalizados. Solo en un cambio;
 *   `custom`   — unos escritos aqui, solo para esta persona (BR-G29).
 */
export type TierSource = 'template' | 'kept' | 'custom'

/**
 * Los tramos de un acuerdo del PERSONAL, debajo de «Cómo le vas a pagar»
 * (D-237): la lista que se le va a aplicar y la salida para personalizarla.
 *
 * PERSONALIZAR NO TOCA LA LISTA GENERAL, y se dice en la misma pantalla: el
 * editor empieza con una copia y lo que se escriba es de esta persona. «Usar la
 * lista general» deshace la personalizacion sin preguntar, porque no se ha
 * guardado nada todavia.
 */
export function AgreementTiersBlock({
  template,
  kept,
  source,
  customTiers,
  onChange,
  showErrors,
  disabled = false,
  idPrefix,
}: {
  /** La lista general vigente. `null` si la organizacion no tiene ninguna. */
  template: readonly Tier[] | null
  /** Los tramos que ya tiene, si no son la general vigente. */
  kept: readonly Tier[] | null
  source: TierSource
  customTiers: readonly EditableTier[]
  onChange: (source: TierSource, customTiers: EditableTier[]) => void
  showErrors: boolean
  disabled?: boolean
  idPrefix: string
}) {
  const copy = (tiers: readonly Tier[]): EditableTier[] =>
    tiers.map((tier) => ({ minTickets: tier.minTickets, rate: tier.rate }))

  const personalize = (from: readonly Tier[]) => (
    <Button
      type="button"
      variant="outline"
      size="touch"
      disabled={disabled}
      onClick={() => onChange('custom', copy(from))}
    >
      <PencilIcon className="size-4" aria-hidden />
      {COPY.personalize}
    </Button>
  )

  const templateButton =
    template === null ? null : (
      <Button
        type="button"
        variant="outline"
        size="touch"
        disabled={disabled}
        onClick={() => onChange('template', [])}
      >
        <RotateCcwIcon className="size-4" aria-hidden />
        {COPY.useTemplate}
      </Button>
    )

  return (
    <div className="space-y-3 rounded-lg border p-4">
      {source === 'custom' ? (
        <>
          <div>
            <p className="text-sm font-medium">{COPY.customCaption}</p>
            <p className="text-muted-foreground text-body-small">{COPY.personalizeHint}</p>
          </div>
          <TierListEditor
            value={customTiers}
            onChange={(tiers) => onChange('custom', tiers)}
            idPrefix={idPrefix}
            showErrors={showErrors}
            disabled={disabled}
          />
          {templateButton}
        </>
      ) : source === 'kept' && kept !== null ? (
        <>
          <p className="text-sm font-medium">{COPY.keptCaption}</p>
          <TierTable tiers={kept} className="text-sm" />
          <div className="flex flex-wrap gap-2">
            {templateButton}
            {personalize(kept)}
          </div>
        </>
      ) : template === null ? (
        <p className="text-body-small">{COPY.noTemplateStaff}</p>
      ) : (
        <>
          <p className="text-sm font-medium">{COPY.templateCaption}</p>
          <TierTable tiers={template} className="text-sm" />
          {personalize(template)}
        </>
      )}
    </div>
  )
}
