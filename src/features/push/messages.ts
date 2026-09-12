/**
 * Lo que se lee en la pantalla de un teléfono cuando llega un aviso
 * (BR-V05, D-191).
 *
 * **VIVE EN TYPESCRIPT Y NO EN LA BASE DE DATOS**, por lo mismo que el texto de
 * la campanita (I-030, D-093): la cola guarda **solo el tipo** de aviso, y la
 * frase se compone aquí al enviar. Así, mejorar una redacción es cambiar este
 * archivo, no aplicar una migración a producción — y, sobre todo, **no hay nada
 * personal que pueda escaparse por la cola**, porque la cola no lo tiene.
 *
 * EL AVISO ES GENÉRICO, Y ESA ES SU REGLA ENTERA. Se lee en una pantalla
 * bloqueada, en un teléfono que puede estar en la mano de otra persona: **ni
 * cuentas, ni números de cuenta, ni el mensaje del vendedor, ni nombres de
 * clientes, ni importes, ni saldos**. Dice que hay algo y a dónde ir; el
 * contenido se compone al abrir la aplicación, con sesión.
 *
 * PURO a propósito: ni sesión, ni base de datos, ni red. Se prueba como una
 * función, y hay una prueba que falla si alguien mete aquí un dato de alguien.
 */

export type PushMessage = {
  title: string
  body: string
  /** Ruta interna. El service worker comprueba que sea del mismo origen. */
  url: string
  /** Agrupa los repetidos: dos avisos iguales no llenan la pantalla. */
  tag: string
}

/** Lo que se manda cuando el tipo de aviso no lo conoce esta versión. */
const GENERICO: PushMessage = {
  title: 'Rifas',
  body: 'Tienes un aviso nuevo. Ábrelo para verlo.',
  url: '/',
  tag: 'rifas',
}

/**
 * El aviso de cada tipo. Hoy solo hay uno que salga del navegador.
 *
 * Nótese que **no recibe ningún dato**: no hay forma de que el nombre de un
 * cliente o un importe acabe aquí, porque la función no los ve. Es la misma
 * idea que hizo que las cuentas se añadieran solas al mensaje en vez de por un
 * marcador (BR-S07): lo que no existe no se puede romper.
 */
export function pushMessageFor(kind: string): PushMessage {
  switch (kind) {
    case 'payment_reminder.due':
      return {
        title: 'Es hora de tu recordatorio',
        body: 'Abre Rifas para copiar el mensaje de cobro y pegarlo en tu grupo.',
        url: '/seller/settings/reminders',
        tag: 'payment-reminder',
      }
    default:
      return GENERICO
  }
}

/** El cuerpo cifrado que viaja: exactamente lo que el service worker sabe leer. */
export function pushPayloadJson(kind: string): string {
  return JSON.stringify(pushMessageFor(kind))
}
