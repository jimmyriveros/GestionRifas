import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type MetricCardProps = {
  label: string
  value: ReactNode
  hint?: string
  className?: string
}

/** Tarjeta de metrica del dashboard (CLAUDE.md 23, 27). */
export function MetricCard({ label, value, hint, className }: MetricCardProps) {
  return (
    <Card className={cn('gap-2 py-4', className)}>
      <CardHeader className="px-4">
        <CardTitle className="text-muted-foreground text-label-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-heading-h2 tabular-nums">{value}</p>
        {hint ? <p className="text-muted-foreground text-caption-regular mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}
