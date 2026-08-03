import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import type { Database } from '@/types/database.types'

/**
 * Cliente con SUPABASE_SERVICE_ROLE_KEY: omite RLS por completo.
 *
 * `import 'server-only'` hace que el build falle si este archivo llega a
 * importarse desde un componente cliente (docs/SECURITY.md §7).
 *
 * Uso exclusivo: invitacion/creacion de usuarios (auth.admin) y scripts de
 * servidor. Nunca para leer o escribir datos de negocio: eso siempre pasa
 * por el cliente de servidor sujeto a RLS (`lib/supabase/server.ts`).
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      // Node 20 no trae WebSocket nativo; @supabase/realtime-js lo exige
      // incluso sin usar realtime. Puente documentado ws -> tipo esperado
      // por el cliente (pensado para el WebSocket del navegador). Sin
      // efecto en runtimes con WebSocket nativo (Node 22+, Vercel).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      realtime: { transport: WebSocket as any },
    },
  )
}
