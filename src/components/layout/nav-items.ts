import type { ReactNode } from 'react'

// El icono se recibe ya renderizado (<Icon />), no como referencia al
// componente: NavLinks es un Client Component y React no puede serializar una
// funcion/componente a traves de ese limite, solo datos planos y elementos ya
// renderizados.
//
// El icono llega SIN tamano. Lo pone quien lo pinta, porque el mismo elemento
// se usa en dos sitios con medidas distintas: 16 px en la barra lateral y en el
// menu de usuario, 24 px en la barra inferior del telefono, donde se toca con
// el dedo (D-106).
export type NavItem = {
  href: string
  label: string
  icon: ReactNode
  /**
   * Entra en la barra inferior del telefono (D-106).
   *
   * Son exactamente cuatro por portal —panel, boletas, clientes y pagos—: los
   * cuatro sitios a los que se vuelve todo el dia. El resto del menu no
   * desaparece, se lee desde el menu de usuario, que en el telefono muestra los
   * items no primarios.
   */
  primary?: boolean
  /**
   * Etiqueta corta para la barra inferior, donde cada opcion dispone de unos
   * 72 px a 320 px de ancho. Solo hace falta cuando la del menu lateral lleva
   * un posesivo delante («Mis boletas» → «Boletas»): el termino del glosario es
   * el mismo, se le quita el «Mis» que ahi no cabe.
   */
  shortLabel?: string
}
