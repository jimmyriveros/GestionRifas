import { ChevronRightIcon, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { Card, CardContent } from '@/components/ui/card'

/**
 * Una seccion de «Configuración», en su pantalla de resumen: la tarjeta entera
 * es el enlace, con su flecha a la derecha —la misma forma que `ClientLinkCard`
 * (D-101)—. Una diana de toda la fila se acierta sin mirar.
 *
 * Nacio dentro de la configuracion del vendedor (D-188) y se extrajo cuando el
 * personal tuvo la suya (D-237): las dos pantallas son un resumen de secciones
 * y tienen que leerse igual.
 */
export function SettingsCard({
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
