import { LOTTERY_LABELS, type LotteryCode } from '@/features/lottery/constants'
import { WEEKDAY_LABELS } from '@/lib/constants'
import { formatClockEs } from '@/lib/dates'
import { ticketLabel } from '@/lib/tickets'

/**
 * El texto de cada aviso.
 *
 * TODOS los textos de avisos viven aqui, igual que los del recorrido guiado
 * viven en `tours.ts` (UX_COPY_GUIDELINES, Anexo B). La base de datos guarda
 * que paso y con que datos; la frase se arma aqui, para que mejorar una
 * redaccion sea cambiar este archivo y no aplicar una migracion a produccion
 * (I-030).
 *
 * Reglas de §13 de la guia: una idea por aviso, frase corta, sin lenguaje
 * tecnico. Nada de «sub-vendedor»: en pantalla todos son vendedores y unos
 * tienen equipo (Anexo A). «Ganador» no se usa: la plataforma detecta una
 * coincidencia numerica, no certifica el premio (BR-L15).
 */

export type NotificationKind =
  | 'team.member_added'
  | 'team.sale'
  | 'lottery.result'
  | 'lottery.schedule_change'
  | 'payment_reminder.due'
  | 'raffle_prize.changed'

type NotificationData = Record<string, unknown>

function text(data: NotificationData, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value !== '' ? value : null
}

function count(data: NotificationData, key: string): number {
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function weekdayName(isoDate: string | null): string | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return null
  const parts = isoDate.slice(0, 10).split('-').map(Number)
  const year = parts[0]
  const month = parts[1]
  const day = parts[2]
  if (year === undefined || month === undefined || day === undefined) return null
  const utc = new Date(Date.UTC(year, month - 1, day, 12))
  const weekday = utc.getUTCDay() === 0 ? 7 : utc.getUTCDay()
  // La lista vive en `constants.ts` (D-188): aqui se usa en minusculas porque
  // estos nombres van DENTRO de una frase, no encabezando un campo.
  return WEEKDAY_LABELS[weekday]?.toLowerCase() ?? null
}

function lotteryName(data: NotificationData): string {
  const code = text(data, 'lottery_code')
  if (code && code in LOTTERY_LABELS) {
    return LOTTERY_LABELS[code as LotteryCode]
  }
  return 'la lotería'
}

function boletasAsignadas(n: number): string {
  return n === 1
    ? '1 boleta asignada antes del sorteo'
    : `${n} boletas asignadas antes del sorteo`
}

function boletasDisponibles(n: number): string {
  return n === 1 ? '1 boleta disponible' : `${n} boletas disponibles`
}

/**
 * «Una boleta coincide con este resultado» (BR-L15, BR-L19, D-203, I-126).
 *
 * EL RESULTADO VA PRIMERO Y LA COINCIDENCIA SE REFIERE A EL, no a «este
 * numero». Desde los premios configurables una boleta puede coincidir solo en
 * las TRES ULTIMAS cifras, y una frase que dijera «con este numero» le
 * atribuiria el numero entero. Nunca «ganador», «premiada» ni que tiene las
 * cuatro cifras: la plataforma detecta una coincidencia, no certifica un premio.
 *
 * Las cifras son de BOLETAS distintas (`confirm_lottery_result`, D-203), y la
 * frase concuerda con ellas: «una boleta que coincide», «2 boletas que
 * coinciden». El nombre del cliente es el de UNA de las vendidas: con varias se
 * dice asi, en vez de presentarlo como el dueno de todas.
 */
function lotteryResultMessage(data: NotificationData): string {
  const lottery = lotteryName(data)
  const number = text(data, 'winning_number')
  const draw = text(data, 'draw_number')
  const sold = count(data, 'sold_count')
  const available = count(data, 'available_count')
  const client = text(data, 'client_name')
  const drawBit = draw ? `, sorteo ${draw}` : ''
  const resultado = `Resultado de ${lottery}${drawBit}${number ? `: ${number}` : ''}.`
  const audience = text(data, 'audience')

  if (audience === 'staff') {
    const raffleCount = count(data, 'raffle_count')
    const raffleNames = Array.isArray(data.raffle_names)
      ? data.raffle_names.filter((name): name is string => typeof name === 'string' && name !== '')
      : []
    const raffleBit =
      raffleNames.length === 1
        ? `, en ${raffleNames[0]}`
        : raffleCount > 1
          ? `, en ${raffleCount} rifas`
          : ''
    const partes = [
      sold > 0 ? boletasAsignadas(sold) : null,
      available > 0 ? boletasDisponibles(available) : null,
    ].filter((parte): parte is string => parte !== null)
    if (partes.length === 0) return resultado
    const verbo = sold + available === 1 ? 'Coincide' : 'Coinciden'
    return `${resultado} ${verbo} con este resultado ${partes.join(' y ')}${raffleBit}.`
  }

  const asignadas =
    sold === 1 ? 'una boleta asignada que coincide' : `${sold} boletas asignadas que coinciden`
  const clientBit = !client
    ? ''
    : sold === 1
      ? ` Cliente: ${client}.`
      : ` Una de ellas es de ${client}.`

  if (sold > 0 && available > 0) {
    const disponibles = available === 1 ? 'otra disponible' : `otras ${available} disponibles`
    return `${resultado} Encontramos ${asignadas} con este resultado y tenías ${disponibles}.${clientBit}`
  }
  if (sold > 0) {
    return `${resultado} Encontramos ${asignadas} con este resultado.${clientBit}`
  }
  if (available > 0) {
    const disponibles =
      available === 1
        ? 'una boleta disponible que coincide'
        : `${available} boletas disponibles que coinciden`
    return `${resultado} Tenías ${disponibles} con este resultado.`
  }
  return resultado
}

function lotteryScheduleMessage(data: NotificationData): string {
  const lottery = lotteryName(data)
  const status = text(data, 'schedule_status')
  const reason = text(data, 'change_reason')
  const refDay = weekdayName(text(data, 'reference_date'))
  const officialDay = weekdayName(text(data, 'official_date'))

  if (status === 'schedule_conflict') {
    return 'La programación oficial requiere verificación.'
  }
  if (status === 'schedule_unverified') {
    return 'Horario por confirmar.'
  }
  if (status === 'suspended') {
    return `El sorteo de ${lottery} está suspendido. No se buscarán coincidencias hasta nueva confirmación.`
  }
  if (status === 'cancelled') {
    return `No habrá sorteo de ${lottery} para esta fecha de referencia. No se buscarán coincidencias.`
  }
  if (status === 'rescheduled_earlier' && refDay && officialDay) {
    return `El sorteo de ${lottery} correspondiente al ${refDay} se jugará anticipadamente el ${officialDay}.`
  }
  if (status === 'rescheduled_later' && refDay && officialDay) {
    return `El sorteo de ${lottery} correspondiente al ${refDay} se jugará el ${officialDay}, según la programación oficial.`
  }
  if (status === 'scheduled' && reason === 'holiday' && refDay) {
    return `El sorteo de ${lottery} se juega el ${refDay}, aunque es festivo, según la programación oficial.`
  }
  return `La fecha del sorteo de ${lottery} cambió según la programación oficial.`
}

/**
 * «Es hora de tu recordatorio» (BR-S10, BR-V01, D-189).
 *
 * DICE CUAL DE SUS RECORDATORIOS ES, porque un vendedor puede tener hasta
 * catorce y un aviso que no los distinga no ayuda a nadie. Y dice que hacer,
 * que es lo que convierte el aviso en algo accionable.
 *
 * NO NOMBRA A NINGUN CLIENTE, NO DICE NINGUN SALDO Y NO DICE NINGUN IMPORTE
 * (BR-S09): ni aqui ni en el mensaje que se va a pegar en el grupo.
 */
function paymentReminderDueMessage(data: NotificationData): string {
  const weekday = data.weekday
  const day = typeof weekday === 'number' ? WEEKDAY_LABELS[weekday]?.toLowerCase() : null
  const time = text(data, 'time_of_day')
  const accion = 'Copia el mensaje y pégalo en tu grupo.'

  if (day === undefined || day === null || time === null) {
    return `Es hora de tu recordatorio de pago. ${accion}`
  }
  // «7:00 p. m.» YA TERMINA EN PUNTO: añadirle otro deja «p. m..», que se lee
  // como una errata. Se cierra la frase solo si hace falta.
  const cuando = `Es hora de tu recordatorio del ${day} a las ${formatClockEs(time)}`
  return `${cuando.endsWith('.') ? cuando : `${cuando}.`} ${accion}`
}

/**
 * «Cambiaron las condiciones de un premio» (BR-J11, D-199).
 *
 * DICE LA RIFA Y EL PREMIO, que es lo que pidio el encargo, y dice tambien que
 * el cambio vale para los PROXIMOS sorteos: los que ya se jugaron conservan las
 * condiciones con las que se anunciaron (BR-J09), y esa es justo la pregunta que
 * se hace quien lee el aviso.
 *
 * NO LLEVA NADA DE LA CARTERA (D-198): ni clientes, ni pagos, ni saldos, ni
 * precios de venta. Solo se escribe lo que este archivo compone.
 */
function rafflePrizeMessage(data: NotificationData): string {
  const prize = text(data, 'prize_title') ?? 'un premio'
  const raffle = text(data, 'raffle_name') ?? 'la rifa'

  switch (text(data, 'change')) {
    case 'created':
      return `Hay un premio nuevo en ${raffle}: «${prize}».`
    case 'archived':
      return `El premio «${prize}» de ${raffle} ya no aplica para los próximos sorteos.`
    case 'restored':
      return `El premio «${prize}» de ${raffle} vuelve a aplicar para los próximos sorteos.`
    default:
      return `Cambiaron las condiciones del premio «${prize}» de ${raffle} para los próximos sorteos.`
  }
}

/**
 * A donde lleva un aviso, o `null` si no lleva a ninguna parte.
 *
 * Hoy solo el recordatorio de pago tiene destino, y es la razon de que esto
 * exista: la campana es la fuente durable del aviso (BR-V01), asi que tiene que
 * poder llevar al sitio donde se copia el mensaje. Los demas avisos cuentan algo
 * que ya paso y no hay nada que hacer con ellos, asi que no se les inventa un
 * enlace (D-189).
 */
export function notificationHref(kind: string): string | null {
  return kind === 'payment_reminder.due' ? '/seller/settings/reminders' : null
}

export function notificationMessage(kind: string, data: NotificationData): string {
  switch (kind) {
    case 'team.member_added': {
      const parent = text(data, 'parent_name') ?? 'Un vendedor'
      const member = text(data, 'member_name') ?? 'un vendedor'
      return data.is_first === true
        ? `${parent} armó su equipo y agregó a ${member}.`
        : `${parent} agregó a ${member} a su equipo.`
    }

    case 'team.sale': {
      const seller = text(data, 'seller_name') ?? 'Un vendedor'
      const numbers = ticketLabel({
        dailyNumber: text(data, 'daily_number'),
        weeklyNumber: text(data, 'weekly_number'),
      })
      return `${seller} vendió la boleta ${numbers}.`
    }

    case 'lottery.result':
      return lotteryResultMessage(data)

    case 'lottery.schedule_change':
      return lotteryScheduleMessage(data)

    case 'payment_reminder.due':
      return paymentReminderDueMessage(data)

    case 'raffle_prize.changed':
      return rafflePrizeMessage(data)

    default:
      // Un aviso de un tipo que esta version no conoce: se muestra algo
      // honesto en vez de una cadena vacia o el nombre tecnico del evento.
      return 'Novedad en tu equipo.'
  }
}
