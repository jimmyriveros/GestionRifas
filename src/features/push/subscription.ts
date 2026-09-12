/**
 * Avisos en el teléfono: qué se puede ofrecer en este navegador, y TODOS sus
 * textos (BR-V01, BR-V04..BR-V06; D-187, D-190).
 *
 * PURO: no lee la sesión, no consulta la base, no toca `window` y no se
 * suscribe a nada. Recibe lo que necesita saber y devuelve qué enseñar, igual
 * que `pwa/install-state.ts` — del que reutiliza la detección de plataforma en
 * vez de volver a escribirla.
 *
 * LO QUE ESTA ETAPA NO HACE: enviar. No hay outbox, ni despachador, ni firma
 * VAPID, ni cifrado. Una suscripción guardada hoy no produce ninguna
 * notificación en ningún teléfono; eso es la Etapa 5.
 *
 * Y LO QUE NO CAMBIA NUNCA: la campana interna es la fuente durable (BR-V01).
 * Todo lo de aquí es un canal EXTRA que va encima, así que cada forma de «no se
 * puede» termina diciendo que lo de dentro no se pierde.
 */

/** Qué se puede ofrecer, en orden de lo que manda. */
export type PushCapability =
  /** La aplicación no tiene clave pública configurada: no se ofrece nada. */
  | 'no-configurado'
  /** iPhone o iPad sin instalar: Safari solo da avisos a la aplicación instalada. */
  | 'ios-sin-instalar'
  /** El navegador no tiene service worker o no tiene Push API. */
  | 'sin-soporte'
  /** La persona o el navegador dijeron que no. */
  | 'bloqueado'
  /** Este dispositivo ya está suscrito y la base lo conoce. */
  | 'activo'
  /** Se puede activar. */
  | 'disponible'

export type PushEnvironment = {
  /** ¿Hay clave pública? Sin ella no se puede ni pedir la suscripción. */
  configured: boolean
  /** `serviceWorker` y `PushManager` presentes. */
  supported: boolean
  /** Lo que devuelve `detectPlatform()` de la instalación (D-117). */
  platform: 'standalone' | 'ios-safari' | 'ios-other' | 'other'
  permission: 'default' | 'granted' | 'denied'
  /** El endpoint de este navegador está registrado en la base, para esta persona. */
  subscribedHere: boolean
}

/**
 * El orden de las comprobaciones no es cosmético.
 *
 * **El iPhone va antes que el soporte** porque en Safari sin instalar
 * `PushManager` sencillamente no existe: si se preguntara primero por el
 * soporte, a media Colombia se le diría «este navegador no puede» cuando lo que
 * pasa es que le falta un paso que sí puede dar.
 *
 * **Y `bloqueado` va antes que `activo`** porque un permiso retirado deja la
 * suscripción viva en la base: lo que manda es lo que dice el navegador hoy.
 */
export function pushCapability(env: PushEnvironment): PushCapability {
  if (!env.configured) return 'no-configurado'
  if (env.platform === 'ios-safari' || env.platform === 'ios-other') return 'ios-sin-instalar'
  if (!env.supported) return 'sin-soporte'
  if (env.permission === 'denied') return 'bloqueado'
  return env.subscribedHere ? 'activo' : 'disponible'
}

/** ¿Se pinta la sección? Sin clave configurada no hay nada que ofrecer. */
export function showsPushSection(capability: PushCapability): boolean {
  return capability !== 'no-configurado'
}

/**
 * La clave pública VAPID, de base64url a los bytes que espera
 * `pushManager.subscribe()`.
 *
 * El navegador pide un `Uint8Array` con el punto P-256 sin comprimir (65 bytes,
 * empezando por `0x04`). La clave se publica en base64url —sin relleno y con
 * `-` y `_`—, así que hay que devolverle su relleno y traducir los dos
 * caracteres antes de decodificar.
 *
 * Devuelve `null` en vez de lanzar: una clave mal copiada en una variable de
 * entorno no puede tumbar una pantalla, solo hacer que no se ofrezcan avisos.
 */
export function vapidKeyToBytes(base64url: string): Uint8Array | null {
  const clean = base64url.trim()
  if (clean === '' || !/^[A-Za-z0-9_-]+$/.test(clean)) return null

  const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), '=')
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')

  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    // Un punto P-256 sin comprimir mide 65 bytes y empieza por 0x04. Cualquier
    // otra cosa haría fallar `subscribe()` con un error que no dice nada.
    if (bytes.length !== 65 || bytes[0] !== 0x04) return null
    return bytes
  } catch {
    return null
  }
}

/**
 * Todo lo que se lee en pantalla sobre los avisos del teléfono.
 *
 * **«Aviso», nunca «notificación push», «suscripción» ni «token»**: son la misma
 * cosa que ya sale en la campanita y el glosario les da un solo nombre
 * (`UX_COPY_GUIDELINES`, Anexo A).
 *
 * **Cada «no se puede» termina diciendo que la campana sigue.** Sin esa frase,
 * un mensaje de error se lee como «te vas a quedar sin enterarte», y no es
 * verdad: el aviso interno es obligatorio y se ve al entrar (BR-V01).
 */
export const PUSH_COPY = {
  title: 'Avisos en este dispositivo',
  /**
   * Dice las DOS cosas que no se pueden deducir: que esto va encima de la
   * campana, y que vale para este aparato y no para la cuenta entera.
   */
  description:
    'Además de la campana, podemos avisarte en este dispositivo cuando llegue la hora de un recordatorio.',

  enable: 'Activar avisos',
  enabling: 'Activando...',
  enabled: 'Este dispositivo ya recibe avisos.',
  disable: 'Dejar de recibir avisos',
  disabling: 'Guardando...',
  disabled: 'Este dispositivo dejó de recibir avisos.',

  /** Lo que se dice cuando el propio navegador se negó a dar la suscripción. */
  failed: 'No pudimos activar los avisos en este dispositivo. Vuelve a intentarlo.',

  /**
   * Las tres formas de que no se pueda. **Una por causa**, no una por pantalla,
   * y cada una nombra la salida que esa persona puede tomar desde donde está
   * (la misma regla que `INVITE_DIALOG_COPY.blocked`, D-176).
   */
  blocked: {
    'ios-sin-instalar':
      'En el iPhone y el iPad, los avisos solo llegan si instalas Rifas en tu pantalla de inicio. La campana te sigue avisando al entrar.',
    'sin-soporte':
      'Este navegador no puede recibir avisos. La campana te sigue avisando al entrar.',
    bloqueado:
      'Tu navegador tiene bloqueados los avisos de Rifas. Puedes permitirlos desde su configuración. La campana te sigue avisando al entrar.',
  } satisfies Record<'ios-sin-instalar' | 'sin-soporte' | 'bloqueado', string>,
} as const
