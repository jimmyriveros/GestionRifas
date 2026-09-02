import type { Metadata } from 'next'

/**
 * Armazon del catalogo publico (D-159, rediseñado en D-163).
 *
 * POR QUE UN GRUPO NUEVO Y NO `(public)`. Aquel es el armazon de ingresar,
 * recuperar y fijar contrasena: centra una tarjeta de `max-w-sm` en medio de la
 * pantalla, que es exactamente lo que un catalogo de cientos de boletas no
 * puede ser. Se crea un grupo aparte en vez de meter una condicion dentro de
 * aquel layout: son dos pantallas publicas que no se parecen en nada, y
 * mezclarlas habria dejado el formulario de login dependiendo de una bandera.
 *
 * NO LLEVA `AppShell`: no hay menu lateral, ni barra inferior, ni menu de
 * usuario. No hay usuario.
 *
 * EL TEMA OSCURO ES DE ESTE GRUPO Y DE NADIE MAS (D-163). `catalog-theme`
 * redefine los tokens de color —fondo, tarjeta, primario, borde— dentro de este
 * arbol, asi que los componentes compartidos (`Button`, `Badge`, `Input`,
 * `EmptyState`) se pintan violeta sin que exista una segunda version de
 * ninguno. La definicion vive en `globals.css` porque lo que cambia son
 * variables CSS, no clases.
 *
 * LAS DOS CAPAS DECORATIVAS son `fixed` y `aria-hidden`: no entran en el flujo,
 * no reciben toques y no se repintan al desplazarse. Son degradados CSS, no
 * imagenes: la unica imagen de la pagina es la composicion del hero.
 *
 * `robots: noindex, nofollow` (BR-K01) se declara AQUI, en el layout, para que
 * lo herede cualquier pantalla del grupo —la de la boleta y tambien la de «no
 * encontrado»—. La direccion es publica para quien la reciba, pero el catalogo
 * no se promociona en buscadores: el `slug` no es una medida de seguridad, y
 * que Google indexe el inventario de un vendedor no le sirve a nadie.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="catalog-theme text-foreground relative isolate min-h-svh ps-[var(--safe-left)] pe-[var(--safe-right)]">
      <div className="catalog-glow -z-10" aria-hidden />
      <div className="catalog-stars -z-10" aria-hidden />
      {children}
    </div>
  )
}
