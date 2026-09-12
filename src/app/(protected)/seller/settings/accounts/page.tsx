import { PageHeader } from '@/components/data/PageHeader'
import { ACCOUNT_COPY } from '@/features/payment-accounts/accounts'
import { PaymentAccountsSection } from '@/features/payment-accounts/components/PaymentAccountsSection'
import { listPaymentAccounts } from '@/features/payment-accounts/queries'

/**
 * «Cuentas para recibir pagos» (BR-M01..BR-M09, D-188).
 *
 * El titulo es EL MISMO que el de su tarjeta en «Configuración»: quien toca
 * «Cuentas para recibir pagos» tiene que llegar a algo que se llame asi.
 *
 * Solo la ve su dueño. No hace falta comprobarlo aqui: el layout exige el rol
 * `seller` y la unica politica de la tabla es
 * `seller_id = current_profile_id()`, asi que ni el personal ni un vendedor
 * padre leerian una sola fila aunque llegaran (BR-M02).
 */
export default async function PaymentAccountsPage() {
  const accounts = await listPaymentAccounts()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={ACCOUNT_COPY.title}
        description={ACCOUNT_COPY.description}
        backHref="/seller/settings"
        backLabel="Volver a Configuración"
      />

      <PaymentAccountsSection accounts={accounts} />
    </div>
  )
}
