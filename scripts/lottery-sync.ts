/**
 * Disparo local del sincronizador de loterias (Etapa 5, D-148).
 *
 *   npx tsx scripts/lottery-sync.ts --probe
 *   npx tsx scripts/lottery-sync.ts
 *
 * Habla con el Route Handler de Next, no con las webs oficiales directo.
 * Requiere `npm run dev:local` y LOTTERY_SYNC_SECRET en `.env.local`.
 * No activa cron. No apunta a produccion.
 */
import { config } from 'dotenv'

config({ path: '.env.local' })

const probe = process.argv.includes('--probe')
const secret = process.env.LOTTERY_SYNC_SECRET?.trim() || process.env.CRON_SECRET?.trim() || ''
const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'

if (secret.length < 16) {
  console.error('Falta LOTTERY_SYNC_SECRET (minimo 16 caracteres) en .env.local.')
  process.exit(1)
}

const url = new URL('/api/lottery/sync', base)
if (probe) url.searchParams.set('probe', '1')

const response = await fetch(url, {
  method: 'GET',
  headers: { Authorization: `Bearer ${secret}` },
})

const body = await response.text()
console.log(response.status, body)
if (!response.ok) process.exit(1)
