/**
 * Armazon de las pantallas sin sesion: ingresar, recuperar y fijar contrasena.
 *
 * Los rellenos de area segura (D-119) valen 0 en escritorio y en cualquier
 * telefono sin muesca. Solo hacen algo con el telefono en horizontal, donde sin
 * ellos la tarjeta del formulario puede quedar pegada al borde fisico.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-4 ps-[calc(1rem_+_var(--safe-left))] pe-[calc(1rem_+_var(--safe-right))]">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
