import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Alto del campo. Es la MISMA distincion que `Button` ya usa desde la Ola 3A,
 * no un mecanismo nuevo:
 *
 *   default  36 px, para el escritorio denso;
 *   touch    44 px en el telefono y 36 px desde `sm`, que es el minimo comodo
 *            para un dedo.
 *
 * No existe un «Input de movil»: es el mismo campo con otro alto, elegido por
 * quien lo compone. El atributo nativo `size` de HTML —que mide en caracteres—
 * se retira del tipo, porque aqui el ancho lo fija `w-full` y tener dos cosas
 * distintas llamadas `size` se lee mal.
 */
const SIZE_CLASSES = {
  default: 'h-9',
  touch: 'h-11 sm:h-9',
} as const

type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & {
  size?: keyof typeof SIZE_CLASSES
}

function Input({ className, type, size = 'default', ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        'border-border-input selection:bg-primary selection:text-primary-foreground file:text-foreground placeholder:text-muted-foreground dark:bg-input/30 text-body-medium md:text-body-small w-full min-w-0 rounded-md border bg-transparent px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-focus-ring focus-visible:ring-focus-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  )
}

export { Input }
