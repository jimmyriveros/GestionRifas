/*
 * SERVICE WORKER DE «GESTIÓN DE RIFAS» (D-115, D-116)
 * ===================================================
 *
 * QUÉ HACE Y, SOBRE TODO, QUÉ NO HACE
 *
 * Guarda los archivos de la aplicación —el JavaScript, los estilos, las fuentes
 * y los iconos— para que abrirla desde el icono del teléfono no dependa de
 * volver a descargarlos. Y responde con una pantalla de «sin conexión» cuando no
 * hay red.
 *
 * NO guarda ni una sola respuesta con datos del negocio. Ni boletas, ni pagos,
 * ni clientes, ni saldos, ni el HTML de una pantalla. La razón está escrita en
 * D-116 y se resume en una frase: en esta aplicación el HTML de cualquier
 * pantalla protegida ES el dato —lo renderiza el servidor con las filas de quien
 * consulta—, así que guardarlo sería guardar información de una persona en un
 * teléfono que puede usar otra. Dos vendedores compartiendo un móvil no es un
 * caso raro aquí, es el caso normal.
 *
 * Consecuencia honesta: sin conexión la aplicación NO muestra las boletas de
 * ayer. Muestra que no hay conexión. Es exactamente el orden de prioridades del
 * encargo: primero datos correctos, después velocidad.
 *
 * LO QUE SÍ SE GUARDA es seguro por construcción: las direcciones de
 * `/_next/static/…` llevan la huella del contenido, de modo que un archivo
 * distinto tiene siempre una dirección distinta. Servir uno desde la caché no
 * puede devolver una versión vieja: si el contenido cambió, cambió la dirección
 * y esa todavía no está guardada.
 *
 * NUNCA se toca nada de esto:
 *   - Peticiones que no sean GET: cada venta, cada abono y cada anulación viaja
 *     en un POST de Server Action y va SIEMPRE al servidor.
 *   - Los payloads de navegación de Next (`RSC: 1` / `?_rsc=`), que llevan los
 *     datos de la pantalla.
 *   - `/api/…` y `/auth/…`.
 *   - Cualquier origen ajeno, empezando por Supabase.
 *
 * CÓMO SE ACTUALIZA
 *
 * La página lo registra como `/sw.js?v=<versión>`. Cada despliegue cambia esa
 * dirección, el navegador descarga este archivo otra vez, lo instala en segundo
 * plano y se queda ESPERANDO. No se activa solo: espera a que la persona pulse
 * «Actualizar» en el aviso, porque activarse implica recargar y recargar en
 * mitad de un abono es perder lo que se estaba escribiendo.
 *
 * LAS NOTIFICACIONES ESTÁN AL FINAL DE ESTE ARCHIVO
 *
 * Este es el ÚNICO service worker de la aplicación y su alcance es la raíz, así
 * que los oyentes `push` y `notificationclick` viven AQUÍ, en su propia sección
 * del final. Un segundo archivo competiría por ese mismo alcance y el navegador
 * solo deja uno controlando cada página.
 *
 * ⚠️ Esta nota decía «SITIO RESERVADO PARA LAS NOTIFICACIONES (Firebase Cloud
 * Messaging)» desde D-115, y Firebase quedó DESCARTADO en D-187: se usa Web
 * Push estándar, sin SDK, sin dependencia nueva y sin abrir la CSP. Lo que sí
 * sigue valiendo igual es la advertencia del segundo worker. Ver
 * `docs/ARCHITECTURE.md` §8.15 y §8.15.a.
 */

/**
 * Versión servida. Llega en la consulta de la propia dirección del worker, que
 * es lo que hace que este archivo, siendo estático, cambie en cada despliegue.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') ?? 'dev'

/**
 * Archivos con huella de contenido. El nombre NO lleva versión a propósito: sus
 * direcciones ya son únicas por contenido, así que lo que siga sirviendo tras un
 * despliegue sigue siendo correcto y no hay que volver a descargarlo. Es la
 * diferencia entre un despliegue que cuesta unos kilobytes y uno que cuesta
 * megabytes.
 */
const ASSET_CACHE = 'rifas-assets'

/**
 * Pantalla de «sin conexión» e iconos. Estos NO llevan huella, así que el nombre
 * SÍ lleva versión: al activarse una versión nueva se borra la anterior entera y
 * se vuelven a pedir.
 */
const SHELL_CACHE = `rifas-shell-${VERSION}`

const OFFLINE_URL = '/offline'

/**
 * Tope de archivos guardados. Cada despliegue deja atrás los fragmentos que
 * cambiaron; sin tope, la caché crecería sin fin en un teléfono. 300 entradas
 * son varios despliegues de holgura sobre los ~60 fragmentos de una versión.
 */
const ASSET_CACHE_MAX_ENTRIES = 300

self.addEventListener('install', (event) => {
  event.waitUntil(installOfflineScreen())
  // Sin `skipWaiting()`. Ver la cabecera: la activación la manda la persona.
})

/**
 * Guarda la pantalla de «sin conexión» Y los archivos que necesita para
 * funcionar.
 *
 * Lo segundo no es un extra. Sin conexión, esa pantalla se sirve desde la caché,
 * pero su JavaScript se pediría a la red igual que cualquier otro: si no está
 * guardado, la pantalla se ve pero no reacciona, y con ella se pierde lo único
 * que hace: enterarse de que volvió la conexión y recargar sola. Por eso se lee
 * su HTML y se guardan las direcciones que menciona, que llevan huella de
 * contenido y por tanto van a la caché de archivos, no a la de la version.
 *
 * NINGÚN fallo aquí puede tumbar la instalación. Si algo no se puede descargar,
 * el worker se instala igual y esa pieza se pedirá a la red cuando toque; un
 * `addAll` habría rechazado el lote entero por un solo archivo.
 */
async function installOfflineScreen() {
  const shell = await caches.open(SHELL_CACHE)

  // `cache: 'reload'` salta la caché HTTP del navegador: al instalar hay que
  // guardar la pantalla que acaba de desplegarse, no la que quedó de antes.
  const response = await fetch(new Request(OFFLINE_URL, { cache: 'reload' }))
  if (!response.ok) return

  const html = await response.clone().text()
  await shell.put(OFFLINE_URL, response)

  const assets = await caches.open(ASSET_CACHE)
  const referenced = new Set(
    Array.from(html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g), (match) => match[1]),
  )
  await Promise.all(
    Array.from(referenced, async (url) => {
      try {
        const asset = await fetch(url, { cache: 'reload' })
        if (asset.status === 200) await assets.put(url, asset)
      } catch {
        // Se pedirá a la red cuando haga falta.
      }
    }),
  )
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('rifas-'))
          .filter((name) => name !== ASSET_CACHE && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      )
      // Tomar el control de las pestañas ya abiertas. Es seguro porque este
      // worker solo responde archivos con huella: una pestaña de la versión
      // anterior sigue pidiendo SUS direcciones, que siguen guardadas.
      await self.clients.claim()
    })(),
  )
})

/** Archivos con huella de contenido: se pueden guardar para siempre. */
function isFingerprintedAsset(url) {
  return url.pathname.startsWith('/_next/static/')
}

/** Iconos y manifiesto: cambian poco y se refrescan con cada versión. */
function isShellAsset(url) {
  return (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.webmanifest'
  )
}

/**
 * Peticiones que NUNCA pasan por aquí, aunque sean GET y del mismo origen.
 * Todas tienen la misma razón: llevan datos de una persona concreta.
 */
function carriesUserData(request, url) {
  return (
    // Payload de navegación de Next: es la pantalla con sus filas dentro.
    request.headers.get('RSC') === '1' ||
    url.searchParams.has('_rsc') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/')
  )
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  // `keys()` devuelve las entradas en orden de inserción: las primeras son las
  // más antiguas.
  const excess = keys.length - maxEntries
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i])
  }
}

async function cacheFirst(event, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(event.request)
  if (hit) return hit

  const response = await fetch(event.request)
  // Solo respuestas completas y del mismo origen. Un 206, un error o una
  // respuesta opaca guardados servirían basura en la siguiente visita.
  if (response.status === 200 && response.type === 'basic') {
    await cache.put(event.request, response.clone())
    if (maxEntries) event.waitUntil(trimCache(cacheName, maxEntries))
  }
  return response
}

/**
 * Navegaciones: SIEMPRE a la red. Si no hay red, la pantalla de sin conexión.
 *
 * No es «network first»: es «solo red». La diferencia importa, porque
 * «network first» GUARDARÍA la respuesta, y la respuesta es el panel de alguien.
 */
async function networkOnlyWithOfflineFallback(request) {
  try {
    return await fetch(request)
  } catch {
    const cache = await caches.open(SHELL_CACHE)
    const offline = await cache.match(OFFLINE_URL)
    return offline ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Todo lo que modifica algo —vender, abonar, anular— sale por aquí sin que
  // este archivo lo mire siquiera.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (carriesUserData(request, url)) return

  if (isFingerprintedAsset(url)) {
    event.respondWith(cacheFirst(event, ASSET_CACHE, ASSET_CACHE_MAX_ENTRIES))
    return
  }

  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(event, SHELL_CACHE, 0))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkOnlyWithOfflineFallback(request))
  }

  // Cualquier otra cosa se deja pasar sin tocarla.
})

self.addEventListener('message', (event) => {
  // Lo envía el aviso de versión nueva cuando la persona pulsa «Actualizar».
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

/*
 * ============================================================================
 * NOTIFICACIONES DEL SISTEMA — Web Push estándar (D-187, D-190, BR-V04, BR-V05)
 * ============================================================================
 *
 * Esta es la sección que la cabecera de este archivo dejó reservada desde D-115,
 * y llega SIN Firebase: el mismo evento `push` del navegador, con VAPID y
 * cifrado estándar, hablando con el servicio de push del propio navegador. No
 * hay SDK, no hay dependencia y la CSP no se abre a nada, porque al servicio de
 * push lo llama el servidor y no esta página.
 *
 * SIGUE HABIENDO UN SOLO SERVICE WORKER Y ES ESTE. Un segundo archivo competiría
 * por el mismo alcance y el navegador solo deja uno controlando cada página.
 *
 * LO QUE ESTO NO CAMBIA: arriba está escrito que este worker no guarda ni una
 * respuesta con datos del negocio. Recibir un push no altera esa regla ni una
 * coma, y de hecho la refuerza — el push no trae nada que se pueda guardar.
 *
 * EL AVISO ES GENÉRICO, SIEMPRE (BR-V05). Se lee en una pantalla bloqueada, en
 * un teléfono que puede estar en la mano de otra persona: no lleva cuentas, ni
 * números de cuenta, ni el mensaje del vendedor, ni nombres de clientes, ni
 * importes, ni saldos. Lleva que hay algo y a dónde ir. El contenido se compone
 * al abrir la aplicación, con sesión.
 *
 * POR QUÉ SIEMPRE SE MUESTRA ALGO. La suscripción se pide con
 * `userVisibleOnly: true`, que es un compromiso con el navegador: por cada push
 * recibido tiene que aparecer una notificación. Si no aparece, el navegador
 * muestra la suya —«este sitio se actualizó en segundo plano»— y, si se repite,
 * puede retirar el permiso. Por eso un cuerpo ilegible o ausente no se descarta:
 * se muestra el texto de reserva de aquí abajo.
 */

/** Lo que se enseña cuando el push llega sin cuerpo o con uno ilegible. */
const PUSH_FALLBACK = {
  title: 'Rifas',
  body: 'Tienes un aviso nuevo. Ábrelo para verlo.',
  url: '/',
}

/** Tope de lo que se pinta. Un título o un cuerpo larguísimo no se muestran igual. */
const PUSH_TITLE_MAX = 80
const PUSH_BODY_MAX = 200

function pushText(value, fallback, max) {
  if (typeof value !== 'string') return fallback
  const clean = value.trim()
  if (clean === '') return fallback
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/**
 * La dirección a la que lleva el aviso, SIEMPRE del mismo origen.
 *
 * Aunque el cuerpo viene cifrado desde nuestro propio servidor, una dirección se
 * resuelve y se comprueba antes de abrirla: un aviso no puede acabar llevando a
 * un sitio ajeno.
 */
function pushUrl(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : PUSH_FALLBACK.url, self.location.origin)
    return url.origin === self.location.origin ? url.href : self.location.origin
  } catch {
    return self.location.origin
  }
}

function readPushPayload(data) {
  if (!data) return PUSH_FALLBACK
  try {
    const payload = data.json()
    return {
      title: pushText(payload?.title, PUSH_FALLBACK.title, PUSH_TITLE_MAX),
      body: pushText(payload?.body, PUSH_FALLBACK.body, PUSH_BODY_MAX),
      url: pushUrl(payload?.url),
      // Agrupa los repetidos: dos avisos del mismo recordatorio no llenan la
      // pantalla de bloqueo con la misma frase dos veces.
      tag: typeof payload?.tag === 'string' && payload.tag !== '' ? payload.tag : 'rifas',
    }
  } catch {
    return { ...PUSH_FALLBACK, url: pushUrl(null), tag: 'rifas' }
  }
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event.data)

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // El icono de la aplicación instalada, que ya existe y ya se sirve.
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag ?? 'rifas',
      // Reemplaza el anterior del mismo `tag` sin volver a vibrar: si alguien
      // dejó el teléfono en la mesa, dos avisos iguales no lo hacen sonar dos
      // veces.
      renotify: false,
      data: { url: payload.url },
    }),
  )
})

/**
 * Al tocar el aviso: se trae al frente una ventana que ya esté abierta, y solo
 * si no hay ninguna se abre otra.
 *
 * Abrir siempre una ventana nueva dejaría al vendedor con tres pestañas de la
 * misma aplicación después de tres recordatorios.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = pushUrl(event.notification.data?.url)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        // `navigate` no existe en todos los navegadores; si falta, al menos la
        // ventana queda al frente, que es la mitad importante.
        if (typeof client.navigate === 'function') await client.navigate(target)
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})
