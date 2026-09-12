/**
 * Los recordatorios de pago del vendedor: que se guarda, como se arma el
 * mensaje y TODOS sus textos (BR-S01..BR-S09, D-185, D-188).
 *
 * PURO: no lee la sesion, no consulta la base y no abre nada. Lo necesitan la
 * pantalla de configuracion, su vista previa y las pruebas unitarias.
 *
 * Aqui NO hay motor. Materializar una ocurrencia, avisar por la campana y el
 * flujo copiar–abrir–atender son la Etapa 3. Lo unico que esta etapa construye
 * es la CONFIGURACION y el compositor del mensaje, que la Etapa 3 reutilizara
 * tal cual: el mensaje se arma **en el momento en que se abre o se copia**, con
 * la configuracion vigente, de modo que cambiar una cuenta cambia los mensajes
 * futuros sin reescribir ni un recordatorio (BR-S08).
 */

import { accountLine, activeAccounts, type PaymentAccount } from '@/features/payment-accounts/accounts'
import { WEEKDAY_LABELS, type PaymentReminderStatus } from '@/lib/constants'
import { formatClockEs } from '@/lib/dates'

/** El tope de activos (BR-S05). En la base lo impone un trigger con cerrojo. */
export const PAYMENT_REMINDER_MAX = 14

/** El mismo tope que el CHECK de `0051` y que el mensaje de invitacion. */
export const REMINDER_MESSAGE_MAX_LENGTH = 1000

/** Un recordatorio, tal como sale de `seller_payment_reminders`. */
export type PaymentReminder = {
  id: string
  /** ISO: 1 lunes … 7 domingo. */
  weekday: number
  /** `HH:MM:SS` de PostgreSQL. */
  timeOfDay: string
  status: PaymentReminderStatus
  useCustomMessage: boolean
  /** La prosa que escribio, SIN las cuentas. `null` si nunca escribio ninguna. */
  customMessage: string | null
}

/**
 * EL ENCABEZADO DE LAS CUENTAS LE HABLA AL CLIENTE, no al vendedor.
 *
 * Es quien va a leer el mensaje en su WhatsApp. Escribir ahi «tus cuentas» —que
 * es como se le explica al vendedor en la pantalla de configuracion— haria que
 * el cliente entendiera las suyas (`UX_COPY_GUIDELINES`, Anexo A).
 */
const ACCOUNTS_HEADING = 'Puedes pagar aquí:'

/**
 * El mensaje predeterminado, que es el que usa casi todo el mundo.
 *
 * VIVE AQUI Y NO EN LA BASE DE DATOS (BR-S06, la misma razon que BR-W02):
 * guardarlo repetido en cada fila haria que mejorar la redaccion exigiera un
 * UPDATE masivo, y que dos vendedores tuvieran textos distintos sin haber
 * elegido ninguno.
 *
 * NO NOMBRA A NINGUN CLIENTE, NO DICE NINGUN SALDO Y NO DICE NINGUN IMPORTE
 * (BR-S09). Va a un grupo donde estan todos los clientes del vendedor: escribir
 * ahi quien debe cuanto es publicar la deuda de una persona delante de las
 * demas.
 */
export const DEFAULT_REMINDER_MESSAGE = `¡Hola a todos! 👋

Les recordamos que pueden ir abonando a su boleta cuando quieran. Cualquier duda, escríbanme por aquí.

¡Mucha suerte! 🍀`

/** La prosa vigente: la suya o la predeterminada (BR-S06, como BR-W03). */
export function activeReminderBody(reminder: PaymentReminder): string {
  if (!reminder.useCustomMessage) return DEFAULT_REMINDER_MESSAGE
  const custom = reminder.customMessage?.trim() ?? ''
  // Cinturon: el CHECK impide guardar «uso mi mensaje» sin texto, asi que esto
  // solo puede pasar con datos escritos a mano. Aun asi se cae al
  // predeterminado en vez de mandar un mensaje vacio.
  return custom === '' ? DEFAULT_REMINDER_MESSAGE : custom
}

/**
 * El bloque de cuentas que se añade al final. Vacio si no hay ninguna activa:
 * **no se inventa un encabezado sin nada debajo** (D-188).
 */
export function accountsBlock(accounts: PaymentAccount[]): string {
  const active = activeAccounts(accounts)
  if (active.length === 0) return ''
  return [ACCOUNTS_HEADING, ...active.map((account) => `• ${accountLine(account)}`)].join('\n')
}

/**
 * El mensaje completo que el vendedor va a pegar en su grupo: la prosa y las
 * cuentas (BR-S07).
 *
 * LAS CUENTAS NUNCA FORMAN PARTE DEL TEXTO QUE SE ESCRIBE. Se añaden aqui, al
 * final, asi que no hay marcador que se pueda borrar, escribir mal, duplicar ni
 * partir a la mitad — que es exactamente lo que D-176 aprendio con el enlace del
 * grupo. No existe `{{cuentas}}` en ninguna parte del producto.
 *
 * Se compone AL ABRIR O AL COPIAR, nunca al guardar: por eso cambiar una cuenta
 * cambia los mensajes futuros sin tocar ningun recordatorio (BR-S08).
 */
export function buildReminderMessage(
  reminder: PaymentReminder,
  accounts: PaymentAccount[],
): string {
  const body = activeReminderBody(reminder)
  const block = accountsBlock(accounts)
  return block === '' ? body : `${body}\n\n${block}`
}

/** «Martes a las 7:00 p. m.» — cuando suena, dicho como se dice en voz alta. */
export function reminderSchedule(reminder: PaymentReminder): string {
  const day = WEEKDAY_LABELS[reminder.weekday] ?? ''
  return `${day} a las ${formatClockEs(reminder.timeOfDay)}`
}

/** Los activos, ordenados por cuando suenan. Es como se leen en la lista. */
export function sortReminders(reminders: PaymentReminder[]): PaymentReminder[] {
  return [...reminders].sort(
    (a, b) => a.weekday - b.weekday || a.timeOfDay.localeCompare(b.timeOfDay),
  )
}

export function countActive(reminders: PaymentReminder[]): number {
  return reminders.filter((reminder) => reminder.status === 'active').length
}

export const REMINDER_COPY = {
  title: 'Recordatorios de pago',
  description:
    'Elige qué día y a qué hora quieres que te preparemos el mensaje de cobro para tu grupo de WhatsApp.',

  summary: {
    none: 'Todavía no tienes recordatorios',
    one: '1 recordatorio activo',
    many: (count: number) => `${count} recordatorios activos`,
  },

  empty: {
    title: 'Todavía no tienes recordatorios de pago',
    description:
      'Crea el primero y te avisaremos el día y la hora que elijas, con el mensaje listo para enviar.',
  },

  add: 'Crear recordatorio',
  addBlocked: `Ya tienes ${PAYMENT_REMINDER_MAX} recordatorios activos. Pausa o archiva uno para crear otro.`,

  form: {
    createTitle: 'Crear recordatorio de pago',
    editTitle: 'Editar recordatorio',
    weekday: 'Día',
    time: 'Hora',
    timeHelp: 'Hora de Colombia.',
    toggle: 'Usar mi propio mensaje',
    message: 'Mensaje del recordatorio',
    defaultHint:
      'Estás usando el mensaje que trae la aplicación. Enciende el interruptor para escribir el tuyo.',
    /**
     * Lo unico que quien escribe no puede deducir mirando la pantalla: que NO
     * tiene que escribir sus cuentas. Va siempre bajo el campo (BR-S07).
     */
    customHint: 'Escribe solo tu mensaje. Tus cuentas se agregan al final, siempre.',
    empty: 'Escribe tu mensaje o vuelve a usar el mensaje predeterminado.',
    restore: 'Volver al mensaje predeterminado',
    preview: 'Así lo verán en tu grupo',
    /**
     * Sin cuentas activas el mensaje sale sin ellas, y se dice FUERA de la
     * vista previa —dentro seria meter un aviso del sistema en un texto que lee
     * un cliente— con la salida a mano (D-188).
     */
    noAccounts: 'Todavía no tienes cuentas para recibir pagos, así que el mensaje sale sin ellas.',
    noAccountsAction: 'Agregar una cuenta',
    submitCreate: 'Crear recordatorio',
    submitEdit: 'Guardar cambios',
    cancel: 'Cancelar',
    // El aviso de «ya tienes uno ese día a esa hora» NO está aquí: lo redacta
    // la RPC y llega traducido por `mapPgError`. Tenerlo repetido dejaría dos
    // frases que envejecen por separado.
  },

  edit: 'Editar',
  /** Pausar NO es archivar, y los dos verbos no se mezclan (D-188). */
  pause: 'Pausar',
  resume: 'Reanudar',
  archive: 'Archivar',
  archiveConfirm: {
    title: 'Archivar recordatorio',
    description: 'Dejarás de recibirlo. Puedes crear otro cuando quieras.',
    confirm: 'Archivar recordatorio',
    pending: 'Archivando...',
  },

  archivedTitle: 'Recordatorios archivados',

  // Las tres etiquetas de estado NO se escriben aquí: viven en
  // `PAYMENT_REMINDER_STATUS_LABELS` (`CLAUDE.md` §27) y la pantalla las lee de
  // ahí, como todas las demás del producto.

  created: 'El recordatorio fue creado.',
  updated: 'Los cambios fueron guardados.',
  paused: 'El recordatorio quedó pausado.',
  resumed: 'El recordatorio volvió a estar activo.',
  archived: 'El recordatorio fue archivado.',
} as const
