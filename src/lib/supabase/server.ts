import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from '@/types/database.types'

import { timedFetch } from './timing'

/**
 * Cliente de Supabase para Server Components y Server Actions.
 * Sujeto a RLS: usa la clave publica + las cookies de sesion del usuario.
 *
 * `setAll` puede fallar cuando se llama desde un Server Component (que no
 * puede escribir cookies); se ignora a proposito porque el proxy.ts refresca
 * la sesion en cada request.
 *
 * `global.fetch` mide cada llamada y deja una linea en el registro solo si es
 * lenta o falla (D-251): no cambia ninguna peticion.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { fetch: timedFetch() },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Llamado desde un Server Component; el proxy ya refresca la sesion.
          }
        },
      },
    },
  )
}
