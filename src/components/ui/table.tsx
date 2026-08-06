'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}

/**
 * Los estados de la fila se escalonan de menos a mas especifico para que no
 * compitan entre si: normal, hover, seleccionable, foco y marcada. Las reglas
 * que deben ganar llevan dos condiciones (`data-[...]:hover:`), asi que se
 * imponen por especificidad y no por el orden en que Tailwind emita el CSS.
 */
function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b transition-colors outline-none',
        'hover:bg-muted/50 has-aria-expanded:bg-muted/50',
        // Fila seleccionable (DataTable con `rowHref` u `onRowActivate`): se
        // anuncia con el puntero y con un hover algo mas marcado que el de una
        // fila cualquiera. Solo cambia el fondo: nada de bordes ni tamanos que
        // muevan el contenido al pasar por encima.
        'data-[clickable=true]:hover:bg-muted data-[clickable=true]:cursor-pointer',
        // Solo las filas seleccionables reciben el foco, asi que este contorno
        // nunca aparece donde no hay accion. `outline` y no `ring`: el navegador
        // lo dibuja alrededor de la fila sin depender del colapso de bordes.
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
        // Fila marcada con la casilla: el hover la varia sin devolverla nunca al
        // aspecto de una fila sin marcar.
        'data-[state=selected]:bg-muted data-[state=selected]:hover:bg-muted-foreground/20',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('text-muted-foreground mt-4 text-sm', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
