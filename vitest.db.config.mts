import path from 'node:path'

import { defineConfig } from 'vitest/config'

/**
 * Pruebas de base de datos: se ejecutan contra la instancia LOCAL de Supabase
 * (`npx supabase start` + `npm run db:reset` + `npm run seed:local`).
 *
 * Separadas de las unitarias (vitest.config.mts) porque necesitan Docker y una
 * base de datos con el seed cargado; `npm run test` debe poder correr sin nada
 * de eso.
 *
 * Sin paralelismo entre archivos: comparten una unica base de datos y varias
 * pruebas escriben en ella.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/db/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // El mismo sustituto que usa `vitest.config.mts`. Hace falta desde
      // D-152: `tests/db/lottery-horizon.test.ts` ejerce el orquestador real
      // (`features/lottery/sync.ts`) contra la base local, y ese modulo
      // importa `server-only`, que lanza fuera de un Server Component. No
      // debilita nada: la frontera la sigue imponiendo el build de Next.
      'server-only': path.resolve(import.meta.dirname, './tests/stubs/server-only.ts'),
    },
  },
})
