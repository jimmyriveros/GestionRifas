'use client'

import { PlusIcon, XIcon } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LOTTERY_CODES, LOTTERY_LABELS } from '@/features/lottery/constants'
import { LOTTERY_NOMINAL_WEEKDAY } from '@/features/lottery/sources'
import { WEEKDAY_LABELS } from '@/lib/constants'
import { formatDateEs } from '@/lib/dates'

import { PRIZE_COPY, PRIZE_SCHEDULE_COPY, summarizeRule, validityText } from '../copy'
import {
  lotteryForWeekday,
  PRIZE_WEEKDAYS,
  rangeRule,
  recurringRule,
  ruleKind,
  ruleProblem,
  singleDateRule,
  type PrizeRule,
  type PrizeRuleKind,
} from '../schedule'
import { PRIZE_LIMITS, type PrizeFormInput } from '../schemas'

/**
 * Los desplegables de un período viven dentro de dos cajas con relleno, y en el
 * teléfono su valor más largo no cabe en una línea: a 320 px «La que corresponde
 * a cada día» mide más que la caja. El primitivo no deja partirse el valor, así
 * que la rejilla se ensanchaba hasta él y el diálogo entero se desplazaba de lado
 * (D-202). Debajo de `sm` el valor se parte en líneas y el control crece en alto:
 * nunca baja de 44 px y nunca se recorta el texto.
 */
const PERIOD_SELECT_CLASS =
  'w-full max-sm:data-[size=touch]:h-auto max-sm:min-h-11 max-sm:whitespace-normal max-sm:text-left'

/**
 * El calendario de un premio (BR-J04, BR-J05, D-202).
 *
 * AQUÍ NO SE VE NINGÚN CONCEPTO TÉCNICO: ni JSON, ni días ISO, ni «regla». Se
 * eligen una fecha, un tramo o unos días de la semana, y debajo se lee en
 * español lo que va a jugar y desde cuándo hasta cuándo.
 *
 * LA LOTERÍA FIJA ACOTA EL DÍA, no al revés (BR-J05): al elegirla, el período
 * se queda con su día nominal y se dice por qué. Una fecha suelta que caiga en
 * otro día se rechaza con la frase de siempre en vez de moverse sola: cambiar
 * la fecha que alguien escribió sería peor que explicarle que no encaja.
 *
 * La validación de verdad es la de PostgreSQL; lo de aquí solo evita llegar
 * hasta allá con algo que ya se sabe que está mal.
 */
export function PrizeScheduleField({
  raffle,
  disabled,
}: {
  raffle: { startDate: string; endDate: string }
  disabled?: boolean
}) {
  const form = useFormContext<PrizeFormInput>()
  const { control } = form
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'rules' })
  const rules = (useWatch({ control, name: 'rules' }) ?? []) as PrizeRule[]

  function setRule(index: number, rule: PrizeRule) {
    form.setValue(`rules.${index}`, rule, { shouldDirty: true, shouldValidate: true })
  }

  function changeKind(index: number, kind: PrizeRuleKind) {
    const rule = rules[index]
    if (!rule) return
    const start = rule.startDate || raffle.startDate
    const end = rule.endDate || start

    if (kind === 'single') {
      setRule(index, { ...singleDateRule(start), lotteryMode: 'corresponding', lotteryCode: null })
      return
    }
    if (kind === 'range') {
      setRule(index, rangeRule(start, end > start ? end : raffle.endDate))
      return
    }
    setRule(index, recurringRule(start, end > start ? end : raffle.endDate, rule.weekdays))
  }

  function changeDates(index: number, kind: PrizeRuleKind, startDate: string, endDate: string) {
    const rule = rules[index]
    if (!rule) return

    if (kind === 'single') {
      setRule(index, {
        ...singleDateRule(startDate),
        lotteryMode: rule.lotteryMode,
        lotteryCode: rule.lotteryMode === 'fixed' ? rule.lotteryCode : null,
      })
      return
    }
    if (kind === 'range') {
      setRule(index, { ...rangeRule(startDate, endDate), lotteryMode: 'corresponding' })
      return
    }
    setRule(index, {
      ...recurringRule(startDate, endDate, rule.weekdays),
      lotteryMode: rule.lotteryMode,
      lotteryCode: rule.lotteryMode === 'fixed' ? rule.lotteryCode : null,
    })
  }

  function toggleWeekday(index: number, weekday: number, checked: boolean) {
    const rule = rules[index]
    if (!rule) return
    const weekdays = checked
      ? [...rule.weekdays, weekday]
      : rule.weekdays.filter((day) => day !== weekday)
    setRule(index, recurringRule(rule.startDate, rule.endDate, weekdays))
  }

  function changeLotteryMode(index: number, mode: 'corresponding' | 'fixed') {
    const rule = rules[index]
    if (!rule) return
    if (mode === 'corresponding') {
      setRule(index, { ...rule, lotteryMode: 'corresponding', lotteryCode: null })
      return
    }
    // Al pasar a fija se propone la del día que ya tiene elegido, si hay uno.
    const only = rule.weekdays.length === 1 ? lotteryForWeekday(rule.weekdays[0]!) : null
    setRule(index, { ...rule, lotteryMode: 'fixed', lotteryCode: only })
  }

  function changeLottery(index: number, code: string) {
    const rule = rules[index]
    if (!rule) return
    const lotteryCode = code as PrizeRule['lotteryCode']
    const nominal = lotteryCode ? LOTTERY_NOMINAL_WEEKDAY[lotteryCode] : null
    const kind = ruleKind(rule)

    // Una lotería fija solo juega su día: el período se queda con ese día. En
    // «Una fecha» no se toca la fecha que la persona escribió; si no encaja, se
    // lo dice el aviso de abajo.
    setRule(index, {
      ...rule,
      lotteryMode: 'fixed',
      lotteryCode,
      weekdays: kind === 'single' || nominal === null ? rule.weekdays : [nominal],
    })
  }

  return (
    <fieldset className="space-y-4 rounded-lg border p-4" disabled={disabled}>
      <legend className="text-body-medium px-1 font-medium">{PRIZE_SCHEDULE_COPY.legend}</legend>

      <div className="space-y-1">
        <p className="text-muted-foreground text-body-small">{PRIZE_SCHEDULE_COPY.help}</p>
        <p className="text-muted-foreground text-body-small">
          {PRIZE_SCHEDULE_COPY.raffleRange(
            formatDateEs(raffle.startDate),
            formatDateEs(raffle.endDate),
          )}
        </p>
      </div>

      {fields.length === 0 ? <p className="text-body-small">{PRIZE_SCHEDULE_COPY.empty}</p> : null}

      {fields.map((field, index) => {
        const rule = rules[index]
        if (!rule) return null

        const kind = ruleKind(rule)
        const problem = ruleProblem(rule, raffle)
        const nominal = rule.lotteryCode ? LOTTERY_NOMINAL_WEEKDAY[rule.lotteryCode] : null

        return (
          <div key={field.id} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-body-small font-medium">
                {PRIZE_SCHEDULE_COPY.periodTitle(index + 1)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                disabled={disabled || fields.length <= 1}
                onClick={() => remove(index)}
              >
                <XIcon className="size-4" aria-hidden />
                <span className="sr-only">
                  {`${PRIZE_SCHEDULE_COPY.removePeriod} ${index + 1}`}
                </span>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`kind-${field.id}`}>{PRIZE_SCHEDULE_COPY.kindLabel}</Label>
                <Select
                  value={kind}
                  onValueChange={(value) => changeKind(index, value as PrizeRuleKind)}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id={`kind-${field.id}`}
                    size="touch"
                    className={PERIOD_SELECT_CLASS}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['single', 'range', 'recurring'] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {PRIZE_SCHEDULE_COPY.kinds[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {kind === 'single' ? (
                <div className="space-y-1">
                  <Label htmlFor={`date-${field.id}`}>{PRIZE_SCHEDULE_COPY.dateLabel}</Label>
                  <Input
                    id={`date-${field.id}`}
                    type="date"
                    size="touch"
                    min={raffle.startDate}
                    max={raffle.endDate}
                    value={rule.startDate}
                    disabled={disabled}
                    onChange={(event) =>
                      changeDates(index, kind, event.target.value, event.target.value)
                    }
                  />
                </div>
              ) : (
                <div className="grid gap-3 sm:col-span-1 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`from-${field.id}`}>{PRIZE_SCHEDULE_COPY.startLabel}</Label>
                    <Input
                      id={`from-${field.id}`}
                      type="date"
                      size="touch"
                      min={raffle.startDate}
                      max={raffle.endDate}
                      value={rule.startDate}
                      disabled={disabled}
                      onChange={(event) =>
                        changeDates(index, kind, event.target.value, rule.endDate)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`to-${field.id}`}>{PRIZE_SCHEDULE_COPY.endLabel}</Label>
                    <Input
                      id={`to-${field.id}`}
                      type="date"
                      size="touch"
                      min={rule.startDate || raffle.startDate}
                      max={raffle.endDate}
                      value={rule.endDate}
                      disabled={disabled}
                      onChange={(event) =>
                        changeDates(index, kind, rule.startDate, event.target.value)
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {kind === 'recurring' ? (
              <fieldset className="space-y-2">
                <legend className="text-body-small font-medium">
                  {PRIZE_SCHEDULE_COPY.weekdaysLabel}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {PRIZE_WEEKDAYS.map((weekday) => {
                    const id = `weekday-${field.id}-${weekday}`
                    return (
                      <Label
                        key={weekday}
                        htmlFor={id}
                        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3"
                      >
                        <Checkbox
                          id={id}
                          checked={rule.weekdays.includes(weekday)}
                          disabled={disabled || rule.lotteryMode === 'fixed'}
                          onCheckedChange={(checked) =>
                            toggleWeekday(index, weekday, checked === true)
                          }
                        />
                        {WEEKDAY_LABELS[weekday]}
                      </Label>
                    )
                  })}
                </div>
                <p className="text-muted-foreground text-body-small">
                  {PRIZE_SCHEDULE_COPY.weekdaysHelp}
                </p>
              </fieldset>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`lottery-mode-${field.id}`}>
                  {PRIZE_SCHEDULE_COPY.lotteryModeLabel}
                </Label>
                <Select
                  value={rule.lotteryMode}
                  onValueChange={(value) =>
                    changeLotteryMode(index, value as 'corresponding' | 'fixed')
                  }
                  disabled={disabled}
                >
                  <SelectTrigger
                    id={`lottery-mode-${field.id}`}
                    size="touch"
                    className={PERIOD_SELECT_CLASS}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['corresponding', 'fixed'] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {PRIZE_SCHEDULE_COPY.lotteryModes[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {rule.lotteryMode === 'fixed' ? (
                <div className="space-y-1">
                  <Label htmlFor={`lottery-${field.id}`}>{PRIZE_SCHEDULE_COPY.lotteryLabel}</Label>
                  <Select
                    value={rule.lotteryCode ?? ''}
                    onValueChange={(value) => changeLottery(index, value)}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      id={`lottery-${field.id}`}
                      size="touch"
                      className={PERIOD_SELECT_CLASS}
                    >
                      <SelectValue placeholder={PRIZE_COPY.ruleProblems.fixed_lottery_missing} />
                    </SelectTrigger>
                    <SelectContent>
                      {LOTTERY_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {LOTTERY_LABELS[code]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {rule.lotteryMode === 'fixed' && rule.lotteryCode && nominal !== null ? (
              <p className="text-muted-foreground text-body-small">
                {PRIZE_SCHEDULE_COPY.fixedHelp(
                  LOTTERY_LABELS[rule.lotteryCode],
                  (WEEKDAY_LABELS[nominal] ?? '').toLowerCase(),
                )}
              </p>
            ) : null}

            {problem ? (
              <Notice tone="warning" density="compact" live>
                {PRIZE_COPY.ruleProblems[problem]}
              </Notice>
            ) : (
              <div className="bg-muted/50 rounded-md px-3 py-2">
                <p className="text-muted-foreground text-body-small">
                  {PRIZE_SCHEDULE_COPY.previewLabel}
                </p>
                <p className="text-body-small text-pretty">{summarizeRule(rule)}</p>
              </div>
            )}
          </div>
        )
      })}

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={disabled || fields.length >= PRIZE_LIMITS.rulesMax}
          onClick={() => append(singleDateRule(raffle.startDate))}
        >
          <PlusIcon className="size-4" aria-hidden />
          {PRIZE_SCHEDULE_COPY.addPeriod}
        </Button>
        {fields.length >= PRIZE_LIMITS.rulesMax ? (
          <p className="text-muted-foreground text-body-small">{PRIZE_COPY.form.rulesTooMany}</p>
        ) : null}
      </div>

      {/* La vigencia entera del premio: desde cuándo y hasta cuándo aplica. */}
      {rules.length > 0 ? (
        <p className="text-body-small">
          <span className="text-muted-foreground">{`${PRIZE_SCHEDULE_COPY.previewLabel}: `}</span>
          {validityText(rules) || '—'}
        </p>
      ) : null}
    </fieldset>
  )
}
