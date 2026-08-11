import { PageHeader } from '@/components/data/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChangePasswordForm } from '@/features/auth/components/ChangePasswordForm'
import { dashboardPathForRole } from '@/lib/auth/guards'
import { getActiveMembership } from '@/lib/auth/session'

export default async function AccountPasswordPage() {
  // Memoizado por request (React cache): ya se resolvio en el layout protegido.
  const membership = await getActiveMembership()
  const backHref = membership ? dashboardPathForRole(membership.role) : '/login'

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 md:p-6">
      <PageHeader
        title="Cambiar contraseña"
        description="Actualiza la contraseña de tu cuenta."
        backHref={backHref}
        backLabel="Volver al panel"
      />

      <Card>
        <CardHeader>
          <CardTitle>Nueva contraseña</CardTitle>
          <CardDescription>Debe tener al menos 8 caracteres.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
