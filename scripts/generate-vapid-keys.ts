/**
 * Genera un par de claves VAPID para los avisos del teléfono (D-187, D-190).
 *
 *   npm run vapid
 *
 * NO ESCRIBE NINGÚN ARCHIVO, a propósito: imprime el par y ahí termina. Un
 * guion que escribiera la clave privada en el disco dejaría un secreto en un
 * sitio que nadie vuelve a mirar, y este proyecto ya tiene la regla de no
 * versionar secretos (`SECURITY` §7).
 *
 * SIN DEPENDENCIAS. Es el `crypto` de Node, que es exactamente lo que D-187
 * eligió para todo este canal: sin `web-push`, sin SDK y sin Firebase.
 *
 * QUÉ ES CADA UNA
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  Pública. Viaja al navegador y ahí tiene que
 *                                 estar: es lo que ata cada suscripción a este
 *                                 servidor. Sin ella no se ofrecen avisos.
 *   VAPID_PRIVATE_KEY             SECRETA. Firma cada envío. NO la usa nada
 *                                 todavía: es de la Etapa 5. Guárdala igual, el
 *                                 par no se puede reconstruir a medias.
 *
 * ⚠️ CAMBIAR EL PAR INVALIDA TODAS LAS SUSCRIPCIONES EXISTENTES. Cada navegador
 * ató la suya a la clave pública que le dimos, así que el servicio de push
 * rechazará los envíos firmados con otra. No es una catástrofe —la campana
 * interna no depende de esto (BR-V01) y las suscripciones muertas se limpian
 * solas por el 404/410 de BR-V07— pero cada persona tendría que volver a activar
 * los avisos en su dispositivo. Se genera una vez y se conserva.
 */
import { generateKeyPairSync } from 'node:crypto'

type EcJwk = { x?: string; y?: string; d?: string }

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })

const pub = publicKey.export({ format: 'jwk' }) as EcJwk
const priv = privateKey.export({ format: 'jwk' }) as EcJwk

if (!pub.x || !pub.y || !priv.d) {
  console.error('No se pudo generar el par de claves: la exportación JWK vino incompleta.')
  process.exit(1)
}

// La clave pública que espera el navegador es el punto P-256 SIN COMPRIMIR: el
// byte 0x04 seguido de las dos coordenadas de 32 bytes. No es el JWK ni el DER.
const uncompressed = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(pub.x, 'base64url'),
  Buffer.from(pub.y, 'base64url'),
])

if (uncompressed.length !== 65) {
  console.error(`El punto público mide ${uncompressed.length} bytes y debería medir 65.`)
  process.exit(1)
}

console.log('Par de claves VAPID generado.\n')
console.log('Copia esto en .env.local (y en Vercel, cuando se promueva):\n')
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${uncompressed.toString('base64url')}"`)
console.log(`VAPID_PRIVATE_KEY="${priv.d}"`)
console.log('\nLa privada es un secreto: no la pegues en un chat, en un ticket ni en un commit.')
console.log('La usa el despachador de la Etapa 5; hoy todavía no la lee nadie.')
