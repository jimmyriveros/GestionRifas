import { config } from 'dotenv'

config({ path: '.env.local' })

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

const missing = required.filter((key) => !process.env[key] || process.env[key]?.trim() === '')

if (missing.length > 0) {
  console.error('Faltan variables de entorno obligatorias:')
  for (const key of missing) console.error(`  - ${key}`)
  console.error('\nRevisa .env.example y crea un .env.local con los valores reales.')
  process.exit(1)
}

if (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('eyJ')) {
  console.warn(
    'Aviso: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY parece un JWT clásico (anon key). ' +
      'Es válido, pero el nombre de variable actual de Supabase es "publishable key".',
  )
}

console.log('Variables de entorno verificadas correctamente.')
