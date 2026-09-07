import { StatusBadge } from '@/components/data/StatusBadge'
import { LOTTERY_SCHEDULE_STATUS_LABELS } from '@/features/lottery/constants'

import type { StatusTone } from '@/lib/constants'
import type { Database } from '@/types/database.types'

type ScheduleStatus = Database['public']['Enums']['lottery_schedule_status']

/**
 * El estado del sorteo de una loteria, con el tono del sistema (Wave 4.5B).
 *
 * Antes repetia aqui las mismas cadenas de color que `StatusBadge`. Ahora dice
 * lo unico que este archivo sabe y los demas no —que significa cada estado del
 * calendario— y el color lo pone el tono.
 *
 * POR QUE CADA UNO (aprobado 2026-09-06).
 *
 * `scheduled`, `rescheduled_later` («Aplazado») y `rescheduled_earlier`
 * («Adelantado») son `info`: la programacion cambio pero sigue siendo valida y
 * el sorteo continua. Un cambio de hora no es un problema, es una noticia.
 *
 * `schedule_unverified` («Horario por confirmar») tambien es `info`: el glosario
 * lo trata como un estado NORMAL, y que falte la confirmacion no prueba por si
 * solo que algo vaya mal.
 *
 * `suspended` y `schedule_conflict` son `warning`, que aqui significa «esto pide
 * que alguien mire»: uno interrumpe el curso normal del sorteo, y del otro la
 * programacion oficial se contradice y hay que verificarla. Ninguno es `error`.
 *
 * NO CONFUNDIR `schedule_conflict` CON EL CONFLICTO DE RESULTADOS de BR-L26.
 * Aquel vive en otro campo —`result.validationStatus`— y es el que deja la
 * pantalla sin numero. Este habla solo del CALENDARIO.
 *
 * `cancelled` es `neutral`, como toda cancelacion deliberada, y `completed` es
 * `success`. Aqui no hay ningun `error`.
 */
const TONES: Record<ScheduleStatus, StatusTone> = {
  scheduled: 'info',
  rescheduled_later: 'info',
  rescheduled_earlier: 'info',
  suspended: 'warning',
  cancelled: 'neutral',
  completed: 'success',
  schedule_unverified: 'info',
  schedule_conflict: 'warning',
}

export function LotteryScheduleBadge({ status }: { status: ScheduleStatus }) {
  return <StatusBadge tone={TONES[status]}>{LOTTERY_SCHEDULE_STATUS_LABELS[status]}</StatusBadge>
}
