import { cn } from '@/lib/utils'

export type DonutSegment = {
  /** Como se llama en la leyenda. Se usa tambien para el nombre accesible. */
  label: string
  /** Importe en pesos. Un cero no dibuja nada, pero no rompe el reparto. */
  value: number
  /** Clase de color del trazo: `stroke-emerald-600 dark:stroke-emerald-400`. */
  className: string
}

type DonutChartProps = {
  segments: DonutSegment[]
  /** Total del que se reparten los segmentos. Cero dibuja el anillo vacio. */
  total: number
  /** Que hay en el centro: «Total a cobrar» y su importe ya formateado. */
  centerLabel: string
  centerValue: string
  className?: string
}

// Mismo lienzo de 100x100 que `ProgressRing`, escalado con CSS: un solo dibujo
// vale para el telefono y para el escritorio sin recalcular nada.
const RADIUS = 40
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// Separacion entre segmentos, en unidades del lienzo. Es lo que hace que dos
// colores contiguos se lean como dos cosas y no como un degradado.
const GAP = 1.5

/**
 * Anillo repartido en segmentos, con su total en el centro (D-112).
 *
 * NO ES UN GRAFICO INTERACTIVO Y NO PRETENDE SERLO: se dibuja en el servidor,
 * no lleva JavaScript y no aporta ni un byte al paquete del cliente, igual que
 * `ProgressRing`. Toda la informacion que transmite el color esta escrita en la
 * leyenda que lo acompaña, asi que el dibujo va como decorativo
 * (`aria-hidden`): repetirlo en un `aria-label` haria que un lector de pantalla
 * leyera dos veces las mismas cifras (CLAUDE.md §27).
 *
 * Un total de cero pinta el anillo de fondo y ya esta; ningun segmento se
 * divide por cero (`collection-breakdown.ts`).
 */
export function DonutChart({
  segments,
  total,
  centerLabel,
  centerValue,
  className,
}: DonutChartProps) {
  const visible = segments.filter((segment) => segment.value > 0)

  // El arco de cada segmento y donde empieza, calculados de una vez: cada uno
  // arranca donde acaba la suma de los anteriores.
  const arcs = visible.map((segment, index) => {
    const length = (segment.value / total) * CIRCUMFERENCE
    return {
      segment,
      length,
      offset: visible
        .slice(0, index)
        .reduce((sum, previous) => sum + (previous.value / total) * CIRCUMFERENCE, 0),
      // Con un solo segmento no se recorta nada: un anillo completo al que le
      // falta un trocito parece un error de dibujo, no una separacion.
      drawn: visible.length > 1 ? Math.max(0, length - GAP) : length,
    }
  })

  return (
    // El tamaño lo decide QUIEN lo usa, con `className`: aqui no puede saberse
    // cuanto ancho le queda a la leyenda que va al lado, y crecer por tamaño de
    // ventana —`sm:`— se lo comia dentro de una tarjeta de media pantalla.
    <div className={cn('relative size-40 shrink-0', className)}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden focusable="false">
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-muted" />
        {arcs.map((arc) => (
          <circle
            key={arc.segment.label}
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="12"
            className={arc.segment.className}
            strokeDasharray={`${arc.drawn} ${CIRCUMFERENCE - arc.drawn}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </svg>

      {/*
        El hueco util del centro son unos 112 px sobre un anillo de 160. Por eso
        el importe va a `text-base` y NO crece con la ventana: «$13.600.000» a
        20 px mide 118 y se salia por los lados del anillo.
      */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center leading-tight">
        <span className="text-muted-foreground text-xs">{centerLabel}</span>
        <span className="mt-1 text-base font-semibold tabular-nums">{centerValue}</span>
      </div>
    </div>
  )
}
