import { formatDateCsv } from '@/lib/dates'

import { prizeConflictMessage, RAFFLE_WIZARD_COPY } from './copy'
import { prizeConflict, type PrizeScheduleSubject } from './schedule'

/**
 * Lo que impide activar una rifa configurable, ANTES de intentarlo (D-202).
 *
 * PURO, y NO es la autoridad: la que manda es PostgreSQL —el disparador
 * `raffles_guard_prize_config` vuelve a comprobarlo todo al activar—. Esto
 * existe para que la pantalla de revisión pueda decir qué falta sin gastar un
 * viaje al servidor y sin ofrecer un botón que va a fallar
 * (`UX_COPY_GUIDELINES` §5).
 *
 * Solo mira los premios VIGENTES: un archivado no aplica a los próximos
 * sorteos, así que ni cuenta para el mínimo ni puede chocar con nadie.
 */
export type ReviewPrize = PrizeScheduleSubject & { id: string }

export type ReviewRaffle = { startDate: string; endDate: string }

export function raffleReviewProblems(prizes: ReviewPrize[], raffle: ReviewRaffle): string[] {
  const problems: string[] = []

  if (prizes.length === 0) {
    return [RAFFLE_WIZARD_COPY.blockedNoPrizes]
  }

  for (const prize of prizes) {
    const outside = prize.rules.some(
      (rule) => rule.startDate < raffle.startDate || rule.endDate > raffle.endDate,
    )
    if (outside) {
      problems.push(
        RAFFLE_WIZARD_COPY.blockedOutside(
          prize.title,
          formatDateCsv(raffle.startDate),
          formatDateCsv(raffle.endDate),
        ),
      )
    }
  }

  // El conflicto se busca una sola vez por pareja: `prizeConflict` es simétrico
  // y repetirlo al revés escribiría el mismo choque dos veces con los nombres
  // cambiados de sitio.
  for (let index = 0; index < prizes.length; index += 1) {
    const prize = prizes[index]!
    const conflict = prizeConflict(prize, prizes.slice(index + 1))
    if (conflict) problems.push(prizeConflictMessage(prize.title, conflict))
  }

  return problems
}

/**
 * Cómo se ofrece ACTIVAR una rifa en borrador desde su detalle (D-202).
 *
 * Una rifa con premios configurables se activa pasando por la revisión, que es
 * la que dice qué falta: su detalle no ofrece «Activar rifa», sino el enlace a
 * «Revisar y activar». Quien no puede configurar los premios tampoco puede
 * revisarlos, así que a esa persona no se le ofrece ninguna de las dos. Una
 * rifa heredada conserva «Activar rifa», como siempre.
 *
 * SOLO DECIDE LO QUE SE PINTA. Activar sigue pasando por `changeRaffleStatus`,
 * que se autoriza sola ante una invocación directa, y por el disparador de
 * PostgreSQL, que valida la configuración venga de donde venga.
 *
 * El texto viaja hecho desde el servidor (el precedente de D-181): los textos
 * del proceso no se cargan en el navegador de la pantalla de detalle.
 */
export type DraftActivation =
  { kind: 'direct' } | { kind: 'review'; href: string; label: string } | { kind: 'none' }

export function draftActivation(
  raffle: { id: string; prizeMode: 'legacy' | 'configurable' },
  canManagePrizes: boolean,
): DraftActivation {
  if (raffle.prizeMode === 'legacy') return { kind: 'direct' }
  if (!canManagePrizes) return { kind: 'none' }
  return {
    kind: 'review',
    href: `/owner/raffles/${raffle.id}/review`,
    label: RAFFLE_WIZARD_COPY.steps.review,
  }
}
