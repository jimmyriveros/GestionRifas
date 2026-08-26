'use client'

import { DownloadIcon, SmartphoneIcon } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  INSTALL_DONE,
  INSTALL_REASON,
  INSTALL_TITLE,
  installNote,
  installSteps,
} from '@/features/pwa/copy'
import {
  dismissInstallPrompt,
  isInstallDismissed,
  silenceInstallPrompt,
} from '@/features/pwa/install-state'
import {
  promptInstall,
  readInstallCapability,
  readInstallCapabilityOnServer,
  subscribeToInstallCapability,
} from '@/features/pwa/install-store'

/**
 * Ofrecimiento de instalar la aplicación, en el panel (D-117, corregido en
 * D-123).
 *
 * DÓNDE VA, Y POR QUÉ SE MOVIÓ. Lo monta cada panel justo después de su
 * encabezado. La primera versión lo ponía al FINAL del contenido, buscando no
 * molestar, y el resultado medido en un teléfono de 390 px fue que la tarjeta
 * caía en `y = 2.646` de una página de 2.936: dos pantallas y media de scroll.
 * El dueño instaló la aplicación a mano sin llegar a verla nunca. No molestar
 * está bien; ser invisible es otra cosa.
 *
 * Sigue sin ser invasivo: es una tarjeta en el flujo de la página —no una
 * ventana, no una banda flotante—, no tapa nada, no empuja nada al aparecer y se
 * calla un mes en cuanto alguien dice «Ahora no».
 *
 * QUIÉN DECIDE SI SE PINTA. `install-store.ts`. Este componente no husmea el
 * navegador ni la ruta: lo montan las dos pantallas que quieren ofrecerlo.
 */
export function InstallPrompt() {
  const capability = useSyncExternalStore(
    subscribeToInstallCapability,
    readInstallCapability,
    readInstallCapabilityOnServer,
  )
  const [hidden, setHidden] = useState(false)

  if (hidden) return null
  if (capability === 'unknown' || capability === 'none') return null
  if (isInstallDismissed()) return null

  const steps = installSteps(capability)
  const note = installNote(capability)

  const install = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted') {
      silenceInstallPrompt()
      toast.success(INSTALL_DONE)
    }
    setHidden(true)
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <SmartphoneIcon className="text-muted-foreground size-6 shrink-0" aria-hidden />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <h2 className="font-semibold">{INSTALL_TITLE}</h2>
            <p className="text-muted-foreground text-sm">{INSTALL_REASON}</p>
          </div>

          {steps.length > 0 ? (
            <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-sm">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}

          {note ? <p className="text-muted-foreground text-sm">{note}</p> : null}
        </div>

        <div className="flex shrink-0 gap-2">
          {capability === 'prompt' ? (
            <Button onClick={install} className="h-11 grow sm:h-9 sm:grow-0">
              <DownloadIcon aria-hidden />
              Instalar
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => {
              dismissInstallPrompt()
              setHidden(true)
            }}
            className="h-11 grow sm:h-9 sm:grow-0"
          >
            Ahora no
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
