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
    },
  },
})
