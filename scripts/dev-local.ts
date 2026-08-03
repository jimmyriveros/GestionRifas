/**
 * Arranca `next dev` apuntando a la instancia LOCAL de Supabase.
 *
 *   npm run dev        -> usa el proyecto configurado en .env.local
 *   npm run dev:local  -> usa 127.0.0.1:54321 (npx supabase start)
 *
 * Existe para poder desarrollar y ejecutar las pruebas end-to-end sin escribir
 * datos de prueba en el proyecto real, y sin tener que editar .env.local a mano
 * cada vez (D-047).
 *
 * Next.js NO sobreescribe las variables que ya existen en el entorno del
 * proceso, asi que estas ganan sobre .env.local.
 */
import { spawn } from 'node:child_process'

import { resolveTarget } from './supabase-target'

const target = resolveTarget()
if (!target.isLocal) {
  // resolveTarget solo devuelve local con --local o SUPABASE_TARGET=local.
  console.error('dev-local debe ejecutarse con --local. Usa `npm run dev:local`.')
  process.exit(1)
}

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: target.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: target.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: target.serviceRoleKey,
  SEED_DEFAULT_PASSWORD: target.seedPassword,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  TZ: 'UTC',
}

console.log(`next dev contra ${target.label}`)

const child = spawn(
  'npx',
  ['next', 'dev', ...process.argv.slice(2).filter((a) => a !== '--local')],
  {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)

child.on('exit', (code) => process.exit(code ?? 0))
