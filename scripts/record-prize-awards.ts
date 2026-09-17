/**
 * Reconoce los premios que el NEGOCIO confirmo sobre coincidencias que el motor
 * no puede premiar (Etapa 1 del historial de premios ganados, D-208, H1).
 *
 *   npx tsx scripts/record-prize-awards.ts --local --organization <uuid> [--apply]
 *
 * SIN --apply ES UNA VISTA PREVIA: la base valida cada entrada y dice qué se
 * reconoceria, qué ya estaba y qué se rechaza, sin escribir nada.
 *
 * CON --apply escribe, en UNA transaccion, y es idempotente: repetirlo no
 * duplica ni reescribe. ENTERA O NADA: con un solo problema no se escribe nada.
 *
 * SOLO LOCAL, EN ESTA ETAPA. El encargo autoriza ensayarlo en local y prohibe
 * escribir en produccion, asi que el script se niega sin `--local`. Llevarlo al
 * proyecto real exige autorizacion propia y una puerta como la de D-205
 * (`scripts/raffle-prize-transition-guard.ts`): destino remoto comprobado,
 * huella de una vista previa anterior y el identificador escrito otra vez.
 *
 * LA CONFIGURACION NO VIVE AQUI. Los dos casos confirmados estan en
 * `src/features/prize-awards/declared.ts`, una sola vez, y la autoridad es
 * `record_declared_prize_awards` (migracion 0067), que vuelve a comprobarlo todo:
 * que la coincidencia exista, que estuviera vendida, que su sorteo se resuelva
 * con el sistema de siempre y que el motor no haya premiado ya esa fotografia.
 *
 * NINGUN IDENTIFICADOR DE PRODUCCION VIVE AQUI: la organizacion llega como
 * argumento. Nunca imprime claves, tokens ni contrasenas.
 */
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import {
  CONFIRMED_AWARDS_BASIS,
  CONFIRMED_PRIZE_AWARDS,
  declaredAwardsKnownAmount,
} from '../src/features/prize-awards/declared'
import type { Database } from '../src/types/database.types'
import { resolveTarget } from './supabase-target'

const USAGE = `Uso:
  npx tsx scripts/record-prize-awards.ts --local --organization <uuid> [--apply]

  --local          obligatorio en esta etapa: el encargo no autoriza produccion
  --organization   la organizacion dueña de las coincidencias
  --apply          escribe; sin el, es una vista previa que no toca nada`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Node 20 no trae WebSocket nativo; @supabase/realtime-js lo exige aunque no se
// use realtime (D-033).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realtime = { transport: WebSocket as any }

function argumento(nombre: string): string | null {
  const indice = process.argv.indexOf(`--${nombre}`)
  if (indice === -1) return null
  return process.argv[indice + 1] ?? null
}

function pesos(valor: number | null): string {
  if (valor == null) return 'sin importe'
  return `$${valor.toLocaleString('es-CO')}`
}

async function main(): Promise<void> {
  if (!process.argv.includes('--local')) {
    console.error(
      'Este script solo trabaja contra la instancia LOCAL.\n' +
        'La Etapa 1 del encargo autoriza ensayarlo en local y prohibe escribir en produccion.\n' +
        'Llevarlo al proyecto real exige autorizacion propia y su puerta (D-205).\n\n' +
        USAGE,
    )
    process.exit(1)
  }

  const organizacion = argumento('organization')
  if (!organizacion || !UUID.test(organizacion)) {
    console.error(`Falta --organization con un identificador valido.\n\n${USAGE}`)
    process.exit(1)
  }

  const apply = process.argv.includes('--apply')
  const target = resolveTarget()
  const supabase = createClient<Database>(target.url, target.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime,
  })

  console.log(`Destino: ${target.label}`)
  console.log(`Modo: ${apply ? 'APLICAR (escribe)' : 'VISTA PREVIA (no escribe nada)'}`)
  console.log(`Entradas: ${CONFIRMED_PRIZE_AWARDS.length}`)
  console.log(`Respaldo: ${CONFIRMED_AWARDS_BASIS}`)
  console.log('')

  const { data, error } = await supabase.rpc('record_declared_prize_awards', {
    p_organization_id: organizacion,
    p_basis: CONFIRMED_AWARDS_BASIS,
    p_awards: CONFIRMED_PRIZE_AWARDS as unknown as never,
    p_apply: apply,
  })

  if (error) {
    console.error(`\nNo se reconocio ningun premio: ${error.message}`)
    if (error.details) console.error(error.details)
    process.exit(1)
  }

  const filas = (data ?? []) as unknown as Array<{
    daily_number: string | null
    weekly_number: string | null
    lottery_code: string | null
    reference_date: string | null
    matched_number: string | null
    prize_title: string | null
    amount: number | null
    in_kind_description: string | null
    outcome: string
    problem: string | null
  }>

  for (const fila of filas) {
    const boleta = `${fila.daily_number ?? '—'} / ${fila.weekly_number ?? '—'}`
    const sorteo = `${fila.lottery_code ?? '—'} ${fila.reference_date ?? '—'}`
    console.log(
      `${fila.outcome.padEnd(15)} ${boleta.padEnd(14)} ${sorteo.padEnd(26)} ` +
        `${(fila.prize_title ?? '—').padEnd(28)} ${pesos(fila.amount)}` +
        (fila.in_kind_description ? ` + ${fila.in_kind_description}` : ''),
    )
    if (fila.problem) console.log(`${' '.repeat(15)} ${fila.problem}`)
  }

  const reconocidos = filas.filter((f) => f.problem === null)
  const dinero = reconocidos.reduce((total, f) => total + (f.amount ?? 0), 0)
  const pendientes = reconocidos.filter((f) => f.amount == null).length

  console.log('')
  console.log(`Premios: ${reconocidos.length} de ${filas.length}`)
  console.log(`Dinero reconocido: ${pesos(dinero)}`)
  if (pendientes > 0) console.log(`Con valor pendiente de definir: ${pendientes}`)

  if (!apply) {
    console.log('\nVista previa: no se escribio nada. Vuelve a ejecutarlo con --apply.')
  }

  // La lista del codigo y lo que dijo la base tienen que coincidir: si no, algo
  // se perdio por el camino y es mejor verlo aqui que en la pantalla.
  if (apply && dinero !== declaredAwardsKnownAmount()) {
    console.error(
      `\nEl dinero reconocido (${pesos(dinero)}) no coincide con la confirmacion ` +
        `(${pesos(declaredAwardsKnownAmount())}). Revisa el informe de arriba.`,
    )
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
