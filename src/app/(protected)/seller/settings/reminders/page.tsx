import { PageHeader } from '@/components/data/PageHeader'
import { listPaymentAccounts } from '@/features/payment-accounts/queries'
import { PaymentRemindersSection } from '@/features/payment-reminders/components/PaymentRemindersSection'
import { listPaymentReminders } from '@/features/payment-reminders/queries'
import { REMINDER_COPY } from '@/features/payment-reminders/reminders'

/**
 * «Recordatorios de pago» (BR-S01..BR-S07, D-188).
 *
 * LEE TAMBIEN LAS CUENTAS, y no es un descuido: la vista previa del mensaje
 * tiene que enseñarlo COMPLETO, con las cuentas ya puestas al final (BR-S07).
 * Son dos lecturas en paralelo, las dos acotadas a quien pregunta y las dos de
 * pocas filas.
 *
 * Lo que NO se enseña aqui es cuando suena el proximo: la base ya lo calcula,
 * pero en esta etapa **no hay motor**, y escribir una fecha que nadie va a
 * cumplir seria prometer algo que no ocurre (D-116).
 */
export default async function PaymentRemindersPage() {
  const [reminders, accounts] = await Promise.all([listPaymentReminders(), listPaymentAccounts()])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={REMINDER_COPY.title}
        description={REMINDER_COPY.description}
        backHref="/seller/settings"
        backLabel="Volver a Configuración"
      />

      <PaymentRemindersSection reminders={reminders} accounts={accounts} />
    </div>
  )
}
