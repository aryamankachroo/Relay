import { createChat } from '../chat.ts';
import { seed } from '../seed.ts';
import { RelayStore } from '../store.ts';
const now = Date.now();
function scenario(name: string, omitNotebooks = false) {
    console.log(`\nDemo: ${name} (fictional residents, no real messages sent)`);
    const state = seed(now);
    if (omitNotebooks)
        state.items = state.items.filter(item => item.catalogId !== 'notebooks');
    const store = new RelayStore({ path: null, initial: state });
    const engine = createChat(store, { now: () => now });
    const [sam, mia, dev] = state.residents.map(r => r.id);
    const say = async (id: string, text: string) => {
        console.log(`${state.residents.find(r => r.id === id)?.name}: ${text}`);
        const result = await engine(id, text);
        console.log(`Relay: ${result.reply}`);
        for (const notification of result.notify ?? [])
            console.log(`Notify ${state.residents.find(r => r.id === notification.userId)?.name}: ${notification.text}`);
    };
    return { say, sam, mia, dev };
}
const ladder = scenario('ladder loan');
await ladder.say(ladder.sam, 'I need a ladder Saturday');
await ladder.say(ladder.mia, 'yes');
await ladder.say(ladder.sam, 'picked up');
await ladder.say(ladder.sam, 'returned');
// Remove seeded notebook gifts in this isolated scenario to demonstrate an open
// need waiting for a new offer, rather than already matching the two demo donors.
const gift = scenario('new notebook offer meets an open need', true);
await gift.say(gift.sam, 'I need 20 notebooks');
await gift.say(gift.mia, 'I have 20 notebooks to give away');
await gift.say(gift.mia, 'yes');
await gift.say(gift.sam, 'yes');
await gift.say(gift.sam, 'received');
const group = scenario('shared drill demand; only the distant demo resident owns a drill');
for (const [i, id] of [group.sam, group.mia, group.dev].entries()) {
    const day = new Date(now + (i + 1) * 86400000).toISOString().slice(0, 10);
    await group.say(id, `I need a drill ${day} morning`);
}
for (const id of [group.sam, group.mia, group.dev])
    await group.say(id, 'yes');
