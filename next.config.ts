import type { NextConfig } from 'next'

import { staticSecurityHeaders } from './src/lib/security-headers'

const isProduction = process.env.NODE_ENV === 'production'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [],
  },

  /**
   * El indicador de desarrollo, fuera de la esquina inferior izquierda (D-106).
   *
   * Solo existe en `next dev` y nunca llega a produccion, pero desde que la
   * navegacion del telefono vive abajo su sitio por defecto —`bottom-left`— cae
   * justo encima de «Panel»: tapa la primera opcion de la barra y se come el
   * toque. Arriba a la izquierda solo hay el nombre de la organizacion, que no
   * se pulsa.
   */
  devIndicators: {
    position: 'top-left',
  },

  /**
   * Cabeceras de seguridad que no dependen del request (Fase 7).
   *
   * Se declaran aqui y no en `proxy.ts` para que las reciba TODA respuesta,
   * incluidos los archivos estaticos que el matcher del proxy excluye. La
   * Content-Security-Policy, que si depende del request porque lleva un nonce
   * distinto cada vez, la pone `proxy.ts`.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: staticSecurityHeaders(isProduction),
      },
    ]
  },
}

export default nextConfig
