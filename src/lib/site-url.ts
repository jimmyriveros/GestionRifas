/**
 * `NEXT_PUBLIC_SITE_URL`: la dirección pública de Rifas (I-049, D-254).
 *
 * La leen el destino que se le pide a Auth para la invitación y la recuperación de contraseña
 * —su `redirectTo`— y el enlace del catálogo. Antes cada uno la leía a su manera; ahora es una sola
 * función, que quita las barras finales para que nada quede como `https://…//auth/callback`.
 *
 * El enlace del correo NO sale de aquí: lo arma Supabase con su «Site URL» y las plantillas de
 * `supabase/templates/` (D-254). Las dos direcciones tienen que ser la misma (`DEPLOYMENT` §2.1).
 *
 * Puro y sin `server-only`: `scripts/check-env.ts` usa `siteUrlProblem` antes de compilar.
 */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') ?? ''
}

/**
 * El `redirectTo` que se le pide a Auth al invitar, reenviar la invitación y recuperar la
 * contraseña. Con las plantillas de D-254 el enlace del correo no lo usa; se conserva porque es el
 * camino de las plantillas por defecto —`/auth/callback`, con el código PKCE— mientras no se hayan
 * cambiado en el panel.
 */
export function passwordLinkRedirectTo(): string {
  return `${siteUrl()}/auth/callback?next=/reset-password`
}

/** Hosts en los que se acepta `http`: el equipo de quien desarrolla y el CI. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Por qué un valor de `NEXT_PUBLIC_SITE_URL` no sirve, o `null` si sirve.
 *
 * Tiene que ser un origen —esquema, host y, si acaso, puerto—, sin ruta, búsqueda ni fragmento, y
 * con `https` salvo en `localhost`. En el despliegue de producción, siempre `https`.
 */
export function siteUrlProblem(
  value: string | undefined,
  { production }: { production: boolean },
): string | null {
  const raw = value?.trim()
  if (!raw) return 'falta NEXT_PUBLIC_SITE_URL'

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return `NEXT_PUBLIC_SITE_URL no es una dirección válida: «${raw}»`
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return `NEXT_PUBLIC_SITE_URL tiene que empezar por https://: «${raw}»`
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    return `NEXT_PUBLIC_SITE_URL tiene que ser solo el origen, sin ruta: «${raw}» → «${url.origin}»`
  }
  if (url.protocol === 'http:' && (production || !LOCAL_HOSTS.has(url.hostname))) {
    return `NEXT_PUBLIC_SITE_URL tiene que usar https:// fuera de localhost: «${raw}»`
  }
  return null
}
