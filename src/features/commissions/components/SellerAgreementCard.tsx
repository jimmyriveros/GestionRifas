'use client'

import { PencilIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { tierListOrigin, type Agreement, type SellerAgreement } from '../agreement'
import { EARNINGS_COPY } from '../copy'
import type { Tier } from '../tiers'
import { SellerAgreementDialog, type RecalculatedRaffle } from './SellerAgreementDialog'
import { TierTable } from './TierTable'

const COPY = EARNINGS_COPY.agreement

/**
 * «Cómo se le paga», en la ficha administrativa de un vendedor (D-237).
 *
 * DICE LA REGLA, NUNCA EL DINERO (D-198, BR-Q08). El personal configura con que
 * acuerdo cobra alguien, pero lo que lleva ganado es de su cartera: aqui no hay
 * ni una cifra ganada. Las unicas cifras son las de la regla —su fijo, sus
 * tramos— y, al cambiarla, cuantas boletas cobradas se recalculan.
 *
 * QUIEN DECIDE CADA ACUERDO (BR-G34). El administrativo —el de quien no tiene
 * vendedor padre— lo cambia el personal desde aqui. El de un integrante lo
 * decide su vendedor padre desde «Mi equipo», y la ficha lo dice en vez de
 * ofrecer un boton que no le toca.
 */
export function SellerAgreementCard({
  seller,
  agreement,
  parentName,
  hasTeam,
  template,
  recalculated,
  canManage,
}: {
  seller: { profileId: string; fullName: string }
  agreement: SellerAgreement
  /** El nombre de su vendedor padre, si tiene. */
  parentName: string | null
  hasTeam: boolean
  template: { id: string; tiers: Tier[] } | null
  recalculated: RecalculatedRaffle[]
  /** Si quien mira tiene la capacidad `sellers.earnings.manage`. */
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const effective = agreement.effective
  const editable = canManage && effective.source === 'direct'

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-base">
          <h2>Cómo se le paga</h2>
        </CardTitle>
        {editable ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <PencilIcon className="size-4" aria-hidden />
            {EARNINGS_COPY.change.button}
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3">
        <AgreementSummary agreement={effective} templateId={template?.id ?? null} />

        {effective.source === 'team' && parentName ? (
          <p className="text-muted-foreground text-sm">{COPY.teamMember(parentName)}</p>
        ) : null}
        {effective.source === 'direct' && hasTeam ? (
          <p className="text-muted-foreground text-sm">{COPY.teamHead(effective.mode === 'tiered')}</p>
        ) : null}
      </CardContent>

      {editable ? (
        <SellerAgreementDialog
          open={open}
          onOpenChange={setOpen}
          seller={seller}
          current={agreement.direct}
          template={template}
          recalculated={recalculated}
          hasTeam={hasTeam}
        />
      ) : null}
    </Card>
  )
}

/** La regla de un acuerdo, en palabras y, si tiene tramos, con su tabla. */
function AgreementSummary({
  agreement,
  templateId,
}: {
  agreement: Agreement
  templateId: string | null
}) {
  if (agreement.mode === 'half_price') {
    return (
      <div className="space-y-1">
        <p className="font-medium">{COPY.half}</p>
        <p className="text-muted-foreground text-sm">{COPY.halfKept}</p>
      </div>
    )
  }

  if (agreement.mode === 'fixed_per_ticket') {
    return <p className="font-medium">{COPY.fixed(agreement.fixedAmount ?? 0)}</p>
  }

  const list = agreement.list
  const origin = list ? tierListOrigin(list, templateId) : null

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="font-medium">{COPY.tiered}</p>
        <p className="text-muted-foreground text-sm">
          {origin === 'current_template'
            ? COPY.currentTemplate
            : origin === 'old_template'
              ? COPY.oldTemplate
              : origin === 'custom'
                ? COPY.custom
                : COPY.unreadable}
        </p>
      </div>
      {list ? <TierTable tiers={list.tiers} className="max-w-sm text-sm" /> : null}
    </div>
  )
}
