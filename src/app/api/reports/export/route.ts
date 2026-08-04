import { NextResponse, type NextRequest } from 'next/server'

import { buildReportCsv, reportFilePrefix } from '@/features/reports/export'
import { parseReportFilters, SELLER_REPORT_KEYS } from '@/features/reports/schemas'
import { getActiveMembership, getAuthUser } from '@/lib/auth/session'
import { csvFilename, csvHeaders } from '@/lib/csv'
import { todayBogota } from '@/lib/dates'

/**
 * Descarga de un reporte en CSV (CLAUDE.md §24).
 *
 * POR QUE VIVE FUERA DE `(protected)` Y SE PROTEGE A MANO
 *
 * Un Route Handler NO pasa por el `layout.tsx` del grupo de rutas: colocarlo
 * dentro de `(protected)/owner/` daria la falsa impresion de estar cubierto por
 * `requireStaff()` cuando en realidad seguiria siendo publico. Se deja aqui,
 * donde nadie puede confundirse, y la comprobacion de sesion es la primera
 * linea del handler (docs/SECURITY.md §5).
 *
 * TRES CAPAS, COMO EN TODA OPERACION SENSIBLE
 *   1. Sesion valida y membresia ACTIVA: un usuario desactivado no descarga
 *      nada, ni siquiera con una sesion anterior (BR-A04).
 *   2. Reporte permitido para su rol: un vendedor no puede pedir el reporte
 *      «Por vendedor», que compara a unos con otros.
 *   3. RLS: las vistas y funciones son `security_invoker`, de modo que el
 *      archivo solo puede contener filas que esa persona ya podia ver. Es la
 *      unica capa que de verdad garantiza el aislamiento; las dos anteriores
 *      solo dan mensajes claros.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesion.' }, { status: 401 })
  }

  const membership = await getActiveMembership()
  if (!membership) {
    return NextResponse.json({ error: 'Tu cuenta esta inactiva.' }, { status: 403 })
  }

  const filters = parseReportFilters(request.nextUrl.searchParams)

  if (membership.role === 'seller' && !SELLER_REPORT_KEYS.includes(filters.report)) {
    return NextResponse.json({ error: 'No tienes acceso a ese reporte.' }, { status: 403 })
  }

  try {
    const csv = await buildReportCsv(filters)
    const filename = csvFilename(reportFilePrefix(filters.report), todayBogota())
    return new NextResponse(csv, { headers: csvHeaders(filename) })
  } catch {
    // Nunca se devuelve el error de PostgreSQL: revelaria nombres de tablas y
    // estructura interna (CLAUDE.md §26, D-044).
    return NextResponse.json(
      { error: 'No se pudo generar el reporte. Intentalo de nuevo.' },
      { status: 500 },
    )
  }
}
