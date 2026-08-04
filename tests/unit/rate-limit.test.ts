import { beforeEach, describe, expect, it } from 'vitest'

import { __clearRateLimits, checkRateLimit, RATE_LIMITS, resetRateLimit } from '@/lib/rate-limit'

/**
 * Fase 7: limitacion de intentos (docs/SECURITY.md §10, D-062).
 *
 * El tiempo se INYECTA en vez de esperarlo: una prueba que duerme 15 minutos no
 * la ejecuta nadie, y una que depende del reloj real falla sola algun dia.
 */

const RULE = { limit: 3, windowMs: 60_000 }

beforeEach(() => {
  __clearRateLimits()
})

describe('checkRateLimit', () => {
  it('permite hasta el limite configurado', () => {
    for (let i = 0; i < RULE.limit; i++) {
      expect(checkRateLimit('k', RULE, 1000).allowed, `intento ${i + 1}`).toBe(true)
    }
  })

  it('bloquea el intento siguiente al limite', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('k', RULE, 1000)
    expect(checkRateLimit('k', RULE, 1000).allowed).toBe(false)
  })

  it('dice cuanto falta para poder reintentar', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('k', RULE, 1000)

    const result = checkRateLimit('k', RULE, 31_000)
    expect(result.allowed).toBe(false)
    if (result.allowed) return
    expect(result.retryAfterSeconds).toBe(30)
    expect(result.message).toMatch(/espera/i)
  })

  it('vuelve a permitir cuando la ventana vence', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('k', RULE, 1000)
    expect(checkRateLimit('k', RULE, 1000).allowed).toBe(false)

    // Justo al cumplirse la ventana, empieza una nueva.
    expect(checkRateLimit('k', RULE, 1000 + RULE.windowMs).allowed).toBe(true)
  })

  it('cuenta cada clave por separado', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('ana', RULE, 1000)
    expect(checkRateLimit('ana', RULE, 1000).allowed).toBe(false)
    // Que Ana se pase no puede dejar fuera a Carlos.
    expect(checkRateLimit('carlos', RULE, 1000).allowed).toBe(true)
  })

  it('no mezcla operaciones distintas del mismo usuario', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('login:ana', RULE, 1000)
    expect(checkRateLimit('login:ana', RULE, 1000).allowed).toBe(false)
    expect(checkRateLimit('password-reset:ana', RULE, 1000).allowed).toBe(true)
  })

  it('la ventana NO se reinicia por seguir intentando (no es deslizante hacia delante)', () => {
    // Si cada intento moviera el inicio de la ventana, quien insiste sin parar
    // quedaria bloqueado para siempre.
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('k', RULE, 1000)
    checkRateLimit('k', RULE, 30_000) // bloqueado, pero no debe extender nada
    expect(checkRateLimit('k', RULE, 1000 + RULE.windowMs).allowed).toBe(true)
  })

  it('un mensaje de espera corta se redacta en segundos', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('k', RULE, 1000)
    const result = checkRateLimit('k', RULE, 1000 + RULE.windowMs - 5_000)
    if (result.allowed) throw new Error('deberia estar bloqueado')
    expect(result.message).toContain('unos segundos')
  })
})

describe('resetRateLimit', () => {
  it('devuelve el cupo tras un acierto', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('login:ana', RULE, 1000)
    expect(checkRateLimit('login:ana', RULE, 1000).allowed).toBe(false)

    // Es lo que hace `login` al entrar bien: unos fallos previos no pueden
    // dejar a alguien bloqueado en su siguiente intento legitimo.
    resetRateLimit('login:ana')
    expect(checkRateLimit('login:ana', RULE, 1000).allowed).toBe(true)
  })
})

describe('reglas configuradas', () => {
  it('el login es mas permisivo que la recuperacion de contrasena', () => {
    // Equivocarse de contrasena es normal; pedir 10 correos de recuperacion no.
    expect(RATE_LIMITS.login.limit).toBeGreaterThan(RATE_LIMITS.passwordReset.limit)
  })

  it('toda regla tiene limite y ventana positivos', () => {
    for (const [nombre, regla] of Object.entries(RATE_LIMITS)) {
      expect(regla.limit, nombre).toBeGreaterThan(0)
      expect(regla.windowMs, nombre).toBeGreaterThan(0)
    }
  })
})
