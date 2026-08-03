/**
 * Resuelve contra que instancia de Supabase trabajan los scripts y las pruebas.
 *
 *   --local  -> instancia local (`npx supabase start`)
 *   (nada)   -> el proyecto configurado en .env.local
 *
 * Las claves de la instancia LOCAL no son secretos: Supabase las genera con un
 * JWT secret de demostracion publico e identico en todas las instalaciones, y
 * solo sirven contra 127.0.0.1. Por eso pueden versionarse; las del proyecto
 * real viven unicamente en .env.local, que esta en .gitignore.
 */
import { config } from 'dotenv'

config({ path: '.env.local' })

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

/** Contrasena de las cuentas de desarrollo cuando se trabaja contra local. */
export const LOCAL_SEED_PASSWORD = 'DesarrolloLocal2026'

export type SupabaseTarget = {
  isLocal: boolean
  url: string
  anonKey: string
  serviceRoleKey: string
  seedPassword: string
  label: string
}

export function resolveTarget(): SupabaseTarget {
  const isLocal = process.argv.includes('--local') || process.env.SUPABASE_TARGET === 'local'

  if (isLocal) {
    return {
      isLocal: true,
      url: LOCAL_URL,
      anonKey: LOCAL_ANON_KEY,
      serviceRoleKey: LOCAL_SERVICE_ROLE_KEY,
      seedPassword: LOCAL_SEED_PASSWORD,
      label: 'LOCAL (127.0.0.1:54321)',
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const seedPassword = process.env.SEED_DEFAULT_PASSWORD

  if (!url || !anonKey || !serviceRoleKey || !seedPassword) {
    console.error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,\n' +
        'SUPABASE_SERVICE_ROLE_KEY o SEED_DEFAULT_PASSWORD en .env.local.\n' +
        'Para trabajar contra la instancia local, agrega el argumento --local.',
    )
    process.exit(1)
  }

  return {
    isLocal: false,
    url,
    anonKey,
    serviceRoleKey,
    seedPassword,
    label: `REMOTO (${url})`,
  }
}
