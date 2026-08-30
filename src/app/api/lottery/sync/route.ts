import { NextResponse, type NextRequest } from 'next/server'

import { authorizeLotterySyncRequest } from '@/features/lottery/auth'
import { runLotterySyncTick } from '@/features/lottery/job'

/**
 * Tick del sincronizador de loterias (Etapa 5, D-148).
 *
 * POR QUE VIVE FUERA DE `(protected)`
 *
 * Un Route Handler no hereda el layout. El programador no trae sesion: se
 * autoriza con un secreto de servidor, comparado a tiempo constante. El proxy
 * deja pasar `/api/lottery/sync` para no redirigir a `/login`.
 *
 * No acepta URLs del cliente. No usa la sesion. La clave de servicio no sale
 * de este proceso. Activar el cron en Vercel es la Etapa 6.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 180

const UNAUTHORIZED = { error: 'No autorizado.' }
const FAILURE = { error: 'No se pudo sincronizar.' }

async function handle(request: NextRequest) {
  const auth = authorizeLotterySyncRequest(request)
  if (!auth.ok) {
    return NextResponse.json(UNAUTHORIZED, { status: auth.status })
  }

  if (request.nextUrl.searchParams.get('probe') === '1') {
    return NextResponse.json({ ok: true, probe: true })
  }

  try {
    const summary = await runLotterySyncTick()
    return NextResponse.json({
      ok: true,
      correlationId: summary.correlationId,
      skipped: summary.skipped,
      reason: summary.reason ?? null,
      schedule: {
        ran: summary.schedule.ran,
        outcome: summary.schedule.outcome,
        errorCode: summary.schedule.errorCode ?? null,
      },
      results: summary.results,
    })
  } catch {
    return NextResponse.json(FAILURE, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
