import { NextResponse, type NextRequest } from 'next/server'

import { WEEKLY_RESULTS_COPY } from '@/features/weekly-results/copy'
import { renderWeeklyResultsPng } from '@/features/weekly-results/image/render'
import { getWeeklyResults, getWeeklyResultsRaffle } from '@/features/weekly-results/queries'
import { parseWeekParam, weeklyResultsFileName } from '@/features/weekly-results/week'
import { getActiveMembership, getAuthUser } from '@/lib/auth/session'
import { todayBogota } from '@/lib/dates'

/**
 * El PNG de «Resultados de la semana» (BR-H05, D-194, `docs/SECURITY.md` §5.3).
 *
 * VIVE EN `/api` Y SE PROTEGE A MANO, por lo mismo que la exportación de
 * reportes: un Route Handler no pasa por el `layout.tsx` de ningún grupo, así
 * que colocarlo junto a la pantalla daría la falsa impresión de estar cubierto
 * (D-060, `SECURITY` §5.0). Las comprobaciones van en este orden:
 *
 *   1. Sesión (401) y membresía ACTIVA (403): una cuenta desactivada no genera
 *      nada con una sesión anterior (BR-A04).
 *   2. Rol vendedor (403): la imagen sale de la rifa del catálogo de un vendedor.
 *   3. `week`, el ÚNICO parámetro, validado: el lunes de una semana terminada
 *      (400). No se acepta ningún identificador de vendedor, de organización ni
 *      de rifa; todo eso sale de la sesión.
 *   4. RLS en las dos lecturas, que es la capa que de verdad aísla.
 *
 * NUNCA UNA IMAGEN PARCIAL: sin rifa o sin los seis resultados confirmados
 * responde 409 y no dibuja nada (BR-H03).
 *
 * `private, no-store` EN TODAS LAS RESPUESTAS. `ImageResponse` trae por defecto
 * una cabecera `public`, y la imagen de un vendedor —con el nombre de su rifa—
 * no puede quedarse en una caché compartida ni servírsele a otro.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRIVATE_NO_STORE = 'private, no-store, max-age=0'
const COPY = WEEKLY_RESULTS_COPY.api

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': PRIVATE_NO_STORE } })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return fail(401, COPY.signIn)

  const membership = await getActiveMembership()
  if (!membership) return fail(403, COPY.inactive)
  if (membership.role !== 'seller') return fail(403, COPY.forbidden)

  const week = parseWeekParam(request.nextUrl.searchParams.get('week'), todayBogota())
  if (!week) return fail(400, COPY.invalidWeek)

  const [raffle, results] = await Promise.all([
    getWeeklyResultsRaffle(membership.profileId),
    getWeeklyResults(week),
  ])
  if (raffle.kind === 'error' || results.kind === 'error') return fail(500, COPY.failed)
  if (raffle.kind === 'none') return fail(409, COPY.noRaffle)
  if (results.kind === 'pending') return fail(409, COPY.notReady)

  try {
    const png = await renderWeeklyResultsPng({
      raffleName: raffle.name,
      week,
      results: results.results,
    })
    return new NextResponse(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.byteLength),
        'Cache-Control': PRIVATE_NO_STORE,
        // El nombre sale de una fecha ya validada: solo cifras y guiones.
        'Content-Disposition': `inline; filename="${weeklyResultsFileName(week)}"`,
      },
    })
  } catch (error) {
    // Al registro del servidor, nunca a la respuesta (D-044).
    console.error('weekly-results: no se pudo componer la imagen', error)
    return fail(500, COPY.failed)
  }
}
