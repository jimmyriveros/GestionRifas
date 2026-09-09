import { TicketIcon } from 'lucide-react'
import { Suspense } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LotteryResultsCard,
  type LotteryCardVariant,
} from '@/features/lottery/components/LotteryResultsCard'
import {
  LOTTERY_DASHBOARD_COPY as COPY,
  type LotteryDashboardAudience,
} from '@/features/lottery/dashboard'
import { getLotteryDashboard } from '@/features/lottery/queries'
import { cn } from '@/lib/utils'

type LotteryResultsSectionProps = {
  audience: LotteryDashboardAudience
  ticketBasePath: '/owner/tickets' | '/seller/tickets'
  /** `compact` para el panel del vendedor (D-180); `full` para el resto. */
  variant?: LotteryCardVariant
  className?: string
}

/**
 * Hueco que ocupa el recuadro mientras llega su consulta (D-155).
 *
 * ES LA MISMA TARJETA, con el mismo encabezado real: el titulo forma parte del
 * armazon que se envia de inmediato, asi que no aparece de golpe despues. Lo
 * unico que cambia es el cuerpo, y desde D-167 son DOS huecos con la misma
 * forma que las dos tarjetas —rotulo del dia, nombre de la loteria, fecha y
 * dato grande—, en la misma rejilla y con el mismo `lg`: reservar uno solo
 * dejaria aparecer la mitad derecha del recuadro de golpe.
 *
 * NO SE RESERVA MAS. La altura real depende de cuantos sorteos haya y cuantas
 * boletas coincidan, asi que ninguna cifra fija la clavaria; estirar el hueco
 * hasta el caso mas alto dejaria medio panel en blanco durante la espera, que
 * es peor que el salto que evita. En la practica el hueco dura lo que tarda la
 * consulta local —unas decimas—, no una espera perceptible.
 *
 * `aria-busy` sobre la tarjeta y un texto para lector de pantalla: las barras
 * son decoracion y no dicen nada por si solas. Es el mismo recurso de
 * `SelectedTicketsView`.
 */
export function LotteryResultsFallback({
  variant = 'full',
  className,
}: {
  variant?: LotteryCardVariant
  className?: string
}) {
  const compact = variant === 'compact'

  return (
    <Card
      data-slot="lottery-results-loading"
      data-variant={variant}
      aria-busy="true"
      className={cn('min-w-0', compact && 'gap-4 py-4 md:py-5', className)}
    >
      <CardHeader
        className={cn(compact && 'flex flex-row items-center justify-between gap-2 space-y-0')}
      >
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          {compact ? null : (
            <TicketIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
          )}
          <h2 className={cn('min-w-0 break-words', compact && 'text-heading-h4')}>
            {compact ? COPY.compactTitle : COPY.title}
          </h2>
        </CardTitle>
        {/* El hueco del botón va donde va el botón: arriba a la derecha
            (D-181). Si se reservara abajo, el encabezado daría un salto lateral
            al resolverse la consulta. */}
        {compact ? <Skeleton className="h-6 w-24 shrink-0" aria-hidden /> : null}
      </CardHeader>
      <CardContent className="min-w-0">
        <span className="sr-only" role="status">
          {COPY.loading}
        </span>
        {compact ? (
          /* Dos filas con la forma de las dos que van a llegar: rótulo corto
             encima, dato debajo, y el icono a la izquierda. El hueco mide lo
             que medirá la tarjeta, así que la página no salta (D-180). */
          <div className="min-w-0 space-y-3" aria-hidden>
            {[0, 1].map((hueco) => (
              <div key={hueco} className="flex min-w-0 items-start gap-3">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-44" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Dos huecos desde `lg`, igual que las dos tarjetas que van a llegar
             (D-167): con uno solo, la mitad derecha del recuadro aparecería de
             golpe al resolverse la consulta. */
          <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
            {[0, 1].map((hueco) => (
              <div
                key={hueco}
                className="min-w-0 space-y-3 rounded-xl border p-4 sm:p-5"
                aria-hidden
              >
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-12 w-28" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

async function LotteryResultsContent({
  audience,
  ticketBasePath,
  variant,
  className,
}: LotteryResultsSectionProps) {
  const data = await getLotteryDashboard()

  return (
    <LotteryResultsCard
      data={data}
      audience={audience}
      ticketBasePath={ticketBasePath}
      variant={variant}
      className={className}
    />
  )
}

/**
 * Recuadro de resultados oficiales, aislado del resto del Panel (D-155).
 *
 * POR QUE UN LIMITE DE SUSPENSE Y NO OTRA COSA. Hasta ahora la lectura de
 * loterias iba dentro del mismo `Promise.all` que las cifras del Panel, asi que
 * la pagina entera costaba lo que la MAS lenta de todas: medido con la consulta
 * local retrasada 1,5 s, el primer byte del Panel del dueno pasaba de 174 ms a
 * 1.628 ms y no se veia ni el saludo. Con el limite, el armazon —encabezado,
 * indicadores, tablas, listas— se envia en cuanto estan sus propias consultas,
 * y este recuadro llega despues por el mismo flujo HTTP, sin una segunda
 * peticion ni JavaScript de cliente.
 *
 * EL LIMITE VIVE AQUI, no en cada `page.tsx`: los dos portales comparten
 * recuadro, hueco y decision, y duplicarlo abriria la puerta a que un portal
 * quedara sin aislar sin que nadie se enterase.
 *
 * Sigue sin consultar internet: `getLotteryDashboard` solo lee tablas locales
 * sujetas a RLS (BR-L20).
 */
export function LotteryResultsSection(props: LotteryResultsSectionProps) {
  return (
    <Suspense
      fallback={<LotteryResultsFallback variant={props.variant} className={props.className} />}
    >
      <LotteryResultsContent {...props} />
    </Suspense>
  )
}
