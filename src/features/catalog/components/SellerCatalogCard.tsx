import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { CatalogLinkField } from './CatalogLinkField'

/**
 * El enlace publico en el panel del vendedor (BR-K12).
 *
 * SOLO VE Y COPIA. No hay aqui ni un control para encender, apagar, cambiar el
 * WhatsApp o regenerar: eso lo hace el Dueño o el Administrador desde la ficha
 * del vendedor, y la Server Action lo exige (`authorizeAction(['owner','admin'])`).
 * Un vendedor tampoco puede consultar el de otro: `getCatalogSettings` va por
 * la RLS, y `memberships_select` solo le devuelve su propia fila.
 *
 * NO SE PINTA SI NO HAY NADA QUE COMPARTIR. Una tarjeta que dijera «no tienes
 * catálogo» ocuparia sitio permanente en la pantalla que mas se usa para
 * anunciar una funcion que el vendedor no puede activar por su cuenta. Va
 * fuera de la rejilla de siete piezas del panel (D-112), junto a los otros dos
 * bloques condicionales —el aviso de boletas por aprobar y la instalacion—,
 * para no alterar el orden de esas siete.
 */
export function SellerCatalogCard({ publicUrl }: { publicUrl: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tu catálogo público</CardTitle>
      </CardHeader>
      <CardContent>
        <CatalogLinkField
          url={publicUrl}
          label="Enlace para compartir"
          description="Envíalo por WhatsApp. Quien lo abra ve tus números libres y los que ya están tomados, y te escribe para pedirte uno. No se muestran tus clientes ni tus pagos."
        />
      </CardContent>
    </Card>
  )
}
