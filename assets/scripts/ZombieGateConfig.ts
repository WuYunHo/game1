/**
 * Authoring tables for gates and weapon crates.
 * Levels reference entries by id instead of inlining kind/value repeatedly.
 */

export type GateKind = 'add' | 'sub' | 'mul' | 'div';

export type GateDef = {
    id: string;
    kind: GateKind;
    value: number;
    /** Short brick label. */
    label: string;
    /** True = growth / False = penalty (drives color). */
    good: boolean;
};

/** Reusable gate catalog — add rows here when introducing new door types. */
export const GATE_DEFS: Record<string, GateDef> = Object.freeze({
    add2: { id: 'add2', kind: 'add', value: 2, label: '+2', good: true },
    add3: { id: 'add3', kind: 'add', value: 3, label: '+3', good: true },
    add4: { id: 'add4', kind: 'add', value: 4, label: '+4', good: true },
    add5: { id: 'add5', kind: 'add', value: 5, label: '+5', good: true },
    sub1: { id: 'sub1', kind: 'sub', value: 1, label: '−1', good: false },
    sub2: { id: 'sub2', kind: 'sub', value: 2, label: '−2', good: false },
    sub3: { id: 'sub3', kind: 'sub', value: 3, label: '−3', good: false },
    sub5: { id: 'sub5', kind: 'sub', value: 5, label: '−5', good: false },
    mul2: { id: 'mul2', kind: 'mul', value: 2, label: '×2', good: true },
    div2: { id: 'div2', kind: 'div', value: 2, label: '÷2', good: false },
});

export type GateDefId = keyof typeof GATE_DEFS;

export function resolveGateDef(id: string): GateDef {
    const def = GATE_DEFS[id];
    if (!def) throw new Error(`Unknown gate def id: ${id}`);
    return def;
}

export type WeaponCrateDef = {
    /** Weapon tier granted when the crate is destroyed (0..max). */
    tier: number;
    /** Hit points; player bullets chip this down. */
    hp: number;
};

/** Default weapon-crate template (width = 1 lane). */
export const WEAPON_CRATE_DEFAULT: WeaponCrateDef = Object.freeze({
    tier: 1,
    hp: 20,
});

export const WEAPON_CRATE_DEFS: Record<string, WeaponCrateDef> = Object.freeze({
    dual: { tier: 1, hp: 20 },
    assault: { tier: 2, hp: 20 },
});

export type WeaponCrateDefId = keyof typeof WEAPON_CRATE_DEFS;

export function resolveWeaponCrateDef(id: string): WeaponCrateDef {
    const def = WEAPON_CRATE_DEFS[id];
    if (!def) throw new Error(`Unknown weapon crate def id: ${id}`);
    return def;
}
