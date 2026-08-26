'use client'

import { SmartphoneIcon } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  INSTALL_DONE,
  INSTALL_MENU_LABEL,
  INSTALL_REASON,
  INSTALL_TITLE,
  installNote,
  installSteps,
} from '@/features/pwa/copy'
import { silenceInstallPrompt } from '@/features/pwa/install-state'
import {
  promptInstall,
  readInstallCapability,
  readInstallCapabilityOnServer,
  subscribeToInstallCapability,
} from '@/features/pwa/install-store'

/**
 * «Instalar aplicación» en el menú de usuario (D-123).
 *
 * PARA QUÉ, si ya está la tarjeta del panel. Para tres casos que la tarjeta no
 * cubre: quien la descartó y luego se arrepiente —la tarjeta se calla un mes—,
 * quien no pasa por el panel, y quien está en el iPhone fuera de Safari, que es
 * exactamente el caso con el que el dueño se topó y donde la aplicación no le
 * dijo absolutamente nada.
 *
 * NO se oculta cuando la tarjeta está descartada: eso es justo lo que viene a
 * resolver. Solo desaparece cuando ya está instalada o cuando no hay nada que
 * ofrecer, porque una opción de menú que no hace nada confunde más que su
 * ausencia —el mismo criterio que `TourLauncher`—.
 *
 * POR QUÉ UN AVISO Y NO UNA VENTANA. Un diálogo abierto desde una opción de menú
 * se desmonta con el menú al cerrarse, y mantenerlo vivo obliga a dejar el menú
 * abierto detrás. El aviso de `sonner` vive fuera de los dos, ya es el sitio
 * donde esta aplicación cuenta las cosas —incluida la versión nueva— y los pasos
 * de iOS son dos líneas.
 */
export function InstallMenuItem() {
  const capability = useSyncExternalStore(
    subscribeToInstallCapability,
    readInstallCapability,
    readInstallCapabilityOnServer,
  )

  if (capability === 'unknown' || capability === 'none') return null

  const explain = () => {
    toast(INSTALL_TITLE, {
      description: [
        INSTALL_REASON,
        installNote(capability),
        ...installSteps(capability).map((step, index) => `${index + 1}. ${step}`),
      ]
        .filter(Boolean)
        .join('\n'),
      duration: Infinity,
      // Arriba: en el teléfono el borde inferior es de la barra de navegación
      // y de la de selección múltiple (D-106, D-110).
      position: 'top-center',
      closeButton: true,
    })
  }

  const onSelect = async () => {
    if (capability !== 'prompt') {
      explain()
      return
    }
    const outcome = await promptInstall()
    if (outcome === 'accepted') {
      silenceInstallPrompt()
      toast.success(INSTALL_DONE)
    }
  }

  return (
    <DropdownMenuItem onSelect={() => void onSelect()}>
      <SmartphoneIcon />
      {INSTALL_MENU_LABEL}
    </DropdownMenuItem>
  )
}
