import type { RaffleStatus } from '@/lib/constants'

/**
 * El aviso de las fechas de una rifa activa, visto desde quien las cambia
 * (BR-R12, D-206).
 *
 * Cambiar la fecha de inicio o la de fin de una rifa ACTIVA avisa a TODAS las
 * personas de la organización: lo escribe la base, en la misma transacción que
 * el cambio (migraciones `0064` y `0065`). Es una consecuencia que la pantalla de
 * editar no enseña, así que se dice ANTES de guardar y solo cuando va a ocurrir:
 * con la rifa activa y alguna fecha distinta de la guardada, igual que el aviso
 * de recálculo de la ganancia (D-127).
 *
 * «También a ti» porque quien guarda recibe su propio aviso: BR-R12 avisa a cada
 * membresía activa, incluida la de quien cambia las fechas. BR-J11, que excluye
 * a quien edita un premio, no aplica aquí (D-206, corregida por la `0065`).
 */
export const RAFFLE_DATE_CHANGE_NOTICE =
  'Al guardar, avisaremos de las fechas nuevas a todas las personas de tu organización, también a ti.'

type RaffleDates = { startDate: string; endDate: string }

export function raffleDateChangeAnnounced(input: {
  status: RaffleStatus
  saved: RaffleDates
  current: RaffleDates
}): boolean {
  return (
    input.status === 'active' &&
    (input.current.startDate !== input.saved.startDate ||
      input.current.endDate !== input.saved.endDate)
  )
}
