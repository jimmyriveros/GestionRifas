'use client'

import { forwardRef, type ChangeEvent } from 'react'

import { Input } from '@/components/ui/input'
import { TICKET_NUMBER_MAX_LENGTH } from '@/lib/constants'
import { cn } from '@/lib/utils'

type TicketNumberInputProps = {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  name?: string
  id?: string
  disabled?: boolean
  placeholder?: string
  className?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/**
 * Numero de boleta: solo digitos, maximo 4, CEROS INICIALES INTACTOS.
 *
 * Prohibido normalizar, recortar o castear a numero en cualquier capa: `007`
 * y `7` son boletas distintas (BR-N03). Por eso el valor viaja siempre como
 * texto y aqui solo se descartan los caracteres que no son digitos.
 */
export const TicketNumberInput = forwardRef<HTMLInputElement, TicketNumberInputProps>(
  function TicketNumberInput({ value, onChange, className, ...props }, ref) {
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, TICKET_NUMBER_MAX_LENGTH)
      onChange(digits)
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={TICKET_NUMBER_MAX_LENGTH}
        value={value}
        onChange={handleChange}
        className={cn('font-mono tabular-nums', className)}
      />
    )
  },
)
