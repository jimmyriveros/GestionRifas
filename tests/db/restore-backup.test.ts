/**
 * SI EL VACIADO SE NIEGA, NO SE IMPORTA NINGUNA FILA — D-240, `RUNBOOK` §5.2.
 *
 * El defecto del ensayo de P3: los pasos de la restauración eran órdenes sueltas, el
 * vaciado se negó porque la pausa no estaba cerrada, y las órdenes siguientes se
 * ejecutaron igual: `data.sql` insertó filas sobre una base sin vaciar.
 *
 * Aquí se ejecuta `scripts/restore-backup.ts` DE VERDAD, como proceso aparte, contra la
 * base local y con un respaldo de mentira cuyo esquema crea una tabla centinela y cuyos
 * datos le insertan una fila. La base de la suite no tiene la pausa cerrada, así que el
 * vaciado se niega; lo que se comprueba es que ahí termina todo: el proceso sale con un
 * código distinto de cero, dice qué pasos NO ejecutó, y ni la tabla ni la fila existen.
 *
 * ⚠️ Con la pausa CERRADA esta orden vaciaría `public`. Por eso la prueba mira antes el
 * estado y falla SIN ejecutar nada si la encuentra cerrada: nunca restaura de verdad.
 * La restauración completa, y un fallo a mitad de la carga, se ensayan aparte sobre una
 * copia (`TEST_RESULTS`, D-240): romperían la base que comparte el resto de la suite.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, localScriptEnv } from './helpers'

const RAIZ = path.resolve(import.meta.dirname, '../..')
const TSX = path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const CENTINELA = 'centinela_restauracion'

let db: Client
let dir = ''

function restaurar(carpeta: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [TSX, 'scripts/restore-backup.ts', carpeta, ...args], {
    cwd: RAIZ,
    env: localScriptEnv(),
    encoding: 'utf8',
    timeout: 120_000,
  })
  return { code: r.status, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** Lo que una restauración cambiaría: las tablas de public, sus filas y la tabla centinela. */
async function estado() {
  const { rows } = await db.query<{
    tablas: number
    boletas: number
    perfiles: number
    centinela: boolean
  }>(
    `select (select count(*)::int from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind = 'r') as tablas,
            (select count(*)::int from tickets) as boletas,
            (select count(*)::int from profiles) as perfiles,
            to_regclass('public.${CENTINELA}') is not null as centinela`,
  )
  return rows[0]!
}

async function pausaCerrada(): Promise<boolean> {
  const { rows } = await db.query<{ cerrada: boolean }>(
    `select to_regclass('pausa.estado') is not null as cerrada`,
  )
  if (!rows[0]!.cerrada) return false
  return (await db.query(`select 1 from pausa.estado where id = 1 and cerrada`)).rowCount === 1
}

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL })
  await db.connect()
  dir = mkdtempSync(path.join(tmpdir(), 'rifas-restauracion-'))
})

afterAll(async () => {
  await db.query(`drop table if exists public.${CENTINELA}`)
  await db.end()
  rmSync(dir, { recursive: true, force: true })
})

function escribirRespaldo(
  nombre: string,
  archivos: Partial<Record<'roles' | 'schema' | 'data', string>>,
): string {
  const carpeta = mkdtempSync(path.join(dir, `${nombre}-`))
  const contenido = {
    roles: `ALTER ROLE "anon" SET "statement_timeout" TO '3s';\n`,
    schema: `CREATE TABLE "public"."${CENTINELA}" ("id" integer);\n`,
    data: `INSERT INTO "public"."${CENTINELA}" ("id") VALUES (1);\n`,
    ...archivos,
  }
  for (const [name, text] of Object.entries(contenido))
    writeFileSync(path.join(carpeta, `${name}.sql`), text)
  return carpeta
}

describe('RB — la restauración se detiene en el primer paso que falla', () => {
  it('RB-01: sin la pausa cerrada el vaciado se niega, y no se ejecuta ningún paso más ni se importa una fila', async () => {
    // Nunca se ejecuta contra una base que SÍ dejaría vaciar.
    expect(await pausaCerrada(), 'la pausa local está CERRADA: esta prueba no se ejecuta así').toBe(
      false,
    )
    const antes = await estado()
    expect(antes.centinela).toBe(false)
    expect(antes.tablas).toBeGreaterThan(20)

    const r = restaurar(escribirRespaldo('completo', {}), '--local')

    expect(r.code, r.salida).toBe(2)
    expect(r.salida).toContain('FALLÓ vaciar public')
    expect(r.salida).toContain(
      'La pausa de publicación no está cerrada: no se vacía public. No se cambió nada.',
    )
    expect(r.salida).toContain('DETENIDA en «vaciar public».')
    expect(r.salida).toContain(
      'NO se ejecutaron: roles.sql, schema.sql, data.sql, después de restaurar.',
    )
    expect(r.salida).toContain('No se cambió nada')
    // Ningún paso posterior llegó a anunciarse.
    expect(r.salida).not.toMatch(/(OK|FALLÓ)\s+(roles|schema|data)\.sql/)
    expect(r.salida).not.toContain('RESTAURADO')

    // Y en la base: ni la tabla del esquema ni la fila de los datos; todo lo demás, igual.
    expect(await estado()).toEqual(antes)
  })

  it('RB-02: un respaldo que no se puede cargar se rechaza ANTES de conectar', async () => {
    const antes = await estado()
    const conAuth = escribirRespaldo('con-auth', {
      data: `INSERT INTO "auth"."users" ("id") VALUES ('x');\nINSERT INTO "public"."${CENTINELA}" ("id") VALUES (1);\n`,
    })
    const r = restaurar(conAuth, '--local')
    expect(r.code, r.salida).toBe(2)
    expect(r.salida).toContain('No se conectó ni se cambió nada.')
    expect(r.salida).toContain('nombra el esquema «auth»')
    expect(r.salida).not.toContain('vaciar public')
    expect(await estado()).toEqual(antes)
  })

  it('RB-03: una carpeta sin sus tres archivos, o una orden mal escrita, no ejecuta nada', async () => {
    const antes = await estado()
    const vacia = mkdtempSync(path.join(dir, 'vacia-'))
    const sinArchivos = restaurar(vacia, '--local')
    expect(sinArchivos.code, sinArchivos.salida).toBe(1)
    expect(sinArchivos.salida).toContain('En la carpeta del respaldo falta roles.sql.')

    const malEscrita = restaurar(escribirRespaldo('orden', {}), '--local', '--seguir')
    expect(malEscrita.code, malEscrita.salida).toBe(1)
    expect(malEscrita.salida).toContain('No reconozco «--seguir»')

    // Producción, desde el entorno de las pruebas: la cadena es local y no nombra ese proyecto.
    const produccion = restaurar(
      escribirRespaldo('prod', {}),
      '--production',
      '--project-ref',
      'proyectoficticioabcd',
    )
    expect(produccion.code, produccion.salida).toBe(1)
    expect(produccion.salida).toContain(
      'SUPABASE_DB_URL no nombra ningún proyecto remoto de Supabase.',
    )
    expect(await estado()).toEqual(antes)
  })
})
