'use client'

import { ChevronDownIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * El armazón de la forma compacta del recuadro de loterías (D-180, D-181).
 *
 * ES LO ÚNICO DE ESTE RECUADRO QUE LLEVA JAVASCRIPT, y solo por una razón: el
 * detalle **se despliega encima del contenido y se cierra al tocar fuera**, y
 * ninguna de las dos cosas la da el HTML por sí solo. Todo lo demás —los datos,
 * las dos filas, el detalle entero— sigue dibujándose en el servidor y llega
 * aquí como `children` y `detail`; este componente no consulta nada, no calcula
 * nada y no conoce ni una regla de negocio.
 *
 * QUÉ SUSTITUYE. Hasta D-181 era un `<details>` nativo con su `<summary>` al
 * final de la tarjeta: cero JavaScript, pero **empujaba hacia abajo** media
 * pantalla al abrirse. El encargo pidió lo contrario, y el precio de pedirlo es
 * este componente. Se pierde una cosa y se dice: **sin JavaScript, el detalle ya
 * no se puede abrir**. Sigue viajando en el HTML —está montado y solo oculto—,
 * pero no hay forma de mostrarlo sin el guion.
 *
 * POR QUÉ NO SE USÓ NADA DE LO QUE YA HAY. `Dialog` y `Sheet` tapan la pantalla
 * entera con un velo y atrapan el foco: son para decidir algo, no para mirar un
 * dato de paso. `DropdownMenu` tiene semántica de menú —`menuitem`— y dentro de
 * este panel hay encabezados, avisos y enlaces a boletas. No existe un
 * primitivo de «panel anclado» en el sistema de diseño, y **no se crea uno**:
 * un solo uso no demuestra que sea reutilizable (§10.55 del sistema de diseño).
 * Si aparece un segundo, esa sí será la evidencia para promoverlo.
 *
 * EL PANEL VIVE DENTRO DE LA TARJETA, no en un portal. Es `absolute` sobre
 * `CardContent`, así que arranca justo debajo del encabezado, mide lo mismo que
 * las filas que tapa y **se sale por abajo sobre lo que haya** sin mover ni un
 * píxel del resto de la pantalla. `z-30` lo deja por encima del contenido y por
 * **debajo** del encabezado pegajoso y de la barra inferior, que son `z-40`.
 */
export function LotteryCompactCard({
  title,
  detail,
  showLabel,
  hideLabel,
  subject,
  children,
  className,
}: {
  /** «Loterías». */
  title: string
  /**
   * El recuadro completo, ya dibujado en el servidor. `null` cuando no hay nada
   * que desplegar —error o sin programaciones—, y entonces **no se dibuja el
   * botón**: uno que abre un panel vacío es peor que no tenerlo.
   */
  detail: ReactNode | null
  showLabel: string
  hideLabel: string
  /** Lo que el botón añade a su nombre accesible, en `sr-only`. */
  subject: string
  /** Las dos filas y sus avisos, o el estado vacío. */
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return

    /*
     * «Fuera» es fuera del PANEL y fuera del BOTÓN, no fuera de la tarjeta: el
     * encabezado sigue a la vista mientras el panel está abierto, y tocarlo
     * tiene que cerrarlo como cualquier otro sitio. El botón se excluye porque
     * su propio `onClick` ya alterna; sin esta guarda se cerraría y se volvería
     * a abrir en el mismo toque.
     *
     * `pointerdown` y no `click`: un enlace de dentro del panel navega en el
     * `click`, y para entonces ya conviene haber decidido que NO se cierra.
     */
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      // El foco vuelve a donde estaba: cerrar con el teclado no puede dejar a
      // nadie perdido al principio de la página.
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <Card
      data-slot="lottery-results"
      data-variant="compact"
      className={cn('relative min-w-0 gap-4 py-4 md:py-5', className)}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="min-w-0">
          <h2 className="text-heading-h4 min-w-0 break-words">{title}</h2>
        </CardTitle>

        {/*
          El botón vive ARRIBA A LA DERECHA (D-181), donde se busca una acción de
          tarjeta y donde no depende de cuánto mida el contenido. Antes estaba al
          pie, y ahí el ojo tenía que recorrer las dos filas para encontrarlo.

          `min-h-11` y no `h-11`: el suelo táctil de 44 px se conserva en todos
          los anchos, y los márgenes negativos devuelven el aire que se le quita
          al encabezado para que el botón no lo haga más alto (D-085).
        */}
        {detail ? (
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            data-slot="lottery-detail-trigger"
            onClick={() => setOpen((estaba) => !estaba)}
            className="text-text-brand text-label-medium hover:bg-surface-accent hover:text-text-on-accent focus-visible:border-focus-ring focus-visible:ring-focus-ring/50 -my-2 -me-2 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 outline-none focus-visible:ring-[3px]"
          >
            {open ? hideLabel : showLabel}
            <span className="sr-only"> {subject}</span>
            <ChevronDownIcon
              className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          </button>
        ) : null}
      </CardHeader>

      {/* `relative` aquí y no en la tarjeta: así el panel arranca exactamente
          donde arrancan las filas, sin ninguna medida escrita a mano. */}
      <CardContent className="relative min-w-0 space-y-3">
        {children}

        {detail ? (
          /*
            Se monta SIEMPRE y se oculta con `hidden`, en vez de montarse al
            abrir: así el detalle viaja en el mismo HTML que el resto del
            recuadro —dentro de su límite de Suspense— y abrirlo no cuesta una
            segunda pintura. `@container/detalle` mide ESTE panel, que es lo que
            decide si su contenido va en una o en dos columnas.

            `max-h` con `svh` y no `vh`: en un teléfono, `vh` cuenta la barra del
            navegador que aparece y desaparece, y el panel se salía de la vista.
          */
          <div
            ref={panelRef}
            id={panelId}
            hidden={!open}
            data-slot="lottery-detail"
            className="bg-card shadow-elevation-shadow-strong @container/detalle absolute inset-x-0 top-0 z-30 max-h-[70svh] overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border p-4 shadow-lg"
          >
            {detail}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
