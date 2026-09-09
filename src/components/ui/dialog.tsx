'use client'

import * as React from 'react'
import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 bg-overlay-scrim fixed inset-0 z-50',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Contenedor de un dialogo.
 *
 * EL ALTO ESTA ACOTADO A PROPOSITO, y no es un detalle estetico.
 *
 * Sin techo, un dialogo alto crece mas que la ventana y su parte inferior
 * —donde viven SIEMPRE los botones de confirmar y cancelar— queda fuera de la
 * pantalla: visible para el navegador, habilitado, y **imposible de pulsar**.
 * No hay forma de recuperarlo, porque sin `overflow` tampoco hay nada que
 * desplazar.
 *
 * Ha pasado dos veces. `TicketImportDialog` lo parcheo por su cuenta con
 * `max-h-[90dvh]`, y en 2026-08-17 volvio a ocurrir en el modal de venta
 * multiple al añadirle el campo de precio (D-099): una prueba E2E reintento el
 * clic 106 veces contra un boton «visible, enabled and stable» pero *outside of
 * the viewport*. Un vendedor con esa seleccion tampoco habria podido vender.
 *
 * `dvh` y no `vh`: en el telefono la barra del navegador aparece y desaparece, y
 * `vh` se queda con la altura mayor —justo la que no cabe—.
 *
 * Un dialogo puede seguir imponiendo su propio alto: `cn` usa `tailwind-merge`,
 * asi que la clase de quien llama gana sobre esta.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-background-default data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 outline-none sm:max-w-lg',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto',
          className,
        )}
        {...props}
      >
        {children}
        {/*
          LA «X» ES UNA DIANA DE 44 px EN EL TELEFONO, NO DE 16 (I-104, D-178).

          Tenia el tamaño del icono y nada mas —16×16—, la diana mas pequeña que
          se ha medido en esta aplicacion y menos de la mitad del suelo de
          `CLAUDE.md` §27. Ahora el BOTON mide 44 y el icono sigue midiendo 16.

          EL ICONO NO SE MUEVE, y ese es todo el truco: la caja crece hacia
          dentro desde su esquina, asi que para que el icono se quede donde
          estaba hay que retroceder el anclaje la mitad de lo que crece la caja
          —(44−16)/2 = 14 px—, y `top-4 right-4` (16 px) pasa a `top-0.5
          right-0.5` (2 px).

          MEDIDO, no razonado: el icono queda a **17,00 px** de la esquina del
          dialogo tanto a 320 px como a 1280 —1 del borde + 16—, y mide 16,00 en
          los dos. Exactamente donde estaba. Para tomar esa medida hay que
          esperar a que TERMINE la animacion de entrada: `zoom-in-95` sigue
          escalando el contenido y sin la espera se mide un fotograma (la misma
          trampa de D-177).

          Desde `sm` vuelve EXACTAMENTE a lo de antes —`sm:top-4 sm:right-4
          sm:size-4`—, que es la misma regla de D-177: el suelo tactil se libera
          por encima del breakpoint pequeño y el escritorio no cambia.
        */}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-surface-accent data-[state=open]:text-muted-foreground absolute top-0.5 right-0.5 inline-flex size-11 items-center justify-center rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none sm:top-4 sm:right-4 sm:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            {/* «Cerrar», no «Close»: la interfaz es español (CLAUDE.md §6,
                BR-X01) y esto es lo que anuncia un lector de pantalla. */}
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    >
      {children}
      {/*
        Nadie lo usa —`showCloseButton` nace en `false` y ningun consumidor lo
        enciende— pero estaba mal de las dos formas que arregla I-104: decia
        «Close» y nacia con el `size` por defecto. Se corrige en vez de
        borrarse: es parte del contrato del primitivo y el dia que alguien lo
        encienda tiene que salir bien, no salir en inglés y con 36 px.
      */}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline" size="touch">
            Cerrar
          </Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-body-large leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-body-small', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
