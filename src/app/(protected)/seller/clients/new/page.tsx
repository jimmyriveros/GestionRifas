import { PageHeader } from '@/components/data/PageHeader'
import { ClientForm } from '@/features/clients/components/ClientForm'

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo cliente"
        description="Solo el nombre y el teléfono son obligatorios. Podrás completar el resto después."
      />
      <ClientForm />
    </div>
  )
}
