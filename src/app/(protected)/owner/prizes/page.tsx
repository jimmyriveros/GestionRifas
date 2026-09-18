import { PRIZE_AWARDS_COPY } from '@/features/prize-awards/copy'
import { PrizeAwardsView } from '@/features/prize-awards/components/PrizeAwardsView'
import { readAdminPrizeAwards, readPrizeAwardCoverage } from '@/features/prize-awards/queries'
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
 * DESACTIVADOS: su historial se conserva y el personal lo consulta.
 */
export default async function OwnerPrizesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff()
  const filters = parsePrizeAwardFilters(await searchParams, 'staff')
  const reversed = prizeAwardDatesReversed(filters)

  const [result, coverage, raffles, members] = await Promise.all([
    reversed ? Promise.resolve(null) : readAdminPrizeAwards(filters),
    readPrizeAwardCoverage(),
    listRaffleOptions(),
    // Una sola lectura de miembros, memoizada por petición (D-104).
    listOrgMembers(['owner', 'admin', 'seller']),
  ])

  // Activos primero, luego los desactivados, cada grupo en el orden de alta.
  const sellers = members
    .filter((member) => member.role === 'seller')
    .sort((a, b) => Number(b.isActive) - Number(a.isActive))

  // Quien dejó de vender —pasó a Administrador— conserva sus premios con su
  // nombre. Si el filtro apunta a esa persona, el desplegable la nombra en vez
  // de quedarse en blanco; no tiene ficha de vendedor, así que no se enlaza.
  const formerSeller =
    filters.sellerId && !sellers.some((member) => member.profileId === filters.sellerId)
      ? members.find((member) => member.profileId === filters.sellerId)
      : undefined

  const options = sellers.map((member) => ({
    value: member.profileId,
    label: member.isActive ? member.fullName : PRIZE_AWARDS_COPY.inactiveSeller(member.fullName),
  }))
  if (formerSeller) options.push({ value: formerSeller.profileId, label: formerSeller.fullName })

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
