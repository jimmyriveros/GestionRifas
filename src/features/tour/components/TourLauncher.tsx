'use client'

import { CompassIcon } from 'lucide-react'

import { useTourControls } from '@/features/tour/components/TourProvider'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

/**
 * Opcion de ayuda del menu de usuario. Solo aparece cuando la pantalla que se
 * esta viendo tiene recorrido: un boton que no hace nada confunde mas que la
 * falta del boton.
 */
export function TourLauncher() {
  const { isAvailable, restart } = useTourControls()

  if (!isAvailable) return null

  return (
    <DropdownMenuItem onSelect={restart}>
      <CompassIcon />
      Ver recorrido guiado
    </DropdownMenuItem>
  )
}
