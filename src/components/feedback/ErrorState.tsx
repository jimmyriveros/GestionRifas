import { AlertTriangleIcon } from 'lucide-react'

type ErrorStateProps = {
  title?: string
  message?: string
}

export function ErrorState({
  title = 'Ocurrio un error',
  message = 'Intenta de nuevo en unos momentos.',
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <AlertTriangleIcon className="text-destructive size-8" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  )
}
