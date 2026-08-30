import { LOTTERY_LABELS, type LotteryCode } from '@/features/lottery/constants'
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

type NotificationData = Record<string, unknown>

function text(data: NotificationData, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value !== '' ? value : null
}

function count(data: NotificationData, key: string): number {
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

function weekdayName(isoDate: string | null): string | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return null
  const parts = isoDate.slice(0, 10).split('-').map(Number)
  const year = parts[0]
  const month = parts[1]
  const day = parts[2]
  if (year === undefined || month === undefined || day === undefined) return null
  const utc = new Date(Date.UTC(year, month - 1, day, 12))
  const weekday = utc.getUTCDay() === 0 ? 7 : utc.getUTCDay()
  return WEEKDAYS[weekday - 1] ?? null
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

function lotteryResultMessage(data: NotificationData): string {
  const lottery = lotteryName(data)
  const number = text(data, 'winning_number') ?? 'el número mayor'
  const draw = text(data, 'draw_number')
  const sold = count(data, 'sold_count')
  const available = count(data, 'available_count')
  const client = text(data, 'client_name')
  const drawBit = draw ? `, sorteo ${draw}` : ''
  const coincidence = `Coincidencia con el número mayor de ${lottery}${drawBit}: ${number}.`
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
    return `${coincidence} ${boletasAsignadas(sold)} y ${boletasDisponibles(available)}${raffleBit}.`
  }

  const clientBit = client ? ` Cliente: ${client}.` : ''
  if (sold > 0 && available > 0) {
    return `${coincidence} Encontramos una boleta asignada con este número y tenías otra disponible.${clientBit}`
  }
  if (sold > 0) {
    return `Encontramos una boleta asignada con este número. ${coincidence}${clientBit}`
  }
  return `Tenías una boleta disponible con este número. ${coincidence}`
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

    default:
      // Un aviso de un tipo que esta version no conoce: se muestra algo
      // honesto en vez de una cadena vacia o el nombre tecnico del evento.
      return 'Novedad en tu equipo.'
  }
}
