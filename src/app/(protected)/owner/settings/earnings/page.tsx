import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { CommissionTemplateForm } from '@/features/commissions/components/CommissionTemplateForm'
import { EARNINGS_COPY } from '@/features/commissions/copy'
import { getCommissionTemplate } from '@/features/commissions/queries'
import { hasCapability } from '@/lib/auth/capability-resolver'
import { requireStaff } from '@/lib/auth/guards'
import { formatDateTimeEs } from '@/lib/dates'

/**
 * «Ganancias de vendedores»: la lista general de tramos (BR-G29, D-237).
 *
 * Es la PLANTILLA que se ofrece al dar de alta a un vendedor y al cambiar su
 * ganancia. Guardarla crea una version nueva y no recalcula a nadie: cada
 * acuerdo conserva la version que recibio.
 *
 * Solo para quien tiene la capacidad `sellers.earnings.manage`. Sin ella la
 * pagina no se abre; la accion y la RPC lo vuelven a comprobar.
 */
export default async function EarningsSettingsPage() {
  const membership = await requireStaff()
  if (!(await hasCapability(membership, 'sellers.earnings.manage'))) redirect('/denied')

  const template = await getCommissionTemplate(membership.organizationId)
  const copy = EARNINGS_COPY.template

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        backHref="/owner/settings"
        backLabel="Volver a Configuración"
      />

      {/* `key` = version: al guardar otra, el formulario vuelve a empezar desde
          ella en vez de conservar lo que se escribio contra la anterior. */}
      <CommissionTemplateForm
        key={template?.templateVersion ?? 0}
        template={
          template
            ? {
                version: template.templateVersion,
                savedAt: formatDateTimeEs(template.savedAt),
                tiers: template.tiers,
              }
            : null
        }
      />
    </div>
  )
}
