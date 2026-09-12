import 'server-only'

import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createSign,
  hkdfSync,
  randomBytes,
} from 'node:crypto'

/**
 * Web Push estándar, sobre el `crypto` de Node y sin una sola dependencia
 * (BR-V03, D-187 Decisión 1, D-191).
 *
 * Son dos cosas distintas y conviene no confundirlas nunca:
 *
 *   1. **VAPID** (RFC 8292): quién manda. Un JWT firmado con ES256 por la clave
 *      privada del servidor, que el servicio de push comprueba contra la clave
 *      pública a la que el navegador ató su suscripción.
 *   2. **El cifrado del cuerpo** (RFC 8291, sobre RFC 8188): qué se manda. Solo
 *      el dispositivo puede leerlo; ni el servicio de push ni nadie por el
 *      camino.
 *
 * **DOS PARES DE CLAVES, y mezclarlos es el error clásico.** El par VAPID es
 * FIJO, vive en el entorno y su pública viaja en la cabecera `Authorization`. El
 * par de cifrado es EFÍMERO: uno nuevo por mensaje, y su pública viaja dentro
 * del cuerpo, en la cabecera del registro.
 *
 * **Por qué se implementa en vez de instalar `web-push`.** Lo decidió D-187 y no
 * es gratis: son estas ~200 líneas. A cambio, cero dependencias nuevas en la
 * cadena de suministro para algo que toca claves, y una CSP que no se abre. El
 * precio se paga con pruebas: el calendario de claves se comprueba contra los
 * **valores publicados en el propio RFC 8291 §5**, no contra sí mismo.
 */

/** Tamaño de registro del RFC 8188. Uno solo por mensaje: los nuestros son cortos. */
const RECORD_SIZE = 4096

/** Un punto P-256 sin comprimir: `0x04` y dos coordenadas de 32 bytes. */
const PUBLIC_KEY_BYTES = 65

/** El secreto de autenticación del RFC 8291. */
const AUTH_SECRET_BYTES = 16

const INFO_WEBPUSH = Buffer.from('WebPush: info\0', 'utf8')
const INFO_CEK = Buffer.from('Content-Encoding: aes128gcm\0', 'utf8')
const INFO_NONCE = Buffer.from('Content-Encoding: nonce\0', 'utf8')

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, salt, info, length))
}

/**
 * El calendario de claves del RFC 8291 §3.4.
 *
 * Es la parte que hay que clavar: un byte de diferencia en cualquiera de los
 * tres `info` produce claves que parecen correctas y que ningún dispositivo
 * puede descifrar. Se exporta **solo para poder probarla** contra los valores
 * que el RFC publica.
 *
 * Nótese que `info` lleva las dos claves públicas SIEMPRE en el mismo orden
 * —primero la del dispositivo, después la del servidor—, independientemente de
 * quién cifre: por eso los dos lados derivan el mismo `IKM`.
 */
export function deriveContentKeys(input: {
  /** Privada de quien cifra. */
  senderPrivate: Buffer
  /** Pública del servidor, tal como viaja en el cuerpo. */
  serverPublic: Buffer
  /** Pública del dispositivo (`p256dh`). */
  devicePublic: Buffer
  /** La pública del OTRO lado, para el ECDH. */
  peerPublic: Buffer
  /** El `auth` de la suscripción. */
  authSecret: Buffer
  salt: Buffer
}): { ikm: Buffer; cek: Buffer; nonce: Buffer } {
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(input.senderPrivate)
  const shared = ecdh.computeSecret(input.peerPublic)

  const info = Buffer.concat([INFO_WEBPUSH, input.devicePublic, input.serverPublic])
  const ikm = hkdf(input.authSecret, shared, info, 32)

  return {
    ikm,
    cek: hkdf(input.salt, ikm, INFO_CEK, 16),
    nonce: hkdf(input.salt, ikm, INFO_NONCE, 12),
  }
}

export type EncryptedPush = {
  /** El cuerpo completo: cabecera del RFC 8188 y un registro cifrado. */
  body: Buffer
  /** La pública efímera que se usó. Va dentro del cuerpo, no en una cabecera. */
  serverPublic: Buffer
}

/**
 * Cifra el cuerpo de un aviso para un dispositivo concreto (RFC 8291).
 *
 * `salt` y `senderKeys` se pueden inyectar **solo para las pruebas**: en
 * producción los dos son aleatorios por mensaje, que es lo que hace que dos
 * envíos del mismo texto no produzcan el mismo cuerpo.
 */
export function encryptPushPayload(input: {
  plaintext: string
  /** `p256dh` de la suscripción, en base64url. */
  p256dh: string
  /** `auth` de la suscripción, en base64url. */
  auth: string
  salt?: Buffer
  senderKeys?: { privateKey: Buffer; publicKey: Buffer }
}): EncryptedPush {
  const devicePublic = Buffer.from(input.p256dh, 'base64url')
  const authSecret = Buffer.from(input.auth, 'base64url')

  if (devicePublic.length !== PUBLIC_KEY_BYTES || devicePublic[0] !== 0x04) {
    throw new Error('La clave pública del dispositivo no es un punto P-256 sin comprimir.')
  }
  if (authSecret.length !== AUTH_SECRET_BYTES) {
    throw new Error('El secreto de autenticación del dispositivo no mide 16 bytes.')
  }

  const salt = input.salt ?? randomBytes(16)

  let senderPrivate: Buffer
  let serverPublic: Buffer
  if (input.senderKeys) {
    senderPrivate = input.senderKeys.privateKey
    serverPublic = input.senderKeys.publicKey
  } else {
    const ecdh = createECDH('prime256v1')
    serverPublic = ecdh.generateKeys()
    senderPrivate = ecdh.getPrivateKey()
  }

  const { cek, nonce } = deriveContentKeys({
    senderPrivate,
    serverPublic,
    devicePublic,
    peerPublic: devicePublic,
    authSecret,
    salt,
  })

  // RFC 8188: el registro termina con un delimitador de relleno. `0x02` marca
  // el ÚLTIMO registro; `0x01` marcaría que viene otro.
  const record = Buffer.concat([Buffer.from(input.plaintext, 'utf8'), Buffer.from([0x02])])

  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()])

  // Cabecera del RFC 8188: salt(16) + tamaño de registro(4) + largo del id(1) +
  // el id, que aquí es la clave pública efímera.
  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header.writeUInt8(serverPublic.length, 20)

  return { body: Buffer.concat([header, serverPublic, ciphertext]), serverPublic }
}

/**
 * La clave privada VAPID como objeto de Node, a partir de las dos mitades que
 * guarda el entorno.
 *
 * Se arma un JWK porque es la única forma de construir una privada EC desde el
 * escalar en crudo sin montar DER a mano: `d` es el escalar y `x`/`y` salen de
 * la pública, que también tenemos.
 */
function vapidPrivateKey(publicKey: string, privateKey: string) {
  const pub = Buffer.from(publicKey, 'base64url')
  if (pub.length !== PUBLIC_KEY_BYTES || pub[0] !== 0x04) {
    throw new Error('La clave pública VAPID no es un punto P-256 sin comprimir.')
  }
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: pub.subarray(1, 33).toString('base64url'),
      y: pub.subarray(33, 65).toString('base64url'),
      d: privateKey,
    },
    format: 'jwk',
  })
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

/** El origen del endpoint, que es lo que el RFC 8292 llama `aud`. */
export function pushAudience(endpoint: string): string {
  return new URL(endpoint).origin
}

/**
 * La cabecera `Authorization` del RFC 8292.
 *
 * **La firma va en crudo, `r || s`, no en DER.** Node firma ECDSA en DER por
 * defecto, y un JWT con una firma DER es rechazado por todos los servicios de
 * push con un 401 que no explica nada. De ahí `dsaEncoding: 'ieee-p1363'`.
 *
 * `exp` se acota a 12 horas: el RFC permite 24 y no hay ninguna razón para
 * emitir un pase más largo del que hace falta.
 */
export function buildVapidAuthorization(input: {
  endpoint: string
  /** `mailto:` o `https:` de contacto, que el RFC exige. */
  subject: string
  publicKey: string
  privateKey: string
  now?: number
}): string {
  const now = input.now ?? Date.now()
  const header = base64urlJson({ typ: 'JWT', alg: 'ES256' })
  const payload = base64urlJson({
    aud: pushAudience(input.endpoint),
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: input.subject,
  })

  const signer = createSign('SHA256')
  signer.update(`${header}.${payload}`)
  signer.end()
  const signature = signer.sign({
    key: vapidPrivateKey(input.publicKey, input.privateKey),
    dsaEncoding: 'ieee-p1363',
  })

  return `vapid t=${header}.${payload}.${signature.toString('base64url')}, k=${input.publicKey}`
}

/**
 * Qué hacer con la respuesta del servicio de push (BR-V07).
 *
 * Es una función pura y se prueba como tal, porque es la que decide si una
 * suscripción muere o si el aviso se vuelve a intentar, y equivocarse tiene dos
 * costes opuestos: revocar de más deja a alguien sin avisos para siempre;
 * reintentar de más machaca a un servicio que ya dijo que no.
 */
export type PushOutcome =
  | { kind: 'sent' }
  /** La suscripción murió: se revoca y NO se reintenta. */
  | { kind: 'gone'; reason: string }
  /** Fallo pasajero: se reintenta con retroceso. */
  | { kind: 'retry'; reason: string }
  /** Fallo nuestro o definitivo: no se reintenta, y se dice por qué. */
  | { kind: 'failed'; reason: string }

export function classifyPushResponse(status: number, statusText = ''): PushOutcome {
  if (status >= 200 && status < 300) return { kind: 'sent' }

  // BR-V07: el dispositivo se borró la aplicación, o la suscripción caducó.
  if (status === 404 || status === 410) {
    return { kind: 'gone', reason: `El servicio de push respondió ${status}.` }
  }

  // Demasiadas peticiones, o el servicio está mal: los dos pasan.
  if (status === 429 || status >= 500) {
    return { kind: 'retry', reason: `El servicio de push respondió ${status}.` }
  }

  // 400, 401, 403: el cuerpo o la firma están mal. Reintentar no lo arregla, y
  // hacerlo en bucle contra un servicio ajeno es peor que parar y dejar rastro.
  const detalle = statusText ? ` ${statusText}` : ''
  return { kind: 'failed', reason: `El servicio de push respondió ${status}.${detalle}`.trim() }
}

/**
 * Manda un aviso a un dispositivo. Es lo único de este archivo que toca la red.
 *
 * **No lanza.** Un fallo de red es un resultado más —`retry`—, porque el que
 * llama tiene que poder anotarlo en la outbox y seguir con el siguiente
 * dispositivo (BR-V02).
 */
export async function sendPushMessage(input: {
  endpoint: string
  p256dh: string
  auth: string
  payload: string
  vapid: { publicKey: string; privateKey: string; subject: string }
  ttlSeconds?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<PushOutcome> {
  let body: Buffer
  let authorization: string
  try {
    body = encryptPushPayload({
      plaintext: input.payload,
      p256dh: input.p256dh,
      auth: input.auth,
    }).body
    authorization = buildVapidAuthorization({
      endpoint: input.endpoint,
      subject: input.vapid.subject,
      publicKey: input.vapid.publicKey,
      privateKey: input.vapid.privateKey,
    })
  } catch (error) {
    // Claves mal formadas: ni es culpa del dispositivo ni lo arregla insistir.
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : 'No se pudo preparar el aviso.',
    }
  }

  const doFetch = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000)

  try {
    const response = await doFetch(input.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(input.ttlSeconds ?? 3600),
        Urgency: 'normal',
      },
      // `Uint8Array` y no `Buffer`: es lo que `fetch` acepta sin copiar.
      body: new Uint8Array(body),
      signal: controller.signal,
      cache: 'no-store',
    })
    return classifyPushResponse(response.status, response.statusText)
  } catch {
    // Sin red, DNS caído o tiempo agotado. La campana sigue estando (BR-V01).
    return { kind: 'retry', reason: 'No se pudo contactar al servicio de push.' }
  } finally {
    clearTimeout(timeout)
  }
}
