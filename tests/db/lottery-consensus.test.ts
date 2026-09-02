/**
 * Consenso entre fuentes alternativas, contra PostgreSQL de verdad
 * (BR-L26, D-162).
 *
 * QUE PRUEBA
 *
 * La regla entera vive en `record_lottery_observations`, porque contar
 * DOMINIOS distintos y confirmar tiene que pasar dentro de una transaccion.
 * Aqui se ejerce esa funcion tal cual, con la RLS, los disparadores y el
 * matching reales: no hay dobles.
 *
 * EL CASO REAL DE REGRESION
 *
 * Cruz Roja del 2026-09-01, sorteo 3169, numero `7132`. Ese dia la portada
 * oficial seguia mostrando el sorteo anterior y tres agregadores ya lo
 * publicaban. Se usa **solo como dato de prueba**: no esta en ninguna
 * migracion, constante ni seed.
 *
 * CONVENCION DE DATOS
 *
 * `lottery_draw_schedules` es nacional y las pruebas de loterias comparten la
 * tabla. Esta usa el año **2093**, que no toca 2095 (lottery-horizon), 2097
 * (lottery-sync) ni 2099 (lottery-results). Al terminar borra lo suyo en
 * orden: observaciones, bitacora, coincidencias, resultados y programacion.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { anonClient, loadSeedContext } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let anon: ReturnType<typeof anonClient>

const FECHA = '2093-09-01'
/**
 * Los numeros de sorteo reales son digitos, y la restriccion de
 * `observed_draw_number` lo exige. El prefijo tambien lo es, para que la
 * limpieza pueda encontrarlos sin tocar los de otras suites.
 */
const PREFIJO = '93090'
let contador = 0

type Observacion = {
  source_id: string
  source_class: 'official' | 'alternative'
  source_url: string
  observed_date: string
  winning_number: string
  series?: string | null
  observed_draw_number?: string | null
}

function obs(
  source_id: string,
  winning_number: string,
  observed_date = FECHA,
  extra: Partial<Observacion> = {},
): Observacion {
  return {
    source_id,
    source_class: source_id === 'official' ? 'official' : 'alternative',
    source_url: `https://${source_id}.example.test/`,
    observed_date,
    winning_number,
    ...extra,
  }
}

async function nuevoSorteo(): Promise<{ id: string; drawNumber: string }> {
  contador += 1
  const drawNumber = `${PREFIJO}${contador}`
  const { data, error } = await ctx.svc
    .from('lottery_draw_schedules')
    .insert({
      lottery_code: 'cruz_roja',
      draw_number: drawNumber,
      reference_date: FECHA,
      official_scheduled_at: `${FECHA}T22:55:00-05:00`,
      original_scheduled_at: `${FECHA}T22:55:00-05:00`,
      schedule_status: 'scheduled',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id, drawNumber }
}

async function registrar(scheduleId: string, observaciones: Observacion[]) {
  const { data, error } = await ctx.svc.rpc('record_lottery_observations', {
    p_schedule_id: scheduleId,
    p_observations: observaciones as never,
  })
  if (error) throw new Error(error.message)
  return data as Record<string, unknown>
}

async function resultadoDe(scheduleId: string) {
  const { data } = await ctx.svc
    .from('lottery_results')
    .select('winning_number, conflicting_winning_number, validation_status, source_kind')
    .eq('schedule_id', scheduleId)
    .maybeSingle()
  return data
}

async function observacionesDe(scheduleId: string) {
  const { data } = await ctx.svc
    .from('lottery_source_observations')
    .select('source_id, winning_number')
    .eq('schedule_id', scheduleId)
    .order('source_id')
  return data ?? []
}

beforeAll(async () => {
  ctx = await loadSeedContext()
  anon = anonClient()
})

afterEach(async () => {
  const { data } = await ctx.svc
    .from('lottery_draw_schedules')
    .select('id')
    .like('draw_number', `${PREFIJO}%`)
  const ids = (data ?? []).map((row) => row.id)
  if (ids.length === 0) return
  await ctx.svc.from('lottery_source_observations').delete().in('schedule_id', ids)
  await ctx.svc.from('lottery_sync_runs').delete().in('schedule_id', ids)
  const { data: resultados } = await ctx.svc
    .from('lottery_results')
    .select('id')
    .in('schedule_id', ids)
  const resultIds = (resultados ?? []).map((row) => row.id)
  if (resultIds.length > 0) {
    await ctx.svc.from('lottery_ticket_matches').delete().in('result_id', resultIds)
    await ctx.svc.from('lottery_results').delete().in('schedule_id', ids)
  }
  await ctx.svc.from('lottery_draw_schedules').delete().in('id', ids)
})

afterAll(async () => {
  contador = 0
})

describe('una sola fuente nunca confirma (BR-L26)', () => {
  it('un numero con una fuente queda pendiente y no crea resultado', async () => {
    const { id } = await nuevoSorteo()
    const salida = await registrar(id, [obs('perlatodo', '7132')])
    expect(salida.consensus).toBe(false)
    expect(salida.reason).toBe('una_sola_fuente')
    expect(await resultadoDe(id)).toBeNull()
  })

  it('dos rutas del MISMO dominio siguen siendo una sola fuente', async () => {
    const { id } = await nuevoSorteo()
    // La pagina exterior de Paga Todo y su iframe comparten `source_id`.
    const salida = await registrar(id, [obs('pagatodo', '7132'), obs('pagatodo', '7132')])
    expect(salida.consensus).toBe(false)
    expect(salida.sources).toEqual(['pagatodo'])
    expect(await resultadoDe(id)).toBeNull()
    // Y solo queda UNA observacion: la segunda actualizo la primera.
    expect(await observacionesDe(id)).toHaveLength(1)
  })
})

describe('dos dominios distintos confirman', () => {
  it('confirma y deja constancia de que no vino de la fuente oficial', async () => {
    const { id } = await nuevoSorteo()
    const salida = await registrar(id, [obs('perlatodo', '7132'), obs('ganarchance', '7132')])
    expect(salida.consensus).toBe(true)
    expect(salida.number).toBe('7132')
    expect(salida.sources).toEqual(['ganarchance', 'perlatodo'])
    expect(await resultadoDe(id)).toMatchObject({
      winning_number: '7132',
      validation_status: 'confirmed',
      source_kind: 'alternative_consensus',
    })
  })

  it('conserva los ceros iniciales', async () => {
    const { id } = await nuevoSorteo()
    await registrar(id, [obs('perlatodo', '0046'), obs('ganarchance', '0046')])
    expect((await resultadoDe(id))?.winning_number).toBe('0046')
  })

  it('un segundo tick identico no duplica nada', async () => {
    const { id } = await nuevoSorteo()
    const observaciones = [obs('perlatodo', '7132'), obs('ganarchance', '7132')]
    await registrar(id, observaciones)
    const segunda = await registrar(id, observaciones)
    expect(segunda.already_confirmed).toBe(true)
    expect(await observacionesDe(id)).toHaveLength(2)
  })
})

describe('desacuerdo entre fuentes', () => {
  it('dos fuentes con numeros distintos no confirman', async () => {
    const { id } = await nuevoSorteo()
    const salida = await registrar(id, [obs('perlatodo', '7132'), obs('ganarchance', '7133')])
    expect(salida.consensus).toBe(false)
    expect(await resultadoDe(id)).toBeNull()
  })

  it('dos coincidentes y una discrepante confirman, y la discrepancia se conserva', async () => {
    const { id } = await nuevoSorteo()
    const salida = await registrar(id, [
      obs('perlatodo', '7132'),
      obs('ganarchance', '7132'),
      obs('loteriasdehoy', '7133'),
    ])
    expect(salida.consensus).toBe(true)
    expect(salida.number).toBe('7132')
    // La discrepancia NO se borra: queda para auditar.
    expect(await observacionesDe(id)).toEqual([
      { source_id: 'ganarchance', winning_number: '7132' },
      { source_id: 'loteriasdehoy', winning_number: '7133' },
      { source_id: 'perlatodo', winning_number: '7132' },
    ])
  })

  it('dos numeros con dos fuentes cada uno es conflicto, y no confirma nada', async () => {
    const { id } = await nuevoSorteo()
    const salida = await registrar(id, [
      obs('perlatodo', '7132'),
      obs('ganarchance', '7132'),
      obs('loteriasdehoy', '7133'),
      obs('pagatodo', '7133'),
    ])
    expect(salida.consensus).toBe(false)
    expect(salida.reason).toBe('conflicto_entre_fuentes')
    expect(await resultadoDe(id)).toBeNull()
  })
})

describe('fecha y sorteo mandan sobre el numero', () => {
  it('una observacion con otra fecha no se guarda siquiera', async () => {
    const { id } = await nuevoSorteo()
    const salida = await registrar(id, [
      obs('perlatodo', '7132', '2093-08-25'),
      obs('ganarchance', '7132', '2093-08-25'),
    ])
    expect(salida.stored).toBe(0)
    expect(salida.consensus).toBe(false)
    expect(await observacionesDe(id)).toEqual([])
  })

  it('el dia siguiente SI vale: la publicacion puede cruzar la medianoche', async () => {
    const { id } = await nuevoSorteo()
    const salida = await registrar(id, [
      obs('perlatodo', '7132', '2093-09-02'),
      obs('ganarchance', '7132', '2093-09-02'),
    ])
    expect(salida.consensus).toBe(true)
  })

  it('una fuente que publica OTRO numero de sorteo se descarta', async () => {
    const { id, drawNumber } = await nuevoSorteo()
    const salida = await registrar(id, [
      obs('perlatodo', '7132', FECHA, { observed_draw_number: drawNumber }),
      obs('ganarchance', '7132', FECHA, { observed_draw_number: '99999' }),
    ])
    // Solo entra la que trae el sorteo correcto: una fuente, sin consenso.
    expect(salida.stored).toBe(1)
    expect(salida.consensus).toBe(false)
  })
})

describe('reconciliacion con la fuente oficial (D-162)', () => {
  it('si la oficial coincide, no duplica ni cambia nada', async () => {
    const { id, drawNumber } = await nuevoSorteo()
    await registrar(id, [obs('perlatodo', '7132'), obs('ganarchance', '7132')])
    const { error } = await ctx.svc.rpc('confirm_lottery_result', {
      p_lottery_code: 'cruz_roja',
      p_draw_number: drawNumber,
      p_winning_number: '7132',
      p_source_url: 'https://lotecruz.org.co/',
      p_source_kind: 'official_page',
      p_official_date: FECHA,
    })
    expect(error).toBeNull()
    expect(await resultadoDe(id)).toMatchObject({
      winning_number: '7132',
      validation_status: 'confirmed',
      conflicting_winning_number: null,
    })
  })

  it('si la oficial difiere, conserva el numero y marca conflicto', async () => {
    const { id, drawNumber } = await nuevoSorteo()
    await registrar(id, [obs('perlatodo', '7132'), obs('ganarchance', '7132')])
    await ctx.svc.rpc('confirm_lottery_result', {
      p_lottery_code: 'cruz_roja',
      p_draw_number: drawNumber,
      p_winning_number: '9999',
      p_source_url: 'https://lotecruz.org.co/',
      p_source_kind: 'official_page',
      p_official_date: FECHA,
    })
    // El numero confirmado NO se sobrescribe en silencio (BR-L08).
    expect(await resultadoDe(id)).toMatchObject({
      winning_number: '7132',
      conflicting_winning_number: '9999',
      validation_status: 'conflict',
    })
  })
})

describe('permisos de la tabla de observaciones', () => {
  it('ni anon ni authenticated pueden leerla ni escribirla', async () => {
    const lectura = await anon.from('lottery_source_observations').select('id').limit(1)
    expect(lectura.error).not.toBeNull()

    const escritura = await anon.from('lottery_source_observations').insert({
      schedule_id: '11111111-1111-4111-8111-111111111111',
      source_id: 'perlatodo',
      source_class: 'alternative',
      source_url: 'https://perlatodo.com/',
      observed_date: FECHA,
      winning_number: '7132',
    })
    expect(escritura.error).not.toBeNull()
  })

  it('anon no puede llamar a la RPC de observaciones', async () => {
    const { error } = await anon.rpc('record_lottery_observations', {
      p_schedule_id: '11111111-1111-4111-8111-111111111111',
      p_observations: [] as never,
    })
    expect(error).not.toBeNull()
  })
})
