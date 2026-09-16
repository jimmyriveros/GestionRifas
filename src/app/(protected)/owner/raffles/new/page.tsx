import { PageHeader } from '@/components/data/PageHeader'
import { RAFFLE_WIZARD_COPY } from '@/features/raffle-prizes/copy'
import { RaffleForm } from '@/features/raffles/components/RaffleForm'
import { RaffleWizardSteps } from '@/features/raffles/components/RaffleWizardSteps'

/**
 * Paso 1 de crear una rifa: sus datos (D-202).
 *
 * La rifa se guarda como BORRADOR y el proceso sigue en sus premios. Se puede
 * salir y continuar despues: el borrador queda en el listado de rifas.
 */
export default function NewRafflePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Nueva rifa" description={RAFFLE_WIZARD_COPY.detailsDescription} />
      <RaffleWizardSteps current={1} />
      <RaffleForm />
    </div>
  )
}
