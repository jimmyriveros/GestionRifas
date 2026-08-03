import { ShieldAlertIcon } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function DeniedPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <ShieldAlertIcon className="text-muted-foreground size-12" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-semibold">Acceso denegado</h1>
        <p className="text-muted-foreground">No tienes permiso para ver esta pagina.</p>
      </div>
      <Button asChild>
        <Link href="/">Ir a mi panel</Link>
      </Button>
    </div>
  )
}
