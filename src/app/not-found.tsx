import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">Página no encontrada</h1>
        <p className="text-muted-foreground">La página que buscas no existe o fue movida.</p>
      </div>
      <Button asChild>
        <Link href="/">Ir al inicio</Link>
      </Button>
    </div>
  )
}
