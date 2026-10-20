import Link from 'next/link'

import { MetricCard } from '@/components/data/MetricCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { commonInventoryCounts, readAdminTicketInventory } from '@/features/tickets/admin-queries'

import { INVENTORY_COPY } from '../copy'
import { getHoldSettings } from '../queries'
import { formatCount } from '../rules'
import { HoldSettingsDialog } from './HoldSettingsDialog'

/**
 * El inventario comun de una rifa en su ficha (D-257): cuantas hay libres,
 * cuantas apartadas ahora y cuantas disponibles tienen los vendedores; y como
 * funcionan los apartados en esta rifa.
 *
 * Los recuentos salen de `admin_ticket_inventory`, la misma lectura —memoizada
 * por peticion— que ya alimenta el resto de la ficha. La configuracion la lee
 * cualquiera del personal; el boton para cambiarla solo aparece si la base dice
 * que quien mira puede (`can_manage`, la capacidad del Dueño).
 */
export async function RaffleInventorySection({
  raffleId,
  editable,
}: {
  raffleId: string
  /** Borrador o activa: las unicas que admiten boletas nuevas y cambios. */
  editable: boolean
}) {
  const [rows, settings] = await Promise.all([
    readAdminTicketInventory(raffleId),
    getHoldSettings(raffleId),
  ])
  const counts = commonInventoryCounts(rows)
  const S = INVENTORY_COPY.staff
  const H = INVENTORY_COPY.settings

  return (
    <section className="space-y-4" aria-labelledby="raffle-inventory-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="raffle-inventory-title" className="text-lg font-semibold">
          {S.summaryTitle}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/owner/tickets?custody=common&raffleId=${raffleId}`}>{S.viewCommon}</Link>
          </Button>
          {editable ? (
            <Button asChild variant="outline">
              <Link href={`/owner/tickets/generate?raffleId=${raffleId}`}>{S.generate}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <MetricCard label={S.summaryFree} value={formatCount(counts.free)} />
        <MetricCard label={S.summaryHeld} value={formatCount(counts.held)} />
        <MetricCard label={S.summaryWithSellers} value={formatCount(counts.withSellers)} />
      </div>

      {settings ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              <h3>{H.title}</h3>
            </CardTitle>
            {settings.canManage && editable ? (
              <HoldSettingsDialog
                raffleId={raffleId}
                durationMinutes={settings.durationMinutes}
                maxActivePerSeller={settings.maxActivePerSeller}
              />
            ) : null}
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{H.duration(settings.durationMinutes)}</p>
            <p>{H.maxActive(settings.maxActivePerSeller)}</p>
            {!settings.canManage ? <p className="text-muted-foreground">{H.onlyOwner}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
