import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/infra/db/schema.ts',
  out: './db/migrations'
})
