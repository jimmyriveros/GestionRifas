import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  createVerify,
} from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  buildVapidAuthorization,
  classifyPushResponse,
  deriveContentKeys,
  encryptPushPayload,
  pushAudience,
} from '@/features/push/webpush'

/**
 * El cifrado, contra los VECTORES DEL PROPIO RFC (BR-V03, D-187, D-191).
 *
 * Este archivo es el criterio de aceptación que `TESTING` §4.8 escribió **antes
 * de construir nada**: «unitarias contra los vectores de prueba del RFC 8291 y
 * la firma VAPID contra los del RFC 8292. Sin esto, la implementación propia no
 * se acepta».
 *
 * La razón es concreta. Una implementación de criptografía puede estar
 * perfectamente equivocada y parecer correcta: cifra, descifra consigo misma y
 * no se queja de nada — y ningún teléfono del mundo puede leer lo que produce.
 * Probarla contra sí misma no demuestra nada. Los valores intermedios que el
 * RFC publica sí.
 */

/** RFC 8291 §5 — «Push Message Encryption Example», tal como está publicado. */
const RFC8291 = {
  plaintext: 'When I grow up, I want to be a watermelon',
  devicePublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  devicePrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  serverPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  serverPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  // Los tres valores intermedios que el RFC publica, y que son los que de
  // verdad demuestran que el calendario de claves es el suyo y no otro.
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
} as const

const b64 = (value: string) => Buffer.from(value, 'base64url')

describe('RFC 8291 — el calendario de claves es el del RFC', () => {
  it('IKM, CEK y NONCE salen idénticos a los publicados', () => {
    const claves = deriveContentKeys({
      senderPrivate: b64(RFC8291.serverPrivate),
      serverPublic: b64(RFC8291.serverPublic),
      devicePublic: b64(RFC8291.devicePublic),
      peerPublic: b64(RFC8291.devicePublic),
      authSecret: b64(RFC8291.authSecret),
      salt: b64(RFC8291.salt),
    })

    expect(claves.ikm.toString('base64url')).toBe(RFC8291.ikm)
    expect(claves.cek.toString('base64url')).toBe(RFC8291.cek)
    expect(claves.nonce.toString('base64url')).toBe(RFC8291.nonce)
  })

  it('los dos lados derivan el MISMO IKM, que es lo que hace que funcione', () => {
    const emisor = deriveContentKeys({
      senderPrivate: b64(RFC8291.serverPrivate),
      serverPublic: b64(RFC8291.serverPublic),
      devicePublic: b64(RFC8291.devicePublic),
      peerPublic: b64(RFC8291.devicePublic),
      authSecret: b64(RFC8291.authSecret),
      salt: b64(RFC8291.salt),
    })
    const receptor = deriveContentKeys({
      senderPrivate: b64(RFC8291.devicePrivate),
      serverPublic: b64(RFC8291.serverPublic),
      devicePublic: b64(RFC8291.devicePublic),
      // El dispositivo hace ECDH contra la pública del servidor; el `info`, en
      // cambio, lleva las dos claves en el mismo orden para los dos.
      peerPublic: b64(RFC8291.serverPublic),
      authSecret: b64(RFC8291.authSecret),
      salt: b64(RFC8291.salt),
    })

    expect(emisor.ikm.equals(receptor.ikm)).toBe(true)
  })
})

describe('RFC 8188 — la forma del cuerpo', () => {
  const cifrado = encryptPushPayload({
    plaintext: RFC8291.plaintext,
    p256dh: RFC8291.devicePublic,
    auth: RFC8291.authSecret,
    salt: b64(RFC8291.salt),
    senderKeys: {
      privateKey: b64(RFC8291.serverPrivate),
      publicKey: b64(RFC8291.serverPublic),
    },
  })

  it('empieza por la cabecera del RFC: salt, tamaño de registro y la clave', () => {
    const { body } = cifrado
    expect(body.subarray(0, 16).toString('base64url')).toBe(RFC8291.salt)
    expect(body.readUInt32BE(16)).toBe(4096)
    expect(body.readUInt8(20)).toBe(65)
    expect(body.subarray(21, 86).toString('base64url')).toBe(RFC8291.serverPublic)
  })

  it('el registro termina con el delimitador 0x02 del ÚLTIMO registro', () => {
    // Se comprueba descifrando: el byte de relleno tiene que ser el 0x02, y no
    // el 0x01, que le diría al dispositivo que espere otro registro.
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(b64(RFC8291.devicePrivate))

    const { cek, nonce } = deriveContentKeys({
      senderPrivate: b64(RFC8291.devicePrivate),
      serverPublic: b64(RFC8291.serverPublic),
      devicePublic: b64(RFC8291.devicePublic),
      peerPublic: b64(RFC8291.serverPublic),
      authSecret: b64(RFC8291.authSecret),
      salt: b64(RFC8291.salt),
    })

    const ciphertext = cifrado.body.subarray(86)
    const decipher = createDecipheriv('aes-128-gcm', cek, nonce)
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
    const claro = Buffer.concat([
      decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
      decipher.final(),
    ])

    expect(claro[claro.length - 1]).toBe(0x02)
    expect(claro.subarray(0, claro.length - 1).toString('utf8')).toBe(RFC8291.plaintext)
  })

  it('DOS envíos del mismo texto producen cuerpos distintos', () => {
    // El salt y el par efímero son aleatorios por mensaje. Si dos envíos
    // iguales dieran el mismo cuerpo, se estarían reutilizando, que es
    // exactamente lo que no se puede hacer con AES-GCM.
    const uno = encryptPushPayload({
      plaintext: 'hola',
      p256dh: RFC8291.devicePublic,
      auth: RFC8291.authSecret,
    })
    const dos = encryptPushPayload({
      plaintext: 'hola',
      p256dh: RFC8291.devicePublic,
      auth: RFC8291.authSecret,
    })
    expect(uno.body.equals(dos.body)).toBe(false)
    expect(uno.serverPublic.equals(dos.serverPublic)).toBe(false)
  })

  it('una clave de dispositivo mal formada se rechaza antes de cifrar', () => {
    for (const malo of [
      { p256dh: 'AAAA', auth: RFC8291.authSecret },
      { p256dh: RFC8291.devicePublic, auth: 'AAAA' },
    ]) {
      expect(() =>
        encryptPushPayload({ plaintext: 'x', ...malo }),
      ).toThrow()
    }
  })
})

describe('RFC 8292 — la cabecera VAPID', () => {
  // Un par generado para la prueba. No es un secreto de nadie.
  const ecdh = createECDH('prime256v1')
  const publicKey = ecdh.generateKeys().toString('base64url')
  const privateKey = ecdh.getPrivateKey().toString('base64url')

  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123'
  const cabecera = buildVapidAuthorization({
    endpoint,
    subject: 'mailto:soporte@ejemplo.com',
    publicKey,
    privateKey,
    now: Date.UTC(2026, 8, 12, 12, 0, 0),
  })

  it('tiene la forma `vapid t=<jwt>, k=<clave>`', () => {
    expect(cabecera.startsWith('vapid t=')).toBe(true)
    expect(cabecera).toContain(`, k=${publicKey}`)
  })

  it('el `aud` es el ORIGEN del endpoint, no el endpoint entero', () => {
    // Mandar el endpoint completo como `aud` es el otro error clásico: revela
    // la dirección del dispositivo en un token que viaja en cada envío, y
    // varios servicios lo rechazan.
    const jwt = /vapid t=([^,]+)/.exec(cabecera)![1]!
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8'))
    expect(payload.aud).toBe('https://fcm.googleapis.com')
    expect(pushAudience(endpoint)).toBe('https://fcm.googleapis.com')
    expect(payload.sub).toBe('mailto:soporte@ejemplo.com')
  })

  it('caduca en 12 horas, no en 24', () => {
    const jwt = /vapid t=([^,]+)/.exec(cabecera)![1]!
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8'))
    expect(payload.exp).toBe(Math.floor(Date.UTC(2026, 8, 12, 12, 0, 0) / 1000) + 12 * 60 * 60)
  })

  /**
   * LA PRUEBA QUE DE VERDAD IMPORTA de esta sección.
   *
   * Node firma ECDSA en DER por defecto, y un JWT con firma DER lo rechazan
   * TODOS los servicios de push con un 401 que no explica nada. Verificar con
   * `ieee-p1363` comprueba que la firma son 64 bytes en crudo, `r || s`.
   */
  it('la firma es `r || s` en crudo, y verifica con la clave pública', () => {
    const jwt = /vapid t=([^,]+)/.exec(cabecera)![1]!
    const [header, payload, signature] = jwt.split('.')
    expect(Buffer.from(signature!, 'base64url')).toHaveLength(64)

    const pub = Buffer.from(publicKey, 'base64url')
    const key = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: pub.subarray(1, 33).toString('base64url'),
        y: pub.subarray(33, 65).toString('base64url'),
      },
      format: 'jwk',
    })

    const verifier = createVerify('SHA256')
    verifier.update(`${header}.${payload}`)
    verifier.end()
    expect(
      verifier.verify(
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature!, 'base64url'),
      ),
    ).toBe(true)
  })

  it('la cabecera declara ES256, que es lo único que acepta el RFC', () => {
    const jwt = /vapid t=([^,]+)/.exec(cabecera)![1]!
    const header = JSON.parse(Buffer.from(jwt.split('.')[0]!, 'base64url').toString('utf8'))
    expect(header).toEqual({ typ: 'JWT', alg: 'ES256' })
  })
})

describe('qué se hace con cada respuesta del servicio de push (BR-V07)', () => {
  it('un 404 o un 410 matan la suscripción, y NO se reintentan', () => {
    for (const status of [404, 410]) {
      expect(classifyPushResponse(status).kind).toBe('gone')
    }
  })

  it('un 429 y los 5xx se reintentan', () => {
    for (const status of [429, 500, 502, 503]) {
      expect(classifyPushResponse(status).kind).toBe('retry')
    }
  })

  it('un 400, un 401 o un 403 son culpa nuestra: no se insiste', () => {
    // Reintentar en bucle contra un servicio ajeno por un error propio es peor
    // que parar y dejar el motivo escrito.
    for (const status of [400, 401, 403]) {
      const outcome = classifyPushResponse(status)
      expect(outcome.kind).toBe('failed')
      expect(outcome.kind === 'failed' && outcome.reason).toContain(String(status))
    }
  })

  it('un 201 es un envío', () => {
    expect(classifyPushResponse(201).kind).toBe('sent')
    expect(classifyPushResponse(200).kind).toBe('sent')
  })
})
