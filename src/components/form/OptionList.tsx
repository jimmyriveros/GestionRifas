import type { ReactNode } from 'react'

import { CheckIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Lista de opciones elegibles de un vistazo: los clientes al asignar una boleta
 * y al registrar un abono.
 *
 * Existe para tener los estados en un solo sitio. Escritos sueltos en cada
 * pantalla se contradecian: `hover:bg-accent` junto a `bg-primary` deja el fondo
 * claro del hover con el texto claro de la seleccion, y el nombre del cliente
 * desaparecia justo al pasar el dedo por encima (I-033).
 *
 * La regla que lo evita: los estados son EXCLUYENTES, nunca acumulables. Una
 * opcion elegida trae su propio hover; una sin elegir, el suyo. Asi ninguna
 * combinacion puede mezclar el fondo de uno con el texto del otro, y no depende
 * de que gane una regla por especificidad o por orden.
 *
 * La eleccion no se marca solo con color (CLAUDE.md 27): lleva ademas un visto
 * y `aria-selected`. El hueco del visto se reserva siempre, para que elegir una
 * opcion no desplace el texto de las demas.
 */

type OptionListProps = {
  /** Que se esta eligiendo, para los lectores de pantalla. Ej.: «Clientes». */
  label: string
  className?: string
  children: ReactNode
}

export function OptionList({ label, className, children }: OptionListProps) {
  return (
    <ul role="listbox" aria-label={label} className={cn('divide-y rounded-md border', className)}>
      {children}
    </ul>
  )
}

type OptionListItemProps = {
  /** Linea principal: el nombre. */
  title: ReactNode
  /** Linea secundaria: alias, telefono, boletas. */
  description?: ReactNode
  /** Dato alineado a la derecha, como el saldo pendiente. */
  trailing?: ReactNode
  /**
   * Marca la opcion como elegida. Omitirlo describe una lista que solo lleva a
   * otra pantalla: no hay eleccion que mostrar y no se reserva hueco de visto.
   */
  selected?: boolean
  disabled?: boolean
  onSelect: () => void
}

export function OptionListItem({
  title,
  description,
  trailing,
  selected,
  disabled = false,
  onSelect,
}: OptionListItemProps) {
  const selectable = selected !== undefined
  const isSelected = selected === true

  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={onSelect}
        disabled={disabled}
        className={cn(
          // Alto comodo para el pulgar y sin saltos: entre estados solo cambia
          // el fondo, nunca el borde ni el tamano.
          'flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition-colors',
          'focus-visible:outline-ring outline-none focus-visible:outline-2 focus-visible:-outline-offset-2',
          'disabled:pointer-events-none disabled:opacity-60',
          isSelected
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'hover:bg-accent hover:text-accent-foreground',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          {description ? (
            <span
              className={cn(
                'block text-xs',
                isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground',
              )}
            >
              {description}
            </span>
          ) : null}
        </span>

        {trailing ? <span className="shrink-0 text-sm tabular-nums">{trailing}</span> : null}

        {selectable ? (
          <CheckIcon
            className={cn('size-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
            aria-hidden
          />
        ) : null}
      </button>
    </li>
  )
}
