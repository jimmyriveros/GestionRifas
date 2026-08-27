'use client'

import { PencilIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CommissionSummary, CommissionTier } from '@/features/commissions/queries'
import { COMMISSION_MODEL_LABELS, type CommissionModel } from '@/lib/constants'
import { formatCOP } from '@/lib/money'

import { TeamCommissionDialog } from './TeamCommissionDialog'

/**
 * «Cuánto gana», en la ficha de un integrante del equipo (BR-G24, D-127).
 *
 * Responde a la pregunta que se hace un vendedor padre mirando a alguien de su
 * equipo: **qué le estoy pagando**, y de ahi el boton para cambiarlo.
 *
 * NO dice «y a ti te quedan tantos». Se intento y se quito: esa cifra por
 * integrante no la devuelve ninguna consulta —`seller_commissions.team_earned`
 * lleva el equipo ENTERO sumado— y calcularla aqui significaba multiplicar y
 * restar dinero en el navegador, que es justo lo que prohibe CLAUDE.md §29 y
 * por lo que todo este motor vive en SQL (BR-G05). Lo que el vendedor padre
 * gana por su equipo se lee donde sale de la base de datos: el encabezado de
 * «Mi equipo» y su propio panel.
 *
 * Lo que se ve depende de lo que haya pasado, no de un estado de carga:
 *
 *   sin boletas cobradas -> solo la regla, porque todavia no hay dinero
 *   con boletas cobradas -> la regla y lo que lleva ganado
 */
export function TeamCommissionCard({
  member,
  commission,
  tiers,
  maxFixed,
  raffleName,
}: {
  member: {
    profileId: string
    fullName: string
    commissionModel: CommissionModel
    fixedCommissionAmount: number | null
  }
  /** Su comision en la rifa de la que se esta hablando. `null` si aun no vende. */
  commission: CommissionSummary | null
  tiers: CommissionTier[]
  maxFixed: number | null
  raffleName: string | null
}) {
  const [open, setOpen] = useState(false)

  const esFijo = member.commissionModel === 'fixed_per_ticket'
  const ticketsPaid = commission?.ticketsPaid ?? 0

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">Cuánto gana</CardTitle>
          {raffleName ? (
            <p className="text-muted-foreground truncate text-xs">{raffleName}</p>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <PencilIcon className="size-4" aria-hidden />
          Cambiar
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1">
          <p className="font-medium">
            {esFijo && member.fixedCommissionAmount !== null
              ? `${formatCOP(member.fixedCommissionAmount)} por boleta`
              : COMMISSION_MODEL_LABELS.tiered}
          </p>
          <p className="text-muted-foreground text-sm">
            {esFijo
              ? 'Gana lo mismo por cada boleta que cobre completa, venda las que venda.'
              : 'Gana más por cada boleta a medida que cobra más. El valor nuevo se aplica a todas las que ya cobró.'}
          </p>
        </div>

        {ticketsPaid > 0 && commission !== null ? (
          <div className="space-y-1 border-t pt-3">
            <p className="text-2xl font-semibold tabular-nums">{formatCOP(commission.earned)}</p>
            <p className="text-muted-foreground text-sm">
              {ticketsPaid} {ticketsPaid === 1 ? 'boleta cobrada' : 'boletas cobradas'} ·{' '}
              {formatCOP(commission.rate)} por boleta
              {commission.ticketsToNext !== null && commission.nextRate !== null
                ? ` · le faltan ${commission.ticketsToNext} para llegar a ${formatCOP(commission.nextRate)}`
                : ''}
            </p>
            {/* Sin esto la cuenta no cuadraria a la vista: «2 cobradas a
                $60.000» encima de un total de $100.000 (BR-G17). */}
            {commission.discounts > 0 ? (
              <p className="text-muted-foreground text-sm">
                Menos {formatCOP(commission.discounts)} de las rebajas que hizo.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground border-t pt-3 text-sm">
            Todavía no ha cobrado ninguna boleta completa, así que aún no ha ganado nada.
          </p>
        )}
      </CardContent>

      <TeamCommissionDialog
        open={open}
        onOpenChange={setOpen}
        member={member}
        tiers={tiers}
        maxFixed={maxFixed}
      />
    </Card>
  )
}
