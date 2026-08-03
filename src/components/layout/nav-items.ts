import type { ReactNode } from 'react'

// El icono se recibe ya renderizado (<Icon className="size-4" />), no como
// referencia al componente: NavLinks es un Client Component y React no
// puede serializar una funcion/componente a traves de ese limite, solo
// datos planos y elementos ya renderizados.
export type NavItem = {
  href: string
  label: string
  icon: ReactNode
}
