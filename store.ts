import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RelayState } from './types.ts';
export function emptyState(): RelayState { return { version: 1, residents: [], items: [], requests: [], exchanges: [], groups: [], pending: {}, spaces: {}, outbox: [], delivered: [] }; }
export class RelayStore {
    state: RelayState;
    readonly path: string | null;
    private tail: Promise<unknown> = Promise.resolve();
    constructor(options: {
        path?: string | null;
        initial?: RelayState;
    } = {}) {
        this.path = options.path === null ? null : resolve(options.path ?? process.env.RELAY_STORE_PATH ?? '.relay/state.json');
        if (this.path && existsSync(this.path)) {
            const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as RelayState;
            if (parsed.version !== 1 || !Array.isArray(parsed.residents) || !Array.isArray(parsed.items) || !Array.isArray(parsed.requests) || !Array.isArray(parsed.exchanges) || !Array.isArray(parsed.groups) || !Array.isArray(parsed.outbox) || !Array.isArray(parsed.delivered) || !parsed.pending || !parsed.spaces)
                throw new Error('Invalid Relay store; restore a valid backup before starting.');
            this.state = parsed;
        }
        else
            this.state = structuredClone(options.initial ?? emptyState());
    }
    save() {
        if (!this.path)
            return;
        mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
        const temp = `${this.path}.${randomUUID()}.tmp`;
        writeFileSync(temp, JSON.stringify(this.state, null, 2) + '\n', { mode: 0o600 });
        renameSync(temp, this.path);
    }
    transaction<T>(fn: () => T | Promise<T>): Promise<T> {
        const run = async () => {
            const previous = structuredClone(this.state);
            try {
                const result = await fn();
                this.save();
                return result;
            }
            catch (error) {
                this.state = previous;
                throw error;
            }
        };
        const next = this.tail.then(run, run);
        this.tail = next.catch(() => undefined);
        return next;
    }
}
/** One local process owns the JSON store; prevents duplicate replies from two bridges. */
export function acquireBridgeLock(storePath: string): () => void {
    const path = `${storePath}.lock`;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const token = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            writeFileSync(path, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 });
            return () => {
                try {
                    const current = JSON.parse(readFileSync(path, 'utf8')) as {
                        token: string;
                    };
                    if (current.token === token)
                        unlinkSync(path);
                }
                catch { /* A lock already removed during shutdown needs no further action. */ }
            };
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                throw error;
            const lock = JSON.parse(readFileSync(path, 'utf8')) as {
                pid: number;
            };
            if (!Number.isInteger(lock.pid) || lock.pid < 1)
                throw new Error('Invalid bridge lock; inspect the local lock file before restarting.', { cause: error });
            try {
                process.kill(lock.pid, 0);
            }
            catch (probe) {
                if ((probe as NodeJS.ErrnoException).code === 'ESRCH') {
                    unlinkSync(path);
                    continue;
                }
            }
            throw new Error('Another Relay bridge is running with this store. Stop it before starting a second one.', { cause: error });
        }
    }
    throw new Error('Could not acquire the bridge lock.');
}
