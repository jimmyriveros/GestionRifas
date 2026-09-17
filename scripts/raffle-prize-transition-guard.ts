/**
 * LA PUERTA del script de transición a premios configurables (Entrega 5, D-205).
 *
 * PURO: no lee `.env.local`, ni la red, ni el reloj. Decide si una orden se
 * puede ejecutar y, si no, dice por qué. `scripts/raffle-prize-transition.ts`
 * la consulta ANTES de resolver ninguna credencial y otra vez después, cuando ya
 * sabe contra qué proyecto trabaja.
 *
 * Hasta la Entrega 4 el script solo aceptaba `--local`. Para el proyecto real no
 * basta con quitar esa comprobación: una orden contra producción tiene que ser
 * difícil de dar por accidente. Por eso exige, a la vez:
 *
 *   1. `--production`, que no se confunde con nada, y nunca junto a `--local`;
 *   2. que el destino resuelto sea de verdad remoto: `https`, un proyecto de
 *      `supabase.co` y ninguna marca de local;
 *   3. la organización y la rifa por identificador, y el nombre, el estado y las
 *      fechas que se esperan de ella (los compara la base);
 *   4. para aplicar, una VISTA PREVIA ANTERIOR: su huella se pasa con
 *      `--preview-hash` y tiene que coincidir con la vista previa que el script
 *      repite justo antes de aplicar. Si entre las dos cambió algo —se jugó un
 *      sorteo, cambió la programación—, la huella es otra y no se aplica;
 *   5. `--apply`;
 *   6. y `--confirm-raffle` con el MISMO identificador de la rifa, escrito otra
 *      vez, carácter por carácter.
 *
 * Sin `--apply` sigue siendo una vista previa, contra cualquier destino.
 *
 * NINGÚN IDENTIFICADOR DE PRODUCCIÓN VIVE AQUÍ: todos llegan como argumentos.
 */

export const TRANSITION_RAFFLE_STATUSES = ['draft', 'active', 'closed', 'cancelled'] as const
export type TransitionRaffleStatus = (typeof TRANSITION_RAFFLE_STATUSES)[number]

export type TransitionTargetKind = 'local' | 'production'

/** Lo que pidió quien ejecuta el script, ya comprobado. */
export type TransitionRequest = {
  target: TransitionTargetKind
  organizationId: string
  raffleId: string
  name: string
  status: TransitionRaffleStatus
  startDate: string
  endDate: string
  apply: boolean
  /** Huella de la vista previa anterior (`--preview-hash`). */
  previewHash: string | null
  /** El identificador de la rifa, escrito otra vez (`--confirm-raffle`). */
  confirmRaffle: string | null
}

/** Una orden que no se ejecuta. El mensaje dice qué falta. */
export class TransitionGateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransitionGateError'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SHA256_HEX = /^[0-9a-f]{64}$/

const SWITCHES = ['--local', '--production', '--apply'] as const
const VALUED = [
  '--organization',
  '--raffle',
  '--name',
  '--status',
  '--start',
  '--end',
  '--preview-hash',
  '--confirm-raffle',
] as const
type ValuedFlag = (typeof VALUED)[number]

export const TRANSITION_USAGE =
  'Uso: npx tsx scripts/raffle-prize-transition.ts (--local | --production) ' +
  '--organization <uuid> --raffle <uuid> --name "Nombre exacto de la rifa" ' +
  '--status active --start AAAA-MM-DD --end AAAA-MM-DD ' +
  '[--apply --preview-hash <huella de la vista previa> --confirm-raffle <uuid de la rifa>]'

/**
 * Lee y comprueba los argumentos. No acepta opciones desconocidas ni repetidas:
 * una errata en una orden contra producción no debe convertirse en otra orden.
 */
export function parseTransitionArgs(args: readonly string[]): TransitionRequest {
  const values = new Map<ValuedFlag, string>()
  const switches = new Set<string>()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if ((SWITCHES as readonly string[]).includes(arg)) {
      if (switches.has(arg)) throw new TransitionGateError(`${arg} está repetido.`)
      switches.add(arg)
      continue
    }
    if ((VALUED as readonly string[]).includes(arg)) {
      const flag = arg as ValuedFlag
      if (values.has(flag)) throw new TransitionGateError(`${flag} está repetido.`)
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new TransitionGateError(`Falta el valor de ${flag}.`)
      }
      values.set(flag, value)
      index += 1
      continue
    }
    throw new TransitionGateError(
      `No reconozco «${arg}». Revisa la orden: una opción mal escrita no se ignora.`,
    )
  }

  const local = switches.has('--local')
  const production = switches.has('--production')
  if (local && production) {
    throw new TransitionGateError('Elige un solo destino: --local o --production.')
  }
  if (!local && !production) {
    throw new TransitionGateError(
      'Indica el destino: --local para la base local o --production para el proyecto real.',
    )
  }

  const organizationId = values.get('--organization')?.trim()
  const raffleId = values.get('--raffle')?.trim()
  const name = values.get('--name')
  const status = values.get('--status')?.trim()
  const startDate = values.get('--start')?.trim()
  const endDate = values.get('--end')?.trim()

  if (!organizationId || !raffleId || name === undefined || !status || !startDate || !endDate) {
    throw new TransitionGateError(
      'Faltan datos de la rifa: --organization, --raffle, --name, --status, --start y --end son obligatorios.',
    )
  }
  if (!UUID.test(organizationId)) {
    throw new TransitionGateError('--organization debe ser el identificador de la organización.')
  }
  if (!UUID.test(raffleId)) {
    throw new TransitionGateError('--raffle debe ser el identificador de la rifa.')
  }
  if (name.trim() === '') {
    throw new TransitionGateError('--name es el nombre exacto de la rifa y no puede ir vacío.')
  }
  if (!(TRANSITION_RAFFLE_STATUSES as readonly string[]).includes(status)) {
    throw new TransitionGateError(
      '--status debe ser draft, active, closed o cancelled: el estado que se espera de la rifa.',
    )
  }
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    throw new TransitionGateError(
      '--start y --end son las fechas que se esperan de la rifa, en formato AAAA-MM-DD.',
    )
  }

  const apply = switches.has('--apply')
  const previewHash = values.get('--preview-hash')?.trim() ?? null
  const confirmRaffle = values.get('--confirm-raffle') ?? null

  if (!apply && (previewHash !== null || confirmRaffle !== null)) {
    throw new TransitionGateError(
      '--preview-hash y --confirm-raffle solo se usan junto con --apply. Sin --apply es una vista previa.',
    )
  }

  if (previewHash !== null && !SHA256_HEX.test(previewHash)) {
    throw new TransitionGateError(
      '--preview-hash es la huella que imprimió la vista previa: 64 caracteres hexadecimales en minúscula.',
    )
  }

  if (production && apply) {
    if (previewHash === null) {
      throw new TransitionGateError(
        'Para aplicar en producción hace falta una vista previa anterior: ejecuta la orden sin --apply y pasa su huella con --preview-hash.',
      )
    }
    if (confirmRaffle === null) {
      throw new TransitionGateError(
        'Para aplicar en producción escribe otra vez el identificador de la rifa con --confirm-raffle.',
      )
    }
  }

  // Igualdad EXACTA, carácter por carácter: ni espacios, ni mayúsculas cambiadas.
  if (confirmRaffle !== null && confirmRaffle !== raffleId) {
    throw new TransitionGateError(
      '--confirm-raffle no coincide con --raffle. Tiene que ser exactamente el mismo identificador.',
    )
  }

  return {
    target: production ? 'production' : 'local',
    organizationId,
    raffleId,
    name,
    status: status as TransitionRaffleStatus,
    startDate,
    endDate,
    apply,
    previewHash,
    confirmRaffle,
  }
}

const LOCAL_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '0.0.0.0',
  '::1',
  '[::1]',
  'host.docker.internal',
])

/**
 * Comprueba que el destino resuelto es el que se pidió. Para producción: que
 * de verdad sea un proyecto remoto de Supabase, sin ninguna marca de local.
 */
export function assertTransitionTarget(
  request: Pick<TransitionRequest, 'target'>,
  resolved: { isLocal: boolean; url: string },
  env: { SUPABASE_TARGET?: string | undefined },
): void {
  if (request.target === 'local') {
    if (!resolved.isLocal) {
      throw new TransitionGateError(
        'Se pidió --local, pero el destino resuelto no es la base local.',
      )
    }
    return
  }

  if (resolved.isLocal || env.SUPABASE_TARGET === 'local') {
    throw new TransitionGateError(
      'Se pidió --production, pero el destino resuelto es la base local. Quita SUPABASE_TARGET=local.',
    )
  }

  let url: URL
  try {
    url = new URL(resolved.url)
  } catch {
    throw new TransitionGateError(
      'Se pidió --production, pero la dirección del proyecto no es válida. Revisa NEXT_PUBLIC_SUPABASE_URL.',
    )
  }

  if (
    url.protocol !== 'https:' ||
    LOCAL_HOSTS.has(url.hostname) ||
    !url.hostname.endsWith('.supabase.co')
  ) {
    throw new TransitionGateError(
      'Se pidió --production, pero el destino no es un proyecto remoto de Supabase (https y supabase.co).',
    )
  }
}

/** Cómo se nombra el destino en pantalla, sin escribir la dirección completa del proyecto. */
export function transitionTargetLabel(
  request: Pick<TransitionRequest, 'target'>,
  resolved: { url: string },
): string {
  if (request.target === 'local') return 'LOCAL (127.0.0.1:54321)'
  try {
    const project = new URL(resolved.url).hostname.split('.')[0] ?? ''
    return `PRODUCCIÓN (proyecto ${project.slice(0, 4)}…)`
  } catch {
    return 'PRODUCCIÓN'
  }
}

/**
 * Antes de aplicar: la vista previa que se acaba de repetir tiene que ser la que
 * se revisó. Si no hay huella que comparar (solo en local), no se exige.
 */
export function assertPreviewUnchanged(
  request: Pick<TransitionRequest, 'previewHash'>,
  currentHash: string,
): void {
  if (request.previewHash === null) return
  if (request.previewHash !== currentHash) {
    throw new TransitionGateError(
      'La configuración cambió desde la vista previa que revisaste —por ejemplo, porque ya se jugó un sorteo—. No se aplicó nada: vuelve a ejecutar la vista previa y revisa la nueva.',
    )
  }
}

/**
 * Si un error de la base deja la transición con certeza SIN aplicar. Un código
 * SQLSTATE —salvo los de conexión, clase 08— significa que PostgreSQL rechazó la
 * operación y deshizo la transacción. Cualquier otra cosa —la red, un tiempo de
 * espera, una pasarela— deja la respuesta INCIERTA: pudo aplicarse sin que la
 * respuesta llegara, y no se repite a ciegas.
 */
export function transitionErrorIsCertain(error: { code?: string | null }): boolean {
  const code = error.code ?? ''
  return /^[0-9A-Z]{5}$/.test(code) && !code.startsWith('08')
}
