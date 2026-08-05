import { PageHeader } from '@/components/data/PageHeader'
import { RaffleForm } from '@/features/raffles/components/RaffleForm'

export default function NewRafflePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva rifa"
        description="La rifa se crea en estado borrador. Actívala cuando puedas empezar a vender."
      />
      <RaffleForm />
    </div>
  )
}
