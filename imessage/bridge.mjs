import { Spectrum } from 'spectrum-ts'
import { localIMessage } from '@spectrum-ts/imessage-local'
import { formatReply } from './format.mjs'

const apiUrl = (process.env.RELAY_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const siteUrl = process.env.RELAY_SITE_URL ?? 'http://127.0.0.1:5173'
/** Every texter acts as the demo resident, the same as the website. */
const residentId = 'avery'

async function relay(path, init) {
  const response = await fetch(`${apiUrl}${path}`, init)
  if (!response.ok) throw new Error(`Relay API ${response.status} on ${path}`)
  return response.json()
}

async function residentNames() {
  try {
    const residents = await relay('/api/residents')
    return new Map(residents.map((row) => [row.id, row.name]))
  } catch {
    return new Map()
  }
}

async function answer(text) {
  const card = await relay('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resident_id: residentId, message: text }),
  })
  return formatReply(card, { names: await residentNames(), siteUrl })
}

let app
try {
  app = await Spectrum({ providers: [localIMessage.config()] })
} catch (error) {
  if (error?.code === 'DATABASE') {
    console.error(
      'Cannot read your Messages database. Turn on Full Disk Access for this app ' +
        '(System Settings > Privacy & Security > Full Disk Access), quit and reopen it, then run npm start again.',
    )
    process.exit(1)
  }
  throw error
}
console.log(`Relay iMessage bridge is listening. Forwarding texts to ${apiUrl}.`)

for await (const [space, message] of app.messages) {
  if (message.direction !== 'inbound' || message.content.type !== 'text') continue
  const text = message.content.text.trim()
  if (!text) continue

  const from = message.sender?.id ?? 'someone'
  console.log(`<- ${from}: ${text}`)
  let reply
  try {
    reply = await answer(text)
  } catch (error) {
    console.error(`Relay API failed: ${error.message}`)
    reply = 'Relay is not answering right now. Try again in a minute.'
  }
  try {
    await space.send(reply)
    console.log(`-> ${from}: ${reply.split('\n')[0]}`)
  } catch (error) {
    console.error(`Could not send the reply: ${error.message}`)
  }
}
