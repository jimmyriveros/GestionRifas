'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import { changeRaffleStatus } from '@/features/raffles/actions'

import { RAFFLE_WIZARD_COPY } from '../copy'
import { raffleReviewProblems } from '../review'
import { PrizeList } from './PrizeList'

import type { PrizeListItem, PrizeRaffleContext } from '../queries'

/**
 * El último paso de crear una rifa: revisar los premios y activarla (D-202).
 *
 * LO QUE IMPIDE ACTIVAR SE DICE ANTES, no al fallar: sin premios, con fechas
 * fuera de la rifa o con dos premios que se cruzan, el botón no se ofrece y se
 * explica qué falta (`UX_COPY_GUIDELINES` §5). La comprobación de aquí es una
 * cortesía: la que manda es la de PostgreSQL, que vuelve a hacerla al activar.
 *
 * ACTIVAR NO OCURRE SOLO. Guardar el último premio no activa nada: hay una
 * acción explícita y una confirmación que dice qué va a pasar.
 */
export function RaffleReview({
  raffle,
  prizes,
}: {
  raffle: PrizeRaffleContext
  prizes: PrizeListItem[]
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  const active = prizes.filter((prize) => prize.status === 'active')
  const problems = raffleReviewProblems(
    active.map((prize) => ({
      id: prize.id,
      title: prize.title,
      numberField: prize.numberField,
      digits: prize.digits,
      rules: prize.rules,
    })),
    raffle,
  )

  const alreadyActive = raffle.status !== 'draft'
  const canActivate = !alreadyActive && problems.length === 0

  function activate() {
    startTransition(async () => {
      const result = await changeRaffleStatus({ id: raffle.id, status: 'active' })
      if ('error' in result) {
        toast.error(result.error)
        setConfirming(false)
        router.refresh()
        return
      }
      setConfirming(false)
      toast.success(RAFFLE_WIZARD_COPY.activated)
      router.push(`/owner/raffles/${raffle.id}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {alreadyActive ? (
        <Notice tone="info">{RAFFLE_WIZARD_COPY.alreadyActive}</Notice>
      ) : problems.length > 0 ? (
        <Notice tone="warning">
          <div className="space-y-1">
            <p className="font-medium">{RAFFLE_WIZARD_COPY.blockedTitle}</p>
            <ul className="list-disc space-y-1 pl-4">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        </Notice>
      ) : null}

      <PrizeList prizes={active} />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          size="touch"
          disabled={!canActivate || isPending}
          onClick={() => setConfirming(true)}
          className="w-full sm:w-auto"
        >
          {isPending ? RAFFLE_WIZARD_COPY.activating : RAFFLE_WIZARD_COPY.activate}
        </Button>
        <Button asChild variant="outline" size="touch" className="w-full sm:w-auto">
          <Link href={`/owner/raffles/${raffle.id}/prizes`}>{RAFFLE_WIZARD_COPY.reviewBack}</Link>
        </Button>
        <Button asChild variant="ghost" size="touch" className="w-full sm:w-auto">
          <Link href="/owner/raffles">{RAFFLE_WIZARD_COPY.saveForLater}</Link>
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={RAFFLE_WIZARD_COPY.activateConfirm.title}
        description={RAFFLE_WIZARD_COPY.activateConfirm.description}
        confirmLabel={RAFFLE_WIZARD_COPY.activateConfirm.confirm}
        pendingLabel={RAFFLE_WIZARD_COPY.activating}
        pending={isPending}
        onConfirm={activate}
      />
    </div>
  )
}
