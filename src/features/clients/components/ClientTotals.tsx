import { ClockIcon, ShoppingCartIcon, TicketIcon, WalletIcon } from 'lucide-react'

import { KpiCard } from '@/features/dashboard/components/KpiCard'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Las cuatro cifras del cliente: cuantas boletas lleva, cuanto suman, cuanto ha
 * pagado y cuanto falta (D-113).
 *
 * Los cuatro numeros salen tal cual de `v_client_balances`, la misma vista que
 * alimenta el listado de clientes: aqui no se suma nada por segunda vez. Que
 * «total pagado» cuente solo los abonos NO anulados es cosa de esa vista
 * (BR-F09), y por eso al anular un pago la ficha se corrige sola.
 *
 * Reutiliza la tarjeta del panel del vendedor —icono a la izquierda, rotulo y
 * cifra— en vez de inventar una quinta forma de mostrar un indicador.
 */

type ClientTotalsProps = {
  ticketsCount: number
  totalPurchased: number
  totalPaid: number
  pendingAmount: number
  className?: string
}

export function ClientTotals({
  ticketsCount,
  totalPurchased,
  totalPaid,
  pendingAmount,
  className,
}: ClientTotalsProps) {
  return (
    // Cuatro en fila solo desde `xl`, por la misma razon que en el panel: con la
    // barra lateral puesta, cuatro columnas antes de eso dejan sin sitio a una
    // cifra como «$1.200.000».
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      <KpiCard label="Boletas compradas" value={String(ticketsCount)} icon={<TicketIcon />} />
      <KpiCard
        label="Total comprado"
        value={formatCOP(totalPurchased)}
        icon={<ShoppingCartIcon />}
      />
      <KpiCard label="Total pagado" value={formatCOP(totalPaid)} icon={<WalletIcon />} />
      <KpiCard label="Saldo pendiente" value={formatCOP(pendingAmount)} icon={<ClockIcon />} />
    </div>
  )
}
