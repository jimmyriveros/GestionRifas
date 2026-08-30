import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

import { LOTTERY_SYNC_SECRET_MIN_LENGTH } from './constants'

export type LotterySyncAuthOk = { ok: true }
export type LotterySyncAuthFail = { ok: false; status: 401 | 429 }

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/**
 * Compara secretos a tiempo constante. El hash evita filtrar la longitud
 * del valor configurado (D-148).
 */
export function secretsEqual(presented: string, expected: string): boolean {
  if (presented.length === 0 || expected.length === 0) return false
  return timingSafeEqual(sha256(presented), sha256(expected))
}

export function presentedLotterySyncSecret(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (authorization) {
    const match = /^Bearer\s+(\S+)/i.exec(authorization.trim())
    const token = match?.[1]
    if (token) return token
  }
  const header = request.headers.get('x-lottery-sync-secret')?.trim()
  return header || null
}

export function configuredLotterySyncSecret(
  env?: Record<string, string | undefined>,
): string | null {
  const bag = env ?? (process.env as Record<string, string | undefined>)
  const value = bag.LOTTERY_SYNC_SECRET?.trim() || bag.CRON_SECRET?.trim() || ''
  if (value.length < LOTTERY_SYNC_SECRET_MIN_LENGTH) return null
  return value
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Autoriza el proceso interno. No usa sesion de usuario. Falla cerrado si
 * el secreto no esta configurado, es corto o no coincide (D-148, BR-L21).
 */
export function authorizeLotterySync(input: {
  presented: string | null
  expected: string | null
  ip?: string
  now?: number
}): LotterySyncAuthOk | LotterySyncAuthFail {
  const valid =
    Boolean(input.expected) &&
    Boolean(input.presented) &&
    secretsEqual(input.presented ?? '', input.expected ?? '')

  if (valid) return { ok: true }

  const limited = checkRateLimit(
    `lottery-sync-auth:${input.ip ?? 'unknown'}`,
    RATE_LIMITS.lotterySyncAuth,
    input.now,
  )
  if (!limited.allowed) return { ok: false, status: 429 }
  return { ok: false, status: 401 }
}

export function authorizeLotterySyncRequest(
  request: Request,
  env?: Record<string, string | undefined>,
): LotterySyncAuthOk | LotterySyncAuthFail {
  return authorizeLotterySync({
    presented: presentedLotterySyncSecret(request),
    expected: configuredLotterySyncSecret(env),
    ip: clientIp(request),
  })
}
