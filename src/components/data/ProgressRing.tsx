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
// mismo componente vale para 96 px en un telefono y 128 en un escritorio sin
// recalcular nada.
const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Anillo de progreso: una cifra de porcentaje rodeada de su proporcion.
 *
 * DENTRO DEL ANILLO SOLO VA EL PORCENTAJE. Nunca un importe: «$1.200.000» no
 * cabe en el hueco central sin encogerlo hasta lo ilegible, y el dinero se lee
 * mucho mejor fuera, al lado, con su rotulo (D-124).
 *
 * EL TEXTO SE MIDE CONTRA EL ANILLO, NO CONTRA LA VENTANA. El anillo se declara
 * `@container` y su contenido se dimensiona en `cqw` —tanto por ciento de SU
 * propio ancho—, de modo que la cifra ocupa siempre la misma proporcion del
 * hueco: mida 80 px o 128, «100%» no puede salirse. Quien lo usa cambia el
 * tamaño con una sola clase y no tiene que acordarse de ajustar la letra.
 * El pie lleva un minimo en `rem` para que la palabra no baje de 11 px aunque
 * el anillo sea pequeño.
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
      className={cn('@container relative size-24 shrink-0', className)}
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
        <span className="text-[26cqw] font-semibold tabular-nums">{safe}%</span>
        <span className="text-muted-foreground mt-[5cqw] text-[max(0.6875rem,9cqw)]">
          {caption}
        </span>
      </span>
    </div>
  )
}
