import { BarChart3Icon, SearchIcon, UserPlusIcon, WalletIcon } from 'lucide-react'
import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { paymentNewHref } from '@/features/payments/return-to'
import { tourTarget } from '@/features/tour/tours'
import { cn } from '@/lib/utils'

type QuickActionsCardProps = { className?: string }

/**
 * «Accesos rápidos»: las cuatro cosas que un vendedor hace todos los dias
 * (D-112).
 *
 * Cada una lleva a un flujo QUE YA EXISTE; aqui no se implementa ninguna
 * accion. Antes eran dos botones grandes en lo alto del panel; ahora son cuatro
 * y ocupan menos, y en el telefono suben al principio porque son lo primero que
 * se busca al entrar.
 *
 * Se dice «Registrar abono», no «Registrar pago», porque asi se llama en el
 * resto de la aplicacion: un termino, un nombre (UX_COPY_GUIDELINES, Anexo A).
 *
 * Sin colores: cuatro tarjetas blancas con un icono gris. El color en esta
 * pantalla significa dinero cobrado, abonado o pendiente, y gastarlo aqui le
 * quitaria significado alli.
 */
export function QuickActionsCard({ className }: QuickActionsCardProps) {
  const actions = [
    {
      href: '/seller/tickets?inventoryStatus=available',
      label: 'Vender una boleta',
      icon: <SearchIcon aria-hidden />,
    },
    { href: '/seller/clients/new', label: 'Nuevo cliente', icon: <UserPlusIcon aria-hidden /> },
    {
      href: paymentNewHref({ from: 'dashboard' }),
      label: 'Registrar abono',
      icon: <WalletIcon aria-hidden />,
    },
    { href: '/seller/reports', label: 'Ver reportes', icon: <BarChart3Icon aria-hidden /> },
  ]

  return (
    <Card className={cn(className)} {...tourTarget('quick-actions')}>
      <CardHeader>
        <CardTitle className="text-base">
          <h2>Accesos rápidos</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              // `px-2.5` bajo `sm`: con 12 px de aire a cada lado, «Registrar
              // abono» no cabia en la celda de 114 px de un telefono de 320.
              className="hover:bg-muted focus-visible:ring-ring [&>svg]:text-muted-foreground flex min-h-11 items-center gap-2 rounded-xl border px-2.5 py-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:gap-3 sm:px-3 [&>svg]:size-5 [&>svg]:shrink-0"
            >
              {action.icon}
              <span className="min-w-0 text-pretty">{action.label}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
