/**
 * Cabeceras de seguridad HTTP (Fase 7, docs/SECURITY.md §9).
 *
 * Se divide en dos partes por una razon tecnica, no estetica:
 *
 *   * Las cabeceras ESTATICAS (HSTS, X-Frame-Options, Referrer-Policy...) no
 *     dependen del request, asi que las declara `next.config.ts` y las aplica
 *     el servidor a toda respuesta, incluidos los archivos estaticos.
 *   * La CSP necesita un NONCE distinto por request, de modo que se construye
 *     aqui y la aplica `proxy.ts`.
 *
 * Este modulo se importa desde el proxy, que corre en el runtime de Next: no
 * puede depender de `server-only` ni de nada de Node.
 */

/** Cabeceras que no dependen del request. */
export function staticSecurityHeaders(isProduction: boolean): { key: string; value: string }[] {
  return [
    // Impide que el navegador "adivine" el tipo de un recurso y ejecute como
    // script algo que se sirvio como texto.
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Redundante con `frame-ancestors` de la CSP, pero lo entienden navegadores
    // antiguos que ignoran esa directiva. Defensa contra clickjacking.
    { key: 'X-Frame-Options', value: 'DENY' },
    // No filtrar la ruta completa —que lleva ids de boletas, clientes y pagos—
    // a sitios de terceros.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // La aplicacion no usa ninguna de estas capacidades: se apagan todas.
    {
      key: 'Permissions-Policy',
      value:
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()',
    },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    // HSTS solo en produccion: en desarrollo se sirve por http y anclar el
    // dominio `localhost` a https rompe el navegador de quien programa durante
    // meses, porque el navegador lo recuerda aunque se quite la cabecera.
    ...(isProduction
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ]
      : []),
  ]
}

/** Nonce aleatorio por request, en base64. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Construye la Content-Security-Policy.
 *
 * `supabaseUrl` entra como parametro y no se lee del entorno aqui para que la
 * funcion sea pura y se pueda probar sin montar variables de entorno.
 *
 * DECISIONES DE LA POLITICA (D-061)
 *
 * * `script-src` usa NONCE + `'strict-dynamic'`. Next inyecta el payload de
 *   hidratacion en scripts en linea; sin nonce habria que abrir
 *   `'unsafe-inline'`, que es tanto como no tener CSP para lo que mas importa.
 *   Con `'strict-dynamic'`, los scripts que Next carga desde los que ya llevan
 *   nonce heredan la confianza, y la lista de origenes deja de hacer falta.
 * * `connect-src` incluye el origen de Supabase —el navegador habla
 *   directamente con PostgREST y con Auth— en http(s) y en ws(s).
 * * `style-src` conserva `'unsafe-inline'`: Next y `next/font` inyectan estilos
 *   en linea, y un estilo en linea no ejecuta codigo. El riesgo residual
 *   (exfiltrar datos con selectores) no compensa romper la interfaz.
 * * `object-src 'none'` y `base-uri 'self'` cierran dos vias clasicas de
 *   inyeccion: incrustar plugins y reescribir la base de las URL relativas.
 * * `form-action 'self'` impide que una inyeccion envie un formulario —y con el
 *   sus datos— a un servidor ajeno.
 * * `frame-ancestors 'none'`: esta aplicacion nunca se muestra dentro de otra.
 * * `worker-src 'self'` es OBLIGATORIO desde que hay service worker (D-115), y
 *   no basta con que `default-src` sea `'self'`. La cadena de respaldo de esa
 *   directiva pasa por `script-src`, que lleva `'strict-dynamic'`, y
 *   `'strict-dynamic'` hace que se IGNOREN las listas de origenes: sin
 *   declararla, el navegador rechaza el registro del worker. Se limita al
 *   propio origen, que es de donde sale `/sw.js`.
 * * `manifest-src 'self'` se declara explicito por la misma prudencia, aunque
 *   ahi el respaldo a `default-src` si funcionaria.
 */
export function buildContentSecurityPolicy(options: {
  nonce: string
  supabaseUrl: string | undefined
  isDevelopment: boolean
}): string {
  const { nonce, supabaseUrl, isDevelopment } = options

  const supabaseOrigins: string[] = []
  if (supabaseUrl) {
    try {
      const { origin, host } = new URL(supabaseUrl)
      supabaseOrigins.push(origin)
      supabaseOrigins.push(`${origin.startsWith('https') ? 'wss' : 'ws'}://${host}`)
    } catch {
      // Una URL malformada no puede tumbar el servidor: se omite y la CSP
      // queda mas estricta, no mas laxa.
    }
  }

  const connectSrc = ["'self'", ...supabaseOrigins]
  // Turbopack abre un websocket al propio host para recargar en caliente.
  if (isDevelopment) connectSrc.push('ws:', 'http:')

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Turbopack evalua codigo al recargar en caliente. Jamas en produccion.
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ]

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src ${connectSrc.join(' ')}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')
}
