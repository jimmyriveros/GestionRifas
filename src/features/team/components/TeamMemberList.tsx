import Link from 'next/link'

import { ActiveBadge } from '@/components/data/StatusBadge'
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
export function TeamMemberList({ members }: { members: TeamMemberWithTotals[] }) {
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

            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Figure label="Boletas vendidas" value={String(member.ticketsAssigned)} />
              <Figure label="Ya pagadas" value={String(member.ticketsPaid)} />
              <Figure label="Total vendido" value={formatCOP(member.totalSold)} />
              <Figure label="Falta por cobrar" value={formatCOP(member.pendingAmount)} />
            </dl>
          </Link>
        </li>
      ))}
    </ul>
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
