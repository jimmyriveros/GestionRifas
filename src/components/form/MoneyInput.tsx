'use client'

import { forwardRef, type ChangeEvent } from 'react'

import { Input } from '@/components/ui/input'
import { formatCOP, parseCOP } from '@/lib/money'

type MoneyInputProps = {
  value: number | null
  onChange: (value: number | null) => void
  onBlur?: () => void
  name?: string
  id?: string
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  className?: string
}

/**
 * Entrada de dinero en pesos ENTEROS (CLAUDE.md 6, BR-P02).
 *
 * Nunca produce decimales ni numeros de punto flotante: se queda con los
 * digitos que escribe la persona y los interpreta como pesos.
 *
 * El valor mostrado se deriva UNICAMENTE de `value`, sin estado interno y sin
 * cambiar de representacion al enfocar. Una version anterior mostraba los
 * digitos crudos mientras el campo tenia el foco y los formateaba al salir,
 * usando estado propio: eso reescribia el contenido del input DURANTE el
 * enfoque, y cualquier escritura programatica (una prueba automatizada, un
 * gestor de contrasenas, el autocompletado del teclado movil) podia acabar
 * CONCATENANDO los digitos en vez de reemplazarlos —«50000» + «30000» =
 * «5000030000»—. Lo detecto una prueba end-to-end de la Fase 5 (I-016).
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, onBlur, placeholder = '$0', ...props },
  ref,
) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(parseCOP(event.target.value))
  }

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={value === null ? '' : formatCOP(value)}
      onChange={handleChange}
      onBlur={onBlur}
    />
  )
})
