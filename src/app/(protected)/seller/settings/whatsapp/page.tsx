import { PageHeader } from '@/components/data/PageHeader'
import { WHATSAPP_COPY } from '@/features/whatsapp/invite'
import { WhatsappSettingsForm } from '@/features/whatsapp/components/WhatsappSettingsForm'
import { getWhatsappSettings } from '@/features/whatsapp/queries'

/**
 * «Grupo de WhatsApp» (BR-W01..BR-W03, D-176), mudado aqui en D-188.
 *
 * Es EXACTAMENTE la misma seccion: el formulario, la Server Action, la RPC y
 * sus textos no cambian ni una palabra. Lo unico que cambio es que ya no vive
 * dentro de «Configuración», sino en su propia pantalla, porque la pantalla
 * pasó a tener tres secciones y el resumen no carga ninguna (D-185).
 */
export default async function WhatsappSettingsPage() {
  const settings = await getWhatsappSettings()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={WHATSAPP_COPY.title}
        description={WHATSAPP_COPY.description}
        backHref="/seller/settings"
        backLabel="Volver a Configuración"
      />

      <WhatsappSettingsForm settings={settings} />
    </div>
  )
}
