import { CoinsIcon, SettingsIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { SettingsCard } from '@/components/data/SettingsCard'
import { EARNINGS_COPY } from '@/features/commissions/copy'
import { getCommissionTemplate } from '@/features/commissions/queries'
import { hasCapability } from '@/lib/auth/capability-resolver'
import { requireStaff } from '@/lib/auth/guards'

/**
 * «Configuración» del personal (D-237): un RESUMEN, como la del vendedor
 * (D-188). No carga ningun formulario; cada seccion vive en su pantalla.
 *
 * Hoy tiene UNA seccion, «Ganancias de vendedores», y solo la ve quien tiene la
 * capacidad `sellers.earnings.manage`. La entrada esta en el menu del avatar,
 * en el mismo sitio que la del vendedor.
 */
export default async function OwnerSettingsPage() {
  const membership = await requireStaff()
  const canManageEarnings = await hasCapability(membership, 'sellers.earnings.manage')
  const template = canManageEarnings ? await getCommissionTemplate(membership.organizationId) : null
  const copy = EARNINGS_COPY.settings

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        backHref="/owner/dashboard"
        backLabel="Volver al panel"
      />

      {canManageEarnings ? (
        <nav className="space-y-3">
          <SettingsCard
            href="/owner/settings/earnings"
            icon={CoinsIcon}
            title={copy.earningsTitle}
            status={
              template
                ? copy.earningsStatus(template.tiers.length, template.templateVersion)
                : copy.earningsStatusMissing
            }
          />
        </nav>
      ) : (
        <EmptyState
          icon={<SettingsIcon className="size-8" aria-hidden />}
          title="No tienes ajustes que cambiar"
          description="Los ajustes de la organización los cambia quien tiene permiso para hacerlo."
        />
      )}
    </div>
  )
}
