import { redirect } from 'next/navigation'

import { dashboardPathForRole } from '@/lib/auth/guards'
import { getActiveMembership, getAuthUser } from '@/lib/auth/session'

export default async function RootPage() {
  const user = await getAuthUser()
  if (!user) {
    redirect('/login')
  }

  const membership = await getActiveMembership()
  if (!membership) {
    redirect('/login?error=inactive')
  }

  redirect(dashboardPathForRole(membership.role))
}
