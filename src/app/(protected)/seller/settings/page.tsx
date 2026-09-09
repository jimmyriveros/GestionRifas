import { PageHeader } from '@/components/data/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getWhatsappSettings } from '@/features/whatsapp/queries'
import { WHATSAPP_COPY } from '@/features/whatsapp/invite'
import { WhatsappSettingsForm } from '@/features/whatsapp/components/WhatsappSettingsForm'

/**
 * «Configuración» del vendedor (D-176).
 *
 * PENSADA PARA CRECER, SIN ARQUITECTURA DE MAS. Hoy tiene una sola seccion y
 * por eso es una sola tarjeta: añadir la siguiente es añadir otra `<Card>`
 * debajo, no montar un enrutador de pestañas para un elemento. Cuando haya
 * tres o cuatro y no quepan de un vistazo, sera el momento de partirla —y
 * entonces se sabra por que secciones, en vez de adivinarlo ahora.
 *
 * La entrada esta en el menú del avatar y SOLO para vendedores (`UserMenu`).
 * El layout de este portal ya exige el rol (`requireRole(['seller'])`), asi que
 * un Dueño o un Administrador que escriba la ruta a mano acaba en `/denied`
 * antes de llegar aqui.
 */
export default async function SellerSettingsPage() {
  const settings = await getWhatsappSettings()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Configuración"
        description="Ajustes de tu cuenta de vendedor."
        backHref="/seller/dashboard"
        backLabel="Volver al panel"
      />

      <Card>
        <CardHeader>
          {/*
            Un encabezado DE VERDAD, como el de «Mi catálogo público» (D-161):
            cada sección de esta pantalla es una región, y sin `h2` no se puede
            saltar a ella con un lector de pantalla. Importa más aquí que en
            otras tarjetas porque esta pantalla está pensada para crecer: en
            cuanto haya tres secciones, el esquema de títulos ES la navegación.
          */}
          <CardTitle>
            <h2 className="text-heading-h4">{WHATSAPP_COPY.title}</h2>
          </CardTitle>
          <CardDescription>{WHATSAPP_COPY.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <WhatsappSettingsForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  )
}
