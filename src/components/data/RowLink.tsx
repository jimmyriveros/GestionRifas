import Link from 'next/link'
import type { ComponentProps } from 'react'

/**
 * Enlace de una FILA de tabla: el que lleva al detalle de una boleta, un
 * cliente, un pago, un vendedor o una rifa.
 *
 * Es un `Link` normal con UNA diferencia: `prefetch={false}`.
 *
 * POR QUE (D-104)
 *
 * Next precarga por defecto todo `Link` que entre en pantalla. En un menú de
 * ocho entradas eso es una ayuda: son pocas, son predecibles y calientan el
 * servidor. En una tabla de veinticinco filas es lo contrario. Medido sobre una
 * sola sesión con dos navegaciones:
 *
 *   42 invocaciones del servidor, de las cuales 16 eran fichas de boletas
 *   concretas que nadie llegó a abrir · 41 llamadas de validación de sesión
 *   frente a 25 consultas de datos reales.
 *
 * En Vercel cada una de esas precargas es una invocación de función. La ráfaga
 * obliga a la plataforma a repartir el trabajo entre instancias nuevas, y la
 * instancia nueva es precisamente la que arranca EN FRÍO cuando la persona
 * pulsa el menú siguiente: 290 ms se convierten en 3.500 ms.
 *
 * Lo que se pierde a cambio es poco: estas rutas de detalle son dinámicas y no
 * tienen `loading.tsx`, así que la precarga no traía sus datos —solo abría la
 * puerta—. Abrir una ficha cuesta lo mismo que antes.
 *
 * Las entradas del menú lateral (`NavLinks`) NO usan esto: ahí la precarga sí
 * compensa.
 */
export function RowLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} />
}
