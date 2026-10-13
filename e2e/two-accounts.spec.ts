import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'

type Account = { id: string; email: string; name: string }
type Accounts = { lender: Account; borrower: Account }

const clerkDir = path.join(process.cwd(), 'playwright/.clerk')

test('two accounts onboard, edit a shelf, finish a loan, and complete a partial handoff', async ({ browser }) => {
  const accounts = JSON.parse(fs.readFileSync(path.join(clerkDir, 'accounts.json'), 'utf8')) as Accounts
  const lender = await openAccount(browser, 'lender')
  const borrower = await openAccount(browser, 'borrower')

  try {
    await onboard(lender, {
      city: 'Charlotte',
      about: 'I lend tools from Willow Court.',
      item: 'Drill',
      quantity: 1,
    })
    await editShelfNotes(lender, 'Drill', 'Fresh bit')

    await onboard(borrower, {
      city: 'Charlotte',
      about: 'I borrow for school projects.',
      item: 'Garden hose',
      quantity: 1,
    })

    await requestDrill(borrower, accounts.lender.name)
    await expect(lender.getByRole('button', { name: 'Accept request' })).toBeVisible()
    await lender.getByRole('button', { name: 'Accept request' }).click()
    await borrower.getByRole('link', { name: 'Activity' }).first().click()
    await borrower.getByRole('button', { name: 'Mark picked up' }).click()
    await borrower.getByRole('button', { name: 'Mark returned' }).click()
    await borrower.getByRole('button', { name: /Completed/ }).click()
    await expect(borrower.getByText('Loan completed')).toBeVisible()

    await sendChat(borrower, 'I need 20 notebooks Saturday')
    await borrower.getByRole('button', { name: 'Confirm details' }).click()
    await sendChat(lender, 'I have 8 notebooks to give away Saturday')
    await lender.getByRole('button', { name: 'Confirm details' }).click()
    await expect(lender.getByRole('button', { name: 'Confirm handoff' })).toBeVisible()
    await expect(lender.locator('p').filter({ hasText: 'arranged' })).toContainText('8')
    await lender.getByRole('button', { name: 'Confirm handoff' }).click()

    await borrower.getByRole('link', { name: 'Activity' }).first().click()
    await borrower.getByRole('button', { name: 'Active' }).click()
    await borrower.getByRole('button', { name: 'Confirm handoff' }).click()
    await expect(borrower.getByText('8 of 20 notebooks')).toBeVisible()
    await borrower.getByRole('button', { name: 'Mark received' }).click()
    await borrower.getByRole('button', { name: /Completed/ }).click()
    await expect(borrower.getByText('Handoff completed')).toBeVisible()
  } finally {
    await lender.context().close()
    await borrower.context().close()
    await deleteAccounts(accounts)
  }
})

async function openAccount(browser: Browser, role: 'lender' | 'borrower') {
  const context = await browser.newContext({ storageState: path.join(clerkDir, `${role}.json`) })
  const page = await context.newPage()
  await page.goto('/')
  return page
}

async function onboard(
  page: Page,
  details: { city: string; about: string; item: string; quantity: number },
) {
  await expect(page.getByRole('heading', { name: 'Where should Relay look?' })).toBeVisible()
  await fillField(page, 'City', details.city)
  await fillField(page, 'About you', details.about)
  await fillField(page, 'Something you have', details.item)
  await fillField(page, 'Quantity', String(details.quantity))
  await page.getByRole('button', { name: 'Join your city' }).click()
  await expect(page.getByRole('heading', { name: 'Chat (the Robo Cat)' })).toBeVisible()
}

async function fillField(page: Page, name: string, value: string) {
  const field = page.getByRole(name === 'Quantity' ? 'spinbutton' : 'textbox', { name })
  await field.click()
  await field.fill(value)
  await expect(field).toHaveValue(value)
}

async function editShelfNotes(page: Page, item: string, notes: string) {
  await page.getByRole('link', { name: 'My Inventory' }).first().click()
  await page.getByRole('button', { name: `Edit ${item}` }).click()
  await page.getByLabel('Notes').fill(notes)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText(notes)).toBeVisible()
}

async function requestDrill(page: Page, lenderName: string) {
  await page.getByRole('button', { name: /I'm building a bookshelf this weekend/ }).click()
  await page.getByRole('button', { name: 'Check my inventory' }).click()
  await page.getByRole('button', { name: `Request the Drill from ${lenderName}` }).click()
  await page.getByRole('group', { name: 'Pickup time' }).getByRole('radio').first().check()
  await page.getByRole('group', { name: 'Expected return' }).getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Review request' }).click()
  await page.getByRole('button', { name: 'Send request' }).click()
}

async function sendChat(page: Page, message: string) {
  await page.getByRole('link', { name: 'Chat' }).first().click()
  await page.getByLabel('Message to Relay').fill(message)
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('button', { name: 'Confirm details' })).toBeVisible()
}

async function deleteAccounts(accounts: Accounts) {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) return
  await Promise.all(
    [accounts.lender.id, accounts.borrower.id].map((id) =>
      fetch(`https://api.clerk.com/v1/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${secret}` },
      }),
    ),
  )
}
