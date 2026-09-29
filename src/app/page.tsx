import { redirect } from 'next/navigation'

import { dashboardPathForRole, getActiveMembershipOrMaintenance } from '@/lib/auth/guards'
import { getAuthUser } from '@/lib/auth/session'

export default async function RootPage() {
  const user = await getAuthUser()
  if (!user) {
    redirect('/login')
  }

  const membership = await getActiveMembershipOrMaintenance()
  if (!membership) {
    redirect('/login?error=inactive')
  }

  redirect(dashboardPathForRole(membership.role))
}
