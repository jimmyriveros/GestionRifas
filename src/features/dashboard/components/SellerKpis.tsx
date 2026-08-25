import {
  ClockIcon,
  CreditCardIcon,
  TagIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-react'

import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import type { Comparison } from '../date-range'
import { KpiCard } from './KpiCard'

type SellerKpisProps = {
  /** Dinero recibido DENTRO del periodo elegido. */
  collected: number
  comparison: Comparison
  /** Cuantos dias mide el periodo, para nombrar el anterior con exactitud. */
  periodDays: number
  /** Saldo pendiente de hoy. No depende del periodo. */
  pending: number
  ticketsToCollect: number
  /** Recaudado sobre vendido, en porcentaje entero. */
  collectionPercentage: number
  ticketsPaid: number
  ticketsAssigned: number
  /** Lo que gana el vendedor por cada boleta que cobre completa (BR-G01). */
  earningPerTicket: number
  /** Precio vigente de la rifa. `null` si no hay ninguna activa. */
  ticketPrice: number | null
  /** Ganancia ya conseguida en esa rifa. */
  earned: number
  /**
   * Siguiente tramo, para quien cobra por tramos y todavia tiene uno por
   * delante (BR-G02). `null` en los demas casos: quien cobra la mitad del
   * precio no tiene niveles que subir, y quien ya llego arriba tampoco.
   */
  nextTier: { ticketsToNext: number; rate: number } | null
  className?: string
}

/**
 * Los cuatro indicadores de la fila superior del panel (D-112).
 *
 * MEZCLAN A PROPOSITO DOS FORMAS DE MIRAR, y por eso cada uno dice de que
 * habla: «Recaudado» es lo que entro DURANTE el periodo elegido arriba, y los
 * otros tres son una foto de HOY. Forzar el saldo pendiente o el avance de
 * cobranza dentro de un rango de fechas cambiaria su significado —«lo que te
 * deben» no es una pregunta sobre la semana pasada— y ademas exigiria un
 * historial de estados que la base de datos no guarda.
 *
 * Por eso tampoco hay comparacion contra el periodo anterior en «Por cobrar»:
 * no se puede saber cuanto te debian hace siete dias, y una cifra inventada es
 * peor que ninguna (encargo: nada de porcentajes artificiales).
 */
export function SellerKpis({
  collected,
  comparison,
  periodDays,
  pending,
  ticketsToCollect,
  collectionPercentage,
  ticketsPaid,
  ticketsAssigned,
  earningPerTicket,
  ticketPrice,
  earned,
  nextTier,
  className,
}: SellerKpisProps) {
  return (
    // Cuatro en fila solo a partir de `xl`. En `lg` el contenido mide 720 px
    // —la barra lateral se lleva 256—, cuatro columnas dejan 78 px de texto y
    // «$2.325.000» necesita 118: las cifras se cortaban. Ahi se quedan en 2x2.
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      <KpiCard
        label="Recaudado"
        value={formatCOP(collected)}
        icon={<WalletIcon />}
        hint={<ComparisonHint comparison={comparison} periodDays={periodDays} />}
      />

      <KpiCard
        label="Por cobrar"
        value={formatCOP(pending)}
        icon={<ClockIcon />}
        hint={
          <p className="text-muted-foreground text-xs">
            {ticketsToCollect === 1
              ? '1 boleta por cobrar'
              : `${ticketsToCollect} boletas por cobrar`}
          </p>
        }
      />

      <KpiCard
        label="Cobranza"
        value={`${collectionPercentage}%`}
        icon={<CreditCardIcon />}
        hint={
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs">
              {ticketsPaid} de {ticketsAssigned}{' '}
              {ticketsAssigned === 1 ? 'boleta pagada' : 'boletas pagadas'}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={collectionPercentage}
              aria-label="Porcentaje del dinero ya cobrado"
              className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
            >
              <div
                className="h-full bg-emerald-600 dark:bg-emerald-400"
                style={{ width: `${collectionPercentage}%` }}
              />
            </div>
          </div>
        }
      />

      <KpiCard
        label="Ganancia por boleta"
        value={formatCOP(earningPerTicket)}
        icon={<TagIcon />}
        hint={
          <div className="space-y-0.5">
            {ticketPrice === null ? null : (
              <p className="text-muted-foreground text-xs tabular-nums">
                Precio de la boleta: {formatCOP(ticketPrice)}
              </p>
            )}
            {/* Lo GANADO, que era el titular de la tarjeta grande que
                desaparecio: sin esta linea, quien cobra por tramos perderia de
                vista lo unico que de verdad es suyo. */}
            {earned > 0 ? (
              <p className="text-muted-foreground text-xs tabular-nums">
                Llevas {formatCOP(earned)} ganados
              </p>
            ) : null}
            {/* Y el incentivo, para quien cobra por tramos. Se dice cuanto
                falta y cuanto pasaria a valer CADA boleta, no cuanto ganaria en
                total: eso ultimo es una proyeccion y no puede parecer dinero
                suyo (BR-G02). */}
            {nextTier === null ? null : (
              <p className="text-muted-foreground text-xs">
                {nextTier.ticketsToNext === 1
                  ? `Te falta 1 boleta para ${formatCOP(nextTier.rate)} por boleta`
                  : `Te faltan ${nextTier.ticketsToNext} boletas para ${formatCOP(nextTier.rate)} por boleta`}
              </p>
            )}
          </div>
        }
      />
    </div>
  )
}

/**
 * «Subió 12% vs. los 7 días anteriores».
 *
 * El periodo anterior se nombra con su duracion real —siete dias, treinta— en
 * vez de «período anterior»: es la misma informacion dicha con palabras que no
 * hay que interpretar. Y cuando en ese periodo no entro nada, se dice tal cual;
 * un aumento desde cero no tiene porcentaje.
 *
 * La flecha no va sola: al lado esta escrito «Subió» o «Bajó», porque el color
 * y el icono no pueden ser la unica señal (CLAUDE.md §27).
 */
function ComparisonHint({
  comparison,
  periodDays,
}: {
  comparison: Comparison
  periodDays: number
}) {
  const previous = periodDays === 1 ? 'el día anterior' : `los ${periodDays} días anteriores`

  if (comparison.kind === 'unknown') {
    return <p className="text-muted-foreground text-xs">Sin recaudo en {previous}</p>
  }

  if (comparison.kind === 'same') {
    return <p className="text-muted-foreground text-xs">Igual que en {previous}</p>
  }

  const isUp = comparison.kind === 'up'
  const Icon = isUp ? TrendingUpIcon : TrendingDownIcon

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-1 font-medium',
          isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {isUp ? 'Subió' : 'Bajó'} {comparison.percentage}%
      </span>
      <span className="text-muted-foreground">vs. {previous}</span>
    </p>
  )
}
