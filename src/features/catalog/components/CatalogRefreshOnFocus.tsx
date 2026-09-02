'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Vuelve a pedir la pagina al recuperar el foco (BR-K11).
 *
 * PARA QUE. Quien toca «Solicitar» se va a WhatsApp y vuelve al rato. Mientras
 * tanto el vendedor puede haber vendido justo esa boleta, y la reja seguiria
 * enseñandola libre hasta que alguien recargara a mano.
 *
 * POR QUE ASI Y NO CON REALTIME NI CON UN TEMPORIZADOR. Una suscripcion abriria
 * un websocket permanente por visitante, y un `setInterval` consultaria la base
 * de datos cada pocos segundos aunque el telefono este en un bolsillo. Esto
 * cuesta CERO mientras nadie vuelve: solo se dispara al recuperar el foco, que
 * es exactamente cuando la persona va a mirar.
 *
 * `router.refresh()` vuelve a pedir el Server Component: no hay estado de
 * cliente que reconciliar, no se pierde lo escrito en el buscador —vive en la
 * URL— y no se pinta ningun parpadeo.
 *
 * `visibilitychange` y no `focus`: en un telefono, volver de otra aplicacion no
 * siempre dispara `focus` en la ventana, pero si cambia la visibilidad del
 * documento. Se comprueba `visibilityState` para no refrescar al OCULTARSE.
 */
export function CatalogRefreshOnFocus() {
  const router = useRouter()

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') router.refresh()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [router])

  return null
}
