/**
 * Cerrojo del tick de loterias — Etapa 5 (BR-L21, D-148).
 *
 * Las RPC son internas: una sesion no las ejecuta. El lock no se lee
 * con la clave publica (FORCE RLS, cero politicas).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSeedContext, signInAs, USERS, type Client } from './helpers'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>
let owner: Client

beforeAll(async () => {
  ctx = await loadSeedContext()
  owner = await signInAs(USERS.owner)
})

afterAll(async () => {
  await ctx.svc.rpc('release_lottery_sync_lock', { p_holder: 'db-cron-a' })
  await ctx.svc.rpc('release_lottery_sync_lock', { p_holder: 'db-cron-b' })
  await ctx.svc.rpc('release_lottery_sync_lock', { p_holder: 'db-cron-stale' })
})

describe('cerrojo del tick (D-148)', () => {
  it('el segundo acquire del mismo instante falla', async () => {
    const { data: first, error: firstError } = await ctx.svc.rpc(
      'try_acquire_lottery_sync_lock',
      { p_holder: 'db-cron-a' },
    )
    expect(firstError).toBeNull()
    expect(first).toBe(true)

    const { data: second, error: secondError } = await ctx.svc.rpc(
      'try_acquire_lottery_sync_lock',
      { p_holder: 'db-cron-b' },
    )
    expect(secondError).toBeNull()
    expect(second).toBe(false)

    const { data: released, error: releaseError } = await ctx.svc.rpc(
      'release_lottery_sync_lock',
      { p_holder: 'db-cron-a' },
    )
    expect(releaseError).toBeNull()
    expect(released).toBe(true)

    const { data: third, error: thirdError } = await ctx.svc.rpc(
      'try_acquire_lottery_sync_lock',
      { p_holder: 'db-cron-b' },
    )
    expect(thirdError).toBeNull()
    expect(third).toBe(true)

    await ctx.svc.rpc('release_lottery_sync_lock', { p_holder: 'db-cron-b' })
  })

  it('un holder no suelta el cerrojo de otro', async () => {
    const { data: taken } = await ctx.svc.rpc('try_acquire_lottery_sync_lock', {
      p_holder: 'db-cron-a',
    })
    expect(taken).toBe(true)

    const { data: stolen, error } = await ctx.svc.rpc('release_lottery_sync_lock', {
      p_holder: 'db-cron-b',
    })
    expect(error).toBeNull()
    expect(stolen).toBe(false)

    await ctx.svc.rpc('release_lottery_sync_lock', { p_holder: 'db-cron-a' })
  })

  it('un cerrojo viejo se puede tomar (tick caido)', async () => {
    const { data: taken } = await ctx.svc.rpc('try_acquire_lottery_sync_lock', {
      p_holder: 'db-cron-stale',
    })
    expect(taken).toBe(true)

    const { error: ageError } = await ctx.svc
      .from('lottery_sync_lock')
      .update({ acquired_at: '1999-01-01T00:00:00Z' })
      .eq('id', 1)
    expect(ageError).toBeNull()

    const { data: stolen, error } = await ctx.svc.rpc('try_acquire_lottery_sync_lock', {
      p_holder: 'db-cron-a',
      p_stale_minutes: 1,
    })
    expect(error).toBeNull()
    expect(stolen).toBe(true)

    await ctx.svc.rpc('release_lottery_sync_lock', { p_holder: 'db-cron-a' })
  })
})

describe('aislamiento del cerrojo', () => {
  it('una sesion no ejecuta las RPC internas', async () => {
    const { error } = await owner.rpc('try_acquire_lottery_sync_lock', {
      p_holder: 'owner-should-fail',
    })
    expect(error).not.toBeNull()
  })

  it('una sesion lee cero filas de lottery_sync_lock', async () => {
    const { data, error } = await owner.from('lottery_sync_lock').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
