'use client'

import { useRouter } from 'next/navigation'

import { LinearProgress } from '@/components/data/LinearProgress'
import { Button } from '@/components/ui/button'

import type { GenerationProgress } from '../actions'
import { INVENTORY_COPY } from '../copy'
import { formatCount } from '../rules'
import { useGenerationRunner } from './use-generation-runner'

const C = INVENTORY_COPY.generator

/**
 * Continuar una generacion que quedo a medias (BR-N18): desde el ULTIMO avance
 * que la base confirmo, que es el que trae la pagina. Lo ya creado no se toca;
 * si otra pestaña la estaba continuando, la base responde con el avance real y
 * esta sigue desde ahi.
 */
export function GenerationRunContinue({ initial }: { initial: GenerationProgress }) {
  const router = useRouter()
  const runner = useGenerationRunner()
  const progress = runner.progress ?? initial

  function run() {
    void runner.runFrom(progress).then(() => router.refresh())
  }

  return (
    <div className="space-y-3" aria-live="polite">
      <p className="text-sm font-medium tabular-nums">
        {runner.running
          ? C.progress(progress.processedCount, progress.totalCount)
          : C.interrupted(progress.createdCount, progress.processedCount, progress.totalCount)}
      </p>
      <LinearProgress
        value={progress.processedCount}
        max={progress.totalCount}
        label={C.progressLabel}
        valueText={`${formatCount(progress.processedCount)} de ${formatCount(progress.totalCount)}`}
      />
      {runner.running ? <p className="text-muted-foreground text-xs">{C.keepOpen}</p> : null}
      {runner.error ? (
        <p role="alert" className="text-destructive text-sm">
          {runner.error}
        </p>
      ) : null}
      {!runner.running && progress.status !== 'completed' ? (
        <Button type="button" size="touch" onClick={run}>
          {C.continue}
        </Button>
      ) : null}
    </div>
  )
}
