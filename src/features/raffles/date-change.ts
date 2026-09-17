import type { RaffleStatus } from '@/lib/constants'

/**
 * El aviso de las fechas de una rifa activa, visto desde quien las cambia
 * (BR-R12, D-206).
 *
 * Cambiar la fecha de inicio o la de fin de una rifa ACTIVA avisa a las demás
 * personas de la organización: lo escribe la base, en la misma transacción que
 * el cambio (migración `0064`). Es una consecuencia que la pantalla de editar no
 * enseña, así que se dice ANTES de guardar y solo cuando va a ocurrir: con la
 * rifa activa y alguna fecha distinta de la guardada, igual que el aviso de
 * recálculo de la ganancia (D-127).
 *
 * «Las demás» porque quien guarda no recibe su propio aviso (BR-J11).
 */
export const RAFFLE_DATE_CHANGE_NOTICE =
  'Al guardar, las demás personas de tu organización recibirán un aviso con las fechas nuevas.'

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
