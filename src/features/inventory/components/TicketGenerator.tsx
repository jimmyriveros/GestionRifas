'use client'

import { Rows3Icon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'

import { LinearProgress } from '@/components/data/LinearProgress'
import { Notice } from '@/components/feedback/Notice'
import { TicketNumberInput } from '@/components/form/TicketNumberInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LEGACY_NUMBER_FORMAT, type RaffleNumberFormat } from '@/lib/ticket-number-format'
import { ticketLabel } from '@/lib/tickets'

import { previewTicketGeneration, startTicketGeneration, type GenerationPreview } from '../actions'
import { INVENTORY_COPY } from '../copy'
import {
  formatCount,
  GENERATION_MAX,
  generationSample,
  generationTotal,
  groupRangeProblem,
  paddedRanges,
  rangeSize,
  type GenerationRanges,
} from '../rules'
import { useGenerationRunner } from './use-generation-runner'

const C = INVENTORY_COPY.generator

/** D-261: cada rifa con sus números; los rangos siguen a la elegida. */
type RaffleOption = { id: string; label: string; name: string; numberFormat?: RaffleNumberFormat }

/**
 * El generador por rangos (D-257, BR-N15..BR-N18).
 *
 * TRES PASOS VISIBLES. Escribir los rangos y calcular; leer la vista previa
 * —cuantas, una muestra, cuantas ya existen y a donde van—; confirmar. Lo que se
 * confirma es EXACTAMENTE lo que se calculo: tocar un numero despues de calcular
 * borra la vista previa y obliga a calcular otra vez.
 *
 * NADA DE 100.000 FILAS EN EL NAVEGADOR. La vista previa enseña seis
 * combinaciones calculadas aqui —las primeras y las ultimas, en el orden en que
 * las crea la base— y dos recuentos que da la base. La creacion va por bloques
 * (`useGenerationRunner`), con su barra de avance.
 *
 * UNA SOLICITUD POR CONFIRMACION. `requestId` nace con el formulario y solo se
 * renueva al terminar o al empezar otra: un doble clic, o el mismo envio que se
 * repite porque se perdio la respuesta, devuelven la misma generacion.
 */
export function TicketGenerator({
  raffles,
  defaultRaffleId,
}: {
  raffles: RaffleOption[]
  defaultRaffleId?: string
}) {
  const router = useRouter()
  const id = useId()
  const [raffleId, setRaffleId] = useState(
    raffles.some((raffle) => raffle.id === defaultRaffleId)
      ? defaultRaffleId!
      : (raffles[0]?.id ?? ''),
  )
  const [dailyFrom, setDailyFrom] = useState('')
  const [dailyTo, setDailyTo] = useState('')
  const [weeklyFrom, setWeeklyFrom] = useState('')
  const [weeklyTo, setWeeklyTo] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [preview, setPreview] = useState<GenerationPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [isCalculating, startCalculating] = useTransition()
  const [isStarting, startStarting] = useTransition()
  const [startError, setStartError] = useState<string | null>(null)
  const runner = useGenerationRunner()

  const raffle = raffles.find((item) => item.id === raffleId) ?? null
  // D-261: los números de la rifa elegida deciden cuántos rangos hay, cómo se
  // llaman y con cuántas cifras sale cada número. Lo escrito no da el ancho.
  const format = raffle?.numberFormat ?? LEGACY_NUMBER_FORMAT
  const [firstGroup, secondGroup] = format.groups
  const dailyProblem = groupRangeProblem(dailyFrom, dailyTo, firstGroup)
  const weeklyProblem = secondGroup ? groupRangeProblem(weeklyFrom, weeklyTo, secondGroup) : null
  const valid = dailyProblem === null && weeklyProblem === null
  // Barato de calcular, y el compilador de React lo memoriza solo.
  const ranges: GenerationRanges = valid
    ? paddedRanges(format.groups, { dailyFrom, dailyTo, weeklyFrom, weeklyTo })
    : { daily: { from: dailyFrom, to: dailyTo }, weekly: null }
  const total = valid ? generationTotal(ranges) : 0
  const tooMany = valid && total > GENERATION_MAX
  // Lo que viaja: con un solo número, el segundo rango va vacío.
  const sent = {
    dailyFrom,
    dailyTo,
    weeklyFrom: secondGroup ? weeklyFrom : '',
    weeklyTo: secondGroup ? weeklyTo : '',
  }

  const progress = runner.progress
  const busy = isStarting || runner.running
  const finished = progress?.status === 'completed'
  // Cualquier cambio en lo que se va a generar invalida lo calculado.
  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPreview(null)
      setPreviewError(null)
    }
  }

  function calculate() {
    setShowErrors(true)
    if (!valid || tooMany || !raffleId) return
    setPreviewError(null)
    startCalculating(async () => {
      const result = await previewTicketGeneration({ raffleId, ...sent })
      if ('error' in result) {
        setPreviewError(result.error)
        setPreview(null)
        return
      }
      setPreview(result.data)
    })
  }

  function confirm() {
    if (!preview || !raffleId) return
    setStartError(null)
    startStarting(async () => {
      const started = await startTicketGeneration({ raffleId, ...sent, requestId })
      if ('error' in started) {
        setStartError(started.error)
        return
      }
      const final = await runner.runFrom(started.data)
      if (final.status === 'completed') router.refresh()
    })
  }

  function continueRun() {
    if (!progress) return
    void runner.runFrom(progress).then((final) => {
      if (final.status === 'completed') router.refresh()
    })
  }

  function reset() {
    setRequestId(crypto.randomUUID())
    setPreview(null)
    setPreviewError(null)
    setStartError(null)
    setShowErrors(false)
    setDailyFrom('')
    setDailyTo('')
    setWeeklyFrom('')
    setWeeklyTo('')
    runner.setProgress(null)
  }

  const sample = valid && !tooMany && total > 0 ? generationSample(ranges) : null
  const newCount = preview ? Math.max(0, preview.total - preview.existing) : 0
  const canConfirm = preview !== null && !busy && (newCount > 0 || preview.inProgressRunId !== null)

  // -------------------------------------------------------------------------
  // Terminada: el resumen y a donde ir.
  // -------------------------------------------------------------------------
  if (progress && finished) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{C.done(progress.createdCount)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {progress.existingCount > 0 ? (
            <p className="text-muted-foreground text-sm">
              {C.doneExisting(progress.existingCount)}{' '}
              {progress.existingGeneratedCount > 0
                ? C.previewExistingGenerated(progress.existingGeneratedCount)
                : null}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild size="touch">
              <Link href={`/owner/tickets?custody=common&raffleId=${progress.raffleId}`}>
                {C.viewInventory}
              </Link>
            </Button>
            <Button asChild variant="outline" size="touch">
              <Link href={`/owner/tickets/generate/${progress.runId}`}>{C.runOpen}</Link>
            </Button>
            <Button type="button" variant="ghost" size="touch" onClick={reset}>
              {C.newGeneration}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="grid content-start gap-2">
            <Label htmlFor={`${id}-raffle`}>{C.raffleLabel}</Label>
            <Select value={raffleId} onValueChange={edit(setRaffleId)} disabled={busy}>
              <SelectTrigger id={`${id}-raffle`} className="w-full">
                <SelectValue placeholder={C.rafflePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {raffles.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={secondGroup ? 'grid gap-5 md:grid-cols-2' : 'grid gap-5'}>
            <RangeFields
              idPrefix={`${id}-daily`}
              legend={C.groupLegend(firstGroup.name)}
              from={dailyFrom}
              to={dailyTo}
              onFrom={edit(setDailyFrom)}
              onTo={edit(setDailyTo)}
              fromExample={C.groupFromExample(firstGroup.digits)}
              toExample={C.groupToExample(firstGroup.digits)}
              maxDigits={firstGroup.digits}
              problem={showErrors ? dailyProblem : null}
              disabled={busy}
            />
            {secondGroup ? (
              <RangeFields
                idPrefix={`${id}-weekly`}
                legend={C.groupLegend(secondGroup.name)}
                from={weeklyFrom}
                to={weeklyTo}
                onFrom={edit(setWeeklyFrom)}
                onTo={edit(setWeeklyTo)}
                fromExample={C.groupFromExample(secondGroup.digits)}
                toExample={C.groupToExample(secondGroup.digits)}
                maxDigits={secondGroup.digits}
                problem={showErrors ? weeklyProblem : null}
                disabled={busy}
              />
            ) : null}
          </div>

          <p className="text-muted-foreground text-sm">
            {C.groupWidthHint(firstGroup.name, firstGroup.digits)}
          </p>

          {tooMany ? (
            <p role="alert" className="text-destructive text-sm">
              {C.tooMany(total, GENERATION_MAX)}
            </p>
          ) : null}

          {previewError ? (
            <p role="alert" className="text-destructive text-sm">
              {previewError}
            </p>
          ) : null}

          <div className="flex">
            <Button
              type="button"
              size="touch"
              variant={preview ? 'outline' : 'default'}
              onClick={calculate}
              disabled={busy || isCalculating || !raffleId}
              className="w-full sm:w-auto"
            >
              {isCalculating ? C.calculating : C.calculate}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && sample && raffle ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Rows3Icon className="text-muted-foreground size-5" aria-hidden />
              {C.previewTitle(newCount)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm">
              {/* El formato FINAL, con los ceros que pone el ancho de la rifa. */}
              <li>
                {C.previewRange(
                  C.groupLegend(firstGroup.name),
                  ranges.daily.from,
                  ranges.daily.to,
                  rangeSize(ranges.daily),
                  firstGroup.digits,
                )}
              </li>
              {secondGroup && ranges.weekly ? (
                <li>
                  {C.previewRange(
                    C.groupLegend(secondGroup.name),
                    ranges.weekly.from,
                    ranges.weekly.to,
                    rangeSize(ranges.weekly),
                    secondGroup.digits,
                  )}
                </li>
              ) : null}
            </ul>

            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">{C.previewSample}</p>
              <p className="font-mono text-sm tabular-nums">
                {[
                  ...sample.first.map((c) =>
                    ticketLabel({ dailyNumber: c.daily, weeklyNumber: c.weekly }, format.groups.length),
                  ),
                  ...(sample.last.length > 0 &&
                  preview.total > sample.first.length + sample.last.length
                    ? ['…']
                    : []),
                  ...sample.last.map((c) =>
                    ticketLabel({ dailyNumber: c.daily, weeklyNumber: c.weekly }, format.groups.length),
                  ),
                ].join('  ·  ')}
              </p>
            </div>

            <p className="text-sm">{C.previewDestination(raffle.name)}</p>

            {preview.existing > 0 ? (
              <Notice tone={newCount === 0 ? 'warning' : 'info'} density="compact">
                {C.previewExisting(preview.existing, preview.total)}{' '}
                {preview.existingGenerated > 0
                  ? C.previewExistingGenerated(preview.existingGenerated)
                  : null}
              </Notice>
            ) : null}

            {preview.inProgressRunId ? (
              <Notice tone="info" density="compact">
                {C.previewInProgress}
              </Notice>
            ) : null}

            {startError ? (
              <p role="alert" className="text-destructive text-sm">
                {startError}
              </p>
            ) : null}

            {progress && !finished ? (
              <div className="space-y-2" aria-live="polite">
                <p className="text-sm font-medium tabular-nums">
                  {runner.running
                    ? C.progress(progress.processedCount, progress.totalCount)
                    : C.interrupted(
                        progress.createdCount,
                        progress.processedCount,
                        progress.totalCount,
                      )}
                </p>
                <LinearProgress
                  value={progress.processedCount}
                  max={progress.totalCount}
                  label={C.progressLabel}
                  valueText={`${formatCount(progress.processedCount)} de ${formatCount(progress.totalCount)}`}
                />
                {runner.running ? (
                  <p className="text-muted-foreground text-xs">{C.keepOpen}</p>
                ) : null}
                {runner.error ? (
                  <p role="alert" className="text-destructive text-sm">
                    {runner.error}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              {progress && !finished && !runner.running ? (
                <Button type="button" size="touch" onClick={continueRun}>
                  {C.continue}
                </Button>
              ) : newCount === 0 && !preview.inProgressRunId && !progress ? null : (
                // Sin nada nuevo no hay botón: «Generar 0 boletas» no es una acción.
                <Button
                  type="button"
                  size="touch"
                  onClick={confirm}
                  disabled={!canConfirm}
                  className="w-full sm:w-auto"
                >
                  {busy && progress
                    ? C.progress(progress.processedCount, progress.totalCount)
                    : preview.inProgressRunId
                      ? C.continue
                      : C.confirm(newCount)}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function RangeFields({
  idPrefix,
  legend,
  from,
  to,
  onFrom,
  onTo,
  fromExample,
  toExample,
  maxDigits,
  problem,
  disabled,
}: {
  idPrefix: string
  legend: string
  from: string
  to: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
  fromExample: string
  toExample: string
  /** D-261: las cifras del número en la rifa; no se puede escribir una más. */
  maxDigits: number
  problem: string | null
  disabled: boolean
}) {
  const errorId = `${idPrefix}-error`
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${idPrefix}-from`} className="text-muted-foreground text-xs">
            {C.fromLabel}
          </Label>
          <TicketNumberInput
            id={`${idPrefix}-from`}
            value={from}
            onChange={onFrom}
            placeholder={fromExample}
            maxDigits={maxDigits}
            disabled={disabled}
            aria-invalid={problem !== null}
            aria-describedby={problem ? errorId : undefined}
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${idPrefix}-to`} className="text-muted-foreground text-xs">
            {C.toLabel}
          </Label>
          <TicketNumberInput
            id={`${idPrefix}-to`}
            value={to}
            onChange={onTo}
            placeholder={toExample}
            maxDigits={maxDigits}
            disabled={disabled}
            aria-invalid={problem !== null}
            aria-describedby={problem ? errorId : undefined}
          />
        </div>
      </div>
      {problem ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      ) : null}
    </fieldset>
  )
}
