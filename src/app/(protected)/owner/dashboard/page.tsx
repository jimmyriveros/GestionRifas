import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getActiveMembership } from '@/lib/auth/session'
import { ROLE_LABELS } from '@/lib/constants'

const UPCOMING_METRICS = [
  { label: 'Rifa activa', phase: 'la Fase 3' },
  { label: 'Vendedores activos', phase: 'la Fase 3' },
  { label: 'Boletas disponibles', phase: 'la Fase 3' },
  { label: 'Boletas pendientes de aprobacion', phase: 'la Fase 3' },
  { label: 'Total vendido', phase: 'la Fase 6' },
  { label: 'Total recaudado', phase: 'la Fase 6' },
  { label: 'Saldo pendiente', phase: 'la Fase 6' },
  { label: 'Pagos recientes', phase: 'la Fase 6' },
]

export default async function OwnerDashboardPage() {
  // Ya resuelto por owner/layout.tsx; cache() de React evita repetir la consulta.
  const membership = await getActiveMembership()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {membership?.fullName ?? ''}
        </h1>
        <div className="text-muted-foreground flex items-center gap-2">
          <span>{membership?.organizationName}</span>
          {membership ? <Badge variant="secondary">{ROLE_LABELS[membership.role]}</Badge> : null}
        </div>
      </div>

      <div>
        <p className="text-muted-foreground mb-3 text-sm">
          Estas metricas se activaran a medida que avancen las siguientes fases del proyecto.
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {UPCOMING_METRICS.map((metric) => (
            <Card key={metric.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  {metric.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">Disponible en {metric.phase}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
