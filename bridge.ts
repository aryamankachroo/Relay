import { randomUUID } from 'node:crypto';
import { Spectrum } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { answerInventoryQuestion } from './agent.ts';
import { chat, getStore } from './chat.ts';
import { confused } from './format.ts';
import { acquireBridgeLock } from './store.ts';
import type { Space, Message } from 'spectrum-ts';
const projectId = process.env.PROJECT_ID?.trim();
const projectSecret = process.env.PROJECT_SECRET?.trim();
if (!projectId || !projectSecret) {
    throw new Error('Set PROJECT_ID and PROJECT_SECRET in .env, then run npm run bridge.');
}
const store = getStore();
const releaseLock = acquireBridgeLock(store.path!);
process.once('exit', releaseLock);
const app = await Spectrum({
    projectId,
    projectSecret,
    providers: [imessage.config()],
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        void app.stop().finally(() => { releaseLock(); process.exit(0); });
    });
}
const spaces = new Map<string, Space>();
// Verified API: imessage(app).space.get(id), space.send(text), message.sender.id.
// Unknown contacts stay queued until their first inbound text; demo handles are
// simulated in the console, not sent to real people or guessed phone numbers.
async function deliverOutbox(current?: {
    userId: string;
    message: Message;
}) {
    for (const notification of [...store.state.outbox]) {
        let space = spaces.get(notification.userId);
        if (!space && store.state.spaces[notification.userId]) {
            try {
                space = await imessage(app).space.get(store.state.spaces[notification.userId]);
                spaces.set(notification.userId, space);
            }
            catch { /* Keep the notification queued for the user's next inbound text. */ }
        }
        if (!space) {
            console.log('[relay.queued]', JSON.stringify({ userId: notification.userId, text: notification.text, demo: notification.userId.startsWith('demo:') }));
            continue;
        }
        try {
            if (current?.userId === notification.userId)
                await current.message.reply(notification.text);
            else
                await space.send(notification.text);
            console.log('[relay.outbound]', JSON.stringify({ userId: notification.userId, text: notification.text }));
            await store.transaction(() => {
                store.state.outbox = store.state.outbox.filter(n => n.id !== notification.id);
            });
        }
        catch {
            console.error('[relay.send_failed] Notification remains queued; it will retry on the next inbound text.');
        }
    }
}
console.log('Relay started: fictional demo community. Unknown-contact notifications are queued. Run one bridge process per project.');
await deliverOutbox();
for await (const [space, message] of app.messages) {
    try {
        if (message.direction !== 'inbound' || message.content.type !== 'text')
            continue;
        const text = message.content.text.trim();
        if (!text || !message.sender?.id)
            continue;
        // A space id identifies a conversation, not a person; use the sender handle.
        const userId = message.sender.id;
        console.log('[relay.inbound]', JSON.stringify({ messageId: message.id, userId, text }));
        spaces.set(userId, space);
        await store.transaction(() => { store.state.spaces[userId] = space.id; });
        const messageId = `${message.platform}:${message.id}`;
        if (store.state.delivered.includes(messageId)) {
            console.log('[relay.duplicate] Ignored already processed message.');
        }
        else {
            const inventoryAnswer = await answerInventoryQuestion(text);
            if (inventoryAnswer !== null) {
                await store.transaction(() => {
                    store.state.delivered.push(messageId);
                    store.state.outbox.push({ id: randomUUID(), userId, text: inventoryAnswer });
                });
            }
            else {
                const result = await chat(userId, text, { messageId });
                if (!result.reply)
                    console.log('[relay.duplicate] Ignored already processed message.');
            }
        }
        await deliverOutbox({ userId, message });
    }
    catch {
        console.error('[relay.message_failed] Could not process the message; the loop will continue.');
        try {
            await message.reply(confused);
            console.log('[relay.outbound]', confused);
        }
        catch {
            console.error('[relay.reply_failed] Could not send the clarification reply.');
        }
    }
}
