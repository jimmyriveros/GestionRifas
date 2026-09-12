import { ChevronRightIcon, LandmarkIcon, type LucideIcon, MessageCircleIcon, BellIcon } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/data/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { ACCOUNT_COPY } from '@/features/payment-accounts/accounts'
import { countActivePaymentAccounts } from '@/features/payment-accounts/queries'
import {
  countActivePaymentReminders,
  countPendingReminderOccurrences,
} from '@/features/payment-reminders/queries'
import { REMINDER_COPY } from '@/features/payment-reminders/reminders'
import { WHATSAPP_COPY } from '@/features/whatsapp/invite'
import { getWhatsappSettings } from '@/features/whatsapp/queries'

/**
 * «Configuración» del vendedor: un RESUMEN, no un contenedor de formularios
 * (D-185, D-188, `ARCHITECTURE` §8.23).
 *
 * D-176 dejo esta pantalla «pensada para crecer, sin arquitectura de mas», con
 * una sola tarjeta y esta nota: «cuando haya tres o cuatro y no quepan de un
 * vistazo, sera el momento de partirla —y entonces se sabra por que secciones,
 * en vez de adivinarlo ahora». Ya se sabe: son tres.
 *
 * LO QUE ESTA PANTALLA NO HACE, Y ES SU RAZON DE SER: no carga ningun
 * formulario ni sus datos. Lee CUATRO recuentos —tres con `head: true`, que no
 * traen ni una fila, y la configuracion de WhatsApp, que ya se leia— y nada mas.
 * Las cuentas, los mensajes y los recordatorios se consultan al entrar en su
 * seccion, no antes.
 *
 * El cuarto es lo que hay POR ENVIAR (D-189). Es un recuento mas, del mismo
 * precio que los otros, y evita que alguien entre aqui sin enterarse de que
 * tiene un mensaje esperando: la campanita guarda los diez ultimos avisos y uno
 * mas viejo se sale de la lista. Solo se escribe cuando hay algo.
 *
 * La entrada esta en el menú del avatar y SOLO para vendedores (`UserMenu`). El
 * layout de este portal ya exige el rol (`requireRole(['seller'])`), asi que un
 * Dueño o un Administrador que escriba la ruta a mano acaba en `/denied` antes
 * de llegar aqui.
 */
export default async function SellerSettingsPage() {
  const [accounts, reminders, pendingReminders, whatsapp] = await Promise.all([
    countActivePaymentAccounts(),
    countActivePaymentReminders(),
    countPendingReminderOccurrences(),
    getWhatsappSettings(),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Configuración"
        description="Ajustes de tu cuenta de vendedor."
        backHref="/seller/dashboard"
        backLabel="Volver al panel"
      />

      <nav className="space-y-3">
        <SettingsCard
          href="/seller/settings/accounts"
          icon={LandmarkIcon}
          title={ACCOUNT_COPY.title}
          status={countLabel(accounts, ACCOUNT_COPY.summary)}
        />
        <SettingsCard
          href="/seller/settings/whatsapp"
          icon={MessageCircleIcon}
          title={WHATSAPP_COPY.title}
          status={whatsapp.groupUrl === null ? 'Todavía no lo has configurado' : 'Grupo configurado'}
        />
        <SettingsCard
          href="/seller/settings/reminders"
          icon={BellIcon}
          title={REMINDER_COPY.title}
          status={
            pendingReminders === 0
              ? countLabel(reminders, REMINDER_COPY.summary)
              : `${countLabel(reminders, REMINDER_COPY.summary)} · ${REMINDER_COPY.summary.pending(pendingReminders)}`
          }
        />
      </nav>
    </div>
  )
}

/** Cero, uno y muchos. «1 cuenta activa», nunca «1 cuentas activas» (D-111). */
function countLabel(
  count: number,
  copy: { none: string; one: string; many: (count: number) => string },
): string {
  if (count === 0) return copy.none
  if (count === 1) return copy.one
  return copy.many(count)
}

/**
 * La tarjeta entera es el enlace, con su flecha a la derecha: la misma forma que
 * `ClientLinkCard` (D-101). Una diana de toda la fila se acierta sin mirar.
 */
function SettingsCard({
  href,
  icon: Icon,
  title,
  status,
}: {
  href: string
  icon: LucideIcon
  title: string
  status: string
}) {
  return (
    <Card className="py-0 transition-colors hover:bg-accent/50">
      <CardContent className="p-0">
        <Link href={href} className="flex items-center gap-3 p-4">
          <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-body-medium block font-medium">{title}</span>
            <span className="text-body-small text-muted-foreground block">{status}</span>
          </span>
          <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  )
}
