import { describe, expect, it } from 'vitest'

import {
  authorizePushDispatch,
  configuredPushSecret,
  configuredVapid,
  presentedPushSecret,
  PUSH_DISPATCH_SECRET_MIN_LENGTH,
} from '@/features/push/auth'
import { decideOutboxOutcome } from '@/features/push/dispatch'
import { pushMessageFor, pushPayloadJson } from '@/features/push/messages'

/**
 * El despachador: quién puede llamarlo, qué decide y qué dice
 * (BR-V05, BR-V07, BR-V08; D-191).
 */

describe('quién puede despertar al despachador (BR-V08)', () => {
  const secreto = 'un-secreto-suficientemente-largo'

  it('lee Bearer y la cabecera propia; NUNCA la URL', () => {
    // Un secreto en la query string acaba en los registros del servidor, en los
    // del proxy y en el historial. Que no se lea es media defensa: la otra es
    // que nadie lo mande ahí.
    expect(
      presentedPushSecret(new Request('https://x/api/push/dispatch', {
        headers: { authorization: `Bearer ${secreto}` },
      })),
    ).toBe(secreto)

    expect(
      presentedPushSecret(new Request('https://x/api/push/dispatch', {
        headers: { 'x-push-dispatch-secret': secreto },
      })),
    ).toBe(secreto)

    expect(
      presentedPushSecret(new Request(`https://x/api/push/dispatch?secret=${secreto}`)),
    ).toBeNull()
  })

  it('falla cerrado: sin secreto configurado no autoriza a nadie', () => {
    expect(
      authorizePushDispatch({ presented: secreto, expected: null, ip: '1.1.1.1' }).ok,
    ).toBe(false)
  })

  it('un secreto configurado demasiado corto es como no tener ninguno', () => {
    const corto = 'a'.repeat(PUSH_DISPATCH_SECRET_MIN_LENGTH - 1)
    expect(configuredPushSecret({ PUSH_DISPATCH_SECRET: corto })).toBeNull()
    expect(
      configuredPushSecret({ PUSH_DISPATCH_SECRET: 'a'.repeat(PUSH_DISPATCH_SECRET_MIN_LENGTH) }),
    ).not.toBeNull()
  })

  it('acepta CRON_SECRET cuando no hay una propia', () => {
    expect(configuredPushSecret({ CRON_SECRET: secreto })).toBe(secreto)
    // Y la propia manda sobre la compartida.
    expect(
      configuredPushSecret({ PUSH_DISPATCH_SECRET: secreto, CRON_SECRET: 'otra-cosa-larga-aqui' }),
    ).toBe(secreto)
  })

  it('un secreto incorrecto y uno ausente responden lo MISMO', () => {
    // Distinguirlos le diría a quien prueba si acertó la mitad del camino.
    const ausente = authorizePushDispatch({ presented: null, expected: secreto, ip: '2.2.2.2' })
    const malo = authorizePushDispatch({ presented: 'otro', expected: secreto, ip: '2.2.2.2' })
    expect(ausente).toEqual(malo)
  })

  it('el correcto sí autoriza', () => {
    expect(authorizePushDispatch({ presented: secreto, expected: secreto }).ok).toBe(true)
  })

  it('el goteo se corta con 429, y con su PROPIO cupo', () => {
    // Cupo propio: un goteo contra el despachador no puede cerrar el de
    // loterías, ni al revés.
    const ip = `aislado-${Math.random()}`
    let ultimo = authorizePushDispatch({ presented: 'malo', expected: secreto, ip })
    for (let i = 0; i < 25; i += 1) {
      ultimo = authorizePushDispatch({ presented: 'malo', expected: secreto, ip })
    }
    expect(ultimo).toEqual({ ok: false, status: 429 })
  })
})

describe('las claves VAPID del envío', () => {
  const publicKey = 'B'.repeat(86)
  const privateKey = 'p'.repeat(43)

  it('sin una de las dos, no se envía nada', () => {
    expect(configuredVapid({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey })).toBeNull()
    expect(configuredVapid({ VAPID_PRIVATE_KEY: privateKey })).toBeNull()
    expect(configuredVapid({})).toBeNull()
  })

  it('con las dos, y un contacto que el RFC acepta', () => {
    const vapid = configuredVapid({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey,
      VAPID_PRIVATE_KEY: privateKey,
      VAPID_SUBJECT: 'mailto:soporte@ejemplo.com',
    })
    expect(vapid?.subject).toBe('mailto:soporte@ejemplo.com')
  })

  it('sin contacto configurado usa la dirección del sitio, no un correo inventado', () => {
    const vapid = configuredVapid({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey,
      VAPID_PRIVATE_KEY: privateKey,
      NEXT_PUBLIC_SITE_URL: 'https://rifas.example.com',
    })
    expect(vapid?.subject).toBe('https://rifas.example.com')
  })

  it('un contacto que el RFC no acepta apaga el envío', () => {
    // El RFC 8292 exige `mailto:` o `https:`. Mandar otra cosa produce un 403
    // que no explica nada, así que se prefiere no enviar y decirlo.
    expect(
      configuredVapid({
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey,
        VAPID_PRIVATE_KEY: privateKey,
        VAPID_SUBJECT: 'soporte@ejemplo.com',
      }),
    ).toBeNull()
  })
})

describe('qué se hace con una fila, vistos todos sus dispositivos (BR-V07)', () => {
  it('basta con que UNO lo acepte', () => {
    // Quien tiene el teléfono y el computador registrados ya se enteró.
    // Reintentar el lote porque el segundo falló le repetiría el aviso.
    expect(
      decideOutboxOutcome([{ kind: 'sent' }, { kind: 'retry', reason: 'x' }]),
    ).toEqual({ status: 'sent' })
  })

  it('si alguno se puede reintentar, se reintenta', () => {
    const decision = decideOutboxOutcome([
      { kind: 'gone', reason: '410' },
      { kind: 'retry', reason: 'el servicio respondió 503' },
    ])
    expect(decision).toEqual({
      status: 'failed',
      reason: 'el servicio respondió 503',
      retryable: true,
    })
  })

  it('si todos murieron, NO se reintenta: ya se revocaron', () => {
    const decision = decideOutboxOutcome([{ kind: 'gone', reason: 'El servicio respondió 410.' }])
    expect(decision.status).toBe('failed')
    expect(decision.status === 'failed' && decision.retryable).toBe(false)
  })

  it('sin ningún dispositivo, se cierra y no se insiste', () => {
    // Una fila cuyo dueño quitó todos sus teléfonos entre encolar y enviar. Sin
    // esto se quedaría dando vueltas cada pocos minutos para nada.
    const decision = decideOutboxOutcome([])
    expect(decision.status).toBe('failed')
    expect(decision.status === 'failed' && decision.retryable).toBe(false)
    expect(decision.status === 'failed' && decision.reason).toContain('dispositivo')
  })

  it('un fallo definitivo tampoco se reintenta', () => {
    const decision = decideOutboxOutcome([{ kind: 'failed', reason: 'El servicio respondió 400.' }])
    expect(decision.status === 'failed' && decision.retryable).toBe(false)
  })
})

describe('lo que se lee en el teléfono (BR-V05)', () => {
  it('el recordatorio dice que hay algo y a dónde ir, y nada más', () => {
    const mensaje = pushMessageFor('payment_reminder.due')
    expect(mensaje.title).toBe('Es hora de tu recordatorio')
    expect(mensaje.url).toBe('/seller/settings/reminders')
    expect(mensaje.tag).toBe('payment-reminder')
  })

  /**
   * LA PRUEBA QUE SOSTIENE BR-V05.
   *
   * `pushMessageFor` **no recibe ningún dato**, así que no hay forma de que el
   * nombre de un cliente o un importe acabe dentro. Esto lo comprueba desde
   * fuera: si alguien le añadiera un parámetro mañana para «personalizarlo», la
   * firma cambiaría y esta prueba se caería.
   */
  it('la función no acepta ningún dato de nadie', () => {
    expect(pushMessageFor.length).toBe(1)
  })

  it('el aviso no lleva cuentas, ni importes, ni clientes, ni saldos', () => {
    const todo = Object.values(pushMessageFor('payment_reminder.due')).join(' ').toLowerCase()
    for (const prohibido of ['$', 'cuenta', 'cliente', 'saldo', 'abonad', 'nequi', 'daviplata']) {
      expect(todo, prohibido).not.toContain(prohibido)
    }
  })

  it('un tipo desconocido no rompe nada: dice algo honesto', () => {
    const mensaje = pushMessageFor('algo.que.no.existe')
    expect(mensaje.title).toBe('Rifas')
    expect(mensaje.url).toBe('/')
  })

  it('el cuerpo que viaja es exactamente lo que el service worker sabe leer', () => {
    const payload = JSON.parse(pushPayloadJson('payment_reminder.due'))
    expect(Object.keys(payload).sort()).toEqual(['body', 'tag', 'title', 'url'])
  })
})
