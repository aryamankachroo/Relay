import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from '../parse.ts';
import { match } from '../matcher.ts';
import { first_free_slot, schedule_shared } from '../scheduler.ts';
import { createChat } from '../chat.ts';
import { answerInventoryQuestion, isInventoryQuestion } from '../agent.ts';
import { RelayStore, emptyState } from '../store.ts';
import type { Item, Resident, Request, TimeWindow } from '../types.ts';
const now = Date.parse('2026-10-11T12:00:00Z');
const win: TimeWindow = { start: now + 86400000, end: now + 86400000 + 6 * 3600000 };
const resident = (id: string): Resident => ({ id, name: id, zone: 0, owned: [] });
const item = (id: string, owner: string, catalogId: string, quantity: number): Item => ({ id, owner, catalogId, quantity, windows: [win], willingToLend: true, kind: catalogId === 'notebooks' ? 'gift' : 'loan', notes: '' });
const need = (id: string, userId: string, catalogId = 'drill', quantity = 1): Request => ({ id, userId, type: 'need', catalogId, quantity, zone: 0, window: win, status: 'open', kind: catalogId === 'notebooks' ? 'gift' : 'loan', declinedOwners: [], createdAt: now });
function fixture() {
    const state = emptyState();
    state.residents = [resident('Sam'), resident('Mia'), resident('Dev')];
    state.items = [item('ladder-mia', 'Mia', 'ladder', 1)];
    state.items[0].windows = [{ start: now, end: now + 30 * 86400000 }];
    return new RelayStore({ path: null, initial: state });
}
test('parser recognizes demo phrases and rejects unknown items', async () => {
    const ladder = await parse('I need a ladder Saturday', { now });
    assert.equal(ladder.intent, 'need');
    assert.equal(ladder.item, 'ladder');
    assert.ok(ladder.window && ladder.window.start > now);
    const notebooks = await parse('I have 20 notebooks to give away', { now });
    assert.equal(notebooks.intent, 'offer');
    assert.equal(notebooks.quantity, 20);
    assert.equal(notebooks.mode, 'gift');
    assert.equal((await parse('yes', { now })).intent, 'confirm');
    assert.equal((await parse('no', { now })).action, 'no');
    assert.equal((await parse('I need a spaceship Friday', { now })).intent, 'clarify');
    assert.equal((await parse('I need 0 notebooks', { now })).intent, 'clarify');
    assert.equal((await parse('I need 501 notebooks', { now })).intent, 'clarify');
    assert.equal((await parse('I need a drill 2020-01-01', { now })).intent, 'clarify');
});
test('three drill requests fit a shared calendar', () => {
    const requests = [0, 1, 2].map(i => ({ id: String(i), window: { start: win.start + i * 7200000, end: win.start + (i + 1) * 7200000 } }));
    const result = schedule_shared(requests, 3600000, 900000);
    assert.equal(result.slots.length, 3);
    assert.equal(result.unplaced, undefined);
});
test('partial notebook matches greedily cover 20 from two donors', () => {
    const result = match(need('n', 'Sam', 'notebooks', 20), [item('a', 'Mia', 'notebooks', 12), item('b', 'Dev', 'notebooks', 8)], [resident('Sam'), resident('Mia'), resident('Dev')]);
    assert.equal(result.covered, 20);
    assert.equal(result.allocations.length, 2);
    assert.deepEqual(result.allocations.map(a => a.quantity), [12, 8]);
});
test('overlapping bookings offer the next free slot including buffer', () => {
    const a = first_free_slot([], win.start, win.end, 3600000, 900000)!;
    const b = first_free_slot([a], win.start, win.end, 3600000, 900000)!;
    assert.equal(b.start, a.end + 900000);
});
test('need, lender yes, pickup and return is a full legal loan flow', async () => {
    const store = fixture();
    const chat = createChat(store, { now: () => now });
    const result = await chat('Sam', 'I need a ladder Saturday');
    assert.equal(result.type, 'match');
    assert.ok(result.notify?.some(n => n.userId === 'Mia' && n.text.includes('YES')));
    const yes = await chat('Mia', 'yes');
    assert.ok(yes.reply.includes('Confirmed'));
    assert.equal(store.state.exchanges[0].status, 'Confirmed');
    assert.ok(yes.notify?.some(n => n.userId === 'Sam'));
    assert.equal((await chat('Sam', 'returned')).type, 'message');
    await chat('Sam', 'picked up');
    assert.equal(store.state.exchanges[0].status, 'Picked up');
    await chat('Sam', 'returned');
    assert.equal(store.state.exchanges[0].status, 'Returned');
});
test('open need is matched proactively when a gift appears, both consent, quantity reduces on receipt', async () => {
    const store = fixture();
    const chat = createChat(store, { now: () => now });
    assert.ok((await chat('Sam', 'I need 20 notebooks')).reply.includes('open'));
    const offer = await chat('Mia', 'I have 20 notebooks to give away');
    assert.ok(offer.notify?.some(n => n.userId === 'Sam' && n.text.includes('YES')));
    await chat('Mia', 'yes');
    await chat('Sam', 'yes');
    assert.equal(store.state.exchanges[0].status, 'Confirmed');
    await chat('Sam', 'received');
    assert.equal(store.state.exchanges[0].status, 'Received');
    assert.equal(store.state.items.find(i => i.catalogId === 'notebooks')?.quantity, 0);
});
test('missing drill demand creates one calendar and starts demo buy after all consent', async () => {
    const store = fixture();
    const chat = createChat(store, { now: () => now });
    await chat('Sam', 'I need a drill Monday morning');
    const two = await chat('Mia', 'I need a drill Tuesday morning');
    assert.equal(two.type, 'shared_demand');
    const three = await chat('Dev', 'I need a drill Wednesday morning');
    assert.ok(three.reply.includes('$20'));
    await chat('Sam', 'yes');
    await chat('Mia', 'yes');
    const last = await chat('Dev', 'yes');
    assert.ok(last.reply.includes('Group buy started (demo)'));
});
test('lender decline tries the next ranked lender', async () => {
    const store = fixture();
    store.state.items.push({ ...store.state.items[0], id: 'ladder-dev', owner: 'Dev' });
    const chat = createChat(store, { now: () => now });
    const first = await chat('Sam', 'I need a ladder Saturday');
    const firstGiver = first.notify![0].userId;
    const declined = await chat(firstGiver, 'no');
    assert.ok(declined.notify?.some(n => n.userId !== 'Sam' && n.userId !== firstGiver && n.text.includes('YES')));
    assert.equal(store.state.exchanges[0].status, 'Declined');
    assert.equal(store.state.exchanges[1].status, 'Requested');
});
test('gift reservations prevent double allocation and require receiver consent', async () => {
    const store = fixture();
    store.state.items = [];
    const chat = createChat(store, { now: () => now });
    await chat('Sam', 'I need 20 notebooks');
    await chat('Dev', 'I need 20 notebooks');
    await chat('Mia', 'I have 20 notebooks to give away');
    assert.equal(store.state.exchanges.reduce((n, e) => n + e.quantity, 0), 20);
    await chat('Mia', 'yes');
    assert.equal(store.state.exchanges[0].status, 'Requested');
    await chat('Sam', 'yes');
    assert.equal(store.state.exchanges[0].status, 'Confirmed');
});
test('busy lender does not hide the next available lender', async () => {
    const store = fixture();
    const saturday = (await parse('I need a ladder Saturday', { now })).window!;
    store.state.exchanges.push({ id: 'busy', item: 'ladder-mia', catalogId: 'ladder', quantity: 1, giver: 'Mia', receiver: 'Dev', requestId: 'old', window: saturday, status: 'Confirmed', kind: 'loan', giverConfirmed: true, receiverConfirmed: true });
    store.state.items.push({ ...store.state.items[0], id: 'ladder-dev', owner: 'Dev' });
    const result = await createChat(store, { now: () => now })('Sam', 'I need a ladder Saturday');
    assert.ok(result.notify?.some(n => n.userId === 'Dev'));
});
test('duplicate message IDs do not create a second request or notification', async () => {
    const store = fixture();
    const chat = createChat(store, { now: () => now });
    await chat('Sam', 'I need a ladder Saturday', { messageId: 'imessage:123' });
    const count = store.state.outbox.length;
    const result = await chat('Sam', 'I need a ladder Saturday', { messageId: 'imessage:123' });
    assert.equal(result.reply, '');
    assert.equal(store.state.requests.length, 1);
    assert.equal(store.state.outbox.length, count);
});
test('project skips owned tools, keeps sander request open, and uses catalog tools', async () => {
    const store = fixture();
    store.state.residents[0].owned = ['drill', 'saw'];
    const result = await createChat(store, { now: () => now })('Sam', "I'm building a bookshelf this weekend");
    assert.equal(result.type, 'tool_list');
    assert.ok(!result.reply.includes('drill, saw'));
    assert.ok(result.reply.includes('sander'));
    assert.equal(store.state.requests.length, 4);
});
test('persisted requests, prompts, spaces, dedup IDs and outbox survive restart', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'relay-test-'));
    try {
        const path = join(dir, 'state.json');
        const original = fixture();
        const store = new RelayStore({ path, initial: original.state });
        const chat = createChat(store, { now: () => now });
        await chat('Sam', 'I need a ladder Saturday', { messageId: 'persist:1' });
        await store.transaction(() => { store.state.spaces.Sam = 'space-sam'; });
        const reopened = new RelayStore({ path });
        assert.equal(reopened.state.pending.Mia[0].type, 'exchange');
        assert.equal(reopened.state.spaces.Sam, 'space-sam');
        assert.ok(reopened.state.outbox.length >= 2);
        const duplicate = await createChat(reopened, { now: () => now })('Sam', 'I need a ladder Saturday', { messageId: 'persist:1' });
        assert.equal(duplicate.reply, '');
        assert.equal(reopened.state.requests.length, 1);
        await createChat(reopened, { now: () => now })('Mia', 'yes');
        assert.equal(new RelayStore({ path }).state.exchanges[0].status, 'Confirmed');
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('concurrent needs reserve consecutive slots on the same ladder', async () => {
    const store = fixture();
    const chat = createChat(store, { now: () => now });
    await Promise.all([chat('Sam', 'I need a ladder Saturday morning'), chat('Dev', 'I need a ladder Saturday morning')]);
    assert.equal(store.state.exchanges.length, 2);
    const [a, b] = store.state.exchanges;
    assert.ok(b.window.start >= a.window.end + 900000);
    await chat('Mia', 'yes');
    await chat('Mia', 'yes');
    assert.ok(store.state.exchanges.every(e => e.status === 'Confirmed'));
    assert.ok(store.state.exchanges[1].window.start >= store.state.exchanges[0].window.end + 900000);
});
test('shared scheduler identifies the request that cannot fit', () => {
    const tight = { start: win.start, end: win.start + 3600000 };
    const result = schedule_shared([{ id: 'a', window: tight }, { id: 'b', window: tight }], 3600000, 900000);
    assert.equal(result.slots.length, 1);
    assert.equal(result.unplaced?.id, 'b');
});
test('parser rejects negative counts and keeps future dates in the configured timezone', async () => {
    assert.equal((await parse('I need -2 notebooks', { now })).intent, 'clarify');
    const monday = await parse('I need a ladder Monday morning', { now });
    assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(monday.window!.start), 'Monday');
    assert.equal((await parse('I need a ladder last Saturday', { now })).intent, 'clarify');
});
test('full partial-donor gift flow records receipt and reduces both donors quantities', async () => {
    const store = fixture();
    store.state.items.push({ ...item('a', 'Mia', 'notebooks', 12), windows: [{ start: now, end: now + 30 * 86400000 }] }, { ...item('b', 'Dev', 'notebooks', 8), windows: [{ start: now, end: now + 30 * 86400000 }] });
    const chat = createChat(store, { now: () => now });
    const result = await chat('Sam', 'I need 20 notebooks');
    assert.equal(result.type, 'match');
    assert.equal(store.state.exchanges.length, 2);
    await chat('Mia', 'yes');
    await chat('Dev', 'yes');
    await chat('Sam', 'received');
    assert.equal(store.state.items.filter(i => i.catalogId === 'notebooks').reduce((sum, i) => sum + i.quantity, 0), 0);
    assert.equal(store.state.requests[0].status, 'completed');
});
test('fractional quantity is rejected', async () => {
    assert.equal((await parse('I need 1.5 notebooks', { now })).intent, 'clarify');
});
test('expired unanswered gift proposals release their reserved quantity', async () => {
    const store = fixture();
    store.state.items = [];
    let clock = now;
    const chat = createChat(store, { now: () => clock });
    await chat('Mia', 'I have 20 notebooks to give away');
    await chat('Sam', 'I need 20 notebooks');
    assert.equal(store.state.exchanges[0].status, 'Requested');
    clock += 2 * 3600000;
    await chat('Dev', 'I need 20 notebooks');
    assert.equal(store.state.exchanges[0].status, 'Declined');
    assert.equal(store.state.exchanges[1].receiver, 'Dev');
});
test('local bridge lock prevents a second process from using the same state file', async () => {
    const { acquireBridgeLock } = await import('../store.ts');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'relay-lock-'));
    try {
        const path = join(dir, 'state.json');
        const release = acquireBridgeLock(path);
        assert.throws(() => acquireBridgeLock(path), /Another Relay bridge/);
        release();
        acquireBridgeLock(path)();
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('Gemini fallback validates catalog, quantity and future window', async () => {
  const originalFetch=globalThis.fetch
  const respond=(value:unknown)=>{globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]}),{status:200})}
  try {
    respond({intent:'need',item:'ladder',quantity:1,window:'Saturday'})
    assert.equal((await parse('Could use something to reach the roof',{now,geminiKey:'test-only'})).item,'ladder')
    respond({intent:'need',item:'spaceship',quantity:1,window:'Saturday'})
    assert.equal((await parse('Unusual phrasing',{now,geminiKey:'test-only'})).intent,'clarify')
    respond({intent:'need',item:'ladder',quantity:501,window:'Saturday'})
    assert.equal((await parse('Unusual phrasing',{now,geminiKey:'test-only'})).intent,'clarify')
    respond({intent:'need',item:'ladder',quantity:1,window:'2020-01-01'})
    assert.equal((await parse('Unusual phrasing',{now,geminiKey:'test-only'})).intent,'clarify')
    globalThis.fetch=async()=>{throw new Error('network offline')}
    assert.equal((await parse('Unusual phrasing',{now,geminiKey:'test-only'})).intent,'unknown')
  } finally {globalThis.fetch=originalFetch}
})

test('inventory questions use the backend and transaction requests stay on the normal chat path', async () => {
    const originalFetch = globalThis.fetch
    let requestedUrl = ''
    globalThis.fetch = async (input) => {
        requestedUrl = String(input)
        return new Response(JSON.stringify({
            type: 'inventory_answer',
            snowflake: 'ok',
            message: 'Snowflake inventory lists Jordan Lee: 1 Cordless drill.',
            items: [],
        }), { status: 200 })
    }
    try {
        assert.equal(isInventoryQuestion('Who has a drill?'), true)
        assert.equal(isInventoryQuestion('I need a drill Saturday'), false)
        assert.equal(await answerInventoryQuestion('Who has a drill?'), 'Snowflake inventory lists Jordan Lee: 1 Cordless drill.')
        assert.equal(requestedUrl, 'http://127.0.0.1:8000/api/agent/answer')
        assert.equal(await answerInventoryQuestion('I need a drill Saturday'), null)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('inventory questions fail closed when the backend cannot be reached', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('API offline') }
    try {
        assert.match(await answerInventoryQuestion('Who has a ladder?') ?? '', /can't verify neighborhood inventory/)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('matching excludes wrong mode, unwilling owners and distant zones',()=>{
  const distant={...resident('Far'),zone:3}
  const candidates=[{...item('far','Far','ladder',1)}, {...item('unwilling','Mia','ladder',1),willingToLend:false},{...item('gift','Dev','ladder',1),kind:'gift' as const}]
  assert.equal(match(need('n','Sam','ladder'),candidates,[resident('Sam'),resident('Mia'),resident('Dev'),distant]).covered,0)
})

test('a yes for an expired prompt cannot silently confirm the next queued loan',async()=>{
  const store=fixture();let clock=now
  const chat=createChat(store,{now:()=>clock})
  await chat('Sam','I need a ladder Monday morning')
  await chat('Dev','I need a ladder Tuesday morning')
  clock=Date.parse('2026-10-12T18:00:00Z')
  const reply=await chat('Mia','yes')
  assert.equal(store.state.exchanges[0].status,'Declined')
  assert.equal(store.state.exchanges[1].status,'Requested')
  assert.equal(store.state.exchanges[1].giverConfirmed,false)
  assert.ok(reply.reply.includes('expired'))
})

test('confirmation preserves pickup details when the lender has another queued question',async()=>{
  const store=fixture();const chat=createChat(store,{now:()=>now})
  await chat('Sam','I need a ladder Saturday morning')
  await chat('Dev','I need a ladder Saturday morning')
  const reply=await chat('Mia','yes')
  assert.ok(reply.reply.includes('Confirmed:'))
  assert.ok(reply.reply.includes('Reply YES or NO'))
  assert.ok(reply.reply.split('\n').length<=3)
})
