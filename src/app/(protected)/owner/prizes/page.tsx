import { PRIZE_AWARDS_COPY } from '@/features/prize-awards/copy'
import { PrizeAwardsView } from '@/features/prize-awards/components/PrizeAwardsView'
import {
  listAdminPrizeAwardSellers,
  readAdminPrizeAwards,
  readPrizeAwardCoverage,
} from '@/features/prize-awards/queries'
import { parsePrizeAwardFilters, prizeAwardDatesReversed } from '@/features/prize-awards/schemas'
import { listRaffleOptions } from '@/features/raffles/queries'
import { listOrgMembers } from '@/features/users/queries'
import { requireStaff } from '@/lib/auth/guards'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * «Premios ganados» del Dueño y el Administrador (D-208, Etapa 2; BR-J21).
 *
 * LA LECTURA ES LA PROYECCIÓN DEL PERSONAL. `admin_prize_awards` y
 * `admin_prize_award_totals` devuelven sorteo, boleta, vendedor, premio e
 * importe de toda la organización, y su tipo de retorno no declara NI UN dato
 * de cliente: ni nombre, ni identificador, ni teléfono. Esta página tampoco
 * acepta un filtro de cliente —`parsePrizeAwardFilters` lo descarta— y no
 * importa nada de `features/clients` ni de la lectura del vendedor (BR-Q01).
 * El recuento de clientes distintos llega como un número.
 *
 * EL VENDEDOR ES UN FILTRO, NO UN ALCANCE. El alcance es la organización de la
 * sesión, dentro de la base. El desplegable ofrece también a los vendedores
 * DESACTIVADOS y a quien VENDIÓ y hoy tiene otro rol —pasó a Administrador—:
 * su historial se conserva y el personal lo elige sin escribir su
 * identificador (Etapa 3, `0070`). A este último no se le enlaza ninguna ficha
 * de vendedor, porque ya no la tiene.
 */
export default async function OwnerPrizesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff()
  const filters = parsePrizeAwardFilters(await searchParams, 'staff')
  const reversed = prizeAwardDatesReversed(filters)

  const [result, coverage, raffles, members, prizeSellers] = await Promise.all([
    reversed ? Promise.resolve(null) : readAdminPrizeAwards(filters),
    readPrizeAwardCoverage(),
    listRaffleOptions(),
    // Una sola lectura de miembros, memoizada por petición (D-104).
    listOrgMembers(['owner', 'admin', 'seller']),
    // Quién aparece como vendedor en el historial, sea cual sea su rol de hoy.
    listAdminPrizeAwardSellers(),
  ])

  // Activos primero, luego los desactivados, cada grupo en el orden de alta.
  const sellers = members
    .filter((member) => member.role === 'seller')
    .sort((a, b) => Number(b.isActive) - Number(a.isActive))
  const sellerIds = new Set(sellers.map((member) => member.profileId))

  // Quien vendió, tiene premios y hoy tiene otro rol: se puede elegir desde el
  // desplegable, con su nombre y la aclaración de que ya no vende (`0070`).
  const formerSellers = prizeSellers.filter((person) => !sellerIds.has(person.sellerId))

  const options = sellers.map((member) => ({
    value: member.profileId,
    label: member.isActive ? member.fullName : PRIZE_AWARDS_COPY.inactiveSeller(member.fullName),
  }))
  for (const person of formerSellers) {
    const name =
      person.sellerName ??
      members.find((member) => member.profileId === person.sellerId)?.fullName ??
      PRIZE_AWARDS_COPY.row.unnamedSeller
    options.push({ value: person.sellerId, label: PRIZE_AWARDS_COPY.formerSeller(name) })
  }

  // Un filtro que apunta a alguien de la organización que no vende ni tiene
  // premios: el desplegable lo nombra en vez de quedarse en blanco.
  if (filters.sellerId && !options.some((option) => option.value === filters.sellerId)) {
    const member = members.find((m) => m.profileId === filters.sellerId)
    if (member) options.push({ value: member.profileId, label: member.fullName })
  }

  return (
    <PrizeAwardsView
      audience="staff"
      filters={filters}
      result={result}
      coverage={coverage}
      raffles={raffles.map((raffle) => ({
        value: raffle.id,
        label: `${raffle.shortCode} · ${raffle.name}`,
      }))}
      sellers={options}
      linkableSellerIds={sellers.map((member) => member.profileId)}
    />
  )
}
