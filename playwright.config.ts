import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const root = import.meta.dirname
const localEnv = readEnv(path.join(root, '.env.local'))
const publishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.VITE_CLERK_PUBLISHABLE_KEY ||
  localEnv.VITE_CLERK_PUBLISHABLE_KEY ||
  ''
const secretKey = process.env.CLERK_SECRET_KEY || localEnv.CLERK_SECRET_KEY || ''

process.env.CLERK_PUBLISHABLE_KEY ||= publishableKey
process.env.CLERK_SECRET_KEY ||= secretKey

const python = fs.existsSync(path.join(root, 'backend/.venv/bin/python')) ? '.venv/bin/python' : 'python'
const apiPort = 8011
const webPort = 5174
const issuer = clerkIssuer(publishableKey)

const blankRemote = {
  SNOWFLAKE_ACCOUNT: '',
  SNOWFLAKE_USER: '',
  SNOWFLAKE_PASSWORD: '',
  SNOWFLAKE_WAREHOUSE: '',
  SNOWFLAKE_DATABASE: '',
  SNOWFLAKE_SCHEMA: '',
  SNOWFLAKE_ROLE: '',
  GEMINI_API_KEY: '',
  BACKBOARD_API_KEY: '',
  RELAY_AUTH_DISABLED: '',
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'browser',
      testMatch: /two-accounts\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `rm -f e2e.db && ${python} -m uvicorn app.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: path.join(root, 'backend'),
      url: `http://127.0.0.1:${apiPort}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        ...blankRemote,
        DATABASE_URL: 'sqlite:///./e2e.db',
        CLERK_SECRET_KEY: secretKey,
        CLERK_ISSUER: issuer,
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${webPort}`,
      cwd: root,
      url: `http://127.0.0.1:${webPort}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_CLERK_PUBLISHABLE_KEY: publishableKey,
        VITE_API_URL: `http://127.0.0.1:${apiPort}`,
      },
    },
  ],
})

function readEnv(file: string) {
  const values: Record<string, string> = {}
  if (!fs.existsSync(file)) return values
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...rest] = trimmed.split('=')
    values[key] = rest.join('=').trim()
  }
  return values
}

function clerkIssuer(publishableKey: string) {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, '')
  const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '')
  if (!host || host.includes('\u0000')) return ''
  return `https://${host}`
}
