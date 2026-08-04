import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // `server-only` lanza al importarse fuera de un Server Component, asi que
      // sin este sustituto Vitest no podria cargar ningun modulo que lo importe
      // —aunque lo unico que se pruebe sea logica pura, como `rate-limit.ts`—.
      // No debilita nada: la frontera real la impone el build de Next, que
      // sigue fallando si un Client Component importa uno de esos modulos.
      'server-only': path.resolve(import.meta.dirname, './tests/stubs/server-only.ts'),
    },
  },
})
