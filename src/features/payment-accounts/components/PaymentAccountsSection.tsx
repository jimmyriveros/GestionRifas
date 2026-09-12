'use client'

import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/data/EmptyState'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'

import { archivePaymentAccount, reorderPaymentAccounts, restorePaymentAccount } from '../actions'
import {
  ACCOUNT_COPY,
  accountParts,
  activeAccounts,
  archivedAccounts,
  PAYMENT_ACCOUNT_MAX,
  type PaymentAccount,
} from '../accounts'
import { PaymentAccountDialog } from './PaymentAccountDialog'

/**
 * «Cuentas para recibir pagos» (BR-M01..BR-M09, D-188).
 *
 * Las cuentas llegan del servidor y esta pantalla NO las vuelve a consultar: lo
 * que cambia lo refresca `revalidatePath` desde cada Server Action. Sin estado
 * global, sin sondeo y sin Realtime (D-185).
 *
 * EL ORDEN SE CAMBIA CON «Subir» y «Bajar», no arrastrando. Arrastrar en un
 * telefono compite con el desplazamiento de la pagina y no tiene equivalente de
 * teclado; dos botones se tocan, se anuncian y funcionan igual en los dos
 * sitios. Cada pulsacion manda la lista COMPLETA en el orden resultante, que es
 * lo que espera la RPC y lo que hace la operacion idempotente.
 */
export function PaymentAccountsSection({ accounts }: { accounts: PaymentAccount[] }) {
  const active = activeAccounts(accounts)
  const archived = archivedAccounts(accounts)
  const isFull = active.length >= PAYMENT_ACCOUNT_MAX

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentAccount | undefined>(undefined)
  const [archiving, setArchiving] = useState<PaymentAccount | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(account: PaymentAccount) {
    setEditing(account)
    setDialogOpen(true)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= active.length) return

    const ids = active.map((account) => account.id)
    const moved = ids[index]!
    ids[index] = ids[target]!
    ids[target] = moved

    startTransition(async () => {
      const result = await reorderPaymentAccounts({ accountIds: ids })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(ACCOUNT_COPY.reordered)
    })
  }

  function confirmArchive() {
    if (!archiving) return
    const account = archiving
    startTransition(async () => {
      const result = await archivePaymentAccount({ accountId: account.id })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setArchiving(null)
      toast.success(ACCOUNT_COPY.archived)
    })
  }

  function restore(account: PaymentAccount) {
    startTransition(async () => {
      const result = await restorePaymentAccount({ accountId: account.id })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(ACCOUNT_COPY.restored)
    })
  }

  return (
    <div className="space-y-6">
      {active.length === 0 ? (
        <EmptyState
          title={ACCOUNT_COPY.empty.title}
          description={ACCOUNT_COPY.empty.description}
          action={
            <Button size="touch" onClick={openCreate}>
              <PlusIcon className="size-4" aria-hidden />
              {ACCOUNT_COPY.add}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">
            {active.map((account, index) => (
              <li
                key={account.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  {/*
                    La cuenta, en el orden en que se dicta por teléfono
                    (UX_COPY_GUIDELINES, Anexo A). El nombre para reconocerla va
                    aparte y en gris: es del vendedor y no viaja al mensaje.
                  */}
                  <p className="text-body-medium break-words">
                    {accountParts(account).join(' · ')}
                  </p>
                  {account.label ? (
                    <p className="text-body-small text-muted-foreground break-words">
                      {account.label}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    onClick={() => move(index, -1)}
                    disabled={isPending || index === 0}
                  >
                    <ChevronUpIcon className="size-4" aria-hidden />
                    <span className="sr-only">
                      {ACCOUNT_COPY.moveUp} {accountParts(account)[0]}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    onClick={() => move(index, 1)}
                    disabled={isPending || index === active.length - 1}
                  >
                    <ChevronDownIcon className="size-4" aria-hidden />
                    <span className="sr-only">
                      {ACCOUNT_COPY.moveDown} {accountParts(account)[0]}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={() => openEdit(account)}
                    disabled={isPending}
                  >
                    {ACCOUNT_COPY.edit}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    onClick={() => setArchiving(account)}
                    disabled={isPending}
                  >
                    {ACCOUNT_COPY.archive}
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* El orden importa porque es el del mensaje: se dice, una vez. */}
          {active.length > 1 ? (
            <p className="text-body-small text-muted-foreground">{ACCOUNT_COPY.orderHelp}</p>
          ) : null}

          <div className="space-y-2">
            <Button size="touch" onClick={openCreate} disabled={isFull || isPending}>
              <PlusIcon className="size-4" aria-hidden />
              {ACCOUNT_COPY.add}
            </Button>
            {/*
              El tope se dice CUANDO estorba, no antes (D-188): con menos de
              cinco no hay ningun contador en pantalla. Y la frase es la misma
              que responde la base de datos.
            */}
            {isFull ? (
              <p className="text-body-small text-muted-foreground">{ACCOUNT_COPY.addBlocked}</p>
            ) : null}
          </div>
        </div>
      )}

      {archived.length > 0 ? (
        <section className="space-y-3 border-t pt-6">
          <h3 className="text-heading-h5">{ACCOUNT_COPY.archivedTitle}</h3>
          <ul className="space-y-2">
            {archived.map((account) => (
              <li
                key={account.id}
                className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-body-small text-muted-foreground min-w-0 break-words">
                  {accountParts(account).join(' · ')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="shrink-0"
                  onClick={() => restore(account)}
                  disabled={isPending || isFull}
                >
                  {ACCOUNT_COPY.restore}
                </Button>
              </li>
            ))}
          </ul>
          {isFull ? (
            <p className="text-body-small text-muted-foreground">{ACCOUNT_COPY.restoreBlocked}</p>
          ) : null}
        </section>
      ) : null}

      <PaymentAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null)
        }}
        title={ACCOUNT_COPY.archiveConfirm.title}
        description={ACCOUNT_COPY.archiveConfirm.description}
        confirmLabel={ACCOUNT_COPY.archiveConfirm.confirm}
        pendingLabel={ACCOUNT_COPY.archiveConfirm.pending}
        pending={isPending}
        onConfirm={confirmArchive}
      />
    </div>
  )
}
