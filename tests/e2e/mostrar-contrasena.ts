import { expect, type Page } from '@playwright/test'

/**
 * Lo que comparten `mostrar-contrasena.spec.ts` y su variante `-movil` (D-255, D-256). Playwright no
 * deja importar un archivo de pruebas desde otro, así que vive aquí.
 */

/** Ficticio: no es la contraseña de nadie. */
export const FICTICIO = 'valor-ficticio-123'

export async function abrirIngreso(page: Page) {
  await page.goto('/login')
  const mostrar = page.getByRole('button', { name: 'Mostrar contraseña' })
  // Activo = hidratado: antes de eso el ojo llega desactivado, como «Ingresar» (I-204).
  await expect(mostrar).toBeEnabled()
  return {
    campo: page.getByLabel('Contraseña'),
    mostrar,
    ocultar: page.getByRole('button', { name: 'Ocultar contraseña' }),
  }
}

type Campo = 'nueva contraseña' | 'confirmación de contraseña'

/**
 * «Nueva contraseña» (`/reset-password`) o «Cambiar contraseña» (`/account/password`), con la
 * sesión ya abierta (D-256). Cada uno tiene dos campos, y cada ojo dice cuál muestra.
 */
export async function abrirContrasenaNueva(page: Page, ruta: string) {
  await page.goto(ruta)
  const ojo = (accion: 'Mostrar' | 'Ocultar', campo: Campo) =>
    page.getByRole('button', { name: `${accion} ${campo}`, exact: true })
  await expect(ojo('Mostrar', 'nueva contraseña')).toBeEnabled()
  return {
    nueva: page.getByLabel('Nueva contraseña'),
    confirmar: page.getByLabel('Confirmar contraseña'),
    ojo,
  }
}

/** Escribe y deja el cursor detrás del quinto carácter: «valor|-ficticio-123». */
export async function escribirConCursorEnMedio(page: Page) {
  await page.keyboard.type(FICTICIO)
  await page.keyboard.press('Home')
  for (let n = 0; n < 5; n++) await page.keyboard.press('ArrowRight')
}

/** Las peticiones que salen de la página desde ahora: método y ruta, nunca contenido. */
export function vigilarRed(page: Page): string[] {
  const peticiones: string[] = []
  page.on('request', (request) =>
    peticiones.push(`${request.method()} ${new URL(request.url()).pathname}`),
  )
  return peticiones
}
