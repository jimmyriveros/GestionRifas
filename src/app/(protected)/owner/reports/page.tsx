import { ReportsView } from '@/features/reports/components/ReportsView'
import { parseReportFilters, REPORT_KEYS } from '@/features/reports/schemas'
import { requireStaff } from '@/lib/auth/guards'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function OwnerReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff()
  const filters = parseReportFilters(await searchParams)

  return (
    <ReportsView
      filters={filters}
      reports={REPORT_KEYS}
      basePath="/owner/reports"
      clientBasePath="/owner/clients"
      sellerBasePath="/owner/sellers"
      withSellerFilter
    />
  )
}
