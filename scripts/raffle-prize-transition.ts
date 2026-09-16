/**
 * Transicion de UNA rifa existente a premios configurables (Entrega 4, D-204).
 *
 *   npx tsx scripts/raffle-prize-transition.ts --local \
 *     --organization <uuid> --raffle <uuid> --name "Nombre exacto de la rifa" \
 *     --status active --start AAAA-MM-DD --end AAAA-MM-DD [--apply]
 *
 * SIN --apply ES UNA VISTA PREVIA. La base ejecuta la transicion entera
 * —validaciones, premios, aviso y bitacora— dentro de un bloque que se deshace,
 * y devuelve lo que habria quedado. No cambia nada.
 *
 * CON --apply la hace, en UNA transaccion: si cualquier comprobacion falla, no
 * queda nada escrito. Repetirla con la misma configuracion no escribe nada.
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
 * SOLO LOCAL HASTA LA ENTREGA 5. Ejecutarla contra el proyecto real necesita
 * autorizacion expresa, y habilitarlo es cambiar esa unica comprobacion
 * (docs/RUNBOOK.md, «Transicion de una rifa a premios configurables»).
 */
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = ['draft', 'active', 'closed', 'cancelled'] as const
type RaffleStatus = (typeof STATUSES)[number]

type TransitionInput = {
  organizationId: string
  raffleId: string
  name: string
  status: RaffleStatus
  startDate: string
  endDate: string
  apply: boolean
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function fail(message: string): never {
  console.error(`\nError: ${message}`)
  process.exit(1)
}

function usage(): never {
  console.error(
    'Uso: npx tsx scripts/raffle-prize-transition.ts --local ' +
      '--organization <uuid> --raffle <uuid> --name "Nombre exacto de la rifa" ' +
      '--status active --start AAAA-MM-DD --end AAAA-MM-DD [--apply]',
  )
  process.exit(1)
}

function parseArgs(): TransitionInput {
  const organizationId = readArg('organization')?.trim()
  const raffleId = readArg('raffle')?.trim()
  const name = readArg('name')
  const status = readArg('status')?.trim()
  const startDate = readArg('start')?.trim()
  const endDate = readArg('end')?.trim()

  if (!organizationId || !raffleId || name === undefined || !status || !startDate || !endDate) {
    usage()
  }
  if (!UUID.test(organizationId))
    fail('--organization debe ser el identificador de la organización.')
  if (!UUID.test(raffleId)) fail('--raffle debe ser el identificador de la rifa.')
  if (!(STATUSES as readonly string[]).includes(status)) {
    fail('--status debe ser draft, active, closed o cancelled: el estado que se espera de la rifa.')
  }
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    fail('--start y --end son las fechas que se esperan de la rifa, en formato AAAA-MM-DD.')
  }

  return {
    organizationId,
    raffleId,
    name,
    status: status as RaffleStatus,
    startDate,
    endDate,
    apply: process.argv.includes('--apply'),
  }
}

async function main() {
  // La unica puerta hacia el proyecto real, cerrada a proposito hasta la
  // Entrega 5: se abre con autorizacion expresa, no con un argumento. Se mira
  // ANTES de resolver el destino, para no leer ni una credencial remota.
  if (!process.argv.includes('--local')) {
    fail('Hasta la Entrega 5 la transición solo se ejecuta contra la base local. Agrega --local.')
  }

  const input = parseArgs()
  const target = resolveTarget()
  if (!target.isLocal) {
    fail('Hasta la Entrega 5 la transición solo se ejecuta contra la base local. Agrega --local.')
  }

  const supabase = createClient<Database>(target.url, target.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime,
  })

  console.log(`Transición de premios · ${target.label}`)

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
      fail(PRIZE_TRANSITION_COPY.failed)
    }
    return data as unknown as TransitionResult
  }

  const preview = await run(false)
  console.log('')
  console.log(transitionPreviewLines(preview).join('\n'))

  if (!input.apply) {
    if (!preview.already_applied) {
      console.log('\nPara aplicarla, repite el comando con --apply.')
    }
    return
  }

  if (preview.already_applied) return

  const applied = await run(true)
  console.log('')
  console.log(transitionPreviewLines(applied).join('\n'))
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
