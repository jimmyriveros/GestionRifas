import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-label-small whitespace-nowrap transition-[color,box-shadow] focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        // NO se cuelga de `action/primary` a proposito (Wave 3B1b).
        //
        // El sistema aprobado NO tiene un Badge generico: en Figma solo existe
        // «Badge / Status», con sus cinco estados. Este `default` es herencia de
        // shadcn, y en la aplicacion lo usan DOS sitios, los dos para decir
        // «Activo»/«Inactivo» de un enlace de catalogo: es un indicador de
        // ESTADO, no un enfasis de marca.
        //
        // Si siguiera atado a `action/primary`, al encender la marca esos dos
        // se volverian verdes por herencia de implementacion, no por decision.
        // Se queda en el token heredado hasta que la ola de Status decida a que
        // estado de «Badge / Status» corresponden. Hoy no cambia nada: el freno
        // de la Wave 1 hace que los dos valores sean el mismo.
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'bg-action-secondary text-text-on-secondary [a&]:hover:bg-action-secondary/90',
        destructive:
          'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
        outline:
          'border-border text-foreground [a&]:hover:bg-surface-accent [a&]:hover:text-text-on-accent',
        ghost: '[a&]:hover:bg-surface-accent [a&]:hover:text-text-on-accent',
        link: 'text-text-brand underline-offset-4 [a&]:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
