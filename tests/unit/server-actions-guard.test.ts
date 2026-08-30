import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Prueba 25 de `CLAUDE.md` §30: proteccion de APIs y Server Actions.
 *
 * POR QUE ES UNA PRUEBA ESTRUCTURAL Y NO FUNCIONAL
 *
 * Una Server Action es un endpoint publico: Next le asigna un identificador y
 * cualquiera puede invocarla con un POST, sin pasar por la pantalla que la
 * usa. La proteccion no es la ruta desde la que se llama, sino la primera linea
 * de la propia accion.
 *
 * Llamarlas de verdad desde una prueba exigiria reproducir el protocolo interno
 * de Next y sus identificadores, que cambian en cada build: una prueba asi seria
 * fragil y dejaria de comprobar nada en cuanto fallara por otro motivo. Lo que
 * se comprueba aqui es la INVARIANTE que de verdad importa y que se rompe sola
 * con el tiempo: **ninguna accion nueva puede olvidarse la autorizacion**.
 *
 * Su valor esta en el futuro: cuando alguien agregue una accion en la Fase 8 o
 * en el mantenimiento y se salte la guarda, esta prueba falla sin que nadie haya
 * tenido que escribir una prueba nueva. Es el mismo principio que `catalog.test.ts`
 * aplica al esquema de la base de datos.
 *
 * Las otras dos capas se comprueban aparte:
 *   * Que la guarda RECHACE de verdad -> `tests/e2e/security.spec.ts`.
 *   * Que aunque se saltara, la RLS bloquee la escritura -> `tests/db/*`.
 */

const FEATURES_DIR = join(process.cwd(), 'src', 'features')

/**
 * Acciones que legitimamente NO llevan `authorizeAction`, con su motivo.
 * Cualquier otra que aparezca sin guarda hace fallar la prueba.
 */
const SIN_GUARDA_JUSTIFICADA: Record<string, string> = {
  // Son el flujo de autenticacion: exigir sesion para iniciar sesion no tiene
  // sentido. Cada una se protege con lo suyo (validacion, limite de intentos,
  // y el token de Supabase en el caso de restablecer).
  'auth/login': 'es el propio inicio de sesion',
  'auth/logout': 'cerrar sesion no puede exigir permisos',
  'auth/requestPasswordReset': 'flujo publico de recuperacion',
  'auth/resetPassword': 'se autoriza con el token de recuperacion de Supabase',
  'auth/changePassword': 'opera sobre la sesion activa mediante Supabase Auth',
}

type Accion = { modulo: string; nombre: string; cuerpo: string }

/**
 * Todos los `<nombre>.ts` bajo `src/features`, a CUALQUIER profundidad.
 *
 * Recorrer un solo nivel dejaba fuera `tickets/assign/`, `tickets/bulk/` y
 * `tickets/seller/`: 6 de las 28 acciones quedaban sin analizar, justo las que
 * asignan boletas y las crean en lote (hallazgo A-01 de la Fase 9). Estaban
 * bien protegidas, pero la red que impide olvidarse de la guarda no las cubria.
 */
function buscarArchivos(nombre: string, dir = FEATURES_DIR): string[] {
  const encontrados: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) encontrados.push(...buscarArchivos(nombre, ruta))
    else if (entrada.name === nombre) encontrados.push(ruta)
  }
  return encontrados
}

/** Identifica el modulo por su ruta relativa: `tickets/bulk`, no solo `tickets`. */
function moduloDe(archivo: string): string {
  return archivo
    .slice(FEATURES_DIR.length + 1)
    .replace(/\\/g, '/')
    .replace(/\/actions\.ts$/, '')
}

/** Extrae cada Server Action exportada con su cuerpo. */
function leerAcciones(): Accion[] {
  const acciones: Accion[] = []

  for (const archivo of buscarArchivos('actions.ts')) {
    const modulo = moduloDe(archivo)
    const fuente = readFileSync(archivo, 'utf8')

    expect(fuente.startsWith("'use server'"), `${modulo}/actions.ts sin 'use server'`).toBe(true)

    const regex = /export async function (\w+)\s*\(/g
    const posiciones: { nombre: string; desde: number }[] = []
    let match: RegExpExecArray | null
    while ((match = regex.exec(fuente)) !== null) {
      posiciones.push({ nombre: match[1]!, desde: match.index })
    }

    posiciones.forEach((posicion, indice) => {
      const hasta = posiciones[indice + 1]?.desde ?? fuente.length
      acciones.push({
        modulo,
        nombre: posicion.nombre,
        cuerpo: fuente.slice(posicion.desde, hasta),
      })
    })
  }

  return acciones
}

const ACCIONES = leerAcciones()

describe('F7-25 toda Server Action se autoriza a si misma', () => {
  it('se encontraron acciones que analizar', () => {
    // Si un cambio de estructura dejara la lista vacia, las comprobaciones de
    // abajo pasarian sin mirar nada. Esto lo impide.
    expect(ACCIONES.length).toBeGreaterThanOrEqual(28)
  })

  it('se analizan TODOS los actions.ts, tambien los anidados (A-01)', () => {
    // La version anterior leia solo `features/<modulo>/actions.ts` y se dejaba
    // fuera los tres modulos anidados de boletas. Comparar contra el listado
    // recursivo impide que el descuido vuelva.
    const modulos = [...new Set(ACCIONES.map((accion) => accion.modulo))].sort()
    const archivos = buscarArchivos('actions.ts').map(moduloDe).sort()

    expect(modulos).toEqual(archivos)
    expect(modulos).toContain('tickets/assign')
    expect(modulos).toContain('tickets/bulk')
    expect(modulos).toContain('tickets/seller')
  })

  it('ninguna accion de negocio se salta `authorizeAction`', () => {
    const sinGuarda = ACCIONES.filter((accion) => {
      const clave = `${accion.modulo}/${accion.nombre}`
      if (clave in SIN_GUARDA_JUSTIFICADA) return false
      return !accion.cuerpo.includes('authorizeAction(')
    }).map((accion) => `${accion.modulo}/${accion.nombre}`)

    expect(sinGuarda, 'acciones sin autorizacion').toEqual([])
  })

  it('la autorizacion es lo PRIMERO, antes de tocar la base de datos', () => {
    // Validar o consultar antes de autorizar filtraria informacion por el
    // mensaje de error a alguien que no deberia haber llegado tan lejos.
    const tardias = ACCIONES.filter((accion) => {
      const clave = `${accion.modulo}/${accion.nombre}`
      if (clave in SIN_GUARDA_JUSTIFICADA) return false

      const posGuarda = accion.cuerpo.indexOf('authorizeAction(')
      if (posGuarda === -1) return false

      const posCliente = accion.cuerpo.search(/createClient\(\)|createAdminClient\(\)/)
      return posCliente !== -1 && posCliente < posGuarda
    }).map((accion) => `${accion.modulo}/${accion.nombre}`)

    expect(tardias, 'acciones que abren cliente antes de autorizar').toEqual([])
  })

  it('toda accion comprueba el resultado de la guarda antes de seguir', () => {
    // `authorizeAction` devuelve `{ error }` en vez de lanzar: sin el `if` que
    // lo comprueba, la accion continuaria como si estuviera autorizada.
    const sinComprobar = ACCIONES.filter((accion) => {
      if (!accion.cuerpo.includes('authorizeAction(')) return false
      return !/if \('error' in \w+\) return/.test(accion.cuerpo)
    }).map((accion) => `${accion.modulo}/${accion.nombre}`)

    expect(sinComprobar, 'acciones que ignoran el resultado de la guarda').toEqual([])
  })

  it('las excepciones documentadas son exactamente las del flujo de autenticacion', () => {
    // Impide que alguien "resuelva" un fallo de esta prueba agregando su accion
    // a la lista de excepciones sin pensarlo.
    const nombres = Object.keys(SIN_GUARDA_JUSTIFICADA)
    expect(nombres.every((nombre) => nombre.startsWith('auth/'))).toBe(true)
    expect(nombres.length).toBe(5)
  })

  it('ningun esquema acepta `organization_id` del cliente', () => {
    // docs/SECURITY.md §5: la organizacion se deriva de la sesion en el
    // servidor. Si un esquema Zod la aceptara, un vendedor podria intentar
    // escribir en otra organizacion.
    //
    // `sellerId` SI viaja desde el cliente y es correcto que lo haga: el
    // personal elige a que vendedor asigna una boleta. No es un control de
    // seguridad — lo valida la FK compuesta contra `memberships(profile_id,
    // organization_id)`, comprobado en Q-01 y Q-03 de la Fase 9 (A-05).
    const sospechosos = buscarArchivos('schemas.ts').filter((archivo) =>
      /\b(organizationId|organization_id)\s*:/.test(readFileSync(archivo, 'utf8')),
    )

    expect(sospechosos, 'esquemas que aceptan organizationId del cliente').toEqual([])
  })
})

describe('F7-25 los Route Handlers se protegen a mano', () => {
  it('todo route.ts fuera de /auth comprueba la sesion en su cuerpo', () => {
    // Un Route Handler NO pasa por el layout de su grupo de rutas (D-060).
    const encontrados: string[] = []

    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name)
        if (entrada.isDirectory()) recorrer(ruta)
        else if (entrada.name === 'route.ts') encontrados.push(ruta)
      }
    }
    recorrer(join(process.cwd(), 'src', 'app'))

    expect(encontrados.length).toBeGreaterThan(0)

    const sinGuarda = encontrados.filter((ruta) => {
      // `/auth/callback` es publico por definicion: intercambia el codigo de
      // Supabase por una sesion, asi que aun no hay sesion que comprobar.
      if (ruta.includes(join('app', 'auth'))) return false
      const fuente = readFileSync(ruta, 'utf8')
      // El tick de loterias no usa sesion: el programador autentica con un
      // secreto de servidor (D-148, BR-L21). La guarda es
      // `authorizeLotterySyncRequest`, no `getAuthUser`.
      if (fuente.includes('authorizeLotterySyncRequest')) return false
      return !fuente.includes('getAuthUser') && !fuente.includes('requireActiveMembership')
    })

    expect(sinGuarda, 'Route Handlers sin comprobacion de sesion').toEqual([])
  })
})
