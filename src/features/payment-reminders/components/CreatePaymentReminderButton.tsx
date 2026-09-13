'use client'

import { PlusIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { PaymentAccount } from '@/features/payment-accounts/accounts'

import {
  countActive,
  PAYMENT_REMINDER_MAX,
  REMINDER_COPY,
  type PaymentReminder,
} from '../reminders'
import { PaymentReminderDialog } from './PaymentReminderDialog'

/**
 * «Crear recordatorio»: la unica accion del encabezado de «Recordatorios de
 * pago» (BR-S05, D-188).
 *
 * EL PATRON DE `CreateUserButton`: el boton y el dialogo de CREAR viajan
 * juntos, de modo que la pagina lo pasa a `PageHeader` sin dejar de ser un
 * Server Component. Editar se queda en `PaymentRemindersSection`, con su propia
 * instancia del MISMO `PaymentReminderDialog`. Cerrado, un dialogo no monta
 * nada, y ninguno de los dos se duplica segun el ancho de la pantalla.
 *
 * EL TOPE SE DICE CUANDO ESTORBA, Y PEGADO A LO QUE BLOQUEA (D-188): la frase
 * va debajo del boton desactivado, igual que cuando vivia al pie de la lista.
 * La cuenta es la misma de siempre, y la base lo sigue imponiendo con su
 * trigger.
 *
 * Va en `actions` y NO en `compactAction`, a proposito. La cabecera compacta
 * deja el CTA en un icono en el telefono (D-150), y con el tope alcanzado ahi
 * quedaria un «+» desactivado sin la frase que explica por que.
 */
export function CreatePaymentReminderButton({
  reminders,
  accounts,
}: {
  reminders: PaymentReminder[]
  accounts: PaymentAccount[]
}) {
  const [open, setOpen] = useState(false)
  const isFull = countActive(reminders) >= PAYMENT_REMINDER_MAX

  // Telefono: a ancho completo, debajo del titulo. Desde `sm` el encabezado
  // pone sus acciones a la derecha y el boton recupera su ancho natural.
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <Button
        type="button"
        size="touch"
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
        disabled={isFull}
      >
        <PlusIcon className="size-4" aria-hidden />
        {REMINDER_COPY.add}
      </Button>
      {isFull ? (
        <p className="text-body-small text-muted-foreground sm:max-w-xs sm:text-right">
          {REMINDER_COPY.addBlocked}
        </p>
      ) : null}

      <PaymentReminderDialog open={open} onOpenChange={setOpen} accounts={accounts} />
    </div>
  )
}
