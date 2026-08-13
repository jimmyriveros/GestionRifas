import Link from 'next/link'

import { ActiveBadge } from '@/components/data/StatusBadge'
import type { CommissionSummary } from '@/features/commissions/queries'
import { formatCOP } from '@/lib/money'

import type { TeamMemberWithTotals } from '../queries'

/**
 * Los integrantes del equipo, en tarjetas.
 *
 * Tarjetas y no tabla a proposito: un vendedor usa esto desde el telefono, y una
 * tabla ancha ahi obliga a desplazarse en horizontal para leer un dato que cabe
 * de sobra en una tarjeta. En escritorio se reparten en dos columnas en vez de
 * estirarse hasta ser ilegibles.
 *
 * La tarjeta ENTERA es el enlace al detalle: es la diana mas grande posible en
 * un telefono, y evita el problema de poner acciones pequenas y juntas.
 */
export function TeamMemberList({
  members,
  commissions,
}: {
  members: TeamMemberWithTotals[]
  /** Comision de cada integrante en la rifa activa, por id de vendedor. */
  commissions: Map<string, CommissionSummary>
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {members.map((member) => (
        <li key={member.membershipId}>
          <Link
            href={`/seller/team/${member.profileId}`}
            className="bg-card hover:bg-accent focus-visible:ring-ring block rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{member.fullName}</p>
                {member.alias ? (
                  <p className="text-muted-foreground truncate text-sm">{member.alias}</p>
                ) : null}
              </div>
              <ActiveBadge isActive={member.isActive} />
            </div>

            {/*
              «Cuántas lleva cobradas» NO se pinta aquí, aunque
              `team_sales_summary` lo devuelva: lo dice la línea de ganancia, y
              esa lo toma de `seller_commissions`, que es la fuente que gobierna
              el dinero. Dos cálculos independientes del mismo número, a dos
              centímetros uno del otro, es una contradicción esperando a pasar.
            */}
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <Figure label="Vendidas" value={String(member.ticketsAssigned)} />
              <Figure label="Vendido" value={formatCOP(member.totalSold)} />
              <Figure label="Por cobrar" value={formatCOP(member.pendingAmount)} />
            </dl>

            <TeamMemberEarnings commission={commissions.get(member.profileId)} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Lo que lleva ganado un integrante, en la rifa activa.
 *
 * Se separa del resto con una linea porque es de otra naturaleza: arriba esta el
 * dinero de la EMPRESA (vendido, por cobrar) y aqui el dinero de la PERSONA. Sin
 * esa separacion las cuatro cifras se leen como si fueran lo mismo.
 */
function TeamMemberEarnings({ commission }: { commission: CommissionSummary | undefined }) {
  if (!commission || commission.ticketsPaid === 0) {
    return (
      <p className="text-muted-foreground mt-3 border-t pt-3 text-sm">
        Todavía no ha cobrado ninguna boleta completa.
      </p>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 border-t pt-3">
      <span className="text-sm">
        Lleva ganado <span className="font-medium">{formatCOP(commission.earned)}</span>
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatCOP(commission.rate)} por boleta
      </span>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
