'use client'

import { EyeIcon, EyeOffIcon } from 'lucide-react'
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
} from 'react'

import { useHydrated } from '@/components/form/HydratedSubmitButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Campo de contraseña con un ojo para mostrar u ocultar lo escrito (D-255; compartido desde D-256).
 *
 * Es el MISMO `<input>` con otro `type`: nada se remonta, y el valor sigue siendo de quien lo
 * controla —react-hook-form en los formularios de acceso—. La visibilidad es un booleano propio
 * que no se guarda en ninguna parte. Va dentro de `FormControl` como un `Input` más: lo que este
 * le pasa —`id`, `aria-invalid`, `aria-describedby`— llega al `<input>`, y la etiqueta y los
 * errores siguen asociados.
 *
 * Detalles que sostienen que se pueda seguir escribiendo con normalidad:
 *
 * - El clic o el toque en el ojo no le quitan el foco al campo (`onMouseDown`): el teclado del
 *   teléfono no se cierra. Con el teclado, el ojo recibe el foco por tabulación como cualquier
 *   botón, y Enter o Espacio lo alternan.
 * - Al cambiar el `type` con un clic, Chrome lleva el cursor al principio. Se devuelve a su sitio
 *   antes de pintar, midiendo antes la caja: sin eso Chrome rehace el campo después y el cursor
 *   devuelto se pierde igual (medido en D-255).
 * - Mientras se ve, el campo es de texto: se apagan el corrector y el autocorrector, que podrían
 *   mandarla a un servicio externo, cambiarla o aprenderla. Y se quita el ojo propio de Edge
 *   (`::-ms-reveal`): dos ojos que hacen lo mismo sobran.
 * - Desactivado —el formulario se está enviando—, la contraseña se tapa y se queda tapada: no se ve
 *   tras guardar o tras un error del servidor, y el navegador encuentra un campo de contraseña. Un
 *   error de validación, en cambio, no la tapa: hay que poder ver qué no coincide.
 * - Antes de hidratar el ojo está desactivado, como el botón de enviar (I-204).
 */

/** El ojo mide lo que el campo, y el campo le reserva ese hueco a la derecha. */
const EYE_SIZES = {
  default: { button: 'icon', input: 'pr-9' },
  touch: { button: 'icon-touch', input: 'pr-11 sm:pr-9' },
} as const

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type'> & {
  /**
   * Lo que el ojo muestra u oculta, en minúscula, para su nombre: «Mostrar {subject}». Con un solo
   * campo basta «contraseña»; con dos en la misma pantalla, cada uno dice cuál es.
   */
  subject?: string
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function PasswordInput({
  subject = 'contraseña',
  size = 'default',
  disabled = false,
  className,
  ref,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  // Ajuste de estado durante el render, el patrón de React para esto: sin efecto ni parpadeo.
  if (disabled && visible) setVisible(false)

  const hydrated = useHydrated()
  const inputRef = useRef<HTMLInputElement | null>(null)
  /** Dónde estaba el cursor al pulsar el ojo. */
  const caretRef = useRef<[number, number] | null>(null)

  const setRefs = useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element
      assignRef(ref, element)
    },
    [ref],
  )

  useLayoutEffect(() => {
    const input = inputRef.current
    const caret = caretRef.current
    caretRef.current = null
    if (!input || !caret) return
    input.getBoundingClientRect()
    input.setSelectionRange(caret[0], caret[1])
  }, [visible])

  function toggle() {
    const input = inputRef.current
    // Solo con el foco en el campo, que el toque no le quita: fuera de él, mover la selección
    // puede darle el foco en algunos navegadores y abrir el teclado del teléfono.
    caretRef.current =
      input &&
      document.activeElement === input &&
      input.selectionStart !== null &&
      input.selectionEnd !== null
        ? [input.selectionStart, input.selectionEnd]
        : null
    setVisible((current) => !current)
  }

  const eye = EYE_SIZES[size]

  return (
    <div className="relative">
      <Input
        {...props}
        ref={setRefs}
        size={size}
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="none"
        disabled={disabled}
        className={cn(eye.input, '[&::-ms-reveal]:hidden', className)}
      />
      <Button
        type="button"
        variant="ghost"
        size={eye.button}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 hover:bg-transparent dark:hover:bg-transparent"
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
        disabled={disabled || !hydrated}
      >
        {visible ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
        {/*
          Texto `sr-only` y no `aria-label` (D-114): `getByLabel('Contraseña')` también lee los
          `aria-label`, y encontraría el campo y este botón a la vez.
        */}
        <span className="sr-only">{`${visible ? 'Ocultar' : 'Mostrar'} ${subject}`}</span>
      </Button>
    </div>
  )
}
