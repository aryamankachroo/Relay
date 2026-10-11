import type { Kind } from './types.ts';
export type CatalogEntry = {
    id: string;
    name: string;
    aliases: string[];
    kind: Kind;
    demoPrice: number;
};
export const catalog: CatalogEntry[] = [
    { id: 'drill', name: 'drill', aliases: ['cordless drill', 'power drill', 'drill'], kind: 'loan', demoPrice: 60 },
    { id: 'saw', name: 'circular saw', aliases: ['circular saw', 'hand saw', 'saw'], kind: 'loan', demoPrice: 80 },
    { id: 'level', name: 'level', aliases: ['spirit level', 'level'], kind: 'loan', demoPrice: 20 },
    { id: 'sander', name: 'sander', aliases: ['orbital sander', 'sander'], kind: 'loan', demoPrice: 60 },
    { id: 'clamps', name: 'clamps', aliases: ['clamp', 'clamps'], kind: 'loan', demoPrice: 24 },
    { id: 'tape-measure', name: 'tape measure', aliases: ['measuring tape', 'tape measure'], kind: 'loan', demoPrice: 15 },
    { id: 'ladder', name: 'ladder', aliases: ['step ladder', 'ladder'], kind: 'loan', demoPrice: 90 },
    { id: 'hammer', name: 'hammer', aliases: ['hammer'], kind: 'loan', demoPrice: 15 },
    { id: 'lawn-mower', name: 'lawn mower', aliases: ['lawn mower', 'mower'], kind: 'loan', demoPrice: 200 },
    { id: 'stand-mixer', name: 'stand mixer', aliases: ['stand mixer', 'mixer'], kind: 'loan', demoPrice: 250 },
    { id: 'projector', name: 'projector', aliases: ['projector'], kind: 'loan', demoPrice: 150 },
    { id: 'tent', name: 'tent', aliases: ['tent'], kind: 'loan', demoPrice: 80 },
    { id: 'folding-table', name: 'folding table', aliases: ['folding table', 'table'], kind: 'loan', demoPrice: 50 },
    { id: 'notebooks', name: 'notebooks', aliases: ['unused notebooks', 'notebook', 'notebooks'], kind: 'gift', demoPrice: 3 },
    { id: 'moving-boxes', name: 'moving boxes', aliases: ['moving boxes', 'moving box', 'boxes'], kind: 'gift', demoPrice: 2 },
];
export const projects: Record<string, string[]> = { bookshelf: ['drill', 'saw', 'level', 'sander', 'clamps', 'tape-measure'] };
export function lookup(text: string): CatalogEntry | undefined {
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
    return catalog.find(item => item.id === normalized.trim()) ?? catalog
        .flatMap(item => item.aliases.map(alias => ({ item, alias })))
        .sort((a, b) => b.alias.length - a.alias.length)
        .find(({ alias }) => new RegExp(`\\b${alias}\\b`).test(normalized))?.item;
}
export function entry(id: string): CatalogEntry { const found = catalog.find(i => i.id === id); if (!found)
    throw new Error('Unknown catalog item'); return found; }
