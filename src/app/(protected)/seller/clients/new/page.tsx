import { PageHeader } from '@/components/data/PageHeader'
import { ClientForm } from '@/features/clients/components/ClientForm'
import { getWhatsappSettings } from '@/features/whatsapp/queries'

export default async function NewClientPage() {
  // Viaja con el HTML de esta pagina (D-176): el dialogo de exito no consulta
  // nada al abrirse, asi que registrar un cliente no cuesta una peticion mas.
  const whatsappSettings = await getWhatsappSettings()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo cliente"
        description="Solo el nombre y el teléfono son obligatorios. Podrás completar el resto después."
      />
      <ClientForm whatsappSettings={whatsappSettings} />
    </div>
  )
}
