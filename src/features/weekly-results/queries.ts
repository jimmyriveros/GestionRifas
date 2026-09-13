import 'server-only'

import { getCatalogSettings } from '@/features/catalog/queries'
import { LOTTERY_DASHBOARD_TIMEOUT_MS } from '@/features/lottery/dashboard'
import { getActiveMembership } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import {
  EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS,
  type WeeklyResultsMessageSettingsResult,
} from './message'
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
 * Lecturas de «Resultados de la semana» (BR-H02, BR-H04, BR-H09, D-194, D-197).
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

/**
 * El mensaje del vendedor de la sesión: si usa uno propio y cuál (BR-H09, BR-H10).
 *
 * NO RECIBE NINGÚN VENDEDOR. Se lee la membresía de quien pregunta, que sale de
 * la sesión —como `getWhatsappSettings`—, y además `memberships_select` no
 * serviría la de un vendedor ajeno a su equipo.
 *
 * TRES RESPUESTAS. Sin personalización, o si quien pregunta no es vendedor, la
 * configuración vacía: el predeterminado. Si la lectura FALLA, `error` y no la
 * vacía: tratar un fallo como «no tiene mensaje propio» le ofrecería guardar
 * encima del suyo sin haberlo visto. Ninguna de las tres tumba la sección.
 */
export async function getWeeklyResultsMessageSettings(): Promise<WeeklyResultsMessageSettingsResult> {
  try {
    const membership = await getActiveMembership()
    if (!membership || membership.role !== 'seller') {
      return { kind: 'ready', settings: EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('memberships')
      .select('weekly_results_use_custom_message, weekly_results_custom_message')
      .eq('profile_id', membership.profileId)
      .eq('organization_id', membership.organizationId)
      .eq('role', 'seller')
      .maybeSingle()

    if (error) return { kind: 'error' }
    if (!data) return { kind: 'ready', settings: EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS }

    return {
      kind: 'ready',
      settings: {
        useCustomMessage: data.weekly_results_use_custom_message,
        customMessage: data.weekly_results_custom_message,
      },
    }
  } catch {
    return { kind: 'error' }
  }
}
