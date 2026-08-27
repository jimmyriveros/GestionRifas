'use client'

import { ArrowLeftIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { hasInternalHistory } from '@/lib/navigation-history'
import { cn } from '@/lib/utils'

/**
 * Flecha de volver de las pantallas de detalle (D-089).
 *
 * Prefiere el historial real de la sesion -asi se conservan busqueda,
 * filtros, pagina y scroll de la lista de origen sin ningun codigo extra,
 * porque en este proyecto esos datos ya viven en la URL (§6.b de HANDOFF)-.
 * Cuando no hay una pantalla anterior real (URL directa, pestana nueva,
 * enlace externo) usa `fallbackHref` en su lugar. Nunca saca de la
 * aplicacion ni queda sin reaccionar.
 *
 * Visualmente es un boton de icono discreto (20 px); la diana se agranda a
 * 44 px con el propio tamano del boton, igual que la casilla de seleccion
 * (`SelectionCheckbox`, D-085).
 *
 * NO decide su propia colocacion. Quien lo pinta sabe junto a que texto va y
 * pasa el ajuste por `className`; hoy el unico que lo hace es `PageHeader`, que
 * es donde vive el tamano del titulo (D-126).
 */
export function BackButton({
  fallbackHref,
  label = 'Volver',
  className,
}: {
  fallbackHref: string
  label?: string
  className?: string
}) {
  const router = useRouter()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-11 shrink-0', className)}
      aria-label={label}
      title={label}
      onClick={() => {
        if (hasInternalHistory()) router.back()
        else router.push(fallbackHref)
      }}
    >
      <ArrowLeftIcon className="size-5" aria-hidden />
    </Button>
  )
}
