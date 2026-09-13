/**
 * Todo lo que se lee de «Resultados de la semana»: la pantalla, la imagen y el
 * mensaje, incluido el editor del mensaje propio (BR-H01..BR-H10, D-194, D-197).
 *
 * TODOS LOS TEXTOS AQUÍ, juntos, como `whatsapp/invite.ts` y
 * `payment-reminders/reminders.ts` (`UX_COPY_GUIDELINES`, Anexo B). Los que ya
 * existían con el mismo sentido NO se reescriben: «Resultado pendiente» y
 * «Número mayor» vienen del recuadro de loterías, y copiar el mensaje y
 * configurar el grupo usan las frases del flujo de recordatorios.
 *
 * NINGÚN TEXTO DICE «GANADOR» (BR-L15): la imagen enseña el número mayor de cada
 * lotería, no certifica ningún premio. Y NINGUNO DICE QUE ALGO SE ENVIÓ: Rifas
 * prepara la imagen y el mensaje, y quien los envía es la persona (BR-W08).
 *
 * `share` son SOLO cadenas, sin funciones: viaja entero al componente cliente,
 * que así no arrastra a su paquete los módulos de loterías de los que salen
 * algunas.
 */

import {
  LOTTERY_CODES,
  LOTTERY_LABELS,
  LOTTERY_MATCH_FIELD,
  type LotteryCode,
  type LotteryMatchField,
} from '@/features/lottery/constants'
import { LOTTERY_DASHBOARD_COPY } from '@/features/lottery/dashboard'
import { LOTTERY_NOMINAL_WEEKDAY } from '@/features/lottery/sources'
import { REMINDER_COPY } from '@/features/payment-reminders/reminders'
import { WEEKDAY_LABELS } from '@/lib/constants'

import type { WeeklyLotteryStatus } from './results'
import { formatWeekLong, type ResultsWeek } from './week'

export const WEEKLY_RESULTS_COPY = {
  title: 'Resultados de la semana',
  /**
   * La línea de la tarjeta en «Configuración». No cuenta nada a propósito: esa
   * pantalla no consulta los resultados ni genera la imagen (D-194).
   */
  summary: 'Imagen y mensaje para compartir',
  description: 'Comparte con tu grupo los números mayores de la semana que terminó.',

  week: {
    heading: (range: string) => `Semana ${range}`,
    /** El estado con cifras y con palabras: no depende del color (§27). */
    count: (confirmed: number, total: number) => `${confirmed} de ${total} resultados`,
    raffle: (name: string) => `Rifa de tu catálogo: ${name}`,
    listLabel: 'Resultados de lunes a sábado',
    loading: 'Buscando los resultados de la semana…',
    pending: (lotteries: string, count: number) =>
      count === 1
        ? `Falta el resultado de ${lotteries}. La imagen y el mensaje estarán listos cuando se confirmen los seis.`
        : `Faltan los resultados de ${lotteries}. La imagen y el mensaje estarán listos cuando se confirmen los seis.`,
    /** Configurar la rifa del catálogo es del personal (BR-K12): se dice a quién pedírsela. */
    noRaffle:
      'Tu catálogo todavía no tiene una rifa. Pídele a quien administra la rifa que la configure: sin ella no podemos preparar la imagen.',
    errorTitle: 'No pudimos cargar los resultados de la semana',
    errorDescription:
      'El resto de Configuración sigue disponible. Vuelve a cargar la página para intentarlo de nuevo.',
    imageAlt: (range: string) =>
      `Imagen de los resultados de la semana ${range}, lista para compartir`,
  },

  row: {
    /** Lo que anuncia un lector de pantalla antes de la cifra. */
    numberLabel: LOTTERY_DASHBOARD_COPY.winningNumber,
    field: {
      daily_number: 'Número diario',
      weekly_number: 'Número semanal',
    } satisfies Record<LotteryMatchField, string>,
    detail: (weekday: string, day: string, field: string) => `${weekday} ${day} · ${field}`,
    status: {
      pending: LOTTERY_DASHBOARD_COPY.pending,
      conflict: 'Requiere verificación',
      rejected: 'No se pudo confirmar',
      invalid: 'No se pudo confirmar',
    } satisfies Record<Exclude<WeeklyLotteryStatus, 'confirmed'>, string>,
  },

  share: {
    title: 'Compartir con tu grupo',
    description:
      'Comparte o descarga la imagen, copia el mensaje y envíalos a tu grupo. Rifas no los envía por ti.',
    imageTitle: 'Imagen para compartir',
    /** El título que se le pasa al menú del teléfono junto con la imagen. */
    shareTitle: 'Resultados de la semana',

    previewLoading: 'Preparando imagen…',
    previewReady: 'La imagen está lista.',
    previewPending: 'La imagen estará lista cuando se confirmen los seis resultados.',
    previewNoRaffle: 'La imagen estará lista cuando tu catálogo tenga una rifa.',
    /** Nunca se da por preparada una imagen que no llegó (D-116). */
    previewFailed: 'No pudimos preparar la imagen. Inténtalo de nuevo.',
    retry: 'Reintentar',

    shareImage: 'Compartir imagen',
    sharing: 'Compartiendo…',
    shareFailed: 'No pudimos compartir la imagen. Descárgala y envíala desde WhatsApp.',
    /** Sin menú para archivos no se ofrece un botón que va a fallar (BR-W05). */
    shareUnavailable:
      'Este dispositivo no permite compartir la imagen desde aquí. Descárgala y envíala desde WhatsApp.',
    downloadImage: 'Descargar imagen',
    downloading: 'Descargando…',

    messageTitle: 'Mensaje para tu grupo',
    messagePending: 'El mensaje estará listo cuando se confirmen los seis resultados.',

    /*
     * El mensaje propio (BR-H09, D-197). Las frases que ya existían con el mismo
     * sentido —el interruptor, el predeterminado, el vacío, volver, la vista
     * previa y guardar— son las del mensaje de los recordatorios, que es el mismo
     * editor: no se escriben otra vez.
     */
    messageToggle: REMINDER_COPY.form.toggle,
    messageDefaultHint: REMINDER_COPY.form.defaultHint,
    /**
     * Lo único que quien escribe no puede deducir mirando la pantalla: el texto se
     * usa tal cual, y la fecha que traía el predeterminado al copiarlo ya no
     * cambia sola.
     */
    messageCustomHint:
      'Se usará tal como lo escribas. Las fechas que tenga no se actualizan solas: revísalas cada semana.',
    messageEmpty: REMINDER_COPY.form.empty,
    messageTooLong: 'El mensaje no puede superar 1.000 caracteres.',
    messageRestore: REMINDER_COPY.form.restore,
    messagePreview: REMINDER_COPY.form.preview,
    messageSave: REMINDER_COPY.form.submitEdit,
    messageSaving: 'Guardando...',
    messageSaved: REMINDER_COPY.updated,
    /** Sin respuesta del servidor no se sabe si guardó, y no se da por guardado (D-116). */
    messageSaveFailed:
      'No pudimos guardar los cambios. Revisa la conexión e inténtalo nuevamente. Lo que escribiste sigue aquí.',
    messageSaveForbidden: 'No pudimos guardar los cambios. Revisa tus permisos.',
    /** Sin la configuración leída no se ofrece guardar: se diría encima de algo que no se ve. */
    messageLoadFailed:
      'No pudimos cargar tu mensaje. Por ahora se usa el mensaje que trae la aplicación. Vuelve a cargar la página para intentarlo de nuevo.',

    copyMessage: REMINDER_COPY.due.copy,
    copied: REMINDER_COPY.due.copied,
    copyFailed: REMINDER_COPY.due.copyFailed,

    groupLabel: 'Tu grupo de WhatsApp',
    openGroup: 'Abrir mi grupo',
    noGroup: REMINDER_COPY.due.noGroup,
    configureGroup: REMINDER_COPY.due.noGroupAction,
  },

  /** Los textos fijos del PNG. Lo variable —rifa, semana, números— llega con los datos. */
  image: {
    title: 'RESULTADOS DE LA SEMANA',
    weeklyResult: 'RESULTADO SEMANAL',
    footer: 'Verifica tu boleta',
    /**
     * Los nombres que se ACORTAN en la imagen, y solo en ella.
     *
     * «CUNDINAMARCA» no cabe en su tarjeta diaria con los nombres un 30 % más
     * grandes; «CUNDI.» sí, y así las cinco tarjetas llevan el mismo tamaño. La
     * pantalla, el mensaje y `LOTTERY_LABELS` siguen diciendo «Cundinamarca»: el
     * nombre oficial no cambia en ningún otro sitio.
     */
    shortLotteryLabels: { cundinamarca: 'CUNDI.' } satisfies Partial<Record<LotteryCode, string>>,
  },

  /** Lo que responde la ruta del PNG cuando no lo entrega. Nunca lleva detalles internos. */
  api: {
    signIn: 'Debes iniciar sesión.',
    inactive: 'Tu cuenta está inactiva.',
    forbidden: 'No tienes acceso a esta imagen.',
    invalidWeek: 'La semana pedida no es válida.',
    noRaffle: 'Tu catálogo todavía no tiene una rifa.',
    notReady: 'Todavía faltan resultados de esa semana.',
    failed: 'No se pudo preparar la imagen. Inténtalo de nuevo.',
  },
} as const

export type WeeklyResultsShareCopy = typeof WEEKLY_RESULTS_COPY.share

/** «Lunes», «Sábado»: el día nominal de la lotería, de la lista única de días (D-188). */
export function lotteryWeekdayLabel(code: LotteryCode): string {
  const label = WEEKDAY_LABELS[LOTTERY_NOMINAL_WEEKDAY[code]]
  if (label === undefined) throw new Error(`La loteria ${code} no tiene dia nominal`)
  return label
}

/**
 * Cómo se escribe una lotería DENTRO de la imagen: en mayúsculas y, si tiene
 * nombre corto (`image.shortLotteryLabels`), con él. Solo lo usa el PNG.
 */
export function imageLotteryLabel(code: LotteryCode): string {
  const short: Partial<Record<LotteryCode, string>> = WEEKLY_RESULTS_COPY.image.shortLotteryLabels
  return short[code] ?? LOTTERY_LABELS[code].toLocaleUpperCase('es-CO')
}

/** «Meta», «Meta y Bogotá», «Cundinamarca, Meta y Bogotá». */
export function missingLotteriesText(codes: readonly LotteryCode[]): string {
  return new Intl.ListFormat('es', { style: 'long', type: 'conjunction' }).format(
    codes.map((code) => LOTTERY_LABELS[code]),
  )
}

/**
 * El mensaje predeterminado para el grupo (BR-H06).
 *
 * VIVE AQUÍ Y NO EN LA BASE: es el mismo razonamiento de `DEFAULT_INVITE_MESSAGE`
 * (BR-W02), y aquí pesa más, porque lleva la semana dentro y guardarlo sería
 * congelar una fecha. Desde D-197 un vendedor puede usar uno PROPIO en su lugar
 * (BR-H09, `message.ts`), que se guarda en su membresía; quien no lo hace recibe
 * este, con la semana correcta y cualquier mejora de la redacción. No lleva el
 * enlace del grupo —se envía DENTRO del grupo—, ni números: los números van en la
 * imagen, que es la que no se puede leer mal.
 *
 * Los días y la lotería del número semanal salen de las constantes, no se
 * escriben: si mañana el número semanal se verificara con otra lotería, el
 * mensaje lo diría solo.
 */
export function weeklyResultsMessage(week: ResultsWeek): string {
  const daily = LOTTERY_CODES.filter((code) => LOTTERY_MATCH_FIELD[code] === 'daily_number')
  const weekly = LOTTERY_CODES.find((code) => LOTTERY_MATCH_FIELD[code] === 'weekly_number')
  const firstDaily = daily[0]
  const lastDaily = daily[daily.length - 1]
  if (firstDaily === undefined || lastDaily === undefined || weekly === undefined) {
    throw new Error('Las loterias no tienen el reparto diario y semanal esperado')
  }

  const day = (code: LotteryCode) => lotteryWeekdayLabel(code).toLocaleLowerCase('es-CO')

  return [
    `🎉 ${WEEKLY_RESULTS_COPY.title}`,
    `Estos fueron los números mayores ${formatWeekLong(week)}. Revisa tu boleta en la imagen. 🍀`,
    `Recuerda: de ${day(firstDaily)} a ${day(lastDaily)} se verifica el número diario. El ${day(weekly)} se verifica el número semanal con ${LOTTERY_LABELS[weekly]}.`,
  ].join('\n\n')
}
