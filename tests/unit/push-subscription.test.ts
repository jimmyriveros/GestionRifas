import { describe, expect, it } from 'vitest'

import {
  PUSH_COPY,
  pushCapability,
  showsPushSection,
  vapidKeyToBytes,
  type PushEnvironment,
} from '@/features/push/subscription'

/**
 * Qué se ofrece en cada navegador, y qué se dice cuando no se puede
 * (BR-V01, BR-V06; D-190).
 *
 * La prueba que más importa es la del **orden** de las comprobaciones: en un
 * iPhone sin instalar, `PushManager` no existe, así que preguntar primero por el
 * soporte diría «este navegador no puede» cuando lo que falta es un paso que sí
 * se puede dar.
 */

function env(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    configured: true,
    supported: true,
    platform: 'other',
    permission: 'default',
    subscribedHere: false,
    ...overrides,
  }
}

describe('qué se puede ofrecer', () => {
  it('sin clave configurada no se ofrece nada, y la sección no se pinta', () => {
    const capability = pushCapability(env({ configured: false }))
    expect(capability).toBe('no-configurado')
    expect(showsPushSection(capability)).toBe(false)
  })

  it('en un iPhone sin instalar se dice lo que falta, NO «no se puede»', () => {
    // El orden importa: ahí `PushManager` no existe, así que `supported` es
    // false y la respuesta ingenua sería «sin-soporte».
    expect(pushCapability(env({ platform: 'ios-safari', supported: false }))).toBe(
      'ios-sin-instalar',
    )
    expect(pushCapability(env({ platform: 'ios-other', supported: false }))).toBe(
      'ios-sin-instalar',
    )
  })

  it('instalada en el iPhone, se comporta como cualquier otro navegador', () => {
    expect(pushCapability(env({ platform: 'standalone' }))).toBe('disponible')
  })

  it('un navegador sin Push API lo dice', () => {
    expect(pushCapability(env({ supported: false }))).toBe('sin-soporte')
  })

  it('un permiso denegado manda sobre la suscripción guardada', () => {
    // El permiso se puede retirar dejando la fila viva en la base: lo que manda
    // es lo que dice el navegador hoy.
    expect(pushCapability(env({ permission: 'denied', subscribedHere: true }))).toBe('bloqueado')
  })

  it('con permiso y suscripción, este dispositivo está activo', () => {
    expect(pushCapability(env({ permission: 'granted', subscribedHere: true }))).toBe('activo')
  })

  it('con permiso pero sin suscripción aquí, se puede activar', () => {
    // Es el caso del teléfono compartido: el navegador ya tiene permiso porque
    // lo dio la otra persona, pero esta suscripción no es suya todavía.
    expect(pushCapability(env({ permission: 'granted', subscribedHere: false }))).toBe('disponible')
  })
})

describe('la clave pública, de base64url a bytes', () => {
  /** Un punto P-256 válido: 0x04 y 64 bytes más, en base64url sin relleno. */
  const valida = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 7)]).toString('base64url')

  it('acepta una clave de 65 bytes que empieza por 0x04', () => {
    const bytes = vapidKeyToBytes(valida)
    expect(bytes).not.toBeNull()
    expect(bytes!.length).toBe(65)
    expect(bytes![0]).toBe(0x04)
  })

  it('devuelve null en vez de lanzar cuando está mal', () => {
    // Una clave mal copiada en una variable de entorno no puede tumbar una
    // pantalla: solo hace que no se ofrezcan avisos.
    for (const mala of [
      '',
      '   ',
      'no-es-base64url!!',
      Buffer.alloc(65, 1).toString('base64url'), // 65 bytes pero no empieza por 0x04
      Buffer.concat([Buffer.from([0x04]), Buffer.alloc(32, 7)]).toString('base64url'), // corta
    ]) {
      expect(vapidKeyToBytes(mala), JSON.stringify(mala)).toBeNull()
    }
  })

  it('acepta la forma sin relleno, que es como se publica', () => {
    expect(valida.includes('=')).toBe(false)
    expect(vapidKeyToBytes(valida)).not.toBeNull()
  })
})

describe('los textos', () => {
  it('cada «no se puede» dice que la campana sigue (BR-V01)', () => {
    // Es la regla que impide que un mensaje de error se lea como «te vas a
    // quedar sin enterarte»: el aviso interno es obligatorio y se ve al entrar.
    for (const [causa, texto] of Object.entries(PUSH_COPY.blocked)) {
      expect(texto, causa).toContain('La campana te sigue avisando')
    }
  })

  it('no se nombra ninguna palabra técnica (Anexo A)', () => {
    const todos = [
      PUSH_COPY.title,
      PUSH_COPY.description,
      PUSH_COPY.enable,
      PUSH_COPY.enabled,
      PUSH_COPY.disable,
      PUSH_COPY.disabled,
      PUSH_COPY.failed,
      ...Object.values(PUSH_COPY.blocked),
    ]
      .join(' ')
      .toLowerCase()

    for (const prohibida of ['push', 'notificación', 'suscripción', 'token', 'endpoint']) {
      expect(todos, prohibida).not.toContain(prohibida)
    }
  })

  it('se habla SIEMPRE de este dispositivo, no de la cuenta', () => {
    // Activar en el teléfono no activa en el computador, y en un móvil
    // compartido activar cambia de dueño la suscripción.
    expect(PUSH_COPY.title).toContain('este dispositivo')
    expect(PUSH_COPY.description).toContain('este dispositivo')
    expect(PUSH_COPY.enabled).toContain('Este dispositivo')
    expect(PUSH_COPY.disabled).toContain('Este dispositivo')
  })
})
