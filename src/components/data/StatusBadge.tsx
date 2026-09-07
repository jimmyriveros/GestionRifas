import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  accountStatus,
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_STATUS_TONES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_TONES,
  RAFFLE_STATUS_LABELS,
  RAFFLE_STATUS_TONES,
  TICKET_INVENTORY_STATUS_LABELS,
  TICKET_INVENTORY_STATUS_TONES,
  TICKET_PAYMENT_STATUS_LABELS,
  TICKET_PAYMENT_STATUS_TONES,
  type RaffleStatus,
  type StatusTone,
  type TicketInventoryStatus,
  type TicketPaymentStatus,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Insignias de estado.
 *
 * SIEMPRE LLEVAN TEXTO: el color es un refuerzo, nunca la unica señal
 * (CLAUDE.md §27, docs/ARCHITECTURE.md §8.4). Aqui no hay ni una insignia de
 * solo icono, y no debe haberla.
 *
 * COMO ESTA ARMADO (Wave 4.5B). Antes cada familia de estados repetia su propia
 * cadena de colores —amber, sky, emerald, rose, slate— y esas cadenas estaban
 * ademas copiadas en otros cuatro componentes. Ahora hay tres piezas y cada una
 * decide UNA cosa:
 *
 *   1. el estado de negocio  →  su tono, en `src/lib/constants.ts`, pegado a la
 *      etiqueta que ya vivia alli;
 *   2. el tono              →  sus colores, en `TONE_CLASSES`, aqui abajo y una
 *      sola vez;
 *   3. la insignia          →  `StatusBadge`, que no sabe nada de negocio.
 *
 * Asi ningun componente vuelve a decidir por su cuenta que significa un estado,
 * y cambiar el verde de «Pagada» es cambiar un token, no diez archivos.
 *
 * LA PROP SE LLAMA `tone` Y NO `status` a proposito. El contrato de Figma la
 * escribe como `status="success"`, pero en esta base de codigo `status` ya
 * nombra el estado de negocio —`status={ticket.inventoryStatus}`— y tener las
 * dos cosas con el mismo nombre a un centimetro se lee mal.
 */

const BASE = 'border font-medium'

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-status-success-surface text-status-success-text border-status-success-border',
  warning: 'bg-status-warning-surface text-status-warning-text border-status-warning-border',
  error: 'bg-status-error-surface text-status-error-text border-status-error-border',
  info: 'bg-status-info-surface text-status-info-text border-status-info-border',
  neutral: 'bg-status-neutral-surface text-status-neutral-text border-status-neutral-border',
}

/**
 * La insignia generica. Es la unica que conoce los colores de un tono, y la
 * usan tambien los estados que viven fuera de este archivo —el calendario de
 * loterias, la tabla de pagos, la vista previa del importador—.
 */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <Badge variant="outline" className={cn(BASE, TONE_CLASSES[tone])}>
      {children}
    </Badge>
  )
}

export function InventoryStatusBadge({ status }: { status: TicketInventoryStatus }) {
  return (
    <StatusBadge tone={TICKET_INVENTORY_STATUS_TONES[status]}>
      {TICKET_INVENTORY_STATUS_LABELS[status]}
    </StatusBadge>
  )
}

export function PaymentStatusBadge({ status }: { status: TicketPaymentStatus }) {
  return (
    <StatusBadge tone={TICKET_PAYMENT_STATUS_TONES[status]}>
      {TICKET_PAYMENT_STATUS_LABELS[status]}
    </StatusBadge>
  )
}

export function RaffleStatusBadge({ status }: { status: RaffleStatus }) {
  return (
    <StatusBadge tone={RAFFLE_STATUS_TONES[status]}>{RAFFLE_STATUS_LABELS[status]}</StatusBadge>
  )
}

/**
 * Estado del cliente: activo o archivado (BR-C06).
 *
 * Archivar no es un error ni una anulacion —es un cliente que se guardo y se
 * puede restaurar—, asi que su tono es `neutral`, el mismo de «Cerrada» y
 * «Anulada». Antes compartia literalmente las clases de una rifa cerrada; ahora
 * comparte el SIGNIFICADO, que es lo que se queria decir.
 */
export function ClientStatusBadge({ archived }: { archived: boolean }) {
  const key = archived ? 'archived' : 'active'
  return <StatusBadge tone={CLIENT_STATUS_TONES[key]}>{CLIENT_STATUS_LABELS[key]}</StatusBadge>
}

/**
 * LEGADO MUERTO: hoy no lo usa ni una pantalla (verificado en la Wave 4.5A).
 *
 * No se borra —limpiar codigo muerto es otra tarea— pero tampoco se quedo con
 * sus colores a mano, porque esos ya no existen. `AccountStatusBadge` es quien
 * ocupa su sitio en las pantallas de personas, y distingue «Invitación
 * pendiente» de «Inactivo», que era justo lo que este confundia.
 */
export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <StatusBadge tone={isActive ? 'success' : 'neutral'}>
      {isActive ? 'Activo' : 'Inactivo'}
    </StatusBadge>
  )
}

/**
 * El estado de la cuenta de una persona: activa, con la invitacion pendiente o
 * sin acceso (BR-E14).
 *
 * «Invitación pendiente» es `info` y no `warning`: nadie tiene que hacer nada,
 * solo se espera a que la persona entre. Es justo la distincion que este badge
 * venia a resolver, y ahora tambien esta en el tono.
 */
export function AccountStatusBadge({
  isActive,
  activatedAt,
}: {
  isActive: boolean
  activatedAt: string | null
}) {
  const status = accountStatus({ isActive, activatedAt })
  return (
    <StatusBadge tone={ACCOUNT_STATUS_TONES[status]}>{ACCOUNT_STATUS_LABELS[status]}</StatusBadge>
  )
}
