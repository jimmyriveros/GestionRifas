/**
 * Resultado uniforme de las Server Actions (docs/ARCHITECTURE.md 7.2, paso 8).
 *
 * Las acciones nunca lanzan al cliente: devuelven `{ error }` con un mensaje
 * en espanol ya traducido por `mapPgError`, o `{ ok: true }` con los datos que
 * la interfaz necesite.
 */
export type ActionResult = { ok: true } | { error: string }

export type ActionResultWith<T> = { ok: true; data: T } | { error: string }
