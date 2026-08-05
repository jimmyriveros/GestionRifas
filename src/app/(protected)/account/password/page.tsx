import { ArrowLeftIcon } from 'lucide-react'
import Link from 'next/link'

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
      <Link
        href={backHref}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" />
        Volver al panel
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cambiar contraseña</h1>
        <p className="text-muted-foreground">Actualiza la contraseña de tu cuenta.</p>
      </div>

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
