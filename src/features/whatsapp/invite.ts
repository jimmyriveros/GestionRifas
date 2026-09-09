/**
 * La invitacion al grupo de WhatsApp del vendedor: que se guarda, como se
 * redacta el mensaje y cuando se puede invitar (BR-W01..BR-W08, D-176).
 *
 * Vive aparte —igual que `clearance-receipt.ts`, `release-ticket.ts` y
 * `reassign-client.ts`— porque lo necesitan la pantalla de configuracion, los
 * dos dialogos de exito y las pruebas unitarias, que no montan React. Es PURO:
 * no lee la sesion, no consulta la base de datos y no abre nada.
 *
 * TODOS LOS TEXTOS ESTAN AQUI, juntos, por lo mismo que `search/hints.ts` y
 * `notifications/text.ts`: un termino se escribe una sola vez o acaba habiendo
 * tres (`UX_COPY_GUIDELINES` Anexo B).
 *
 * Esto NO autoriza nada: decide que se pinta. La frontera es
 * `set_seller_whatsapp_settings`, que vuelve a comprobarlo todo en la base.
 */

import { isValidWhatsappNumber, normalizeWhatsappNumber, whatsappUrl } from '@/lib/whatsapp'

/**
 * EL ENLACE DEL GRUPO NUNCA FORMA PARTE DEL TEXTO. Esta es la decision que
 * ordena todo este modulo (BR-W04, D-176).
 *
 * El encargo proponia un marcador, `{{whatsapp_group_link}}`, que el vendedor
 * tendria que conservar dentro de su mensaje. Se descarto: un marcador se
 * puede borrar sin querer, escribir mal, pegar dos veces o partir en mitad al
 * editar, y cada una de esas formas de romperlo obliga a una validacion y a un
 * texto de error que explique una sintaxis a alguien que solo queria escribir
 * «Hola, gracias por participar».
 *
 * Aqui el vendedor escribe PROSA y el enlace se anade siempre al final. No hay
 * nada que conservar, asi que no hay nada que romper — que es literalmente lo
 * que pedia el encargo: «una experiencia dificil de romper». Y como la pantalla
 * de configuracion ensena la vista previa del mensaje COMPLETO, con el enlace
 * ya puesto, nadie tiene que imaginarselo ni fiarse de una promesa.
 */
const JOIN_LINE = 'Únete aquí:'

/**
 * El mensaje predeterminado, que es el que usa casi todo el mundo.
 *
 * VIVE AQUI Y NO EN LA BASE DE DATOS (BR-W02). Guardarlo repetido en cada
 * membresia significaria que mejorar la redaccion obligaria a un UPDATE masivo,
 * y que dos vendedores dados de alta en fechas distintas tendrian textos
 * distintos sin haber elegido ninguno. En la base, `whatsapp_custom_message` es
 * NULL en quien usa este.
 *
 * El tono es el de un sorteo —cercano, con emojis— porque es un mensaje que una
 * persona le manda a otra por WhatsApp, no un aviso del sistema. Aun asi no
 * promete nada que no podamos cumplir: invita al grupo y ya.
 */
export const DEFAULT_INVITE_MESSAGE = `🎉 ¡Gracias por participar con nosotros!

Te invitamos a unirte a nuestro grupo de WhatsApp para que estés pendiente de los sorteos, resultados y premios de cada día. 🍀🏆

¡No te pierdas ninguna novedad y mucha suerte! 🎰✨`

/** Lo que se puede escribir en el mensaje propio. El mismo tope que el CHECK. */
export const INVITE_MESSAGE_MAX_LENGTH = 1000

/**
 * La forma de un enlace de invitacion a un grupo.
 *
 * EXACTAMENTE la misma que el CHECK `memberships_whatsapp_group_url_format` y
 * que la que repite la RPC. Son tres copias a proposito y en ese orden de
 * autoridad: esta da el mensaje antes de ir al servidor, la de la RPC lo da
 * cuando alguien se salta la pantalla, y el CHECK es el que de verdad manda
 * (docs/SECURITY.md 1).
 *
 * NO se acota el codigo a una longitud exacta: WhatsApp los ha emitido de
 * largos distintos y rechazar manana un enlace legitimo es mucho mas caro que
 * aceptar uno raro. Se admite la cola `?mode=...` que el propio WhatsApp anade
 * al compartir.
 */
export const GROUP_URL_REGEX = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{6,64}([?#]\S*)?$/

export function isValidGroupUrl(value: string): boolean {
  return GROUP_URL_REGEX.test(value.trim())
}

/** La configuracion de WhatsApp de un vendedor, tal como sale de su membresia. */
export type WhatsappSettings = {
  /** `null` mientras no haya configurado su grupo. */
  groupUrl: string | null
  useCustomMessage: boolean
  /** La prosa que escribio, SIN el enlace. `null` si nunca escribio ninguna. */
  customMessage: string | null
}

export const EMPTY_WHATSAPP_SETTINGS: WhatsappSettings = {
  groupUrl: null,
  useCustomMessage: false,
  customMessage: null,
}

/**
 * La prosa vigente: la suya o la predeterminada.
 *
 * El interruptor manda sobre el texto guardado, no al reves. Un vendedor puede
 * tener su mensaje escrito y estar usando el predeterminado ahora mismo: apagar
 * el interruptor no borra lo que escribio, para que volver a encenderlo se lo
 * devuelva tal cual (BR-W03).
 */
export function activeMessageBody(settings: WhatsappSettings): string {
  if (!settings.useCustomMessage) return DEFAULT_INVITE_MESSAGE
  const custom = settings.customMessage?.trim() ?? ''
  // Cinturon: el CHECK impide guardar «personalizado» sin texto, asi que esto
  // solo puede pasar con datos escritos antes de la 0050 o a mano. Aun asi se
  // cae al predeterminado en vez de mandar un mensaje vacio.
  return custom === '' ? DEFAULT_INVITE_MESSAGE : custom
}

/**
 * El mensaje completo que llega escrito en WhatsApp: la prosa y el enlace.
 *
 * Sin enlace devuelve solo la prosa, y no un hueco ni un marcador a medio
 * sustituir. Ese caso no deberia llegar aqui —sin grupo configurado no se
 * ofrece invitar (BR-W05)— pero si llega, lo peor posible seria mandarle al
 * cliente un mensaje con `{{...}}` dentro.
 */
export function buildInviteMessage(settings: WhatsappSettings): string {
  const body = activeMessageBody(settings)
  if (settings.groupUrl === null) return body
  return `${body}\n\n${JOIN_LINE} ${settings.groupUrl}`
}

/** Por que no se puede invitar a este cliente, o `null` si si se puede. */
export type InviteBlocker = 'sin-grupo' | 'sin-telefono'

/**
 * El telefono del cliente, listo para `wa.me`, o `null` si no sirve.
 *
 * `clients.phone` es obligatorio y valida contra `PHONE_REGEX`, que acepta de 7
 * a 20 caracteres con `+`, espacios, parentesis y guiones. Eso NO garantiza un
 * numero utilizable por WhatsApp: «123-4567» pasa el formulario y son siete
 * digitos, dos menos de los que necesita un numero internacional. Por eso se
 * vuelve a comprobar aqui en vez de darlo por bueno.
 */
export function inviteWhatsappNumber(clientPhone: string): string | null {
  const normalized = normalizeWhatsappNumber(clientPhone)
  if (normalized === null || !isValidWhatsappNumber(normalized)) return null
  return normalized
}

/**
 * Que se puede ofrecer en el dialogo de exito, para ESTE cliente.
 *
 * Devuelve `null` cuando se puede invitar. Los dos motivos llevan a sitios
 * distintos y por eso se distinguen: sin grupo, la salida es configurarlo;
 * con un telefono que no sirve, la salida es corregir el cliente, y ofrecerle
 * «Configurar WhatsApp» a quien ya lo tiene configurado seria mandarlo a
 * arreglar algo que no esta roto.
 */
export function inviteBlocker(
  settings: WhatsappSettings,
  clientPhone: string,
): InviteBlocker | null {
  if (settings.groupUrl === null) return 'sin-grupo'
  if (inviteWhatsappNumber(clientPhone) === null) return 'sin-telefono'
  return null
}

/**
 * El enlace que abre WhatsApp con el mensaje escrito, o `null` si no se puede.
 *
 * Un solo punto de construccion: quien lo llame no interpola ni codifica nada
 * por su cuenta (la misma regla que `paymentNewHref`, D-133).
 */
export function inviteUrl(settings: WhatsappSettings, clientPhone: string): string | null {
  const number = inviteWhatsappNumber(clientPhone)
  if (number === null || settings.groupUrl === null) return null
  return whatsappUrl(number, buildInviteMessage(settings))
}

/**
 * Todo lo que se lee en pantalla sobre la invitacion.
 *
 * «Enlace», nunca «link» (Anexo A del glosario). El encargo escribia «Link del
 * grupo de WhatsApp» y se corrige aqui: `link` esta expresamente prohibido para
 * la direccion de una pagina en este proyecto, y tenerlo para una cosa y
 * «enlace» para otra seria peor que no tener glosario (`CLAUDE.md` 35.2.4).
 */
export const WHATSAPP_COPY = {
  /** La seccion, dentro de «Configuración». */
  title: 'Grupo de WhatsApp',
  description:
    'Cuando registres un cliente nuevo, podrás invitarlo a tu grupo con el mensaje ya escrito.',

  groupField: {
    label: 'Enlace del grupo de WhatsApp',
    /** Donde encontrarlo. Es lo unico que la pantalla no puede ensenar. */
    help: 'En WhatsApp, entra a tu grupo, toca su nombre y elige «Invitar por enlace».',
    placeholder: 'https://chat.whatsapp.com/...',
    invalid:
      'Ese enlace no parece de un grupo de WhatsApp. Debe empezar por https://chat.whatsapp.com/',
    /** Abre el grupo en otra pestana. No cambia nada. */
    open: 'Abrir el grupo',
  },

  messageField: {
    label: 'Mensaje de invitación',
    toggle: 'Usar mi propio mensaje',
    /** La consecuencia del interruptor apagado, dicha antes de encenderlo. */
    defaultHint:
      'Estás usando el mensaje que trae la aplicación. Enciende el interruptor para escribir el tuyo.',
    /**
     * Lo unico que quien escribe no puede deducir mirando la pantalla: que NO
     * tiene que pegar el enlace. Va siempre bajo el campo.
     */
    customHint: 'Escribe solo tu mensaje. El enlace de tu grupo se agrega al final, siempre.',
    empty: 'Escribe tu mensaje o vuelve a usar el mensaje predeterminado.',
    restore: 'Volver al mensaje predeterminado',
    preview: 'Así lo recibirá tu cliente',
  },

  /** Sin grupo configurado todavia. */
  notConfigured: 'Configura tu grupo de WhatsApp para poder invitar a tus clientes nuevos.',

  saved: 'Los cambios fueron guardados.',
} as const

/**
 * Los textos de los dos dialogos de exito.
 *
 * SON DOS PORQUE PASARON DOS COSAS DISTINTAS. Desde una boleta se creo el
 * cliente Y se vendio la boleta; desde «Mis clientes» solo se creo el cliente,
 * y el dialogo NO puede mencionar ninguna boleta porque no hubo ninguna
 * (BR-W06).
 */
export const INVITE_DIALOG_COPY = {
  clientOnly: {
    title: '¡Cliente creado!',
    /** `{nombre}` lo pone quien pinta. */
    body: (name: string) => `${name} quedó registrado en tus clientes.`,
  },
  withTickets: {
    title: (count: number) => (count === 1 ? '¡Boleta asignada!' : '¡Boletas asignadas!'),
    /**
     * La boleta se nombra por sus DOS numeros cuando es una sola (BR-N11); con
     * varias se dice cuantas, porque una lista de veinte pares no se lee.
     */
    body: (name: string, ticketLabel: string | null, count: number) =>
      count === 1 && ticketLabel !== null
        ? `${name} quedó registrado y la boleta ${ticketLabel} es suya.`
        : `${name} quedó registrado y ${count} boletas son suyas.`,
  },

  /** La accion que abre WhatsApp. */
  invite: 'Invitar al grupo',
  /** La que cierra sin invitar. Nunca «Aceptar» ni «Listo» (guia 6). */
  close: 'Cerrar',
  /** Cuando falta el grupo: se cambia la accion, no se ofrece una que fallara. */
  configure: 'Configurar WhatsApp',

  /** Por que hoy no se puede invitar. Uno por causa, no uno por pantalla. */
  blocked: {
    'sin-grupo': 'Configura tu grupo de WhatsApp para poder invitar a tus clientes nuevos.',
    'sin-telefono':
      'El teléfono de este cliente no sirve para WhatsApp. Corrígelo en su ficha y podrás invitarlo.',
  } satisfies Record<InviteBlocker, string>,

  /**
   * Si el navegador bloquea la ventana. No se dice «se abrió» cuando no se
   * abrio: es la misma regla de siempre (D-116).
   */
  popupBlocked:
    'Tu navegador no dejó abrir WhatsApp. Permítelo y vuelve a tocar «Invitar al grupo».',
} as const
