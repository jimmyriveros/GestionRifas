import { ReportsView } from '@/features/reports/components/ReportsView'
import { OWNER_REPORT_KEYS, parseReportFilters } from '@/features/reports/schemas'
import { requireStaff } from '@/lib/auth/guards'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Reportes del portal administrativo.
 *
 * Ofrece `OWNER_REPORT_KEYS`, no el catalogo entero: «Ventas por fecha» es del
 * portal del vendedor y no se anadio aqui (D-151). Su primer reporte sigue
 * siendo «Por vendedor», que es lo que se abre al entrar sin parametros.
 */
export default async function OwnerReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff()
  const filters = parseReportFilters(await searchParams)

  return (
    <ReportsView
      filters={filters}
      reports={OWNER_REPORT_KEYS}
      basePath="/owner/reports"
      clientBasePath="/owner/clients"
      sellerBasePath="/owner/sellers"
      ticketBasePath="/owner/tickets"
      withSellerFilter
    />
  )
}
