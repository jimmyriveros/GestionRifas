/**
 * La pausa de publicación, vista desde la aplicación (D-239, `RUNBOOK` §10).
 *
 * Mientras se publica un cambio que no es compatible con el código servido, quien
 * opera cierra la API de datos: PostgREST rechaza TODA petición con HTTP 423 y el
 * código `RIFAS_PAUSA` (`supabase/maintenance/pausa.sql`). La base es la que
 * impide operar; aquí solo se decide qué ve la persona.
 *
 * Lo que NO puede pasar es lo de I-115: que la lectura de la membresía falle y la
 * guarda lo tome por una cuenta inactiva, cierre la sesión en todos los
 * dispositivos y diga «Tu cuenta está inactiva». Con la pausa, la sesión se
 * conserva y se ve `/mantenimiento`; al abrir, la persona sigue donde estaba.
 */

/** El código que devuelve el gancho de PostgREST con la pausa cerrada. */
export const MAINTENANCE_PAUSE_CODE = 'RIFAS_PAUSA'

/** Su estado HTTP: 423 y no 503, que `postgrest-js` reintenta (ver `pausa.sql`). */
export const MAINTENANCE_PAUSE_STATUS = 423

/** La pantalla que se ve durante la pausa. Pública: no consulta nada. */
export const MAINTENANCE_PATH = '/mantenimiento'

/**
 * Lo que responde una acción durante la pausa. Es EL MISMO texto que devuelve la
 * base a quien llama a la API directamente (`pausa.sql`); una prueba unitaria los
 * compara letra por letra.
 */
export const MAINTENANCE_PAUSE_MESSAGE =
  'Estamos actualizando Rifas. Vuelve a intentarlo en unos minutos.'

/** Un error de PostgREST tal como lo entrega `supabase-js`. */
type MaybePostgrestError = { code?: string | null } | null | undefined

/** ¿Este error es la pausa? Por el código; un HEAD no trae cuerpo, así que también por el estado. */
export function isMaintenancePause(error: MaybePostgrestError, status?: number | null): boolean {
  if (error?.code === MAINTENANCE_PAUSE_CODE) return true
  return error != null && status === MAINTENANCE_PAUSE_STATUS
}

/**
 * Lo que lanza la lectura de la membresía cuando la API está en pausa. Quien la
 * recoge decide: una pantalla lleva a `/mantenimiento`, una acción devuelve el
 * mensaje y conserva lo que la persona escribió.
 */
export class MaintenancePauseError extends Error {
  constructor() {
    super(MAINTENANCE_PAUSE_MESSAGE)
    this.name = 'MaintenancePauseError'
  }
}
