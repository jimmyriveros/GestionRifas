import { notFound } from 'next/navigation'

import { getClientName } from '@/features/clients/queries'
import { PrizeAwardsView } from '@/features/prize-awards/components/PrizeAwardsView'
import { readPrizeAwardCoverage, readSellerPrizeAwards } from '@/features/prize-awards/queries'
import { parsePrizeAwardFilters, prizeAwardDatesReversed } from '@/features/prize-awards/schemas'
import { listRaffleOptions } from '@/features/raffles/queries'
import { requireRole } from '@/lib/auth/guards'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * «Premios ganados» del vendedor (D-208, Etapa 2; BR-J17..BR-J23).
 *
 * SOLO LO SUYO, Y LO DECIDE LA BASE. `seller_prize_awards` exige rol de
 * vendedor activo y devuelve las coincidencias de SU perfil —tener equipo no
 * añade ninguna—. Esta página no filtra por seguridad: pasa los filtros de la
 * URL, ya validados, y pinta lo que vuelve.
 *
 * TODAS LAS RIFAS, TAMBIÉN LAS CERRADAS. El historial no depende de la rifa del
 * catálogo ni de la activa, así que aquí sí hay filtro de rifa (a diferencia de
 * «Mis boletas», D-088).
 *
 * EL CLIENTE DEL FILTRO se lee con la RLS del vendedor: un identificador ajeno
 * o inexistente responde como «no encontrado», sin distinguir uno de otro
 * (T15). Un cliente archivado sí aparece: su historial se conserva.
 */
export default async function SellerPrizesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(['seller'])
  const filters = parsePrizeAwardFilters(await searchParams, 'seller')
  const reversed = prizeAwardDatesReversed(filters)

  // Todo a la vez: el cliente del filtro, la página con sus indicadores, la
  // cobertura y las rifas del desplegable. Ninguna lectura por fila.
  const [client, result, coverage, raffles] = await Promise.all([
    filters.clientId ? getClientName(filters.clientId) : Promise.resolve(null),
    reversed ? Promise.resolve(null) : readSellerPrizeAwards(filters),
    readPrizeAwardCoverage(),
    listRaffleOptions(),
  ])

  if (filters.clientId && !client) notFound()

  return (
    <PrizeAwardsView
      audience="seller"
      filters={filters}
      result={result}
      coverage={coverage}
      client={client}
      raffles={raffles.map((raffle) => ({
        value: raffle.id,
        label: `${raffle.shortCode} · ${raffle.name}`,
      }))}
    />
  )
}
