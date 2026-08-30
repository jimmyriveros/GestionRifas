import { LOTTERY_SYNC_PATH } from './constants'

/**
 * Programador de produccion (D-149, Etapa 6). Las expresiones son UTC;
 * Bogota es UTC-5 todo el ano.
 *
 * Hobby (docs de Vercel, 2026-07): un job no puede correr mas de una vez
 * al dia, con precision de ±59 min. Varios jobs diarios a horas distintas
 * si estan permitidos (hasta 100 por proyecto). Pro permite un solo job
 * cada 15 minutos. vercel.json declara el plan Hobby: es valido en los
 * dos planes. Un intervalo subdiario romperia el despliegue en Hobby.
 *
 * pg_cron de Supabase no es el disparador: los parsers se quedan en Node
 * (encargo §23) y el plan Free pausa el proyecto a los 7 dias sin trafico.
 */

export type LotteryCronJob = {
  path: string
  schedule: string
  purpose: string
}

export const LOTTERY_CRON_JOBS_HOBBY: readonly LotteryCronJob[] = [
  { path: LOTTERY_SYNC_PATH, schedule: '0 12 * * *', purpose: 'Programacion CNJSA (07:00 Bogota)' },
  { path: LOTTERY_SYNC_PATH, schedule: '0 13 * * *', purpose: 'Conciliacion de la manana (08:00)' },
  { path: LOTTERY_SYNC_PATH, schedule: '0 15 * * *', purpose: 'Conciliacion de la manana (10:00)' },
  { path: LOTTERY_SYNC_PATH, schedule: '0 16 * * *', purpose: 'Conciliacion de la manana (11:00)' },
  { path: LOTTERY_SYNC_PATH, schedule: '20 3 * * *', purpose: 'Ventana Meta/Boyaca (22:20)' },
  { path: LOTTERY_SYNC_PATH, schedule: '50 3 * * *', purpose: 'Ventana Cruz Roja (22:50)' },
  { path: LOTTERY_SYNC_PATH, schedule: '20 4 * * *', purpose: 'Ventana Cundinamarca/Medellin (23:20)' },
  { path: LOTTERY_SYNC_PATH, schedule: '50 4 * * *', purpose: 'Ventana Bogota (23:50)' },
  { path: LOTTERY_SYNC_PATH, schedule: '30 5 * * *', purpose: 'Publicacion despues de medianoche (00:30)' },
  { path: LOTTERY_SYNC_PATH, schedule: '0 6 * * *', purpose: 'Publicacion tardia (01:00)' },
] as const

export const LOTTERY_CRON_JOBS_PRO: readonly LotteryCronJob[] = [
  {
    path: LOTTERY_SYNC_PATH,
    schedule: '*/15 3-6,12-16 * * *',
    purpose: 'Ventanas de publicacion y conciliacion, cada 15 minutos',
  },
] as const

/** Entradas de vercel.json. Solo path y schedule: Vercel no guarda el proposito. */
export function lotteryVercelCrons(
  jobs: readonly LotteryCronJob[] = LOTTERY_CRON_JOBS_HOBBY,
): { path: string; schedule: string }[] {
  return jobs.map(({ path, schedule }) => ({ path, schedule }))
}
