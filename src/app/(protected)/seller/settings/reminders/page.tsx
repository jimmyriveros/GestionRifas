import { PageHeader } from '@/components/data/PageHeader'
import { listPaymentAccounts } from '@/features/payment-accounts/queries'
import { PaymentRemindersSection } from '@/features/payment-reminders/components/PaymentRemindersSection'
import { PendingReminderOccurrences } from '@/features/payment-reminders/components/PendingReminderOccurrences'
import {
  listPaymentReminders,
  listPendingReminderOccurrences,
} from '@/features/payment-reminders/queries'
import { REMINDER_COPY } from '@/features/payment-reminders/reminders'
import { PushNotificationsCard } from '@/features/push/components/PushNotificationsCard'
import { listPushEndpoints } from '@/features/push/queries'
import { getWhatsappSettings } from '@/features/whatsapp/queries'

/**
 * «Recordatorios de pago» (BR-S01..BR-S14, D-188, D-189).
 *
 * LA PANTALLA TIENE DOS MITADES y esa es su forma: arriba, lo que hay que
 * enviar HOY —el flujo copiar → abrir → atender—; debajo, la configuración de
 * cuándo volver a avisar. Lo urgente antes que lo permanente, que es el mismo
 * orden del panel del vendedor desde D-175.
 *
 * CUATRO LECTURAS EN PARALELO, y ninguna sobra:
 *
 *   · las ocurrencias pendientes, que es a lo que trae la campanita;
 *   · los recordatorios, que es lo que se administra;
 *   · las cuentas, porque el mensaje se enseña COMPLETO y las lleva al final
 *     (BR-S07), tanto en la vista previa como en lo que se copia;
 *   · el grupo de WhatsApp, para poder abrirlo — y para cambiar la acción por
 *     «Configurar WhatsApp» cuando todavía no lo hay, en vez de ofrecer un
 *     botón que va a fallar (BR-W05).
 *
 * Todas son de pocas filas y están acotadas a quien pregunta. Ninguna vive en un
 * layout ni en un panel (D-185, decisión 10).
 *
 * Lo que sigue sin enseñarse es la fecha del PRÓXIMO envío. Ahora existe y es
 * correcta, pero el reloj se mueve por debajo —al pausar, al cambiar la hora, al
 * procesar— y una fecha escrita en la pantalla envejecería sin avisar (D-189).
 *
 * Desde la Etapa 4 hay una quinta lectura: los **dispositivos** de esta persona
 * que aceptan avisos (D-190). Aquí y no en otro sitio porque el permiso se pide
 * **en una pantalla y a propósito** (BR-V06), y los recordatorios son lo único
 * que hoy produce avisos. Solo se leen los endpoints —nunca las claves—, y la
 * tarjeta **no aparece** si la aplicación no tiene clave VAPID configurada: el
 * canal del teléfono es una mejora encima de la campana, no un requisito.
 */
export default async function PaymentRemindersPage() {
  const [pending, reminders, accounts, whatsapp, pushEndpoints] = await Promise.all([
    listPendingReminderOccurrences(),
    listPaymentReminders(),
    listPaymentAccounts(),
    getWhatsappSettings(),
    listPushEndpoints(),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={REMINDER_COPY.title}
        description={REMINDER_COPY.description}
        backHref="/seller/settings"
        backLabel="Volver a Configuración"
      />

      <PendingReminderOccurrences
        occurrences={pending}
        accounts={accounts}
        groupUrl={whatsapp.groupUrl}
      />

      <PaymentRemindersSection reminders={reminders} accounts={accounts} />

      <PushNotificationsCard endpoints={pushEndpoints} />
    </div>
  )
}
