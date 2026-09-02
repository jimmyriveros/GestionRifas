'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import { regenerateCatalogSlug, saveCatalogSettings } from '../actions'
import { catalogSettingsSchema } from '../schemas'

/**
 * Configurar el catalogo publico de un vendedor (BR-K04..BR-K06).
 *
 * SOLO LO ABRE EL PERSONAL. La accion vuelve a comprobarlo y la politica
 * `memberships_update_staff` lo comprueba por tercera vez: esta pantalla es
 * comodidad, no la frontera.
 *
 * REGENERAR VIVE AQUI PERO NO ES «GUARDAR». Tiene su propio boton y su propia
 * confirmacion porque su consecuencia es distinta y no se puede deshacer: la
 * direccion que el vendedor ya repartio deja de funcionar. Meterlo dentro de
 * «Guardar cambios» habria roto enlaces a cambio de corregir un telefono.
 */

type RaffleOption = { id: string; name: string }

export type CatalogSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string
  sellerName: string
  raffles: RaffleOption[]
  hasSlug: boolean
  initial: { enabled: boolean; whatsappNumber: string; raffleId: string }
}

export function CatalogSettingsDialog({
  open,
  onOpenChange,
  profileId,
  sellerName,
  raffles,
  hasSlug,
  initial,
}: CatalogSettingsDialogProps) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [whatsappNumber, setWhatsappNumber] = useState(initial.whatsappNumber)
  const [raffleId, setRaffleId] = useState(initial.raffleId)
  const [error, setError] = useState<string | null>(null)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [isPending, startTransition] = useTransition()

  function save() {
    const parsed = catalogSettingsSchema.safeParse({
      profileId,
      enabled,
      whatsappNumber,
      raffleId,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await saveCatalogSettings(parsed.data)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(
        parsed.data.enabled
          ? 'El catálogo quedó publicado.'
          : 'El catálogo dejó de estar publicado.',
      )
      onOpenChange(false)
      router.refresh()
    })
  }

  function regenerate() {
    setConfirmRegenerate(false)
    startTransition(async () => {
      const result = await regenerateCatalogSlug({ profileId })
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success('El enlace anterior dejó de funcionar. Comparte el nuevo.')
      router.refresh()
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Catálogo público</DialogTitle>
            <DialogDescription>
              Publica los números de {sellerName} en una página que puede abrir cualquiera con el
              enlace. No se muestran clientes ni pagos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Switch
                id="catalog-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={isPending}
              />
              <div className="space-y-0.5">
                <Label htmlFor="catalog-enabled">Publicar el catálogo</Label>
                <p className="text-muted-foreground text-xs">
                  Al apagarlo, el enlace deja de abrir. No se borra nada y puedes volver a
                  encenderlo.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="catalog-whatsapp">WhatsApp para recibir solicitudes</Label>
              <Input
                id="catalog-whatsapp"
                value={whatsappNumber}
                onChange={(event) => setWhatsappNumber(event.target.value)}
                placeholder="573001234567"
                inputMode="tel"
                autoComplete="off"
                disabled={isPending}
              />
              <p className="text-muted-foreground text-xs">
                Es el número que verá quien toque «Solicitar». Escríbelo con indicativo; si escribes
                un celular colombiano de 10 cifras le agregamos el 57.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="catalog-raffle">Rifa que se publica</Label>
              <Select value={raffleId} onValueChange={setRaffleId} disabled={isPending}>
                <SelectTrigger id="catalog-raffle" className="w-full">
                  <SelectValue placeholder="Elige una rifa" />
                </SelectTrigger>
                <SelectContent>
                  {raffles.map((raffle) => (
                    <SelectItem key={raffle.id} value={raffle.id}>
                      {raffle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Solo se publican las boletas de esa rifa. Al cerrarla, el catálogo deja de abrir.
              </p>
            </div>

            {hasSlug ? (
              <div className="space-y-1.5 border-t pt-4">
                <p className="text-sm font-medium">Enlace</p>
                <p className="text-muted-foreground text-xs">
                  Genera uno nuevo solo si el enlace llegó a quien no debía. El que {sellerName} ya
                  repartió dejará de funcionar.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmRegenerate(true)}
                  disabled={isPending}
                >
                  Generar un enlace nuevo
                </Button>
              </div>
            ) : null}

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={save} disabled={isPending}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title="Generar un enlace nuevo"
        description={`El enlace que ${sellerName} ya repartió dejará de abrir. Tendrá que enviar el nuevo a quien le escriba.`}
        confirmLabel="Generar enlace nuevo"
        destructive
        pending={isPending}
        onConfirm={regenerate}
      />
    </>
  )
}
