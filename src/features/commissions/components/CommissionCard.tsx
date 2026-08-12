import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCOP } from '@/lib/money'

import type { CommissionSummary } from '../queries'

/**
 * «Tu ganancia»: lo que el vendedor mira primero.
 *
 * Regla que ordena todo lo demas: **lo ganado y lo proyectado nunca se mezclan**
 * (encargo, seccion PROYECCION). El dinero grande de arriba es dinero suyo; la
 * cifra del siguiente nivel vive en otro bloque, con otro tamaño, y lleva escrito
 * «todavia no es tuyo». Un vendedor que confunda las dos cosas cuenta con dinero
 * que no tiene.
 *
 * Nada se calcula aqui: los importes llegan de `commission_summary` (BR-G05).
 */
export function CommissionCard({
  commission,
  firstTierRate,
  raffleName,
}: {
  commission: CommissionSummary | null
  /** Lo que se paga por la primera boleta, para quien todavia no ha cobrado ninguna. */
  firstTierRate: number
  /** De que rifa habla. La comision se cuenta por rifa (BR-G04). */
  raffleName: string | null
}) {
  if (commission === null || commission.ticketsPaid === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tu ganancia</CardTitle>
          {raffleName ? <RaffleLine name={raffleName} /> : null}
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-3xl font-semibold tabular-nums">{formatCOP(0)}</p>
          <p className="text-muted-foreground text-sm">
            Ganas {formatCOP(firstTierRate)} por cada boleta que te paguen completa. Cuantas más
            cobres, más vale cada una.
          </p>
        </CardContent>
      </Card>
    )
  }

  const { ticketsPaid, rate, earned, nextMinTickets, nextRate, ticketsToNext, projectedEarned } =
    commission

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tu ganancia</CardTitle>
        {raffleName ? <RaffleLine name={raffleName} /> : null}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-3xl font-semibold tabular-nums">{formatCOP(earned)}</p>
          <p className="text-muted-foreground text-sm">
            {ticketsPaid} {ticketsPaid === 1 ? 'boleta cobrada' : 'boletas cobradas'} ·{' '}
            {formatCOP(rate)} por boleta
          </p>
        </div>

        {nextMinTickets !== null && nextRate !== null && ticketsToNext !== null ? (
          <NextLevel
            ticketsPaid={ticketsPaid}
            nextMinTickets={nextMinTickets}
            nextRate={nextRate}
            ticketsToNext={ticketsToNext}
            projectedEarned={projectedEarned}
          />
        ) : (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Estás en el nivel más alto: {formatCOP(rate)} por cada boleta que cobres.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** De que rifa son las cifras. Se cuenta por rifa, y decirlo evita confusiones. */
function RaffleLine({ name }: { name: string }) {
  return <p className="text-muted-foreground truncate text-xs">{name}</p>
}

function NextLevel({
  ticketsPaid,
  nextMinTickets,
  nextRate,
  ticketsToNext,
  projectedEarned,
}: {
  ticketsPaid: number
  nextMinTickets: number
  nextRate: number
  ticketsToNext: number
  projectedEarned: number | null
}) {
  const percent = Math.min(100, Math.round((ticketsPaid / nextMinTickets) * 100))

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-medium">
          {ticketsToNext === 1
            ? 'Te falta 1 boleta para subir de nivel'
            : `Te faltan ${ticketsToNext} boletas para subir de nivel`}
        </p>
        <p className="text-muted-foreground text-sm tabular-nums">
          {ticketsPaid} de {nextMinTickets}
        </p>
      </div>

      {/* La barra lleva su valor en el `aria-valuetext` porque el porcentaje solo
          se ve; el texto de al lado dice lo mismo para todo el mundo. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={nextMinTickets}
        aria-valuenow={ticketsPaid}
        aria-valuetext={`${ticketsPaid} de ${nextMinTickets} boletas cobradas`}
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-muted-foreground text-sm">
        Al llegar a {nextMinTickets} boletas, cada una pasa a valer {formatCOP(nextRate)}
        {projectedEarned !== null ? (
          <>
            {' '}
            y tu ganancia sería de <span className="font-medium">{formatCOP(projectedEarned)}</span>
          </>
        ) : null}
        .
      </p>
      <p className="text-muted-foreground text-xs">
        Esa cifra todavía no es tuya: es lo que ganarías si llegas.
      </p>
    </div>
  )
}
