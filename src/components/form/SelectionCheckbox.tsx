'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

/**
 * Casilla de seleccion multiple con diana grande (seccion 6 del encargo).
 *
 * Un cuadrado de 20 px se ve bien y se reconoce al instante como «puedo marcar
 * varias»; 20 px de zona sensible, en cambio, se fallan con el pulgar. Por eso
 * la casilla va dentro de un envoltorio de 44 px que tambien recibe el toque:
 * lo que se ve y lo que se puede tocar no tienen por que medir lo mismo.
 *
 * Se usa un cuadrado y no un circulo a proposito: un circulo se lee como
 * «elige uno», que es justo lo contrario de lo que ocurre aqui.
 */
export function SelectionCheckbox({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean | 'indeterminate'
  onCheckedChange: (checked: boolean) => void
  /** Nombre accesible. Siempre concreto: «Seleccionar la boleta 1234 / 5678». */
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <span
      className={cn('-m-3 inline-flex size-11 items-center justify-center p-3', className)}
      // La etiqueta envolvente ya extiende el clic a los 44 px; este atributo
      // evita ademas que ese clic llegue al manejador de la fila y cuente dos
      // veces (docs/DECISIONS.md D-076).
      data-row-activation="ignore"
    >
      <Checkbox
        checked={checked === 'indeterminate' ? 'indeterminate' : checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={label}
        disabled={disabled}
        className="size-5"
      />
    </span>
  )
}
