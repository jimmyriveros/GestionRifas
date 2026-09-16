import { CheckIcon } from 'lucide-react'

import { RAFFLE_WIZARD_COPY } from '@/features/raffle-prizes/copy'
import { cn } from '@/lib/utils'

/**
 * Los tres pasos de crear una rifa: datos, premios y revisión (D-202).
 *
 * Dice dónde está la persona y qué falta, y nada más: no navega. Los pasos ya
 * hechos llevan un visto ADEMÁS del color, porque aquí ningún significado se
 * fía solo al color (`CLAUDE.md` §27).
 */

const STEPS = [
  RAFFLE_WIZARD_COPY.steps.details,
  RAFFLE_WIZARD_COPY.steps.prizes,
  RAFFLE_WIZARD_COPY.steps.review,
] as const

export function RaffleWizardSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label={RAFFLE_WIZARD_COPY.stepOf(current, STEPS.length)}>
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((step, index) => {
          const number = index + 1
          const done = number < current
          const active = number === current

          return (
            <li key={step} className="flex items-center gap-2">
              <span
                className={cn(
                  'text-body-small flex items-center gap-1.5 rounded-full border px-3 py-1',
                  active && 'bg-surface-accent text-text-on-accent border-transparent font-medium',
                  done && 'text-muted-foreground',
                  !active && !done && 'text-muted-foreground border-dashed',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <CheckIcon className="size-3.5" aria-hidden /> : <span>{number}.</span>}
                {step}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
