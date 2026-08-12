import { BellIcon } from 'lucide-react'

import { getNotificationFeed } from '../queries'
import { NotificationMenu } from './NotificationMenu'

/**
 * La campanita del encabezado.
 *
 * Componente de servidor: lee la bandeja en la misma pasada que pinta la
 * pantalla, sin peticiones desde el navegador ni tiempo real (D-093). El
 * contador se actualiza al navegar o al recargar, que es como se comporta el
 * resto de esta aplicacion.
 *
 * Si la consulta falla, la campanita no aparece y la pantalla sigue
 * funcionando: un aviso no puede impedirle a nadie vender una boleta.
 */
export async function NotificationBell() {
  let feed
  try {
    feed = await getNotificationFeed()
  } catch {
    return null
  }

  if (feed.items.length === 0 && feed.unreadCount === 0) {
    // Sin nada que contar todavia, la campanita seria un boton que no lleva a
    // ninguna parte. Aparece en cuanto hay algo.
    return null
  }

  return (
    <NotificationMenu
      items={feed.items}
      unreadCount={feed.unreadCount}
      icon={<BellIcon className="size-5" aria-hidden />}
    />
  )
}
