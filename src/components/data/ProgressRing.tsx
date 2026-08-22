import { cn } from '@/lib/utils'

type ProgressRingProps = {
  /** Entero de 0 a 100. Se acota igual aquí para que un dato raro no rompa el dibujo. */
  percentage: number
  /** Palabra corta bajo la cifra, dentro del anillo: «abonado». */
  caption: string
  /** Qué mide el anillo, para quien no puede verlo. */
  label: string
  className?: string
}

// El circulo se dibuja sobre un lienzo de 100x100 y se escala con CSS: asi el
// mismo componente vale para 64 px en un telefono y 96 px en un escritorio sin
// recalcular nada.
const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Anillo de progreso: una cifra de porcentaje rodeada de su proporcion.
 *
 * Es la version compacta de la barra de `CollectionSummaryCard`: la barra
 * necesita el ancho de una tarjeta y aqui el porcentaje comparte fila con dos
 * cifras de dinero, donde no hay ancho que gastar.
 *
 * El color NUNCA es la unica señal (CLAUDE.md §27): el porcentaje va escrito en
 * el centro y `role="progressbar"` lo publica para los lectores de pantalla.
 */
export function ProgressRing({ percentage, caption, label, className }: ProgressRingProps) {
  const safe = Math.min(100, Math.max(0, Math.round(percentage)))

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe}
      aria-label={label}
      className={cn('relative size-16 shrink-0 sm:size-24', className)}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden focusable="false">
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className="stroke-emerald-600 dark:stroke-emerald-400"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - safe / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-base font-semibold tabular-nums sm:text-lg">{safe}%</span>
        {/* En el anillo pequeño la palabra tiene que caber DENTRO del trazo:
            por eso encoge más que la cifra, que es lo que de verdad se lee. */}
        <span className="text-muted-foreground mt-0.5 text-[0.5625rem] sm:mt-1 sm:text-[0.6875rem]">
          {caption}
        </span>
      </span>
    </div>
  )
}
