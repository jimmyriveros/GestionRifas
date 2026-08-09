import { digitsOnly, foldForSearch } from '@/lib/search'

import type { ImportRow } from './rows'

/** Identidad comparable; nunca reemplaza el nombre ni el celular mostrados. */
export function clientIdentityKey(name: string, phone: string): string {
  return JSON.stringify([foldForSearch(name), clientPhoneKey(phone)])
}

/** Celular nacional comparable, compartido por la detección de ambigüedades. */
export function clientPhoneKey(phone: string): string {
  const digits = digitsOnly(phone)
  return digits.length > 10 ? digits.slice(-10) : digits
}

export function hasAnyClientData(row: Pick<ImportRow, 'clientName' | 'clientPhone'>): boolean {
  return Boolean(row.clientName?.trim() || row.clientPhone?.trim())
}

export function hasCompleteClientData(
  row: Pick<ImportRow, 'clientName' | 'clientPhone'>,
): row is ImportRow & { clientName: string; clientPhone: string } {
  return Boolean(row.clientName?.trim() && row.clientPhone?.trim())
}

export type ImportClientGroup = {
  key: string
  name: string
  phone: string
}

/** Un grupo por nombre + celular normalizados, conservando el primer texto visible. */
export function groupImportClients(
  rows: readonly Pick<ImportRow, 'clientName' | 'clientPhone'>[],
): ImportClientGroup[] {
  const groups = new Map<string, ImportClientGroup>()

  for (const row of rows) {
    if (!hasCompleteClientData(row)) continue
    const name = row.clientName.trim()
    const phone = row.clientPhone.trim()
    const key = clientIdentityKey(name, phone)
    if (!groups.has(key)) groups.set(key, { key, name, phone })
  }

  return [...groups.values()]
}

export type ClientResolution = ImportClientGroup & {
  status: 'existing' | 'new' | 'conflict'
  clientId?: string
  problem?: string
}
