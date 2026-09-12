import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

import { configuredVapid } from './auth'
import { pushPayloadJson } from './messages'
import { sendPushMessage, type PushOutcome } from './webpush'

/**
 * El despachador: vacía la cola de avisos (BR-V02, BR-V07, D-191).
 *
 * QUÉ HACE, Y EN QUÉ ORDEN
 *
 *   1. Toma un lote con `claim_push_outbox`, que ya recupera lo que otro
 *      despachador dejó a medias y marca lo tomado como «enviando».
 *   2. Por cada aviso, lo manda a **todos** los dispositivos vivos de esa
 *      persona.
 *   3. Cierra la fila según lo que dijeron esos dispositivos.
 *
 * LO QUE NO HACE, Y ES EL PUNTO ENTERO DE LA OUTBOX: tocar el aviso interno. La
 * campana ya está escrita desde que el motor la creó (BR-V01), y nada de lo que
 * pase aquí —un servicio caído, un endpoint muerto, este proceso entero sin
 * arrancar— puede borrarla ni retrasarla.
 *
 * NO LANZA POR UN DISPOSITIVO. Un fallo de un teléfono no puede llevarse por
 * delante el lote: cada envío devuelve su resultado y se anota.
 */

export type DispatchSummary = {
  /** Filas tomadas de la cola. */
  claimed: number
  /** Filas que acabaron enviadas (al menos un dispositivo las aceptó). */
  sent: number
  /** Filas que volvieron a la cola para reintentarse. */
  retried: number
  /** Filas dadas por perdidas. La campana sigue estando. */
  failed: number
  /** Suscripciones revocadas por un 404 o un 410 (BR-V07). */
  revoked: number
  /** `true` si no hay claves configuradas: no se envió nada y se dice. */
  skipped: boolean
  reason?: string
}

type ClaimedRow = {
  outbox_id: string
  attempts: number
  payload: Record<string, unknown>
  notification_id: string
  subscription_id: string | null
  endpoint: string | null
  p256dh: string | null
  auth: string | null
}

type Device = { subscriptionId: string; endpoint: string; p256dh: string; auth: string }

/** Un aviso con la lista de teléfonos a los que hay que mandarlo. */
type Job = { outboxId: string; kind: string; devices: Device[] }

function groupByOutbox(rows: ClaimedRow[]): Job[] {
  const jobs = new Map<string, Job>()
  for (const row of rows) {
    let job = jobs.get(row.outbox_id)
    if (!job) {
      const kind = typeof row.payload?.kind === 'string' ? row.payload.kind : 'desconocido'
      job = { outboxId: row.outbox_id, kind, devices: [] }
      jobs.set(row.outbox_id, job)
    }
    // Las columnas del dispositivo vienen en NULL cuando esa persona ya no tiene
    // ninguno vivo: la fila llega igual para poder cerrarla (0054, sección 5).
    if (row.subscription_id && row.endpoint && row.p256dh && row.auth) {
      job.devices.push({
        subscriptionId: row.subscription_id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
      })
    }
  }
  return [...jobs.values()]
}

/**
 * Qué se hace con una fila, vistos todos sus dispositivos.
 *
 * Pura y exportada porque es la decisión que más caro sale equivocar: marcar
 * «enviada» una que no salió deja a alguien sin aviso; reintentar una que sí
 * salió le manda el mismo dos veces.
 *
 * **Basta con que UN dispositivo la acepte.** Quien tiene el teléfono y el
 * computador registrados ya se enteró; reintentar el lote entero porque el
 * segundo falló le repetiría el aviso en el primero.
 */
export function decideOutboxOutcome(
  outcomes: PushOutcome[],
): { status: 'sent' } | { status: 'failed'; reason: string; retryable: boolean } {
  if (outcomes.length === 0) {
    // Nadie a quien enviárselo. No se reintenta: el aviso interno ya está y
    // volver a mirarlo cada pocos minutos no lo cambiaría.
    return {
      status: 'failed',
      reason: 'No hay ningún dispositivo activo para esta persona.',
      retryable: false,
    }
  }

  if (outcomes.some((outcome) => outcome.kind === 'sent')) return { status: 'sent' }

  const retry = outcomes.find((outcome) => outcome.kind === 'retry')
  if (retry) {
    return { status: 'failed', reason: retry.kind === 'retry' ? retry.reason : '', retryable: true }
  }

  // Solo quedan `gone` y `failed`: las suscripciones muertas ya se revocaron, y
  // volver a intentarlo daría exactamente lo mismo.
  const primero = outcomes[0]!
  const reason = primero.kind === 'sent' ? '' : primero.reason
  return { status: 'failed', reason, retryable: false }
}

export async function runPushDispatch(options: { limit?: number } = {}): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    revoked: 0,
    skipped: false,
  }

  const vapid = configuredVapid()
  if (!vapid) {
    // Sin claves no se envía, y **no se toma nada de la cola**: dejarla intacta
    // hace que el día que se configuren salga todo lo que estaba esperando.
    return { ...summary, skipped: true, reason: 'Sin claves VAPID configuradas.' }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('claim_push_outbox', {
    p_limit: options.limit ?? 50,
  })
  if (error) throw error

  const jobs = groupByOutbox((data ?? []) as ClaimedRow[])
  summary.claimed = jobs.length

  for (const job of jobs) {
    const payload = pushPayloadJson(job.kind)
    const outcomes: PushOutcome[] = []

    for (const device of job.devices) {
      const outcome = await sendPushMessage({
        endpoint: device.endpoint,
        p256dh: device.p256dh,
        auth: device.auth,
        payload,
        vapid,
      })
      outcomes.push(outcome)

      if (outcome.kind === 'gone') {
        // BR-V07: murió. Se marca y no se reintenta nunca más contra ella.
        const { data: revoked } = await supabase.rpc('revoke_push_subscription', {
          p_endpoint: device.endpoint,
          p_reason: outcome.reason,
        })
        if (revoked) summary.revoked += 1
      } else if (outcome.kind === 'sent') {
        await supabase.rpc('mark_push_subscription_sent', { p_endpoint: device.endpoint })
      }
    }

    const decision = decideOutboxOutcome(outcomes)
    if (decision.status === 'sent') {
      await supabase.rpc('mark_push_outbox_sent', { p_id: job.outboxId })
      summary.sent += 1
    } else {
      await supabase.rpc('mark_push_outbox_failed', {
        p_id: job.outboxId,
        p_reason: decision.reason,
        p_retryable: decision.retryable,
      })
      if (decision.retryable) summary.retried += 1
      else summary.failed += 1
    }
  }

  return summary
}
