/**
 * Reconoce los premios que el NEGOCIO confirmo sobre coincidencias que el motor
 * no puede premiar (D-208, respuesta H1). El cargador nacio en la Etapa 1; su
 * puerta de produccion, en la Etapa 4 (`record-prize-awards-guard.ts`,
 * `RUNBOOK` §9.4).
 *
 *   npx tsx scripts/record-prize-awards.ts (--local | --production --project-ref <ref>) \
 *     --organization <uuid> --confirm-organization <uuid> \
 *     [--apply --preview-hash <huella de la vista previa>]
 *
 * SIN --apply ES UNA VISTA PREVIA, contra cualquier destino: la base valida cada
 * entrada y dice que se reconoceria, que ya estaba y que se rechaza, sin
 * escribir nada. Imprime la HUELLA de lo que respondio.
 *
 * CON --apply, en los DOS destinos: repite la vista previa, exige que su huella
 * sea la que se paso con --preview-hash y que ninguna entrada se rechace, y solo
 * entonces escribe, en UNA transaccion —entera o nada, idempotente—. Despues
 * vuelve a leer lo almacenado y lo concilia con las entradas.
 *
 * UN SOLO FLUJO para local y produccion: lo unico que cambia es el destino. Por
 * eso el ensayo local (`tests/db/record-prize-awards-script.test.ts`) recorre el
 * mismo camino que la puerta 2.
 *
 * COMO TERMINA (`AWARDS_EXIT`): 0 bien, o nada que hacer; 1 no se escribio nada;
 * 2 se escribio y lo almacenado no cuadra con lo pedido —se detiene y se
 * investiga—; 3 respuesta incierta —no se sabe si se escribio, y no se repite a
 * ciegas (`RUNBOOK` §9.7)—.
 *
 * LA CONFIGURACION NO VIVE AQUI: los casos confirmados estan en
 * `src/features/prize-awards/declared.ts`, una sola vez, y la autoridad es
 * `record_declared_prize_awards` (`0068`), que vuelve a comprobarlo todo.
 *
 * NINGUN IDENTIFICADOR DE PRODUCCION VIVE AQUI: la organizacion y el proyecto
 * llegan como argumentos. Nunca imprime claves, tokens, contrasenas ni la
 * direccion completa del proyecto, y la base no le devuelve ningun dato de
 * cliente: solo numeros de boleta, sorteo, premio e importe.
 */
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import {
  assertAwardInputs,
  assertAwardsTarget,
  assertSamePreview,
  assessAwardsReport,
  AWARDS_EXIT,
  AWARDS_USAGE,
  awardsErrorIsCertain,
  AwardsGateError,
  awardsPreviewHash,
  awardsTargetLabel,
  parseAwardsArgs,
  parseAwardsReport,
  type AwardReportRow,
  type AwardsAssessment,
} from './record-prize-awards-guard'
import { resolveTarget } from './supabase-target'
import {
  CONFIRMED_AWARDS_BASIS,
  CONFIRMED_PRIZE_AWARDS,
  declaredAwardsKnownAmount,
} from '../src/features/prize-awards/declared'
import { formatCOP } from '../src/lib/money'
import type { Database } from '../src/types/database.types'

// Node 20 no trae WebSocket nativo; @supabase/realtime-js lo exige aunque no se
// use realtime (D-033).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realtime = { transport: WebSocket as any }

const ENTRIES = CONFIRMED_PRIZE_AWARDS

/** Si ya salio la peticion que escribe: a partir de ahi, un fallo es incierto. */
let applySent = false

function stop(code: number, message: string): never {
  console.error(`\n${message}`)
  process.exit(code)
}

/** Una negativa de la puerta termina el script sin escribir nada; cualquier otro error sigue. */
function gate<T>(check: () => T, usage = false): T {
  try {
    return check()
  } catch (error) {
    if (error instanceof AwardsGateError) {
      if (usage) console.error(AWARDS_USAGE)
      stop(AWARDS_EXIT.refused, error.message)
    }
    throw error
  }
}

function printReport(rows: readonly AwardReportRow[]): void {
  for (const row of rows) {
    const ticket = `${row.daily_number ?? '—'} / ${row.weekly_number ?? '—'}`
    const draw = `${row.lottery_code ?? '—'} ${row.reference_date ?? '—'}`
    const reward = [row.amount === null ? null : formatCOP(row.amount), row.in_kind_description]
      .filter((part): part is string => part !== null)
      .join(' + ')
    console.log(
      `${row.outcome.padEnd(15)} ${ticket.padEnd(14)} ${draw.padEnd(26)} ` +
        `${(row.prize_title ?? '—').padEnd(16)} ${reward || 'sin importe'}`,
    )
    if (row.problem) console.log(`${' '.repeat(16)}${row.problem}`)
  }
}

function printProblems(assessment: AwardsAssessment): void {
  for (const problem of assessment.problems) console.error(`  · ${problem}`)
}

async function main(): Promise<void> {
  // LA PUERTA, antes de resolver el destino: una orden mal formada o una lista
  // mal escrita no llegan a crear ningun cliente ni a usar ninguna credencial.
  const request = gate(() => parseAwardsArgs(process.argv.slice(2)), true)
  gate(() => assertAwardInputs(ENTRIES, CONFIRMED_AWARDS_BASIS))

  const target = resolveTarget()
  gate(() => assertAwardsTarget(request, target, { SUPABASE_TARGET: process.env.SUPABASE_TARGET }))

  const supabase = createClient<Database>(target.url, target.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime,
  })

  console.log(`Premios reconocidos · ${awardsTargetLabel(request, target)}`)
  console.log(`Modo: ${request.apply ? 'APLICAR (escribe)' : 'VISTA PREVIA (no escribe nada)'}`)
  console.log(`Organización: ${request.organizationId}`)
  console.log(`Entradas: ${ENTRIES.length}`)
  console.log(`Respaldo: ${CONFIRMED_AWARDS_BASIS}`)
  console.log('')

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', request.organizationId)
    .maybeSingle()
  if (organizationError) {
    stop(
      AWARDS_EXIT.refused,
      `No se pudo comprobar la organización: ${organizationError.message}. No se escribió nada.`,
    )
  }
  if (!organization) {
    stop(AWARDS_EXIT.refused, 'Esa organización no existe en el destino. No se escribió nada.')
  }

  const call = (apply: boolean) =>
    supabase.rpc('record_declared_prize_awards', {
      p_organization_id: request.organizationId,
      p_basis: CONFIRMED_AWARDS_BASIS,
      p_awards: ENTRIES as unknown as never,
      p_apply: apply,
    })

  // 1. LA VISTA PREVIA, siempre: es la que se revisa y la que se compara.
  const first = await call(false)
  if (first.error) {
    stop(
      AWARDS_EXIT.refused,
      `La vista previa no se pudo hacer: ${first.error.message}. No se escribió nada.`,
    )
  }
  const preview = gate(() => parseAwardsReport(first.data))
  printReport(preview)
  const previewCheck = assessAwardsReport(ENTRIES, preview, 'preview')
  const hash = awardsPreviewHash({
    target: request.target,
    projectRef: request.projectRef,
    organizationId: request.organizationId,
    basis: CONFIRMED_AWARDS_BASIS,
    entries: ENTRIES,
    preview,
  })

  console.log('')
  console.log(
    `Se reconocerían: ${previewCheck.counts.wouldRecord} · Ya estaban: ${previewCheck.counts.alreadyStored} · ` +
      `Rechazadas: ${previewCheck.counts.rejected}`,
  )
  console.log(`Dinero de estas entradas: ${formatCOP(previewCheck.amount)}`)

  if (previewCheck.problems.length > 0 || previewCheck.counts.rejected > 0) {
    printProblems(previewCheck)
    stop(
      AWARDS_EXIT.refused,
      'Esta vista previa no se puede aplicar: hay entradas rechazadas o que no corresponden a lo pedido. ' +
        'No se escribió nada.',
    )
  }

  if (previewCheck.counts.wouldRecord === 0) {
    // Todo estaba: lo que la base informa es lo almacenado, y cuadra.
    console.log(
      `\nNada que escribir: las ${ENTRIES.length} entradas ya estaban reconocidas con estos importes.`,
    )
    return
  }

  if (!request.apply) {
    console.log(`\nHuella de la vista previa: ${hash}`)
    console.log('Vista previa: no se escribió nada.')
    console.log('Para aplicarla, repite la MISMA orden con --apply --preview-hash <esa huella>.')
    return
  }

  // 2. APLICAR: solo si la vista previa de ahora es la que se revisó.
  gate(() => assertSamePreview(request.previewHash, hash))

  applySent = true
  const written = await call(true)
  if (written.error) {
    if (awardsErrorIsCertain(written.error)) {
      stop(
        AWARDS_EXIT.refused,
        `No se reconoció ningún premio: ${written.error.message}. La base deshizo la operación entera.`,
      )
    }
    stop(
      AWARDS_EXIT.uncertain,
      'No sabemos si se reconocieron los premios: la respuesta no llegó completa. No lo repitas a ciegas: ' +
        'consulta primero lo almacenado (docs/RUNBOOK.md §9.7).',
    )
  }

  let applied: AwardReportRow[]
  try {
    applied = parseAwardsReport(written.data)
  } catch {
    stop(
      AWARDS_EXIT.discrepancy,
      'La base confirmó la operación, pero su informe no se entiende. Detente y concilia a mano (docs/RUNBOOK.md §9.6).',
    )
  }
  console.log('')
  printReport(applied)
  const appliedCheck = assessAwardsReport(ENTRIES, applied, 'apply')
  console.log('')
  console.log(
    `Reconocidos ahora: ${appliedCheck.counts.recorded} · Ya estaban: ${appliedCheck.counts.alreadyStored} · ` +
      `Rechazadas: ${appliedCheck.counts.rejected}`,
  )
  if (appliedCheck.problems.length > 0) {
    printProblems(appliedCheck)
    stop(
      AWARDS_EXIT.discrepancy,
      'Se escribió, pero el informe no corresponde a lo pedido. Detente y revisa (docs/RUNBOOK.md §9.7).',
    )
  }

  // 3. CONCILIACIÓN: se vuelve a leer lo almacenado, que es lo que manda.
  const again = await call(false)
  if (again.error) {
    stop(
      AWARDS_EXIT.discrepancy,
      `Se aplicó, pero no se pudo volver a leer lo almacenado: ${again.error.message}. ` +
        'Concilia con la consulta de docs/RUNBOOK.md §9.6 antes de seguir.',
    )
  }
  let stored: AwardReportRow[]
  try {
    stored = parseAwardsReport(again.data)
  } catch {
    stop(
      AWARDS_EXIT.discrepancy,
      'Se aplicó, pero lo almacenado no se pudo leer. Concilia con docs/RUNBOOK.md §9.6.',
    )
  }
  const storedCheck = assessAwardsReport(ENTRIES, stored, 'reconcile')
  const expected = declaredAwardsKnownAmount(ENTRIES)
  if (storedCheck.problems.length > 0 || storedCheck.amount !== expected) {
    printProblems(storedCheck)
    stop(
      AWARDS_EXIT.discrepancy,
      `Lo almacenado (${formatCOP(storedCheck.amount)}) no cuadra con la confirmación (${formatCOP(expected)}). ` +
        'Detente y revisa (docs/RUNBOOK.md §9.7).',
    )
  }
  console.log(
    `\nConciliación: ${storedCheck.counts.alreadyStored} de ${ENTRIES.length} entradas almacenadas ` +
      `con su importe · ${formatCOP(storedCheck.amount)}`,
  )
}

main().catch((error: unknown) => {
  // Solo el mensaje: un error inesperado podria arrastrar la direccion del proyecto.
  console.error(error instanceof Error ? error.message : 'Error inesperado.')
  process.exit(applySent ? AWARDS_EXIT.uncertain : AWARDS_EXIT.refused)
})
