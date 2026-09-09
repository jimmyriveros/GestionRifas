/**
 * Recuadro de resultados oficiales del Panel (Etapa 4, D-147, BR-L20).
 *
 * Modulo PURO a proposito: no consulta internet ni la base. Las paginas leen
 * filas locales en `queries.ts` y este archivo decide QUE sorteo es el actual,
 * cual es el ultimo confirmado y que aviso de programacion corresponde.
 *
 * El dia que manda es el de `official_scheduled_at` en America/Bogota, no el
 * dia nominal de la loteria. Un resultado anterior nunca se presenta como el
 * de hoy.
 */

import {
  LOTTERY_ASSIGNMENT_STATUS_LABELS,
  LOTTERY_LABELS,
  type LotteryCode,
} from '@/features/lottery/constants'
import { notificationMessage } from '@/features/notifications/text'
import { formatTimeEs, formatWeekdayEs, isoDateBogota } from '@/lib/dates'
import { ticketLabel } from '@/lib/tickets'

import type { Database } from '@/types/database.types'

type ScheduleStatus = Database['public']['Enums']['lottery_schedule_status']
type ChangeReason = Database['public']['Enums']['lottery_schedule_change_reason']
type ValidationStatus = Database['public']['Enums']['lottery_result_validation_status']
type AssignmentStatus = Database['public']['Enums']['lottery_assignment_status']

export const LOTTERY_DASHBOARD_LOOKBEHIND_DAYS = 10
export const LOTTERY_DASHBOARD_LOOKAHEAD_DAYS = 21
export const LOTTERY_DASHBOARD_MATCH_LINKS = 6

/**
 * Plazo maximo de la lectura LOCAL del recuadro (D-155).
 *
 * Desde que el recuadro vive en su propio limite de Suspense, una consulta
 * lenta ya no retrasa el resto del Panel: solo mantiene abierto ESE hueco. El
 * plazo existe para que el hueco tampoco se quede abierto indefinidamente si
 * PostgREST deja de responder —la respuesta HTTP no se cierra hasta que el
 * limite resuelve— y para que se vea el aviso de error en vez de una espera sin
 * final.
 *
 * Cubre las DOS consultas juntas, no cada una: es el presupuesto de la lectura
 * entera. 3 s es holgado; las dos consultas medidas en local tardan ~20 ms.
 */
export const LOTTERY_DASHBOARD_TIMEOUT_MS = 3_000

/** Proyeccion de programacion + resultado. Sin HTML ni coincidencias. */
export const LOTTERY_DASHBOARD_SCHEDULE_SELECT = [
  'id',
  'lottery_code',
  'draw_number',
  'reference_date',
  'original_scheduled_at',
  'official_scheduled_at',
  'schedule_status',
  'change_reason',
  'source_url',
  'source_authority',
  'verified_at',
  'lottery_results ( id, winning_number, series, validation_status, source_url, source_kind, evidence, fetched_at, confirmed_at )',
].join(', ')

/** Coincidencias del ambito de quien pregunta, con la boleta y la rifa. */
export const LOTTERY_DASHBOARD_MATCH_SELECT = [
  'result_id',
  'assignment_status',
  'matched_number',
  'ticket_id',
  'raffle:raffles!lottery_ticket_matches_raffle_org_fk ( name )',
  'ticket:tickets!lottery_ticket_matches_ticket_org_fk ( daily_number, weekly_number )',
  'client:clients!lottery_ticket_matches_client_org_fk ( name )',
].join(', ')

export const LOTTERY_DASHBOARD_COPY = {
  title: 'Resultados y próxima lotería',
  emptyTitle: 'Todavía no hay resultados oficiales',
  emptyDescription:
    'Cuando se publique la programación de los sorteos, el número mayor aparecerá aquí.',
  errorTitle: 'No se pudieron cargar los resultados oficiales',
  errorDescription: 'El resto del panel sigue disponible. Intenta recargar la página.',
  loading: 'Buscando los resultados oficiales…',
  pending: 'Resultado pendiente',
  rejected: 'No se pudo confirmar el resultado.',
  conflict: 'La fuente oficial publicó otro número. Requiere verificación.',
  noDrawToday: 'Hoy no hay sorteo programado.',
  // Las dos tarjetas se rotulan por el DIA, no por su papel: «Hoy» y «Ayer»
  // dicen en una palabra lo que «Proximo sorteo» y «Ultimo resultado» decian en
  // dos, y siguen siendo ciertos cuando el sorteo cae en otro dia (D-167).
  today: 'Hoy',
  yesterday: 'Ayer',
  tomorrow: 'Mañana',
  // Encabezado de la hora. Solo se escribe cuando el sorteo TODAVIA no se ha
  // jugado: pasada la hora la tarjeta dice `pending`, nunca «juega hoy a las».
  playsToday: 'Juega hoy a las',
  playsTomorrow: 'Juega mañana a las',
  playsOn: (weekday: string) => `Juega el ${weekday} a las`,
  drawNumber: (numero: string) => `Sorteo ${numero}`,
  // Solo cuando la fecha nominal del premio no es el dia en que se juega
  // (BR-L03): asi no se pierde ninguno de los dos datos.
  referenceDay: (fecha: string) => `Correspondiente al ${fecha}`,
  autoUpdate: 'Actualizado automáticamente cada día',
  winningNumber: 'Número mayor',
  series: 'Serie informativa',
  officialSource: 'Fuente oficial',
  // Un resultado por consenso NO se presenta como oficial (D-162, BR-L26).
  // Se dice cuantas fuentes lo respaldan, con el numero real.
  consensusSource: (fuentes: number) => `Verificado por ${fuentes} fuentes`,
  weekChanges: 'Cambios de programación',
  noMatchSeller: 'Ninguna de tus boletas coincidió con este número.',
  noMatchStaff: 'Ninguna boleta coincidió con este número.',
  // ---------------------------------------------------------------------
  // Forma compacta del recuadro, en lo alto del panel del vendedor (D-180).
  //
  // «Loterías» y no «Resultados y próxima lotería»: debajo van dos filas
  // rotuladas «Próxima» y «Último resultado», que es literalmente lo que
  // decia ese titulo. Un titulo que repite las dos etiquetas que tiene
  // justo debajo no dice nada nuevo (misma regla que D-126). El titulo
  // largo NO se toca: lo sigue usando el recuadro completo del portal
  // administrativo.
  // ---------------------------------------------------------------------
  compactTitle: 'Loterías',
  upcomingRow: 'Próxima',
  lastResultRow: 'Último resultado',
  showDetail: 'Ver detalle',
  hideDetail: 'Ocultar detalle',
  // Lo visible se queda corto —dentro de una tarjeta que se llama «Loterías»
  // no hace falta mas— pero el nombre accesible dice de que detalle habla: en
  // esta misma pantalla hay un «Ver detalle de cobranza», y quien escucha los
  // controles uno detras de otro no tiene la tarjeta delante para distinguirlos
  // (D-114).
  detailSubject: 'de las loterías',
  // Las coincidencias en corto. La version larga —cuantas se vendieron
  // antes del sorteo, cuantas seguian disponibles y cuantas se asignaron
  // despues— sigue entera dentro del detalle, que es donde cabe (BR-L15).
  noMatchesShort: 'Sin coincidencias',
  matchCount: (boletas: number) =>
    boletas === 1 ? '1 boleta coincidió' : `${boletas} boletas coincidieron`,
} as const

export type LotteryDashboardAudience = 'staff' | 'seller'

export type LotteryMatchSnapshot = {
  ticketId: string
  assignmentStatus: AssignmentStatus
  matchedNumber: string
  raffleName: string | null
  dailyNumber: string | null
  weeklyNumber: string | null
  clientName: string | null
}

export type LotteryResultSnapshot = {
  id: string
  winningNumber: string | null
  series: string | null
  validationStatus: ValidationStatus
  sourceUrl: string | null
  /** `alternative_consensus` si lo confirmaron dos fuentes, no la autoridad. */
  sourceKind: string | null
  /** Cuantos dominios formaron el consenso. Nulo si vino de la fuente oficial. */
  consensusSources: number | null
  fetchedAt: string
  confirmedAt: string | null
}

export type LotteryScheduleSnapshot = {
  id: string
  lotteryCode: LotteryCode
  drawNumber: string
  referenceDate: string
  originalScheduledAt: string | null
  officialScheduledAt: string | null
  scheduleStatus: ScheduleStatus
  changeReason: ChangeReason | null
  sourceUrl: string | null
  sourceAuthority: string | null
  verifiedAt: string | null
  result: LotteryResultSnapshot | null
  matches: LotteryMatchSnapshot[]
}

export type LotteryMatchView = {
  ticketId: string
  label: string
  assignmentStatus: AssignmentStatus
  assignmentLabel: string
  raffleName: string | null
  clientName: string | null
}

export type LotteryResultKind = 'none' | 'pending' | 'confirmed' | 'rejected' | 'conflict'

export type LotteryDrawView = {
  scheduleId: string
  lotteryCode: LotteryCode
  lotteryLabel: string
  drawNumber: string
  referenceDate: string
  officialScheduledAt: string | null
  originalScheduledAt: string | null
  officialDate: string | null
  scheduleStatus: ScheduleStatus
  changeReason: ChangeReason | null
  scheduleNotice: string | null
  resultKind: LotteryResultKind
  winningNumber: string | null
  series: string | null
  sourceUrl: string | null
  sourceAuthority: string | null
  /**
   * Cuantas fuentes respaldan el numero cuando NO lo confirmo la autoridad.
   * Nulo = vino de la fuente oficial. El Panel no puede presentar un consenso
   * como si fuera oficial (D-162).
   */
  consensusSources: number | null
  lastVerifiedAt: string | null
  matches: LotteryMatchView[]
  soldCount: number
  availableCount: number
  lateCount: number
  raffleNames: string[]
}

export type LotteryDashboardReady = {
  kind: 'ready'
  todayDraws: LotteryDrawView[]
  /**
   * El proximo sorteo, **solo cuando hoy no hay ninguno**. Es lo que pinta el
   * recuadro completo, y no cambia: con sorteo hoy, la tarjeta azul es la de
   * hoy y no la de pasado mañana.
   */
  nextDraw: LotteryDrawView | null
  /**
   * El proximo sorteo, HAYA O NO sorteo hoy (D-180).
   *
   * Es el mismo calculo de `nextDraw` sin el recorte de arriba, y existe porque
   * la forma compacta tiene una fila fija rotulada «Próxima» que debe decir algo
   * cierto tambien cuando el sorteo de hoy ya se jugo. Se añade en vez de
   * ensanchar `nextDraw` para no cambiar lo que ve el portal administrativo:
   * ahi seguirian saliendo dos tarjetas azules donde hoy sale una.
   */
  nextScheduled: LotteryDrawView | null
  previousConfirmed: LotteryDrawView | null
  weekAlerts: LotteryDrawView[]
}

export type LotteryDashboard = { kind: 'error' } | { kind: 'empty' } | LotteryDashboardReady

function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function lotteryDashboardWindow(today: string): { from: string; to: string } {
  return {
    from: addIsoDays(today, -LOTTERY_DASHBOARD_LOOKBEHIND_DAYS),
    to: addIsoDays(today, LOTTERY_DASHBOARD_LOOKAHEAD_DAYS),
  }
}

function mondayOfWeek(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (weekday - 1))
  return date.toISOString().slice(0, 10)
}

function officialBogotaDate(row: LotteryScheduleSnapshot): string | null {
  if (row.officialScheduledAt) return isoDateBogota(row.officialScheduledAt)
  if (row.scheduleStatus === 'schedule_unverified') return row.referenceDate
  return null
}

function sortInstant(row: LotteryScheduleSnapshot): number {
  if (row.officialScheduledAt) {
    const value = Date.parse(row.officialScheduledAt)
    return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
  }
  return Date.parse(`${row.referenceDate}T23:59:59-05:00`)
}

function isNotableSchedule(status: ScheduleStatus, reason: ChangeReason | null): boolean {
  if (
    status === 'rescheduled_later' ||
    status === 'rescheduled_earlier' ||
    status === 'suspended' ||
    status === 'cancelled' ||
    status === 'schedule_unverified' ||
    status === 'schedule_conflict'
  ) {
    return true
  }
  return status === 'scheduled' && reason === 'holiday'
}

function resultKind(result: LotteryResultSnapshot | null): LotteryResultKind {
  if (!result) return 'none'
  if (result.validationStatus === 'confirmed') return 'confirmed'
  if (result.validationStatus === 'conflict') return 'conflict'
  if (result.validationStatus === 'rejected') return 'rejected'
  return 'pending'
}

function winningNumberOf(result: LotteryResultSnapshot | null): string | null {
  if (!result) return null
  if (result.validationStatus !== 'confirmed' && result.validationStatus !== 'conflict') {
    return null
  }
  return result.winningNumber
}

function scheduleNotice(row: LotteryScheduleSnapshot): string | null {
  if (!isNotableSchedule(row.scheduleStatus, row.changeReason)) return null
  const officialDate = row.officialScheduledAt ? isoDateBogota(row.officialScheduledAt) : null
  return notificationMessage('lottery.schedule_change', {
    lottery_code: row.lotteryCode,
    schedule_status: row.scheduleStatus,
    change_reason: row.changeReason,
    reference_date: row.referenceDate,
    official_date: officialDate,
  })
}

function toMatchView(match: LotteryMatchSnapshot): LotteryMatchView {
  return {
    ticketId: match.ticketId,
    label: ticketLabel({
      dailyNumber: match.dailyNumber,
      weeklyNumber: match.weeklyNumber,
    }),
    assignmentStatus: match.assignmentStatus,
    assignmentLabel: LOTTERY_ASSIGNMENT_STATUS_LABELS[match.assignmentStatus],
    raffleName: match.raffleName,
    clientName: match.clientName,
  }
}

export function toDrawView(row: LotteryScheduleSnapshot): LotteryDrawView {
  const matches = row.matches.map(toMatchView)
  const raffleNames = [
    ...new Set(
      matches.map((match) => match.raffleName).filter((name): name is string => Boolean(name)),
    ),
  ]
  const result = row.result
  return {
    scheduleId: row.id,
    lotteryCode: row.lotteryCode,
    lotteryLabel: LOTTERY_LABELS[row.lotteryCode],
    drawNumber: row.drawNumber,
    referenceDate: row.referenceDate,
    officialScheduledAt: row.officialScheduledAt,
    originalScheduledAt: row.originalScheduledAt,
    officialDate: officialBogotaDate(row),
    scheduleStatus: row.scheduleStatus,
    changeReason: row.changeReason,
    scheduleNotice: scheduleNotice(row),
    resultKind: resultKind(result),
    winningNumber: winningNumberOf(result),
    series: result?.series ?? null,
    sourceUrl: result?.sourceUrl ?? row.sourceUrl,
    sourceAuthority: row.sourceAuthority,
    consensusSources:
      result?.sourceKind === 'alternative_consensus' ? (result.consensusSources ?? 2) : null,
    lastVerifiedAt: result?.fetchedAt ?? row.verifiedAt,
    matches,
    soldCount: matches.filter((match) => match.assignmentStatus === 'sold').length,
    availableCount: matches.filter((match) => match.assignmentStatus === 'available').length,
    lateCount: matches.filter((match) => match.assignmentStatus === 'late_assignment').length,
    raffleNames,
  }
}

export function matchSummaryText(
  draw: Pick<LotteryDrawView, 'soldCount' | 'availableCount' | 'lateCount' | 'resultKind'>,
  audience: LotteryDashboardAudience,
): string | null {
  if (draw.resultKind !== 'confirmed' && draw.resultKind !== 'conflict') return null
  const { soldCount, availableCount, lateCount } = draw
  if (soldCount === 0 && availableCount === 0 && lateCount === 0) {
    return audience === 'seller'
      ? LOTTERY_DASHBOARD_COPY.noMatchSeller
      : LOTTERY_DASHBOARD_COPY.noMatchStaff
  }
  const parts: string[] = []
  if (soldCount > 0) {
    parts.push(
      soldCount === 1
        ? '1 boleta asignada antes del sorteo'
        : `${soldCount} boletas asignadas antes del sorteo`,
    )
  }
  if (availableCount > 0) {
    parts.push(
      availableCount === 1 ? '1 boleta disponible' : `${availableCount} boletas disponibles`,
    )
  }
  if (lateCount > 0) {
    parts.push(
      lateCount === 1
        ? '1 boleta asignada después del sorteo'
        : `${lateCount} boletas asignadas después del sorteo`,
    )
  }
  return parts.join(' · ')
}

/**
 * El dia que manda para rotular un sorteo: cuando se JUEGA, no el nominal.
 *
 * Vive aqui y no en el componente porque lo usan los dos: el recuadro completo
 * para su rotulo del dia y la forma compacta para su linea de «Próxima».
 */
export function drawPlayDate(
  draw: Pick<LotteryDrawView, 'officialDate' | 'referenceDate'>,
): string {
  return draw.officialDate ?? draw.referenceDate
}

/** Un sorteo con numero publicado es un RESULTADO; el resto, una espera. */
export function drawHasNumber(
  draw: Pick<LotteryDrawView, 'resultKind' | 'winningNumber'>,
): boolean {
  return (
    (draw.resultKind === 'confirmed' || draw.resultKind === 'conflict') &&
    draw.winningNumber !== null
  )
}

/**
 * «hoy» + «10:30 p. m.» — cuando juega un sorteo (D-180).
 *
 * LA HORA SOLO SE DEVUELVE SI TODAVIA NO HA JUGADO. Es la misma regla que ya
 * aplica el recuadro completo (D-167): «Juega hoy a las 11:15 p. m.» es una
 * promesa, y pasada esa hora deja de serlo. Aqui se resuelve callando la hora y
 * dejando solo el dia; quien quiera saber que falta lo lee en la fila de al
 * lado, que dira «Resultado pendiente».
 *
 * El dia va en minuscula porque va dentro de una frase —«Bogotá · hoy, 10:30
 * p. m.»—, que ademas es como se escriben los dias de la semana en español.
 *
 * VUELVEN LAS DOS PIEZAS POR SEPARADO, no la frase montada, porque quien la
 * pinta necesita impedir que la linea se parta DENTRO de la hora: a 320 px
 * «10:30 p. m.» se rompia entre «p.» y «m.», que se lee como una errata.
 */
export function compactWhen(
  draw: Pick<
    LotteryDrawView,
    'officialDate' | 'referenceDate' | 'officialScheduledAt' | 'scheduleStatus'
  >,
  today: string,
  now: Date,
): { day: string; time: string | null } {
  const day = relativeDayLabel(drawPlayDate(draw), today).toLocaleLowerCase('es-CO')
  if (!draw.officialScheduledAt) return { day, time: null }
  const at = Date.parse(draw.officialScheduledAt)
  if (Number.isNaN(at) || at <= now.getTime()) return { day, time: null }
  return { day, time: formatTimeEs(draw.officialScheduledAt) }
}

/**
 * Las coincidencias en corto: «Sin coincidencias», «1 boleta coincidió»,
 * «N boletas coincidieron» (D-180).
 *
 * CUENTA, NO CLASIFICA. El reparto por como estaba la boleta cuando se jugo
 * —vendida antes, todavia disponible, asignada despues— es lo que distingue
 * una coincidencia normal de una sospechosa, y por eso NO se pierde: sigue
 * entero en `matchSummaryText`, dentro del detalle. Aqui solo se dice cuantas
 * son, que es lo que cabe en una fila y lo unico que hace falta para decidir
 * si merece la pena abrirlo.
 *
 * Devuelve `null` cuando todavia no hay numero: sin numero no hay nada con lo
 * que coincidir, y escribir «Sin coincidencias» ahi seria dar por comprobado un
 * sorteo que no se ha jugado.
 */
export function compactMatchText(
  draw: Pick<LotteryDrawView, 'matches' | 'resultKind' | 'winningNumber'>,
): string | null {
  if (!drawHasNumber(draw)) return null
  return draw.matches.length === 0
    ? LOTTERY_DASHBOARD_COPY.noMatchesShort
    : LOTTERY_DASHBOARD_COPY.matchCount(draw.matches.length)
}

export function raffleSummaryText(names: string[]): string | null {
  if (names.length === 1) return `en ${names[0]}`
  if (names.length > 1) return `en ${names.length} rifas`
  return null
}

/**
 * Rotulo del dia de un sorteo: «Hoy», «Ayer», «Mañana» o el dia de la semana
 * (D-167).
 *
 * SOLO PRESENTACION. No decide que sorteo se muestra —eso sigue siendo
 * `buildLotteryDashboard`—: traduce a una palabra la fecha que ese reparto ya
 * eligio. Se calcula, nunca se escribe fijo: `previousConfirmed` puede ser de
 * hace tres dias y `nextDraw`, del martes que viene; una etiqueta «Ayer» a
 * mano mentiria en cuanto una loteria no publique a tiempo.
 *
 * Un dia mas lejano se dice por su dia de la semana, y la fecha completa va
 * escrita justo debajo en la tarjeta: «Martes» a secas seria ambiguo solo.
 */
export function relativeDayLabel(isoDate: string, today: string): string {
  if (isoDate === today) return LOTTERY_DASHBOARD_COPY.today
  if (isoDate === addIsoDays(today, -1)) return LOTTERY_DASHBOARD_COPY.yesterday
  if (isoDate === addIsoDays(today, 1)) return LOTTERY_DASHBOARD_COPY.tomorrow
  const weekday = formatWeekdayEs(isoDate)
  return weekday.charAt(0).toUpperCase() + weekday.slice(1)
}

/**
 * Elige los sorteos que el recuadro debe mostrar.
 *
 * `today` es el dia calendario de Bogota (`YYYY-MM-DD`). `now` decide si un
 * sorteo de hoy todavia no se ha jugado.
 */
export function buildLotteryDashboard(
  rows: LotteryScheduleSnapshot[],
  today: string,
  now: Date = new Date(`${today}T12:00:00-05:00`),
): LotteryDashboard {
  if (rows.length === 0) return { kind: 'empty' }

  const views = [...rows].sort((a, b) => sortInstant(a) - sortInstant(b)).map(toDrawView)

  const todayDraws = views.filter((draw) => draw.officialDate === today)

  const todayIds = new Set(todayDraws.map((draw) => draw.scheduleId))
  const todayHasConfirmed = todayDraws.some(
    (draw) => draw.resultKind === 'confirmed' || draw.resultKind === 'conflict',
  )

  const previousConfirmed = todayHasConfirmed
    ? null
    : (views
        .filter(
          (draw) =>
            (draw.resultKind === 'confirmed' || draw.resultKind === 'conflict') &&
            !todayIds.has(draw.scheduleId),
        )
        .sort((a, b) => {
          const aTime = a.officialScheduledAt ?? a.referenceDate
          const bTime = b.officialScheduledAt ?? b.referenceDate
          return Date.parse(bTime) - Date.parse(aTime)
        })[0] ?? null)

  const nowMs = now.getTime()
  const nextDraw =
    views.find((draw) => {
      if (todayIds.has(draw.scheduleId)) return false
      if (draw.scheduleStatus === 'cancelled' || draw.scheduleStatus === 'suspended') {
        return false
      }
      if (draw.officialScheduledAt) {
        const at = Date.parse(draw.officialScheduledAt)
        return !Number.isNaN(at) && at > nowMs
      }
      return draw.referenceDate > today
    }) ?? null

  const weekStart = mondayOfWeek(today)
  const weekEnd = addIsoDays(weekStart, 6)
  const shownNext = todayDraws.length === 0 ? nextDraw : null
  const shownIds = new Set([
    ...todayIds,
    ...(shownNext ? [shownNext.scheduleId] : []),
    ...(previousConfirmed ? [previousConfirmed.scheduleId] : []),
  ])
  const weekAlerts = views.filter((draw) => {
    if (shownIds.has(draw.scheduleId)) return false
    if (!isNotableSchedule(draw.scheduleStatus, draw.changeReason)) return false
    const date = draw.referenceDate
    return date >= weekStart && date <= weekEnd
  })

  return {
    kind: 'ready',
    todayDraws,
    nextDraw: shownNext,
    nextScheduled: nextDraw,
    previousConfirmed,
    weekAlerts,
  }
}
