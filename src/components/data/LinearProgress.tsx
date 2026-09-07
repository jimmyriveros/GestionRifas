import { cn } from '@/lib/utils'

/**
 * Barra de avance: cuanto se lleva recorrido de algo que se recorre.
 *
 * NO ES DATO DE PRODUCTO. Es la otra familia, y la diferencia no la decide el
 * dibujo ni el dinero:
 *
 *   Dato de producto  reparte una cantidad en categorias —cuanto de esta
 *                     boleta esta abonado, sin pagar o pendiente—;
 *   Avance            mide lo andado hacia un final: un umbral, un total, el
 *                     fin de una tarea.
 *
 * Por eso `PaymentProgressBar` y `ProgressRing` NO son esto, aunque se dibujen
 * parecido: los dos reparten el precio de UNA boleta. Y por eso una barra de
 * dinero cobrado sobre dinero vendido SI es esto: no reparte nada, dice cuanto
 * falta para haberlo cobrado todo.
 *
 * QUIEN LA USA PONE EL TEXTO. La barra no escribe porcentajes, ni rotulos, ni
 * explica niveles ni procesos: eso lo dice la pantalla, que es la que sabe de
 * que va. Aqui solo viven el valor, la pista y el anuncio accesible.
 */

type LinearProgressProps = {
  /** Lo recorrido. En las unidades que use quien la pone: por ciento, boletas, lo que sea. */
  value: number
  /** El final. Por omision 100, que es el caso corriente de un porcentaje. */
  max?: number
  /**
   * Como se llama esta barra para quien no la ve. Es OBLIGATORIO: una barra sin
   * nombre se anuncia como «barra de progreso» y no dice de que.
   */
  label: string
  /**
   * Que decir en vez del porcentaje, cuando el numero crudo no significa nada
   * por si solo —«3 de 10 boletas cobradas» se entiende, «30 %» a secas no—.
   */
  valueText?: string
  className?: string
}

export function LinearProgress({
  value,
  max = 100,
  label,
  valueText,
  className,
}: LinearProgressProps) {
  // El ancho se acota SIEMPRE. Un dato raro —o un valor que de verdad pasa del
  // final, como cobrar mas boletas de las que pedia el nivel— no puede pintar
  // fuera de la barra.
  const percent = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-label={label}
      className={cn('bg-progress-track h-2 w-full overflow-hidden rounded-full', className)}
    >
      <div
        className="bg-progress-value h-full rounded-full transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
