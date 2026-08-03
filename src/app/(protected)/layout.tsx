import type { ReactNode } from 'react'

import { requireActiveMembership } from '@/lib/auth/guards'

// Solo verifica sesion + membresia activa. El shell visual (sidebar, header)
// vive en cada portal (owner/layout.tsx, seller/layout.tsx) para no duplicar
// el encabezado en paginas compartidas como /account/password.
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireActiveMembership()
  return <>{children}</>
}
