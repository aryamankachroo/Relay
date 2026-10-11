import { randomUUID } from 'node:crypto';
import { emptyState } from './store.ts';
import type { RelayState } from './types.ts';
export function seed(now = Date.now()): RelayState {
    const state = emptyState();
    state.residents = [
        { id: process.env.DEMO_USER_PHONE || 'demo:sam', name: 'Sam', zone: 0, owned: ['hammer', 'tape-measure'] },
        { id: process.env.DEMO_SECOND_PHONE || 'demo:mia', name: 'Mia', zone: 0, owned: ['ladder', 'saw', 'level', 'clamps'] },
        { id: process.env.DEMO_THIRD_PHONE || 'demo:dev', name: 'Dev', zone: 1, owned: ['stand-mixer', 'tent', 'folding-table'] },
        { id: 'demo:rosa', name: 'Rosa', zone: 2, owned: ['lawn-mower', 'projector'] },
        { id: 'demo:leo', name: 'Leo', zone: 3, owned: ['drill', 'saw', 'clamps'] },
    ];
    const rows: [
        number,
        string,
        number
    ][] = [
        [0, 'hammer', 1], [0, 'tape-measure', 1], [1, 'ladder', 1], [1, 'saw', 1], [1, 'level', 1], [1, 'clamps', 4], [1, 'notebooks', 12],
        [2, 'stand-mixer', 1], [2, 'tent', 1], [2, 'folding-table', 2], [2, 'notebooks', 8], [2, 'moving-boxes', 12],
        [3, 'lawn-mower', 1], [3, 'projector', 1], [3, 'ladder', 1], [3, 'hammer', 1], [4, 'drill', 1], [4, 'saw', 1], [4, 'clamps', 4], [4, 'tape-measure', 1],
    ];
    state.items = rows.map(([owner, catalogId, quantity]) => ({ id: randomUUID(), owner: state.residents[owner].id, catalogId, quantity, windows: [{ start: now, end: now + 365 * 86400000 }], willingToLend: true, kind: catalogId === 'notebooks' || catalogId === 'moving-boxes' ? 'gift' : 'loan', notes: 'Fictional demo community item' }));
    return state;
}
