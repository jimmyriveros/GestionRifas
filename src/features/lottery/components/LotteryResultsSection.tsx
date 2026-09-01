import { Suspense } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LotteryResultsCard } from '@/features/lottery/components/LotteryResultsCard'
import {
  LOTTERY_DASHBOARD_COPY as COPY,
  type LotteryDashboardAudience,
} from '@/features/lottery/dashboard'
import { getLotteryDashboard } from '@/features/lottery/queries'
import { cn } from '@/lib/utils'

type LotteryResultsSectionProps = {
  audience: LotteryDashboardAudience
  ticketBasePath: '/owner/tickets' | '/seller/tickets'
  className?: string
}

/**
 * Hueco que ocupa el recuadro mientras llega su consulta (D-155).
 *
 * ES LA MISMA TARJETA, con el mismo encabezado real: el titulo forma parte del
 * armazon que se envia de inmediato, asi que no aparece de golpe despues. Lo
 * unico que cambia es el cuerpo, y sus cuatro barras estan medidas contra un
 * bloque de sorteo real —nombre de la loteria, linea del sorteo, numero mayor y
 * linea de la fuente—: 234 px en escritorio, entre los 210 px de un sorteo
 * pendiente y los 306 px de uno confirmado.
 *
 * NO SE RESERVA MAS. La altura de este recuadro va de 210 a 578 px segun cuantos
 * sorteos haya y cuantas boletas coincidan, asi que ninguna cifra fija lo
 * clavaria; estirar el hueco hasta el caso mas alto dejaria medio panel en
 * blanco durante la espera, que es peor que el salto que evita. En la practica
 * el hueco dura lo que tarda la consulta local —unas decimas—, no una espera
 * perceptible.
 *
 * `aria-busy` sobre la tarjeta y un texto para lector de pantalla: las barras
 * son decoracion y no dicen nada por si solas. Es el mismo recurso de
 * `SelectedTicketsView`.
 */
export function LotteryResultsFallback({ className }: { className?: string }) {
  return (
    <Card data-slot="lottery-results-loading" aria-busy="true" className={cn('min-w-0', className)}>
      <CardHeader>
        <CardTitle className="text-base">
          <h2>{COPY.title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        <span className="sr-only" role="status">
          {COPY.loading}
        </span>
        <Skeleton className="h-5 w-40" aria-hidden />
        <Skeleton className="h-4 w-full max-w-xs" aria-hidden />
        <Skeleton className="h-10 w-32" aria-hidden />
        <Skeleton className="h-4 w-48" aria-hidden />
      </CardContent>
    </Card>
  )
}

async function LotteryResultsContent({
  audience,
  ticketBasePath,
  className,
}: LotteryResultsSectionProps) {
  const data = await getLotteryDashboard()

  return (
    <LotteryResultsCard
      data={data}
      audience={audience}
      ticketBasePath={ticketBasePath}
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
    <Suspense fallback={<LotteryResultsFallback className={props.className} />}>
      <LotteryResultsContent {...props} />
    </Suspense>
  )
}
