import { createTextMessage, type ChatMessage } from './message.ts'

const temporaryText = 'Got it. I will line up the next step for that right here.'

/** Stand-in until Relay can answer with text and interactive cards. */
export function temporaryReply(): ChatMessage {
  return createTextMessage('relay', temporaryText)
}
