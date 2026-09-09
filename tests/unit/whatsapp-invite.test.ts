import { describe, expect, it } from 'vitest'

import {
  activeMessageBody,
  buildInviteMessage,
  DEFAULT_INVITE_MESSAGE,
  EMPTY_WHATSAPP_SETTINGS,
  INVITE_DIALOG_COPY,
  inviteBlocker,
  inviteUrl,
  inviteWhatsappNumber,
  isValidGroupUrl,
  type WhatsappSettings,
} from '@/features/whatsapp/invite'
import { normalizeWhatsappNumber, whatsappUrl } from '@/lib/whatsapp'

/**
 * La invitacion al grupo de WhatsApp (BR-W01..BR-W08, D-176).
 *
 * Se prueba el modulo PURO, que es donde viven las decisiones: que enlace se
 * acepta, que mensaje se arma, cuando NO se puede invitar y como queda la
 * direccion final. Lo que no se prueba aqui es la autorizacion —eso es de la
 * base y esta en `tests/db/whatsapp-settings.test.ts`— ni el dialogo, que es de
 * las pruebas E2E.
 */

const CONFIGURED: WhatsappSettings = {
  groupUrl: 'https://chat.whatsapp.com/ABCdef123456',
  useCustomMessage: false,
  customMessage: null,
}

describe('el enlace del grupo', () => {
  it('acepta un enlace de invitacion real', () => {
    expect(isValidGroupUrl('https://chat.whatsapp.com/ABCdef123456')).toBe(true)
  })

  it('acepta la cola que anade el propio WhatsApp al compartir', () => {
    expect(isValidGroupUrl('https://chat.whatsapp.com/ABCdef123456?mode=ac_t')).toBe(true)
  })

  it('no exige una longitud exacta de codigo', () => {
    // WhatsApp los ha emitido de largos distintos. Rechazar manana un enlace
    // legitimo es mucho mas caro que aceptar uno raro.
    expect(isValidGroupUrl('https://chat.whatsapp.com/ABCdef')).toBe(true)
    expect(isValidGroupUrl(`https://chat.whatsapp.com/${'A'.repeat(40)}`)).toBe(true)
  })

  it('perdona los espacios que arrastra el portapapeles', () => {
    expect(isValidGroupUrl('  https://chat.whatsapp.com/ABCdef123456  ')).toBe(true)
  })

  it('rechaza http, otro dominio, un enlace sin codigo y un texto cualquiera', () => {
    expect(isValidGroupUrl('http://chat.whatsapp.com/ABCdef123456')).toBe(false)
    expect(isValidGroupUrl('https://chat.whatsapp.com.evil.test/ABCdef123456')).toBe(false)
    expect(isValidGroupUrl('https://wa.me/573001234567')).toBe(false)
    expect(isValidGroupUrl('https://chat.whatsapp.com/')).toBe(false)
    expect(isValidGroupUrl('mi grupo')).toBe(false)
    expect(isValidGroupUrl('')).toBe(false)
  })
})

describe('que mensaje se usa', () => {
  it('el predeterminado cuando el interruptor esta apagado', () => {
    expect(activeMessageBody(CONFIGURED)).toBe(DEFAULT_INVITE_MESSAGE)
  })

  it('el suyo cuando esta encendido', () => {
    const settings = { ...CONFIGURED, useCustomMessage: true, customMessage: 'Hola, bienvenida.' }
    expect(activeMessageBody(settings)).toBe('Hola, bienvenida.')
  })

  it('apagar el interruptor NO pierde lo que escribio (BR-W03)', () => {
    // El texto sigue guardado; lo unico que cambia es cual se usa. Volver a
    // encenderlo tiene que devolverlo tal cual.
    const guardado = { ...CONFIGURED, useCustomMessage: false, customMessage: 'Mi texto.' }
    expect(activeMessageBody(guardado)).toBe(DEFAULT_INVITE_MESSAGE)
    expect(activeMessageBody({ ...guardado, useCustomMessage: true })).toBe('Mi texto.')
  })

  it('cae al predeterminado antes que mandar un mensaje vacio', () => {
    // El CHECK lo impide en la base; esto es el cinturon para datos escritos a
    // mano o anteriores a la 0050.
    const roto = { ...CONFIGURED, useCustomMessage: true, customMessage: '   ' }
    expect(activeMessageBody(roto)).toBe(DEFAULT_INVITE_MESSAGE)
  })
})

describe('el enlace del grupo se anade solo (BR-W04)', () => {
  it('va al final del mensaje predeterminado', () => {
    const message = buildInviteMessage(CONFIGURED)
    expect(message).toContain(DEFAULT_INVITE_MESSAGE)
    expect(message.endsWith('Únete aquí: https://chat.whatsapp.com/ABCdef123456')).toBe(true)
  })

  it('va al final tambien del mensaje propio, sin que haya que escribirlo', () => {
    const settings = { ...CONFIGURED, useCustomMessage: true, customMessage: 'Hola, gracias.' }
    expect(buildInviteMessage(settings)).toBe(
      'Hola, gracias.\n\nÚnete aquí: https://chat.whatsapp.com/ABCdef123456',
    )
  })

  it('no deja ningun marcador a medio sustituir cuando no hay grupo', () => {
    const message = buildInviteMessage(EMPTY_WHATSAPP_SETTINGS)
    expect(message).toBe(DEFAULT_INVITE_MESSAGE)
    expect(message).not.toContain('{{')
    expect(message).not.toContain('undefined')
    expect(message).not.toContain('null')
  })

  it('el mensaje guardado NUNCA contiene el enlace: el marcador no existe', () => {
    // La prueba de que la decision se sostiene: no hay sintaxis que aprender ni
    // que conservar. Lo unico que se guarda es prosa.
    const settings = { ...CONFIGURED, useCustomMessage: true, customMessage: 'Solo prosa.' }
    expect(activeMessageBody(settings)).not.toContain('chat.whatsapp.com')
    expect(buildInviteMessage(settings)).toContain('chat.whatsapp.com')
  })
})

describe('el telefono del cliente', () => {
  it('completa el indicativo de un movil colombiano', () => {
    expect(inviteWhatsappNumber('3001234567')).toBe('573001234567')
  })

  it('quita el «+», los espacios, los guiones y los parentesis', () => {
    expect(inviteWhatsappNumber('+57 300 123 4567')).toBe('573001234567')
    expect(inviteWhatsappNumber('300-123-4567')).toBe('573001234567')
    expect(inviteWhatsappNumber('(300) 123 4567')).toBe('573001234567')
    expect(inviteWhatsappNumber('+57 (300) 123-4567')).toBe('573001234567')
  })

  it('respeta un numero internacional en vez de romperlo', () => {
    // 34 es España. No se le puede anteponer un 57 «por si acaso».
    expect(inviteWhatsappNumber('+34 612 345 678')).toBe('34612345678')
    expect(inviteWhatsappNumber('12125551234')).toBe('12125551234')
  })

  it('rechaza lo que no sirve para WhatsApp', () => {
    // Un fijo de Bogota de siete cifras PASA el formulario de cliente y no
    // sirve aqui: por eso se vuelve a comprobar.
    expect(inviteWhatsappNumber('2345678')).toBeNull()
    expect(inviteWhatsappNumber('')).toBeNull()
    expect(inviteWhatsappNumber('   ')).toBeNull()
    expect(inviteWhatsappNumber('sin numero')).toBeNull()
  })
})

describe('cuando NO se puede invitar (BR-W05)', () => {
  it('sin grupo configurado, la salida es configurarlo', () => {
    expect(inviteBlocker(EMPTY_WHATSAPP_SETTINGS, '3001234567')).toBe('sin-grupo')
    expect(inviteUrl(EMPTY_WHATSAPP_SETTINGS, '3001234567')).toBeNull()
  })

  it('con un telefono que no sirve, la salida es corregir el cliente', () => {
    expect(inviteBlocker(CONFIGURED, '2345678')).toBe('sin-telefono')
    expect(inviteUrl(CONFIGURED, '2345678')).toBeNull()
  })

  it('sin grupo manda «sin-grupo», aunque el telefono tampoco sirva', () => {
    // Solo se pinta UNA explicacion, y tiene que ser la que la persona puede
    // arreglar desde donde esta.
    expect(inviteBlocker(EMPTY_WHATSAPP_SETTINGS, '2345678')).toBe('sin-grupo')
  })

  it('con todo en orden no hay nada que explicar', () => {
    expect(inviteBlocker(CONFIGURED, '3001234567')).toBeNull()
  })

  it('cada motivo tiene su frase, y ninguna promete lo que no se puede', () => {
    expect(INVITE_DIALOG_COPY.blocked['sin-grupo']).toContain('Configura tu grupo')
    expect(INVITE_DIALOG_COPY.blocked['sin-telefono']).toContain('teléfono')
  })
})

describe('la direccion final', () => {
  it('lleva el telefono normalizado y el mensaje codificado', () => {
    const url = inviteUrl(CONFIGURED, '+57 300 123 4567')
    expect(url).not.toBeNull()
    expect(url!.startsWith('https://wa.me/573001234567?text=')).toBe(true)
  })

  it('codifica el espacio como %20 y no como «+»', () => {
    // WhatsApp muestra el «+» literalmente dentro del mensaje: es la razon por
    // la que `whatsappUrl` usa `encodeURIComponent` y no `URLSearchParams`.
    const url = inviteUrl(CONFIGURED, '3001234567')!
    expect(url).toContain('%20')
    expect(url.split('?text=')[1]).not.toContain('+')
  })

  it('el mensaje viaja entero: al decodificarlo vuelve a salir con su enlace', () => {
    const url = inviteUrl(CONFIGURED, '3001234567')!
    const decoded = decodeURIComponent(url.split('?text=')[1]!)
    expect(decoded).toBe(buildInviteMessage(CONFIGURED))
    expect(decoded).toContain('https://chat.whatsapp.com/ABCdef123456')
  })

  it('sobrevive a los emojis y a los saltos de linea del mensaje', () => {
    const settings = {
      ...CONFIGURED,
      useCustomMessage: true,
      customMessage: '¡Hola! 🎉\nBienvenida al grupo & suerte.',
    }
    const decoded = decodeURIComponent(inviteUrl(settings, '3001234567')!.split('?text=')[1]!)
    expect(decoded).toContain('🎉')
    expect(decoded).toContain('\n')
    expect(decoded).toContain('&')
  })

  it('es exactamente lo que arman los ayudantes compartidos', () => {
    // Un solo punto de construccion: si esto deja de cuadrar es que alguien
    // interpolo la URL por su cuenta en algun sitio.
    expect(inviteUrl(CONFIGURED, '3001234567')).toBe(
      whatsappUrl(normalizeWhatsappNumber('3001234567')!, buildInviteMessage(CONFIGURED)),
    )
  })
})

describe('los dos flujos se dicen distinto (BR-W06)', () => {
  it('desde «Mis clientes» no se menciona ninguna boleta', () => {
    const body = INVITE_DIALOG_COPY.clientOnly.body('Juan Pérez')
    expect(body).toContain('Juan Pérez')
    expect(body.toLowerCase()).not.toContain('boleta')
  })

  it('desde una boleta se nombra por sus DOS numeros (BR-N11)', () => {
    const body = INVITE_DIALOG_COPY.withTickets.body('Juan Pérez', '1234 / 5678', 1)
    expect(body).toContain('1234 / 5678')
    expect(INVITE_DIALOG_COPY.withTickets.title(1)).toBe('¡Boleta asignada!')
  })

  it('con varias se dice cuantas, no se listan', () => {
    const body = INVITE_DIALOG_COPY.withTickets.body('Juan Pérez', null, 6)
    expect(body).toContain('6 boletas')
    expect(INVITE_DIALOG_COPY.withTickets.title(6)).toBe('¡Boletas asignadas!')
  })
})
