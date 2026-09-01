import { ReportsView } from '@/features/reports/components/ReportsView'
import { parseReportFilters, SELLER_REPORT_KEYS } from '@/features/reports/schemas'
import { requireRole } from '@/lib/auth/guards'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Reportes del vendedor.
 *
 * Ofrece los mismos componentes que el portal administrativo, sin el reporte
 * «Por vendedor» y sin el selector de vendedor: un vendedor no compara su
 * desempeno con el de sus companeros (CLAUDE.md §24).
 *
 * Eso es una decision de producto, no la barrera de seguridad: aunque alguien
 * pidiera `?report=sellers&sellerId=<otro>`, las vistas `security_invoker`
 * devolverian unicamente sus propias filas.
 *
 * ENTRAR SIN PARAMETROS ABRE «VENTAS POR FECHA» con las ventas de hoy (D-151).
 * No hay redireccion: el reporte es el primero de `SELLER_REPORT_KEYS` y el dia
 * lo deduce `resolveSalesDateRange` de que no haya fechas en la URL.
 */
export default async function SellerReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(['seller'])
  const filters = parseReportFilters(await searchParams)

  return (
    <ReportsView
      filters={filters}
      reports={SELLER_REPORT_KEYS}
      basePath="/seller/reports"
      clientBasePath="/seller/clients"
      ticketBasePath="/seller/tickets"
    />
  )
}
