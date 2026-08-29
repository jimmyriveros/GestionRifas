import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Los avisos de quien consulta.
 *
 * No se filtra por destinatario: la politica `notifications_select` (0023) ya
 * limita las filas a las propias, y ni siquiera el personal ve la bandeja de
 * otro. El filtro aqui seria cosmetico.
 */

export type NotificationItem = {
  id: string
  kind: string
  data: Record<string, unknown>
  createdAt: string
  isRead: boolean
}

export type NotificationFeed = {
  items: NotificationItem[]
  unreadCount: number
}

/** Cuantos avisos caben en la campanita sin volverla una pantalla. */
const FEED_SIZE = 10

export async function getNotificationFeed(): Promise<NotificationFeed> {
  const supabase = await createClient()

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, kind, data, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(FEED_SIZE),
    // Conteo EXACTO en SQL: contar las filas traidas diria «10» en cuanto
    // hubiera once (I-011, mismo motivo que en el resto del proyecto).
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ])

  if (error) throw error
  if (countError) throw countError

  return {
    items: (data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      data: (row.data ?? {}) as Record<string, unknown>,
      createdAt: row.created_at,
      isRead: row.read_at !== null,
    })),
    unreadCount: count ?? 0,
  }
}
