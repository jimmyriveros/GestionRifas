import 'server-only'

import { getActiveMembership } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

import type { PaymentAccount } from './accounts'

/**
 * Las cuentas para recibir pagos del vendedor de la sesion (BR-M02).
 *
 * NO RECIBE NINGUN VENDEDOR. Se leen siempre las filas de quien pregunta: no
 * hay parametro que manipular. Y aunque lo hubiera, `seller_payment_accounts`
 * tiene UNA politica y es `seller_id = current_profile_id()`, asi que la base no
 * serviria las de otro ni al personal ni a un vendedor padre.
 *
 * Devuelve activas Y archivadas en una sola lectura: son cinco filas como mucho
 * activas, y la pantalla enseña las dos listas. Partirlo en dos consultas para
 * ahorrar unas pocas filas archivadas seria pagar un viaje de red por nada.
 *
 * ESTA CONSULTA NO VIVE EN NINGUN LAYOUT NI EN NINGUN PANEL (D-185): solo la
 * piden `/seller/settings/accounts` y el formulario de un recordatorio, que
 * necesita las activas para su vista previa.
 */
export async function listPaymentAccounts(): Promise<PaymentAccount[]> {
  const membership = await getActiveMembership()
  if (!membership || membership.role !== 'seller') return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('seller_payment_accounts')
    .select(
      'id, kind, holder_name, phone, bank_name, account_type, account_number, label, sort_order, archived_at',
    )
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    holderName: row.holder_name,
    phone: row.phone,
    bankName: row.bank_name,
    accountType: row.account_type,
    accountNumber: row.account_number,
    label: row.label,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  }))
}

/**
 * Cuantas cuentas activas hay, para la linea de estado del resumen.
 *
 * `head: true` + `count: 'exact'`: no trae ni una fila. El resumen de
 * «Configuración» tiene que ser ligero (D-185), y aqui lo unico que se pinta es
 * un numero.
 */
export async function countActivePaymentAccounts(): Promise<number> {
  const membership = await getActiveMembership()
  if (!membership || membership.role !== 'seller') return 0

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('seller_payment_accounts')
    .select('id', { count: 'exact', head: true })
    .is('archived_at', null)

  if (error) return 0
  return count ?? 0
}
