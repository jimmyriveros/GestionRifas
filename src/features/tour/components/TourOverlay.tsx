'use client'

import { XIcon } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import type { TargetRect } from '@/features/tour/use-tour'
import type { TourStep } from '@/features/tour/tours'
import { Button } from '@/components/ui/button'

/**
 * Presentacion del recorrido guiado: el foco sobre el elemento y el globo con
 * la explicacion. No decide nada; recibe el paso ya resuelto por `useTourRunner`.
 */

type TourOverlayProps = {
  step: TourStep
  index: number
  total: number
  isFirst: boolean
  isLast: boolean
  rect: TargetRect | null
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
}

/** Aire entre el borde del elemento y el recorte iluminado. */
const SPOTLIGHT_PADDING = 6

export function TourOverlay({
  step,
  index,
  total,
  isFirst,
  isLast,
  rect,
  onNext,
  onPrevious,
  onClose,
}: TourOverlayProps) {
  const titleId = useId()
  const bodyId = useId()
  const cardRef = useRef<HTMLDivElement>(null)

  // El foco viaja con el paso: quien navega con teclado o lector de pantalla
  // escucha el titulo, el progreso y el texto de cada paso al llegar.
  useEffect(() => {
    cardRef.current?.focus()
  }, [step.id])

  const card = (
    <div
      ref={cardRef}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      className="bg-popover text-popover-foreground w-[min(22rem,calc(100vw-2rem))] rounded-lg border p-4 shadow-lg outline-none"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs font-medium">
          Paso {index + 1} de {total}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el recorrido"
          className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 rounded p-1"
        >
          <XIcon className="size-4" aria-hidden />
        </button>
      </div>

      <h2 id={titleId} className="text-base font-semibold">
        {step.title}
      </h2>
      <p id={bodyId} className="text-muted-foreground mt-1 text-sm">
        {step.body}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {isLast ? 'Cerrar' : 'Omitir recorrido'}
        </Button>
        <div className="flex items-center gap-2">
          {isFirst ? null : (
            <Button type="button" variant="outline" size="sm" onClick={onPrevious}>
              Atrás
            </Button>
          )}
          <Button type="button" size="sm" onClick={onNext}>
            {isLast ? 'Empezar' : 'Siguiente'}
          </Button>
        </div>
      </div>
    </div>
  )

  // Paso sin elemento (el cierre): tarjeta centrada, sin foco sobre nada.
  if (!step.target || !rect) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">{card}</div>
    )
  }

  const spotlight = {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  }

  return (
    <>
      {/*
        Capa que impide tocar el resto de la pantalla mientras el recorrido esta
        abierto: sin ella, un toque en cualquier parte navegaria a otra pagina y
        dejaria el recorrido apuntando a un elemento que ya no existe.
      */}
      <div className="fixed inset-0 z-[100]" aria-hidden />

      {/*
        El oscurecido lo dibuja la SOMBRA de este recuadro, no una capa aparte:
        asi el hueco coincide exactamente con el elemento y no hay que recortar
        nada. No captura clics para no tapar lo que esta resaltando.
      */}
      <div
        aria-hidden
        // Sin transicion CSS: la posicion ya se actualiza en cada fotograma
        // mientras dura el scroll, y animarla ademas la dejaria por detras del
        // elemento al que persigue.
        className="ring-primary pointer-events-none fixed z-[101] rounded-lg ring-2"
        style={{
          top: spotlight.top,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
          boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)',
        }}
      />

      <PopoverPrimitive.Root open>
        {/*
          El ancla es un recuadro invisible del tamano del elemento. Radix se
          encarga desde ahi de voltear el globo y mantenerlo dentro de la
          pantalla, que es justo lo que se rompe al calcular posiciones a mano.
        */}
        <PopoverPrimitive.Anchor asChild>
          <div
            aria-hidden
            className="pointer-events-none fixed z-[100]"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
          />
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side={step.side ?? 'bottom'}
            sideOffset={12}
            collisionPadding={16}
            avoidCollisions
            className="z-[102]"
            /*
              Radix marca su contenido como `dialog`. Aqui solo es el envoltorio
              que lo coloca: el dialogo real es la tarjeta, que es la que tiene
              titulo y descripcion. Sin esto habria dos dialogos anidados y un
              lector de pantalla anunciaria uno vacio.
            */
            role="presentation"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            {card}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  )
}
