import { ActiveBadge } from '@/components/data/StatusBadge'

import type { TeamMember } from '../queries'

/**
 * Los integrantes del equipo, en tarjetas.
 *
 * Tarjetas y no tabla a proposito: un vendedor usa esto desde el telefono, y una
 * tabla ancha ahi obliga a desplazarse en horizontal para leer un dato que cabe
 * de sobra en una tarjeta. En escritorio las tarjetas se reparten en dos
 * columnas en vez de estirarse hasta ser ilegibles.
 */
export function TeamMemberList({ members }: { members: TeamMember[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {members.map((member) => (
        <li key={member.membershipId} className="bg-card rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{member.fullName}</p>
              {member.alias ? (
                <p className="text-muted-foreground truncate text-sm">{member.alias}</p>
              ) : null}
            </div>
            <ActiveBadge isActive={member.isActive} />
          </div>

          <dl className="text-muted-foreground mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="shrink-0">Teléfono:</dt>
              <dd className="truncate">{member.phone}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0">Correo:</dt>
              <dd className="truncate">{member.email}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )
}
