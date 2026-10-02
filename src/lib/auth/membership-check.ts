/**
 * No se pudo COMPROBAR la membresía (I-115, D-248).
 *
 * `getActiveMembership` devolvía `null` también cuando la consulta FALLABA —un 401 `PGRST303` (I-202),
 * un 5xx, la red—, y las guardas lo tomaban por una cuenta inactiva: cerraban la sesión en TODOS los
 * dispositivos y decían «Tu cuenta está inactiva». Ahora un fallo de lectura lanza este error y `null`
 * significa una sola cosa: la membresía no existe o está inactiva.
 *
 * Quien lo recoge decide qué ve la persona, como con la pausa de publicación (D-239):
 *
 *   · una pantalla lo deja subir hasta la página de error general («Algo salió mal» y «Reintentar»,
 *     que vuelve a pedir la pantalla): no se pinta nada sin haber comprobado el acceso;
 *   · una Server Action o una ruta de la API devuelve `MEMBERSHIP_CHECK_MESSAGE` y no hace nada;
 *   · el inicio de sesión conserva la sesión recién creada y manda a la pantalla que vuelve a comprobar.
 *
 * En ningún caso se llama a `signOut()`: la sesión sigue siendo válida, y lo que falló es la lectura.
 */

/** Lo que responde una acción o una ruta cuando no se pudo comprobar el acceso. */
export const MEMBERSHIP_CHECK_MESSAGE =
  'No pudimos comprobar tu acceso. Vuelve a intentarlo en unos segundos.'

export class MembershipCheckError extends Error {
  constructor() {
    super(MEMBERSHIP_CHECK_MESSAGE)
    this.name = 'MembershipCheckError'
  }
}
