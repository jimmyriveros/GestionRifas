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
 *
 * DOS OPCIONES MAS, para el inventario comun del vendedor (D-257), que si tiene
 * plazos: alli una boleta pasa de libre a apartada —y de apartada a libre— en
 * minutos, y el propio apartado del vendedor vence a una hora conocida.
 *
 *   * `intervalMs`  vuelve a pedir la pagina cada tanto, pero SOLO mientras la
 *                   pestaña esta a la vista: oculta, no consulta nada. Lo usa una
 *                   pantalla con sesion, nunca el catalogo publico.
 *   * `refreshAt`   instantes (ms de la epoca, ya en la hora del telefono) en
 *                   que algo cambia sin que nadie toque nada —el vencimiento de
 *                   un apartado—: la pagina se vuelve a pedir justo despues.
 *
 * NINGUNA DE LAS DOS DECIDE NADA. La base interpreta el vencimiento en cada
 * consulta y en cada operacion; esto solo evita que la pantalla enseñe un estado
 * viejo. Sin ellas el componente hace exactamente lo de siempre.
 */
export function CatalogRefreshOnFocus({
  intervalMs,
  refreshAt,
}: {
  intervalMs?: number
  refreshAt?: readonly number[]
} = {}) {
  const router = useRouter()

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') router.refresh()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [router])

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [router, intervalMs])

  // Una sola alarma: la del proximo instante que todavia no llego. Al
  // refrescarse la pagina llegan los instantes nuevos y se programa la
  // siguiente. Un segundo de margen, para pedirla cuando la base ya lo ve vencido.
  // La lista viaja como texto para que el efecto no se rehaga en cada pintado.
  const schedule = (refreshAt ?? []).join(',')
  useEffect(() => {
    if (schedule === '') return
    const now = Date.now()
    const next = schedule
      .split(',')
      .map(Number)
      .filter((at) => at > now)
      .sort((a, b) => a - b)[0]
    if (next === undefined) return
    const delay = Math.min(next - now + 1_000, 2_147_000_000)
    const timer = window.setTimeout(() => router.refresh(), delay)
    return () => window.clearTimeout(timer)
  }, [router, schedule])

  return null
}
