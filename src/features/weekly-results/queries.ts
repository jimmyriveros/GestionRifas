import 'server-only'

import { getCatalogSettings } from '@/features/catalog/queries'
import { LOTTERY_DASHBOARD_TIMEOUT_MS } from '@/features/lottery/dashboard'
import { createClient } from '@/lib/supabase/server'

import {
  buildWeeklyResults,
  weeklyResultsRaffleName,
  type LotteryValidationStatus,
  type WeeklyResults,
  type WeeklyResultsRaffle,
  type WeeklyScheduleRow,
} from './results'
import type { ResultsWeek } from './week'

/**
 * Lecturas de «Resultados de la semana» (BR-H02, BR-H04, D-194).
 *
 * SOLO TABLAS LOCALES, con el cliente sujeto a la RLS de quien pregunta. No
 * importa adaptadores, descargas ni sincronización: una fuente oficial caída no
 * puede afectar esta pantalla ni la imagen (BR-L20). Programación y resultado
 * son nacionales y los lee cualquier miembro activo (D-141); aquí no se tocan
 * coincidencias, boletas ni clientes, porque la imagen no los usa.
 *
 * UNA consulta para los seis sorteos, con el resultado incrustado, y con el
 * mismo plazo que el recuadro de loterías del panel (BR-L25). Un fallo o un plazo
 * vencido devuelven `error`: el resto de Configuración se sigue pintando.
 */

export const WEEKLY_RESULTS_SELECT =
  'lottery_code, reference_date, lottery_results ( winning_number, validation_status )'

type ResultEmbed = { winning_number: string | null; validation_status: LotteryValidationStatus }

type ScheduleQueryRow = {
  lottery_code: string
  reference_date: string
  lottery_results: ResultEmbed | ResultEmbed[] | null
}

export async function getWeeklyResults(week: ResultsWeek): Promise<WeeklyResults> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('lottery_draw_schedules')
      .select(WEEKLY_RESULTS_SELECT)
      .gte('reference_date', week.monday)
      .lte('reference_date', week.saturday)
      .abortSignal(AbortSignal.timeout(LOTTERY_DASHBOARD_TIMEOUT_MS))

    if (error) return { kind: 'error', week }

    const rows = ((data ?? []) as unknown as ScheduleQueryRow[]).map((row): WeeklyScheduleRow => {
      // `schedule_id` es único en `lottery_results`: PostgREST entrega un objeto,
      // pero se acepta también la forma de lista por si cambia la inferencia.
      const result = Array.isArray(row.lottery_results)
        ? (row.lottery_results[0] ?? null)
        : row.lottery_results
      return {
        lotteryCode: row.lottery_code,
        referenceDate: row.reference_date,
        result: result
          ? { winningNumber: result.winning_number, validationStatus: result.validation_status }
          : null,
      }
    })

    return buildWeeklyResults(week, rows)
  } catch {
    return { kind: 'error', week }
  }
}

/**
 * La rifa que encabeza la imagen: la configurada en el catálogo de ESE vendedor.
 *
 * Reutiliza `getCatalogSettings`, que ya va por la RLS: con otro `profileId` la
 * base no devuelve la fila y el resultado es `none`, nunca la rifa de otro. La
 * ruta del PNG ni siquiera acepta ese identificador —sale de la sesión—; esta
 * función no confía en eso para ser segura.
 */
export async function getWeeklyResultsRaffle(profileId: string): Promise<WeeklyResultsRaffle> {
  try {
    const name = weeklyResultsRaffleName(await getCatalogSettings(profileId))
    return name === null ? { kind: 'none' } : { kind: 'ready', name }
  } catch {
    return { kind: 'error' }
  }
}
