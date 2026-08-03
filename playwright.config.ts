import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas end-to-end del portal administrativo (Fase 3).
 *
 * Se ejecutan SIEMPRE contra la instancia LOCAL de Supabase (`npm run dev:local`,
 * D-047): crean rifas, vendedores y boletas de verdad, y eso jamas debe ocurrir
 * en el proyecto real.
 *
 * Requisitos previos:
 *   npx supabase start
 *   npm run db:reset && npm run seed:local
 */
const PORT = 3000
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  // Comparten una unica base de datos: en paralelo se pisarian los datos.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Las pruebas responsive solo tienen sentido en el viewport movil: se
    // excluyen del proyecto de escritorio para no ejecutarlas dos veces con
    // expectativas contrarias.
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /responsive\.spec\.ts/,
    },
    { name: 'movil', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],

  webServer: {
    command: 'npm run dev:local',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
