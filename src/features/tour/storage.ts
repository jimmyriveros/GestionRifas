import type { TourId } from '@/features/tour/tours'

/**
 * Memoria de que recorridos ya vio cada persona.
 *
 * Vive en `localStorage`, no en la base de datos: es una preferencia de
 * interfaz, no un dato del negocio (D-074). La clave incluye el perfil para que
 * dos personas que compartan el mismo telefono no se hereden el recorrido.
 */

const PREFIX = 'rifas.tour'

function key(profileId: string, tourId: TourId) {
  return `${PREFIX}.${profileId}.${tourId}`
}

/**
 * `localStorage` lanza excepcion en modo privado de Safari y cuando el
 * navegador tiene bloqueado el almacenamiento. Que falle solo puede significar
 * que el recorrido se ofrezca de nuevo, nunca que la pantalla se rompa.
 */
function safely<T>(fallback: T, run: () => T): T {
  try {
    return run()
  } catch {
    return fallback
  }
}

export function hasSeenTour(profileId: string, tourId: TourId): boolean {
  return safely(true, () => window.localStorage.getItem(key(profileId, tourId)) !== null)
}

/** Se marca igual al terminarlo que al omitirlo: en ambos casos ya no aparece solo. */
export function markTourSeen(profileId: string, tourId: TourId): void {
  safely(undefined, () =>
    window.localStorage.setItem(key(profileId, tourId), new Date().toISOString()),
  )
}
