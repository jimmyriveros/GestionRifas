'use client'

import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { CatalogLinkField } from './CatalogLinkField'
import { CatalogSettingsDialog } from './CatalogSettingsDialog'

/**
 * El catalogo publico dentro de la ficha del vendedor (BR-K12).
 *
 * NO ES UN MODULO ADMINISTRATIVO NUEVO. Es una tarjeta mas en la pantalla que
 * ya existe, junto a «Datos de contacto» y «Equipo y comisión»: el encargo pide
 * expresamente no construir otro modulo si la ficha se puede ampliar.
 *
 * Es cliente porque guarda si el dialogo esta abierto, y nada mas. Todos los
 * datos llegan ya resueltos desde el servidor.
 */

type RaffleOption = { id: string; name: string }

export function CatalogSettingsCard({
  profileId,
  sellerName,
  raffles,
  enabled,
  slug,
  publicUrl,
  whatsappNumber,
  raffleId,
  raffleName,
}: {
  profileId: string
  sellerName: string
  raffles: RaffleOption[]
  enabled: boolean
  slug: string | null
  publicUrl: string | null
  whatsappNumber: string | null
  raffleId: string | null
  raffleName: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Catálogo público</CardTitle>
        {/*
          La insignia dice el estado con PALABRAS, no solo con color
          (CLAUDE.md 27). «Publicado» y «Sin publicar» no son etiquetas de
          estado de las ocho de `constants.ts`: describen este interruptor y
          solo existen aqui.
        */}
        <Badge variant={enabled ? 'default' : 'outline'}>
          {enabled ? 'Publicado' : 'Sin publicar'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {enabled && publicUrl ? (
          <CatalogLinkField
            url={publicUrl}
            description={`${sellerName} puede compartir este enlace por WhatsApp. Quien lo abra ve solo los números de la rifa, no clientes ni pagos.`}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            {slug === null
              ? 'Todavía no tiene enlace. Se genera al publicar el catálogo.'
              : 'El catálogo está apagado: su enlace no abre. Puedes volver a publicarlo cuando quieras.'}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp público">
            {whatsappNumber ?? <span className="text-muted-foreground">Sin configurar</span>}
          </Field>
          <Field label="Rifa que se publica">
            {raffleName ?? <span className="text-muted-foreground">Sin elegir</span>}
          </Field>
        </div>

        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Configurar catálogo
        </Button>
      </CardContent>

      <CatalogSettingsDialog
        // Se remonta cuando cambia lo guardado, para que el formulario parta
        // siempre de los valores vigentes sin sincronizarlos con un efecto.
        key={`${enabled}:${whatsappNumber ?? ''}:${raffleId ?? ''}:${slug ?? ''}`}
        open={open}
        onOpenChange={setOpen}
        profileId={profileId}
        sellerName={sellerName}
        raffles={raffles}
        hasSlug={slug !== null}
        initial={{
          enabled,
          whatsappNumber: whatsappNumber ?? '',
          raffleId: raffleId ?? '',
        }}
      />
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="font-mono text-sm">{children}</div>
    </div>
  )
}
