/**
 * Transicion de UNA rifa existente a premios configurables (Entrega 4, D-204;
 * puerta de produccion en la Entrega 5, D-205).
 *
 *   npx tsx scripts/raffle-prize-transition.ts (--local | --production) \
 *     --organization <uuid> --raffle <uuid> --name "Nombre exacto de la rifa" \
 *     --status active --start AAAA-MM-DD --end AAAA-MM-DD \
 *     [--apply --preview-hash <huella> --confirm-raffle <uuid de la rifa>]
 *
 * SIN --apply ES UNA VISTA PREVIA, contra cualquier destino. La base ejecuta la
 * transicion entera —validaciones, premios, aviso y bitacora— dentro de un
 * bloque que se deshace, y devuelve lo que habria quedado, con su HUELLA. No
 * cambia nada.
 *
 * CON --apply la hace, en UNA transaccion: si cualquier comprobacion falla, no
 * queda nada escrito. Repetirla con la misma configuracion no escribe nada.
 * Antes de aplicar repite la vista previa y, si se paso `--preview-hash`, exige
 * que su huella sea la misma.
 *
 * CONTRA PRODUCCION, aplicar exige TODO a la vez (`raffle-prize-transition-guard.ts`):
 * `--production`, un destino que de verdad es remoto, la huella de una vista
 * previa anterior, `--apply` y el identificador de la rifa escrito otra vez con
 * `--confirm-raffle`. Ningun identificador de produccion vive en el codigo.
 *
 * LO QUE CALCULA ESTE SCRIPT, y nada mas: desde que sorteo empiezan el premio
 * diario y el de los sabados —el primero que todavia no se jugo, respuesta del
 * dueno del 2026-09-16— y que sorteos estan cancelados. Lo lee de la
 * programacion oficial y lo muestra. La configuracion de los seis premios es
 * `confirmedRafflePrizes`, y la autoridad es `transition_raffle_prize_mode`
 * (migracion 0063), que vuelve a comprobarlo todo.
 *
 * LA RIFA NO SE ELIGE POR NOMBRE: se da su identificador y su organizacion, y
 * el nombre, el estado y las fechas son lo que se ESPERA de ella. Si algo no
 * coincide, la base lo rechaza.
 *
 * UNA RESPUESTA INCIERTA NO SE REPITE. Si aplicar falla sin un rechazo claro de
 * la base —la red, un tiempo de espera—, el script lo dice y termina: primero se
 * consulta el estado (docs/RUNBOOK.md §8.4).
 *
 * Nunca imprime claves, tokens, contrasenas ni la direccion completa del proyecto.
 */
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import {
  assertPreviewUnchanged,
  assertTransitionTarget,
  parseTransitionArgs,
  TRANSITION_USAGE,
  TransitionGateError,
  transitionErrorIsCertain,
  transitionTargetLabel,
  type TransitionRequest,
} from './raffle-prize-transition-guard'
import { resolveTarget } from './supabase-target'
import { PRIZE_TRANSITION_COPY } from '../src/features/raffle-prizes/copy'
import {
  CONFIRMED_PRIZE_PLAN,
  confirmedPrizeStarts,
  confirmedRafflePrizes,
  TransitionPlanError,
  transitionPreviewLines,
  type ConfirmedPrizeStarts,
  type TransitionPrizePayload,
  type TransitionResult,
} from '../src/features/raffle-prizes/transition'
import { formatDateCsv, isoDateBogota } from '../src/lib/dates'
import type { Database, Json } from '../src/types/database.types'

// Node 20 no trae WebSocket nativo; @supabase/realtime-js lo exige aunque no
// se use realtime (D-033).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realtime = { transport: WebSocket as any }

function fail(message: string): never {
  console.error(`\nError: ${message}`)
  process.exit(1)
}

/** Una negativa de la puerta termina el script con su mensaje; cualquier otro error sigue. */
function gate<T>(check: () => T, usage = false): T {
  try {
    return check()
  } catch (error) {
    if (error instanceof TransitionGateError) {
      if (usage) console.error(TRANSITION_USAGE)
      fail(error.message)
    }
    throw error
  }
}

async function main() {
  // LA PUERTA, antes de resolver el destino: una orden mal formada no llega a
  // crear ningún cliente ni a usar ninguna credencial.
  const input: TransitionRequest = gate(() => parseTransitionArgs(process.argv.slice(2)), true)

  const target = resolveTarget()
  gate(() =>
    assertTransitionTarget(input, target, { SUPABASE_TARGET: process.env.SUPABASE_TARGET }),
  )

  const supabase = createClient<Database>(target.url, target.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime,
  })

  console.log(`Transición de premios · ${transitionTargetLabel(input, target)}`)

  const now = new Date()
  const today = isoDateBogota(now)
  const from = input.startDate > today ? input.startDate : today

  const { data: schedules, error: schedulesError } = await supabase
    .from('lottery_draw_schedules')
    .select(
      'reference_date, lottery_code, schedule_status, original_scheduled_at, official_scheduled_at',
    )
    .gte('reference_date', from)
    .lte('reference_date', CONFIRMED_PRIZE_PLAN.mainDate)
  if (schedulesError) fail(`No se pudo leer la programación oficial: ${schedulesError.message}`)

  let prizes: TransitionPrizePayload[]
  let starts: ConfirmedPrizeStarts
  try {
    starts = confirmedPrizeStarts({
      draws: (schedules ?? []).map((row) => ({
        referenceDate: row.reference_date,
        lotteryCode: row.lottery_code,
        scheduleStatus: row.schedule_status,
        originalScheduledAt: row.original_scheduled_at,
        officialScheduledAt: row.official_scheduled_at,
      })),
      now,
      raffleStartDate: input.startDate,
    })
    prizes = confirmedRafflePrizes(starts)
  } catch (error) {
    if (error instanceof TransitionPlanError) fail(error.message)
    throw error
  }

  console.log(
    `Primer sorteo pendiente: de lunes a viernes, el ${formatDateCsv(starts.dailyStart)}; ` +
      `sábado, el ${formatDateCsv(starts.saturdayStart)}.`,
  )
  if ((starts.cancelledDates ?? []).length > 0) {
    console.log(
      `Sorteos cancelados que no entran en ningún calendario: ${(starts.cancelledDates ?? [])
        .map(formatDateCsv)
        .join(', ')}.`,
    )
  }

  const args = {
    p_organization_id: input.organizationId,
    p_raffle_id: input.raffleId,
    p_expected_name: input.name,
    p_expected_status: input.status,
    p_expected_start_date: input.startDate,
    p_expected_end_date: input.endDate,
    p_prizes: prizes as unknown as Json,
  }

  const run = async (apply: boolean): Promise<TransitionResult> => {
    const { data, error } = await supabase.rpc('transition_raffle_prize_mode', {
      ...args,
      p_apply: apply,
    })
    if (error) {
      console.error(`\n${error.message}`)
      if (error.details) console.error(error.details)
      // Una vista previa nunca deja nada. Al aplicar, solo un rechazo claro de la
      // base garantiza que no se cambió nada; lo demás es incierto.
      if (!apply || transitionErrorIsCertain(error)) fail(PRIZE_TRANSITION_COPY.failed)
      fail(
        'No sabemos si la transición se aplicó: la respuesta no llegó completa. No la repitas: ' +
          'consulta primero si la rifa tiene su fila en raffle_prize_transitions y en qué modo ' +
          'está (docs/RUNBOOK.md §8.4).',
      )
    }
    return data as unknown as TransitionResult
  }

  const preview = await run(false)
  console.log('')
  console.log(transitionPreviewLines(preview).join('\n'))
  console.log(`\nHuella de la configuración: ${preview.configuration_hash}`)

  if (!input.apply) {
    if (!preview.already_applied) {
      console.log(
        input.target === 'production'
          ? '\nPara aplicarla en producción, repite la MISMA orden con --apply ' +
              `--preview-hash ${preview.configuration_hash} --confirm-raffle <identificador de la rifa>.`
          : '\nPara aplicarla, repite el comando con --apply.',
      )
    }
    return
  }

  if (preview.already_applied) return

  // La vista previa que se acaba de repetir tiene que ser la que se revisó.
  gate(() => assertPreviewUnchanged(input, preview.configuration_hash))

  const applied = await run(true)
  console.log('')
  console.log(transitionPreviewLines(applied).join('\n'))
  console.log(`\nHuella de la configuración: ${applied.configuration_hash}`)
}

main().catch((error: unknown) => {
  // Solo el mensaje: un error inesperado podría arrastrar la dirección del proyecto.
  console.error(error instanceof Error ? error.message : 'Error inesperado.')
  process.exit(1)
})
