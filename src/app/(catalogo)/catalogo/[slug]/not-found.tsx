/**
 * «No encontrado» del catalogo publico (BR-K10).
 *
 * UNA SOLA RESPUESTA PARA CINCO SITUACIONES: el enlace no existe, el vendedor
 * esta inactivo, su organizacion esta inactiva, apago su catalogo o la rifa se
 * cerro. Decir cual de las cinco es confirmaria a cualquiera que ese enlace
 * existio y que hay alguien detras.
 *
 * Tiene su propio archivo, y no reutiliza el `not-found.tsx` de la raiz, porque
 * aquel habla desde dentro de la aplicacion y ofrece volver al panel. Quien
 * abre un catalogo no tiene sesion ni panel al que volver: lo unico util que se
 * le puede decir es que le pida el enlace a quien se lo paso.
 */
export default function CatalogNotFound() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Este enlace ya no está disponible</h1>
      <p className="text-muted-foreground text-sm">
        Puede que la dirección esté incompleta o que la persona que te la envió haya dejado de
        publicar sus números. Pídele el enlace nuevo por WhatsApp.
      </p>
    </main>
  )
}
