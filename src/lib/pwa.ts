/**
 * Constantes compartidas de la aplicación instalable (D-115).
 *
 * Las lee el manifiesto (`src/app/manifest.ts`), el `<head>` del armazón
 * (`src/app/layout.tsx`) y el componente que registra el service worker. Están
 * juntas para que el nombre, la descripción y el color no puedan divergir entre
 * la pantalla de inicio del teléfono y la pestaña del navegador.
 *
 * El TEXTO visible de la instalación no vive aquí, sino en el componente que lo
 * muestra, igual que el resto de los textos de pantalla
 * (`docs/UX_COPY_GUIDELINES.md`, anexo B).
 */

/** Nombre completo. El mismo que el título del documento, no una variante. */
export const APP_NAME = 'Gestión de Rifas'

/**
 * Nombre bajo el icono de la pantalla de inicio.
 *
 * Android e iOS lo recortan alrededor de los 12 caracteres, así que «Gestión de
 * Rifas» aparecería como «Gestión de…» y el icono quedaría sin nombre útil.
 * «Rifas» es el término del glosario y cabe entero.
 */
export const APP_SHORT_NAME = 'Rifas'

export const APP_DESCRIPTION = 'Sistema de gestión de rifas, vendedores, boletas, abonos y pagos.'

/**
 * Color de la barra de estado de Android y de la pantalla de arranque.
 *
 * Blanco porque la aplicación se ve SIEMPRE en claro: `globals.css` define la
 * clase `.dark` pero nada la enciende. Es el color real del encabezado
 * (`bg-background`), de modo que la barra del sistema continúa la pantalla.
 */
export const THEME_COLOR = '#ffffff'

/**
 * Versión del código servido. La inyecta `next.config.ts` en tiempo de build.
 *
 * Se usa para dos cosas y solo dos: nombrar las cachés del service worker, de
 * forma que un despliegue nuevo pueda borrar las del anterior, y hacer que la
 * URL con la que se registra el worker cambie en cada despliegue —que es lo que
 * hace que el navegador se entere de que hay una versión nueva—.
 *
 * NO es el hash del commit: es un resumen suyo, precisamente para no publicar el
 * commit. Solo tiene que cumplir tres cosas: ser igual para todos los visitantes
 * de un mismo despliegue, cambiar con el siguiente y no decir nada de nadie.
 */
export const APP_BUILD_ID = process.env.NEXT_PUBLIC_APP_BUILD_ID ?? 'dev'

/** URL con la que se registra el worker. La versión viaja en la consulta. */
export const SERVICE_WORKER_URL = `/sw.js?v=${APP_BUILD_ID}`
