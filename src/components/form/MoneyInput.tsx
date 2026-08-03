'use client'

import { forwardRef, useState, type ChangeEvent } from 'react'

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
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/**
 * Entrada de dinero en pesos ENTEROS (CLAUDE.md 6, BR-P02).
 *
 * Nunca produce decimales ni numeros de punto flotante: se queda con los
 * digitos que escribe la persona y los interpreta como pesos. El valor
 * formateado ($100.000) se muestra mientras el campo no tiene el foco.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, onBlur, placeholder = '$100.000', ...props },
  ref,
) {
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState<string>(value === null ? '' : String(value))

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/[^0-9]/g, '')
    setRaw(digits)
    onChange(parseCOP(digits))
  }

  const display = focused ? raw : value === null ? '' : formatCOP(value)

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      onFocus={() => {
        setRaw(value === null ? '' : String(value))
        setFocused(true)
      }}
      onBlur={() => {
        setFocused(false)
        onBlur?.()
      }}
    />
  )
})
