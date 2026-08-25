import { formatDayMonthEs } from '@/lib/dates'
import { formatCOP, formatCOPCompact } from '@/lib/money'
import { cn } from '@/lib/utils'

export type TrendPoint = {
  /** Dia calendario 'AAAA-MM-DD'. */
  date: string
  /** Importe del dia, en pesos. Un dia sin movimiento vale 0 y SI se dibuja. */
  amount: number
}

type TrendChartProps = {
  points: TrendPoint[]
  /** Nombre accesible del dibujo: que mide y de que periodo. */
  label: string
  className?: string
}

// Lienzo del trazo. El ancho real lo pone el contenedor: el `svg` va al 100% y
// el `viewBox` escala solo, conservando la proporcion (por eso NO se le fija
// una altura en CSS: hacerlo dejaria franjas vacias a los lados y las fechas de
// abajo dejarian de coincidir con los puntos).
const WIDTH = 480
const HEIGHT = 150
// Aire arriba para que el punto mas alto no quede pegado al borde.
const TOP = 10

/** Cuantas fechas caben debajo sin encimarse. Con mas dias se muestran salteadas. */
const MAX_DATE_LABELS = 5

/**
 * Linea de recaudo dia a dia, con su area bajo la curva (D-112).
 *
 * SE DIBUJA EN EL SERVIDOR, sin libreria de graficos y sin JavaScript: el
 * proyecto no tenia ninguna y meter una por un grafico de siete puntos habria
 * pesado mas que todo el panel. Se apoya en lo mismo que ya usaba
 * `ProgressRing`: un `viewBox` que escala con el contenedor.
 *
 * COMO SE MANTIENE LEGIBLE AL ESCALAR. El trazo lleva
 * `vector-effect="non-scaling-stroke"`, de modo que la linea mide lo mismo en
 * un telefono de 320 px que en una tarjeta de 700. Y los textos —eje vertical y
 * fechas— NO van dentro del dibujo sino alrededor, en HTML y en la misma
 * rejilla, porque un `text` dentro del `svg` crece con el y acabaria midiendo 6
 * px en el telefono y 15 en el escritorio.
 *
 * Cada punto lleva un `<title>`, que es el globo de ayuda nativo del navegador:
 * el raton encima dice el dia y el importe exacto sin una linea de JavaScript.
 * Debajo va la misma informacion en texto para quien no ve el dibujo, porque un
 * dibujo no puede ser la unica forma de conocer un dato (CLAUDE.md §27).
 */
export function TrendChart({ points, label, className }: TrendChartProps) {
  const amounts = points.map((point) => point.amount)
  // El dia mas alto del periodo. Puede ser cero: un vendedor que no cobro nada
  // en toda la semana es un caso normal, no un error.
  const peak = Math.max(0, ...amounts)
  // Escala del dibujo. El 1 solo evita la division por cero cuando no entro
  // nada; la linea queda plana abajo, que es exactamente lo que paso. El eje NO
  // usa este numero: escribir «$1» arriba seria inventarse una referencia.
  const max = peak > 0 ? peak : 1

  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0
  const coords = points.map((point, index) => ({
    ...point,
    x: points.length > 1 ? index * step : WIDTH / 2,
    y: HEIGHT - (point.amount / max) * (HEIGHT - TOP),
  }))

  const line = coords.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  const area = `${coords[0]?.x ?? 0},${HEIGHT} ${line} ${coords[coords.length - 1]?.x ?? 0},${HEIGHT}`

  // Se etiquetan como mucho cinco fechas, la primera y la ultima siempre: con
  // treinta dias, treinta fechas se pisan unas a otras.
  const labelStep = Math.max(1, Math.ceil(points.length / MAX_DATE_LABELS))

  return (
    <div className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-x-2', className)}>
      <div
        className="text-muted-foreground flex flex-col justify-between text-[0.625rem] tabular-nums sm:text-xs"
        aria-hidden
      >
        <span>{peak > 0 ? formatCOPCompact(peak) : ''}</span>
        <span>{peak > 0 ? formatCOPCompact(Math.round(peak / 2)) : ''}</span>
        <span>{formatCOPCompact(0)}</span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={label}>
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2={WIDTH}
            y1={TOP + fraction * (HEIGHT - TOP)}
            y2={TOP + fraction * (HEIGHT - TOP)}
            className="stroke-border"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <polygon points={area} className="fill-emerald-500/10 dark:fill-emerald-400/10" />
        <polyline
          points={line}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-emerald-600 dark:stroke-emerald-400"
        />
        {coords.map((point) => (
          <circle
            key={point.date}
            cx={point.x}
            cy={point.y}
            r="4"
            className="fill-emerald-600 dark:fill-emerald-400"
          >
            <title>{`${formatDayMonthEs(point.date)}: ${formatCOP(point.amount)}`}</title>
          </circle>
        ))}
      </svg>

      <div className="col-start-2 mt-2 flex justify-between gap-1" aria-hidden>
        {coords.map((point, index) =>
          index % labelStep === 0 || index === coords.length - 1 ? (
            <span key={point.date} className="text-muted-foreground text-[0.625rem] sm:text-xs">
              {formatDayMonthEs(point.date)}
            </span>
          ) : null,
        )}
      </div>

      <ul className="sr-only col-span-2">
        {points.map((point) => (
          <li key={point.date}>{`${formatDayMonthEs(point.date)}: ${formatCOP(point.amount)}`}</li>
        ))}
      </ul>
    </div>
  )
}
