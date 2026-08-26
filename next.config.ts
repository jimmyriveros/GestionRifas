import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import type { NextConfig } from 'next'

import { staticSecurityHeaders } from './src/lib/security-headers'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Identificador de la version servida, para el service worker (D-115).
 *
 * TIENE QUE SER DETERMINISTA. `next build` evalua este archivo y ademas reparte
 * la generacion entre once procesos; si el valor saliera de `Date.now()`, dos
 * fragmentos del MISMO build podrian llevar numeros distintos y el navegador
 * veria una version nueva en cada navegacion. Por eso sale del commit, que es
 * igual en todos los procesos y cambia exactamente una vez por despliegue: en
 * este proyecto cada cambio promovido es un commit (`docs/HANDOFF.md` §1.a).
 *
 * SE PUBLICA UN RESUMEN, NO EL COMMIT. El valor acaba dentro del JavaScript que
 * descarga cualquiera, asi que no se escribe el hash del commit sino un sha256
 * suyo recortado. Cumple lo unico que se le pide —ser igual para todos los
 * visitantes de un despliegue, cambiar con el siguiente y no decir nada de
 * nadie— sin anadir informacion publica sobre el repositorio.
 *
 * `APP_BUILD_ID` permite fijarlo a mano si algun dia se construye fuera de Git.
 */
function resolveAppBuildId(): string {
  if (process.env.APP_BUILD_ID) return process.env.APP_BUILD_ID

  // En Vercel viene dado; fuera se pregunta a Git. Si no hay ninguno de los dos
  // —una copia descargada sin historial—, el build no se cae: se queda en `dev`
  // y el worker sigue funcionando, solo que sin distinguir versiones.
  let commit = process.env.VERCEL_GIT_COMMIT_SHA
  if (!commit) {
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    } catch {
      return 'dev'
    }
  }

  return createHash('sha256').update(commit).digest('hex').slice(0, 12)
}

const appBuildId = resolveAppBuildId()

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [],
  },

  /**
   * Se inyecta en el bundle en tiempo de build, no se lee en ejecucion: quien
   * abre la aplicacion recibe el identificador del codigo que le acaban de
   * servir. Lo consume `src/lib/pwa.ts`.
   */
  env: {
    NEXT_PUBLIC_APP_BUILD_ID: appBuildId,
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
