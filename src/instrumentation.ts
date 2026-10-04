/**
 * Se ejecuta una vez al arrancar cada instancia del servidor, antes de atender
 * peticiones. Solo en Node: el runtime edge no tiene `sharp` ni `node:module`.
 *
 * La línea del registro dice que esta instancia es nueva (D-251): la primera
 * petición que atiende paga el arranque en frío, y los registros de Vercel no
 * guardan duraciones. Solo la región y la versión; nada de nadie.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.info(
      `[rifas:instancia] nueva · región ${process.env.VERCEL_REGION ?? 'local'} · versión ${process.env.NEXT_PUBLIC_APP_BUILD_ID ?? 'dev'}`,
    )
    const { registerOgRenderer } = await import('@/lib/og-renderer')
    registerOgRenderer()
  }
}
