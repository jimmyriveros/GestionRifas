/**
 * Se ejecuta una vez al arrancar cada instancia del servidor, antes de atender
 * peticiones. Solo en Node: el runtime edge no tiene `sharp` ni `node:module`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerOgRenderer } = await import('@/lib/og-renderer')
    registerOgRenderer()
  }
}
