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
  /**
   * Las cifras del numero en SU rifa (D-261): no se puede escribir una mas.
   * Sin ella, el tope de cualquier boleta, 4.
   */
  maxDigits?: number
}

/**
 * Numero de boleta: solo digitos, hasta las cifras de su grupo (4 como mucho),
 * CEROS INICIALES INTACTOS. No rellena: si faltan cifras lo dice la validacion,
 * con la frase de la base (D-261).
 *
 * Prohibido normalizar, recortar o castear a numero en cualquier capa: `007`
 * y `7` son boletas distintas (BR-N03). Por eso el valor viaja siempre como
 * texto y aqui solo se descartan los caracteres que no son digitos.
 */
export const TicketNumberInput = forwardRef<HTMLInputElement, TicketNumberInputProps>(
  function TicketNumberInput(
    { value, onChange, className, maxDigits = TICKET_NUMBER_MAX_LENGTH, ...props },
    ref,
  ) {
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, maxDigits)
      onChange(digits)
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={maxDigits}
        value={value}
        onChange={handleChange}
        className={cn('font-mono tabular-nums', className)}
      />
    )
  },
)
