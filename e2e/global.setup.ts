import fs from 'node:fs'
import path from 'node:path'
import { clerk, clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

const clerkDir = path.join(process.cwd(), 'playwright/.clerk')

setup.describe.configure({ mode: 'serial' })

// Playwright requires an object pattern for the fixtures argument.
// eslint-disable-next-line no-empty-pattern
setup.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return
  await deleteCreatedAccounts()
})

setup('prepare two Clerk accounts', async () => {
  await clerkSetup()
  fs.mkdirSync(clerkDir, { recursive: true })
  const stamp = Date.now()
  const accounts = {
    lender: await createAccount('lender', stamp),
    borrower: await createAccount('borrower', stamp),
  }
  fs.writeFileSync(path.join(clerkDir, 'accounts.json'), JSON.stringify(accounts))
})

setup('sign in the lender', async ({ page }) => {
  await signIn(page, 'lender')
})

setup('sign in the borrower', async ({ page }) => {
  await signIn(page, 'borrower')
})

async function signIn(page: import('@playwright/test').Page, role: 'lender' | 'borrower') {
  const accounts = JSON.parse(fs.readFileSync(path.join(clerkDir, 'accounts.json'), 'utf8')) as {
    lender: { email: string }
    borrower: { email: string }
  }
  await page.goto('/')
  await clerk.signIn({ page, emailAddress: accounts[role].email })
  await page.getByRole('heading', { name: 'Where should Relay look?' }).waitFor()
  await page.context().storageState({ path: path.join(clerkDir, `${role}.json`) })
}

async function createAccount(role: string, stamp: number) {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) throw new Error('Set CLERK_SECRET_KEY in the environment or in .env.local')
  const email = `relay-${role}-${stamp}+clerk_test@example.com`
  const first = 'Relay'
  const last = role === 'lender' ? 'Lender' : 'Borrower'
  const response = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email_address: [email],
      first_name: first,
      last_name: last,
      password: `Relay-e2e-${stamp}-Aa1`,
      skip_password_checks: true,
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Clerk could not create the ${role} account (${response.status}): ${detail}`)
  }
  const body = (await response.json()) as { id: string }
  const account = { id: body.id, email, name: `${first} ${last}` }
  rememberAccount(role, account)
  return account
}

function rememberAccount(role: string, account: { id: string; email: string; name: string }) {
  fs.mkdirSync(clerkDir, { recursive: true })
  const file = path.join(clerkDir, 'accounts.json')
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown> : {}
  current[role] = account
  fs.writeFileSync(file, JSON.stringify(current))
}

async function deleteCreatedAccounts() {
  const secret = process.env.CLERK_SECRET_KEY
  const file = path.join(clerkDir, 'accounts.json')
  if (!secret || !fs.existsSync(file)) return
  const accounts = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { id?: string }>
  await Promise.all(
    Object.values(accounts).map((account) =>
      account.id
        ? fetch(`https://api.clerk.com/v1/users/${account.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${secret}` },
          })
        : Promise.resolve(),
    ),
  )
  fs.rmSync(file, { force: true })
}
