import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING ??= "true"

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 30000
  }
})
