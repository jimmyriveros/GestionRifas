import { expect, test } from '@playwright/test'

import { setMembershipActive } from './db-setup'
import { ACCOUNTS, loginAs, logout, SEED_PASSWORD } from './fixtures'

/**
 * Fase 7: endurecimiento y proteccion de APIs (prueba 25 de `CLAUDE.md` §30).
 *
 * `tests/unit/server-actions-guard.test.ts` comprueba que TODA Server Action
 * lleva su guarda. Aqui se comprueba lo complementario: que esas guardas y las
 * cabeceras funcionan de verdad sobre HTTP, con sesiones reales.
 */

const RUTAS_PROTEGIDAS = [
  '/owner/dashboard',
  '/owner/raffles',
  '/owner/tickets',
  '/owner/payments',
  '/owner/reports',
  '/owner/users',
  '/seller/dashboard',
  '/seller/tickets',
  '/seller/clients',
  '/seller/payments',
  '/seller/reports',
]

/**
 * Prueba 1 de `CLAUDE.md` §30 (BR-A01, BR-A02).
 *
 * La matriz la daba por cubierta desde la Fase 1, pero ninguna prueba
 * comprobaba el destino POR ROL: el helper `loginAs` espera
 * `/owner/dashboard` **o** `/seller/dashboard`, asi que un vendedor que
 * aterrizara en el portal administrativo habria pasado desapercibido.
 */
test.describe('Login y redireccion por rol (prueba 1)', () => {
  const DESTINOS = [
    { cuenta: ACCOUNTS.owner, destino: '/owner/dashboard', prohibido: '/seller' },
    { cuenta: ACCOUNTS.admin, destino: '/owner/dashboard', prohibido: '/seller' },
    { cuenta: ACCOUNTS.seller, destino: '/seller/dashboard', prohibido: '/owner' },
  ]

  for (const { cuenta, destino, prohibido } of DESTINOS) {
    test(`${cuenta} aterriza exactamente en ${destino}`, async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Correo electrónico').fill(cuenta)
      await page.getByLabel('Contraseña').fill(SEED_PASSWORD)
      await page.getByRole('button', { name: 'Ingresar' }).click()

      await page.waitForURL(new RegExp(destino))
      expect(page.url()).toContain(destino)
      expect(page.url()).not.toContain(prohibido)
    })
  }

  test('la raiz redirige a cada quien a SU portal', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/')
    await expect(page).toHaveURL(/\/seller\/dashboard/)

    await logout(page)

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/')
    await expect(page).toHaveURL(/\/owner\/dashboard/)
  })

  test('con credenciales incorrectas no se entra a ningún portal', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(ACCOUNTS.owner)
    await page.getByLabel('Contraseña').fill('ContrasenaEquivocada1')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page.getByText(/correo o contraseña incorrectos/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Cabeceras de seguridad', () => {
  test('toda respuesta trae las cabeceras de endurecimiento', async ({ page }) => {
    const response = await page.goto('/login')
    const headers = response!.headers()

    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=()')
  })

  test('la CSP lleva un nonce y no permite scripts en linea', async ({ page }) => {
    const response = await page.goto('/login')
    const csp = response!.headers()['content-security-policy']

    expect(csp).toBeTruthy()
    expect(csp).toMatch(/script-src[^;]*'nonce-/)
    // `unsafe-inline` en script-src dejaria la CSP sin su principal utilidad.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("form-action 'self'")
  })

  test('el nonce cambia en cada respuesta', async ({ page }) => {
    const leerNonce = async () => {
      const response = await page.goto('/login')
      return /'nonce-([^']+)'/.exec(response!.headers()['content-security-policy'] ?? '')?.[1]
    }

    const primero = await leerNonce()
    const segundo = await leerNonce()

    expect(primero).toBeTruthy()
    expect(segundo).not.toBe(primero)
  })

  test('la aplicacion FUNCIONA con la CSP puesta: no hay violaciones en consola', async ({
    page,
  }) => {
    // Es la comprobacion que de verdad importa: una CSP mal calibrada no da
    // error de servidor, simplemente deja la pagina muerta.
    const violaciones: string[] = []
    page.on('console', (mensaje) => {
      if (/Content Security Policy|Refused to (load|execute|connect)/i.test(mensaje.text())) {
        violaciones.push(mensaje.text())
      }
    })

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/reports?report=payments')
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()

    expect(violaciones).toEqual([])
  })
})

test.describe('Proteccion de rutas sin sesión (prueba 25)', () => {
  test('toda ruta protegida redirige al login', async ({ page }) => {
    for (const ruta of RUTAS_PROTEGIDAS) {
      await page.goto(ruta)
      await expect(page, `${ruta} deberia redirigir`).toHaveURL(/\/login/)
    }
  })

  test('el destino se conserva para volver después de entrar', async ({ page }) => {
    await page.goto('/owner/payments')
    await expect(page).toHaveURL(/next=%2Fowner%2Fpayments/)
  })

  test('la descarga de reportes no entrega NADA sin sesión', async ({ playwright, baseURL }) => {
    // Contexto NUEVO, sin cookies: un Route Handler no pasa por el layout, asi
    // que si no se protegiera solo, aqui saldria el CSV entero (D-060).
    const contexto = await playwright.request.newContext({ baseURL })

    // Sin seguir la redireccion, para ver la respuesta real y no la del login.
    const respuesta = await contexto.get('/api/reports/export?report=sellers', {
      maxRedirects: 0,
    })

    // El proxy corta antes incluso de llegar al handler; su 401 es la segunda
    // linea de defensa, por si el matcher dejara de cubrir /api algun dia.
    expect(respuesta.status()).toBe(307)
    expect(respuesta.headers()['location']).toContain('/login')

    const cuerpo = await respuesta.text()
    expect(cuerpo).not.toContain('Vendedor;Alias')
    expect(cuerpo).not.toMatch(/Julian|Laura/)

    await contexto.dispose()
  })
})

test.describe('Aislamiento por rol sobre HTTP (prueba 25)', () => {
  test('un vendedor no alcanza ninguna ruta del portal administrativo', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)

    for (const ruta of RUTAS_PROTEGIDAS.filter((r) => r.startsWith('/owner'))) {
      await page.goto(ruta)
      await expect(page, `${ruta} no deberia abrirse`).toHaveURL(/\/denied/)
    }
  })

  test('un administrador no alcanza el portal del vendedor', async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin)

    for (const ruta of RUTAS_PROTEGIDAS.filter((r) => r.startsWith('/seller'))) {
      await page.goto(ruta)
      await expect(page, `${ruta} no deberia abrirse`).toHaveURL(/\/denied/)
    }
  })

  test('un vendedor no puede exportar el reporte que compara vendedores', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/reports')

    const estado = await page.evaluate(async () => {
      const r = await fetch('/api/reports/export?report=sellers')
      return r.status
    })
    expect(estado).toBe(403)
  })
})

test.describe('La API de datos respeta la RLS con la sesión real del navegador', () => {
  test('un vendedor consultando la API directamente solo obtiene sus boletas', async ({ page }) => {
    // Se toma el token REAL que el navegador guarda tras iniciar sesion por la
    // interfaz y se llama a PostgREST sin pasar por la aplicacion, que es lo
    // que haria alguien con las herramientas de desarrollo abiertas.
    await loginAs(page, ACCOUNTS.seller)

    const resultado = await page.evaluate(async () => {
      const cookie = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('sb-') && c.includes('-auth-token='))
      if (!cookie) return { error: 'sin cookie de sesión' }

      const raw = decodeURIComponent(cookie.split('=').slice(1).join('='))
      const json = raw.startsWith('base64-') ? atob(raw.slice('base64-'.length)) : raw
      const token = JSON.parse(json).access_token as string

      const anon =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

      const respuesta = await fetch(
        'http://127.0.0.1:54321/rest/v1/tickets?select=id,seller_id&limit=1000',
        { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
      )
      const filas = (await respuesta.json()) as { seller_id: string }[]
      return {
        status: respuesta.status,
        total: filas.length,
        vendedores: [...new Set(filas.map((f) => f.seller_id))],
      }
    })

    expect(resultado.error).toBeUndefined()
    expect(resultado.status).toBe(200)
    expect(resultado.total).toBeGreaterThan(0)
    // La prueba de verdad: todas las boletas son del MISMO vendedor.
    expect(resultado.vendedores).toHaveLength(1)
  })

  test('sin token, la API no devuelve nada', async ({ playwright }) => {
    const anon =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
    const contexto = await playwright.request.newContext()

    const respuesta = await contexto.get('http://127.0.0.1:54321/rest/v1/tickets?select=id', {
      headers: { apikey: anon },
    })

    // Ni una fila. De hecho ni siquiera llega a la RLS: la migracion 0010 le
    // quito a `anon` todo privilegio sobre las tablas de negocio, asi que
    // PostgreSQL rechaza antes por permisos (dos capas independientes, D-038).
    const cuerpo = await respuesta.json()
    expect(Array.isArray(cuerpo) ? cuerpo : []).toEqual([])
    expect(JSON.stringify(cuerpo)).not.toContain('"id"')

    await contexto.dispose()
  })
})

test.describe('Los errores no revelan estructura interna (prueba 25)', () => {
  /**
   * Se lee `innerText`, no `textContent`, y solo del contenido principal: en
   * desarrollo Next incrusta su payload RSC dentro de etiquetas `<script>`, con
   * rutas de modulos internos. Eso no se le muestra a nadie y no es una fuga;
   * incluirlo daria falsos positivos permanentes.
   */
  /**
   * TODO el texto de la pantalla, no solo el de `main`.
   *
   * Leia `main` hasta que se quitaron los `loading.tsx` (D-104): sin ellos, un
   * id inexistente ya no se pinta dentro del portal —Next resuelve `notFound()`
   * antes de emitir nada y renderiza la pagina de error con el layout raiz, que
   * no tiene `<main>`—. Leer el `body` cubre los dos casos y ademas comprueba
   * MAS: si alguna vez se filtrara el mensaje de PostgreSQL fuera de `main`,
   * antes no se habria visto.
   */
  const textoVisible = async (page: import('@playwright/test').Page) =>
    (await page.locator('body').innerText()).toLowerCase()

  /** Firmas de mensajes que redacta PostgreSQL, no la aplicacion. */
  const FUGAS = [
    'relation "',
    'column "',
    'violates',
    'constraint',
    'invalid input syntax',
    'permission denied for',
    'pg_catalog',
    'select ',
  ]

  test('un id inexistente no filtra nombres de tablas ni columnas', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets/00000000-0000-0000-0000-000000000000')

    const texto = await textoVisible(page)
    for (const fuga of FUGAS) {
      expect(texto, `la página menciona "${fuga}"`).not.toContain(fuga)
    }
  })

  test('un id con formato inválido tampoco', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/clients/no-es-un-uuid')

    const texto = await textoVisible(page)
    for (const fuga of FUGAS) {
      expect(texto, `la página menciona "${fuga}"`).not.toContain(fuga)
    }
  })

  test('el login no revela si un correo existe', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill('noexiste@demo.test')
    await page.getByLabel('Contraseña').fill('ContrasenaIncorrecta1')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    const error = page.getByText(/correo o contraseña incorrectos/i)
    await expect(error).toBeVisible()
  })

  test('la recuperación de contraseña responde igual exista o no el correo', async ({ page }) => {
    const mensajes: string[] = []

    for (const correo of ['owner@demo.test', 'noexiste@demo.test']) {
      await page.goto('/forgot-password')
      await page.getByLabel('Correo electrónico').fill(correo)
      await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click()
      const confirmacion = page.getByText(/si el correo está registrado/i)
      await expect(confirmacion).toBeVisible()
      mensajes.push(await confirmacion.innerText())
    }

    // Si difirieran, se podria enumerar quien tiene cuenta.
    expect(mensajes[0]).toBe(mensajes[1])
  })
})

/**
 * Prueba 2 de `CLAUDE.md` §30 (BR-A04), automatizada por fin en la Fase 7.
 *
 * La matriz la daba por cubierta desde la Fase 1, pero alli se habia comprobado
 * A MANO en el navegador: no existia ninguna prueba automatizada que fallara si
 * alguien rompia el bloqueo. Es el caso dificil —la sesion YA estaba abierta
 * cuando se desactivo la cuenta— y el que de verdad importa: ocultar el menu no
 * sirve de nada si el token anterior sigue funcionando.
 */
test.describe('Sesión de usuario desactivado (BR-A04, prueba 2)', () => {
  const NOMBRE = 'Laura Moreno'

  /**
   * La restitucion va por la base de datos y en un `afterEach`, no por la
   * interfaz dentro de la prueba.
   *
   * Se aprendio a la fuerza: la primera version restituia con un `finally` a
   * traves de la interfaz y, cuando la prueba agoto su tiempo antes de llegar
   * ahi, el vendedor quedo INACTIVO en el seed. A partir de ese momento fallan
   * pruebas que no tienen nada que ver, y encontrar el motivo cuesta mucho mas
   * que escribir esto.
   */
  test.afterEach(async () => {
    await setMembershipActive(ACCOUNTS.otherSeller, true)
  })

  async function cambiarEstado(page: import('@playwright/test').Page, accion: string) {
    await page.goto('/owner/sellers')
    const fila = page.getByRole('row').filter({ hasText: NOMBRE })
    await fila.getByRole('button', { name: `Acciones para ${NOMBRE}` }).click()
    await page.getByRole('menuitem', { name: accion }).click()
    await page.getByRole('button', { name: accion, exact: true }).click()
    // «Cuenta activa», no «Activo»: desde 0026 la etiqueta distingue a quien
    // todavía no ha entrado nunca de quien sí (BR-E14).
    await expect(
      fila.getByText(accion === 'Desactivar' ? 'Inactivo' : 'Cuenta activa'),
    ).toBeVisible()
  }

  test('desactivar a un vendedor invalida la sesión que ya tenia abierta', async ({
    page,
    browser,
  }) => {
    // El vendedor entra y se queda dentro.
    const contextoVendedor = await browser.newContext()
    const paginaVendedor = await contextoVendedor.newPage()
    await loginAs(paginaVendedor, ACCOUNTS.otherSeller)
    await expect(paginaVendedor).toHaveURL(/\/seller\/dashboard/)

    await loginAs(page, ACCOUNTS.owner)

    try {
      await cambiarEstado(page, 'Desactivar')

      // Su sesion anterior deja de servir de inmediato.
      await paginaVendedor.goto('/seller/tickets')
      await expect(paginaVendedor).toHaveURL(/\/login/)

      // Y tampoco puede volver a entrar. Se rellena el formulario a mano en vez
      // de usar `loginAs`, que espera un dashboard que aqui no va a llegar y se
      // comeria el tiempo de la prueba entero esperandolo.
      await paginaVendedor.goto('/login')
      await paginaVendedor.getByLabel('Correo electrónico').fill(ACCOUNTS.otherSeller)
      await paginaVendedor.getByLabel('Contraseña').fill(SEED_PASSWORD)
      await paginaVendedor.getByRole('button', { name: 'Ingresar' }).click()

      await expect(paginaVendedor.getByText(/inactiva/i)).toBeVisible()
      await expect(paginaVendedor).not.toHaveURL(/\/seller\/dashboard/)

      // Se reactiva por la interfaz para comprobar tambien ese camino; si algo
      // fallara antes de llegar aqui, el `afterEach` restituye igualmente.
      await cambiarEstado(page, 'Activar')
    } finally {
      await contextoVendedor.close()
      await logout(page)
    }
  })
})
