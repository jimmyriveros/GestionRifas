import 'server-only'

import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { clientIp, secretsEqual } from '@/features/lottery/auth'

/**
 * Quién puede despertar al despachador (BR-V08, D-191).
 *
 * **NO SE REINVENTA NADA.** `secretsEqual` —que compara a tiempo constante sobre
 * el hash, para no filtrar ni la longitud— y `clientIp` se reutilizan tal cual
 * de `features/lottery/auth.ts` (D-148). Lo único propio es el nombre de la
 * variable y su propio cupo de intentos: dos puertas distintas no comparten
 * contador, o un ataque contra una cerraría la otra.
 *
 * FALLA CERRADO. Sin secreto configurado, con uno corto o sin uno presentado,
 * la respuesta es la misma: no. Un despachador abierto dejaría a cualquiera
 * vaciar la cola de avisos de toda la base.
 */

/** Lo mismo que exige el de loterías: un secreto corto no es un secreto. */
export const PUSH_DISPATCH_SECRET_MIN_LENGTH = 16

export type PushAuthOk = { ok: true }
export type PushAuthFail = { ok: false; status: 401 | 429 }

/**
 * El secreto que trae la petición.
 *
 * **Solo por cabecera, nunca por la URL.** Una query string acaba en los
 * registros del servidor, en los del proxy y en el historial; una cabecera, no
 * (BR-V08).
 */
export function presentedPushSecret(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (authorization) {
    const match = /^Bearer\s+(\S+)/i.exec(authorization.trim())
    const token = match?.[1]
    if (token) return token
  }
  return request.headers.get('x-push-dispatch-secret')?.trim() || null
}

export function configuredPushSecret(env?: Record<string, string | undefined>): string | null {
  const bag = env ?? (process.env as Record<string, string | undefined>)
  const value = bag.PUSH_DISPATCH_SECRET?.trim() || bag.CRON_SECRET?.trim() || ''
  if (value.length < PUSH_DISPATCH_SECRET_MIN_LENGTH) return null
  return value
}

export function authorizePushDispatch(input: {
  presented: string | null
  expected: string | null
  ip?: string
  now?: number
}): PushAuthOk | PushAuthFail {
  const valid =
    Boolean(input.expected) &&
    Boolean(input.presented) &&
    secretsEqual(input.presented ?? '', input.expected ?? '')

  if (valid) return { ok: true }

  const limited = checkRateLimit(
    `push-dispatch-auth:${input.ip ?? 'unknown'}`,
    RATE_LIMITS.pushDispatchAuth,
    input.now,
  )
  if (!limited.allowed) return { ok: false, status: 429 }
  return { ok: false, status: 401 }
}

export function authorizePushDispatchRequest(
  request: Request,
  env?: Record<string, string | undefined>,
): PushAuthOk | PushAuthFail {
  return authorizePushDispatch({
    presented: presentedPushSecret(request),
    expected: configuredPushSecret(env),
    ip: clientIp(request),
  })
}

/**
 * Las claves VAPID, o `null` si no están configuradas.
 *
 * Sin ellas el despachador no envía y lo dice: es el mismo trato que la
 * pantalla, que sin clave pública ni siquiera ofrece los avisos (D-190). El
 * canal entero es opcional hasta que alguien lo enciende a propósito.
 */
export function configuredVapid(
  env?: Record<string, string | undefined>,
): { publicKey: string; privateKey: string; subject: string } | null {
  const bag = env ?? (process.env as Record<string, string | undefined>)
  const publicKey = bag.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? ''
  const privateKey = bag.VAPID_PRIVATE_KEY?.trim() ?? ''
  // El RFC 8292 exige un contacto: `mailto:` o `https:`. Si no hay uno
  // configurado se usa la dirección del propio sitio, que es un dato honesto y
  // no un correo inventado.
  const subject =
    bag.VAPID_SUBJECT?.trim() || bag.NEXT_PUBLIC_SITE_URL?.trim() || 'https://localhost'

  if (publicKey === '' || privateKey === '') return null
  if (!/^(mailto:|https:)/.test(subject)) return null
  return { publicKey, privateKey, subject }
}
