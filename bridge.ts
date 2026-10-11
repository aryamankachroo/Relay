import { Spectrum } from 'spectrum-ts'
import { imessage } from 'spectrum-ts/providers/imessage'

const projectId = process.env.PROJECT_ID?.trim()
const projectSecret = process.env.PROJECT_SECRET?.trim()
if (!projectId || !projectSecret) {
  throw new Error('Set PROJECT_ID and PROJECT_SECRET in .env, then run npm run bridge.')
}

const app = await Spectrum({
  projectId,
  projectSecret,
  providers: [imessage.config()],
})

console.log('Relay Photon bridge started; waiting for messages.')
for await (const [, message] of app.messages) {
  const text = message.content?.type === 'text' ? message.content.text : ''
  if (!text.trim()) continue
  try {
    // TODO: Connect Relay's chat API.
    await message.reply('Relay is getting set up. Check back soon.')
    console.log('Processed an inbound text and sent the setup reply.')
  } catch {
    console.error('Could not process an inbound message. Check the Photon connection.')
  }
}
