import Link from 'next/link'
import { notFound } from 'next/navigation'

import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { AccountStatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CatalogSettingsCard } from '@/features/catalog/components/CatalogSettingsCard'
import { catalogPublicUrl, getCatalogSettings, isCatalogLive } from '@/features/catalog/queries'
import { listRaffleOptions } from '@/features/raffles/queries'
import { getSellerWithInventory } from '@/features/sellers/queries'
import { listOrgMembers } from '@/features/users/queries'
import { UserRowActions } from '@/features/users/components/UserRowActions'
import { requireStaff } from '@/lib/auth/guards'
import { formatDateEs } from '@/lib/dates'

/**
 * Ficha de un vendedor en el portal administrativo.
 *
 * LA CARTERA ES SUYA (D-198, BR-Q08). La ficha ya no ensena su dinero —vendido,
 * recaudado, saldo—, ni su ganancia con el total de rebajas, ni cuantos clientes
 * tiene, ni un enlace a ellos. Conserva lo que el personal administra: sus
 * datos, su inventario, su equipo, su catalogo y asignarle boletas.
 */
export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ sellerId: string }>
}) {
  const { sellerId } = await params
  const membership = await requireStaff()
  const seller = await getSellerWithInventory(sellerId)

  if (!seller) notFound()

  // Su lugar en la estructura comercial (BR-E08) y su catalogo publico
  // (BR-K12). En la MISMA espera: son lecturas independientes.
  const [orgSellers, catalog, raffles] = await Promise.all([
    listOrgMembers(['seller']),
    getCatalogSettings(sellerId),
    listRaffleOptions(),
  ])

  const team = orgSellers.filter((member) => member.parentSellerId === sellerId)
  const parent = seller.parentSellerId
    ? (orgSellers.find((member) => member.profileId === seller.parentSellerId) ?? null)
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title={seller.fullName}
        titleBadge={
          <AccountStatusBadge isActive={seller.isActive} activatedAt={seller.activatedAt} />
        }
        description={seller.alias ?? undefined}
        backHref="/owner/sellers"
        actions={
          <UserRowActions
            member={seller}
            currentRole={membership.role}
            currentProfileId={membership.profileId}
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <h2>Datos de contacto</h2>
          </CardTitle>
        </CardHeader>
        {/* El estado ya no esta aqui: vive junto al nombre, arriba. */}
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Correo">{seller.email}</Field>
          <Field label="Teléfono">{seller.phone}</Field>
          <Field label="Alta">{formatDateEs(seller.createdAt)}</Field>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Inventario</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <MetricCard label="Boletas" value={seller.ticketsTotal} />
          <MetricCard label="Disponibles" value={seller.ticketsAvailable} />
          <MetricCard label="Asignadas" value={seller.ticketsAssigned} />
          <MetricCard label="Pendientes de aprobación" value={seller.ticketsPendingApproval} />
          <MetricCard label="Borradores" value={seller.ticketsDraft} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <h2>Equipo</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendedor a cargo">
              {parent ? (
                <Link href={`/owner/sellers/${parent.profileId}`} className="hover:underline">
                  {parent.fullName}
                </Link>
              ) : (
                <span className="text-muted-foreground">Depende del Dueño o el Administrador</span>
              )}
            </Field>

            {/* BR-G13: dos formas de pago. Es la REGLA, no una cifra: lo que
                lleva ganado es de su cartera y ya no se ensena aqui (D-198). */}
            <Field label="Cómo se le paga">
              {parent === null ? (
                <span>La mitad del precio de cada boleta que cobre completa</span>
              ) : (
                <span>Por niveles, según el total de boletas que lleve cobradas</span>
              )}
            </Field>
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Su equipo
            </p>
            {team.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No tiene vendedores a su cargo. Cualquier vendedor puede armar el suyo.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {team.map((member) => (
                  <li key={member.profileId}>
                    <Link
                      href={`/owner/sellers/${member.profileId}`}
                      className="bg-muted hover:bg-accent inline-flex rounded-md px-2 py-1 text-sm"
                    >
                      {member.fullName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/*
        Solo para vendedores: el catalogo publica boletas, y un Administrador no
        tiene. `getCatalogSettings` ya devuelve `null` para cualquier otro rol.
      */}
      {catalog ? (
        <CatalogSettingsCard
          profileId={seller.profileId}
          sellerName={seller.fullName}
          raffles={raffles.map((raffle) => ({ id: raffle.id, name: raffle.name }))}
          enabled={catalog.enabled}
          slug={catalog.slug}
          publicUrl={catalog.slug ? catalogPublicUrl(catalog.slug) : null}
          whatsappNumber={catalog.whatsappNumber}
          raffleId={catalog.raffleId}
          raffleName={catalog.raffleName}
          isLive={isCatalogLive(catalog)}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="touch">
          <Link href={`/owner/tickets?sellerId=${seller.profileId}`}>Ver sus boletas</Link>
        </Button>
        <Button asChild variant="outline" size="touch">
          <Link href={`/owner/tickets/bulk?sellerId=${seller.profileId}`}>Asignarle boletas</Link>
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}
