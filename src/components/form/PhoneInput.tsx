'use client'

import { forwardRef, type ChangeEvent, type ComponentProps, type KeyboardEvent } from 'react'

import { Input } from '@/components/ui/input'
import { applyPhoneEdit, formatPhone, phoneDeletionRange, PHONE_PLACEHOLDER } from '@/lib/phone'

type PhoneInputProps = {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  name?: string
  id?: string
  disabled?: boolean
  placeholder?: string
  /** `tel` donde el campo es el telefono de una persona; `off` donde no. */
  autoComplete?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  /** Alto del campo, tal cual lo entiende `Input`: `default` o `touch`. */
  size?: ComponentProps<typeof Input>['size']
  className?: string
}

/**
 * Telefono con separadores mientras se escribe (D-184): «300 123 4567»,
 * «+57 300 123 4567».
 *
 * ES SOLO PRESENTACION. Las reglas viven en `lib/phone.ts`, que es puro y esta
 * probado; aqui solo se traducen los eventos del navegador. Y sobre todo: la
 * mascara no valida, no normaliza para buscar y no canoniza para WhatsApp — los
 * separadores no llegan a ninguna de esas tres capas, porque todas empiezan por
 * quedarse con los digitos.
 *
 * LO QUE SE VE SE DERIVA DE `value`, SIN ESTADO PROPIO, igual que `MoneyInput`
 * (D-053). No hay una segunda fuente de verdad «enfocado/crudo/formateado»: esa
 * es la que costo I-016, donde una escritura programatica —una prueba, un gestor
 * de contrasenas, el autocompletado del teclado movil— acababa CONCATENANDO en
 * vez de reemplazar.
 *
 * UN TELEFONO GUARDADO NO SE REESCRIBE POR VERLO. Formatear ocurre al pintar y
 * NO dispara `onChange`: abrir el formulario de un cliente cuyo telefono se
 * guardo como «+57 (300) 123-4567» lo muestra como «+57 300 123 4567», pero el
 * valor del formulario sigue siendo el guardado, caracter por caracter, y se
 * envia tal cual si la persona no lo toca. Solo una edicion explicita adopta la
 * forma nueva.
 *
 * EL CURSOR SE RECOLOCA A MANO, y hace falta. Un campo controlado cuyo texto se
 * reescribe deja el cursor al final: escribir en medio de «300 123 4567» seria
 * imposible. Se escribe el valor formateado en el DOM y se coloca el cursor
 * ANTES de que React vuelva a pintar; cuando React confirma el mismo texto ve
 * que el nodo ya lo tiene y no lo reescribe, que es lo que conserva el cursor.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, onBlur, placeholder = PHONE_PLACEHOLDER, autoComplete = 'tel', ...props },
  ref,
) {
  function commit(input: HTMLInputElement, raw: string, caret: number) {
    const next = applyPhoneEdit(raw, caret)
    input.value = next.value
    input.setSelectionRange(next.caret, next.caret)
    onChange(next.value)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    commit(input, input.value, input.selectionStart ?? input.value.length)
  }

  /**
   * Borrar junto a un separador tiene que quitar un digito, no el separador.
   * `lib/phone.ts` decide si hace falta intervenir; si dice que no, se deja
   * pasar el borrado normal del navegador y `handleChange` reformatea.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    const input = event.currentTarget
    const range = phoneDeletionRange(
      input.value,
      input.selectionStart ?? 0,
      input.selectionEnd ?? 0,
      event.key === 'Backspace' ? 'backward' : 'forward',
    )
    if (range === null) return
    event.preventDefault()
    commit(input, input.value.slice(0, range.start) + input.value.slice(range.end), range.start)
  }

  return (
    <Input
      {...props}
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={formatPhone(value)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={onBlur}
    />
  )
})
