import { expect, type Page } from '@playwright/test'

/**
 * Lo que comparten `mostrar-contrasena.spec.ts` y su variante `-movil` (D-255). Playwright no deja
 * importar un archivo de pruebas desde otro, así que vive aquí.
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
