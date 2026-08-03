import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from '@/types/database.types'

/**
 * Cliente de Supabase para Server Components y Server Actions.
 * Sujeto a RLS: usa la clave publica + las cookies de sesion del usuario.
 *
 * `setAll` puede fallar cuando se llama desde un Server Component (que no
 * puede escribir cookies); se ignora a proposito porque el proxy.ts refresca
 * la sesion en cada request.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
