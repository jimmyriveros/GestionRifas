import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { RAFFLE_WIZARD_COPY } from '@/features/raffle-prizes/copy'
import { RaffleForm } from '@/features/raffles/components/RaffleForm'
import { RaffleWizardSteps } from '@/features/raffles/components/RaffleWizardSteps'
import { hasCapability } from '@/lib/auth/capability-resolver'
import { requireStaff } from '@/lib/auth/guards'

/**
 * Paso 1 de crear una rifa: sus datos (D-202).
 *
 * La rifa se guarda como BORRADOR y el proceso sigue en sus premios. Se puede
 * salir y continuar despues: el borrador queda en el listado de rifas.
 *
 * La rifa nueva nace con premios configurables, asi que crearla exige la
 * capacidad `raffles.prizes.manage`. Lo decide el resolvedor central: sin ella
 * se explica en vez de ofrecer un formulario que `createRaffle` —y la base—
 * van a rechazar.
 */
export default async function NewRafflePage() {
  const membership = await requireStaff()
  const canCreate = await hasCapability(membership, 'raffles.prizes.manage')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva rifa"
        description={canCreate ? RAFFLE_WIZARD_COPY.detailsDescription : undefined}
      />
      {canCreate ? (
        <>
          <RaffleWizardSteps current={1} />
          <RaffleForm />
        </>
      ) : (
        <Notice tone="neutral">{RAFFLE_WIZARD_COPY.noCapability}</Notice>
      )}
    </div>
  )
}
