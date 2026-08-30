import type { LotteryCode } from './constants'

export type AdapterFailureCode =
  | 'blocked_host'
  | 'blocked_redirect'
  | 'timeout'
  | 'too_large'
  | 'unsupported_type'
  | 'source_blocked'
  | 'empty'
  | 'ambiguous'
  | 'not_ordinary'
  | 'structure_changed'
  | 'invalid_number'
  | 'parse_error'

export type AdapterOk<T> = {
  ok: true
  value: T
  sourceUrl: string
  contentType: string
  contentHash: string
  fetchedAt: string
}

export type AdapterFail = {
  ok: false
  code: AdapterFailureCode
  message: string
  sourceUrl?: string
  contentHash?: string
}

export type AdapterOutcome<T> = AdapterOk<T> | AdapterFail

export type CnjsaDocumentKind = 'consolidated' | 'ordinary_acuerdo' | 'extraordinary' | 'other'

export type CnjsaDiscoveredDocument = {
  title: string
  href: string
  kind: CnjsaDocumentKind
}

export type NormalizedScheduleDraw = {
  lotteryCode: LotteryCode
  drawNumber: string
  referenceDate: string
  officialScheduledAt: string
  originalScheduledAt: string
  scheduleStatus:
    | 'scheduled'
    | 'rescheduled_later'
    | 'rescheduled_earlier'
    | 'suspended'
    | 'cancelled'
  changeReason: 'holiday' | 'official_change' | 'force_majeure' | 'unknown' | null
  acuerdo: string | null
  acuerdoModificatorio: string | null
}

export type NormalizedSchedule = {
  authority: 'CNJSA'
  documentTitle: string
  documentUrl: string
  documentVersion: string | null
  draws: NormalizedScheduleDraw[]
  skippedExtraordinary: number
}

export type NormalizedLotteryResult = {
  lotteryCode: LotteryCode
  drawNumber: string
  officialDate: string
  winningNumber: string
  series: string | null
  sourceKind: 'official_page' | 'official_bulletin' | 'official_act'
}
