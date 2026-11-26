/** Static early-combat level: gates (by config id), weapon crates, enemy rows. */
import type { GateDefId, WeaponCrateDefId } from './ZombieGateConfig';

export type EnemyKind = 'normal' | 'tank';

export type GateRowBlueprint = {
    row: number;
    /** Left / right doors reference GATE_DEFS ids. */
    left: GateDefId;
    right: GateDefId;
};

export type WeaponCrateBlueprint = {
    row: number;
    /** Width is always 1 lane. */
    lane: number;
    crate: WeaponCrateDefId;
};

export type EnemySpawn = {
    lane: number;
    kind: EnemyKind;
    /** Row offset for staggered stacks (fractions of a row). */
    dy?: number;
    /** Sub-lane visual offset in lane widths (−0.4…0.4). */
    dx?: number;
};

export type EnemyRowBlueprint = { row: number; spawns: EnemySpawn[] };

/**
 * Gate mix stops infinite snowballing:
 * - growth always faces a real penalty on the other side
 * - several rows are double-penalty (sub/div both sides)
 * - ×2 appears at most once and is paired with ÷2
 */
export const LEVEL_1: {
    gates: GateRowBlueprint[];
    weaponCrates: WeaponCrateBlueprint[];
    enemyRows: EnemyRowBlueprint[];
} = {
    // Fewer doors, wider gaps — keep enemy density, cut gate frequency.
    gates: [
        { row: 5, left: 'add2', right: 'sub2' },
        { row: 16, left: 'sub3', right: 'sub1' },      // double penalty
        { row: 28, left: 'mul2', right: 'div2' },      // only ×2, high risk
        { row: 42, left: 'add3', right: 'div2' },
        { row: 54, left: 'div2', right: 'sub2' },      // double penalty
    ],
    weaponCrates: [
        { row: 8, lane: 1, crate: 'dual' },
        { row: 18, lane: 3, crate: 'dual' },
        { row: 28, lane: 2, crate: 'assault' },
        { row: 40, lane: 4, crate: 'assault' },
    ],
    /**
     * Dense packs: same lane can hold multiple flies with dx/dy stagger
     * so they visually stack instead of sitting in a sparse single line.
     */
    enemyRows: [
        { row: 4.5, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 0, kind: 'normal', dy: 0.32, dx: 0.18 },
            { lane: 2, kind: 'normal' },
            { lane: 2, kind: 'normal', dy: -0.22, dx: -0.14 },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: 0.28, dx: 0.12 },
        ] },
        { row: 6, spawns: [
            { lane: 1, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.3, dx: -0.16 },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: -0.25, dx: 0.15 },
        ] },
        { row: 9, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.18, dx: 0.1 },
            { lane: 1, kind: 'normal', dy: -0.2, dx: -0.12 },
            { lane: 2, kind: 'normal' },
            { lane: 2, kind: 'normal', dy: 0.34, dx: 0.16 },
            { lane: 3, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: -0.15, dx: -0.1 },
            { lane: 4, kind: 'normal', dy: 0.26, dx: 0.14 },
        ] },
        { row: 12, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 0, kind: 'normal', dy: 0.3, dx: 0.12 },
            { lane: 1, kind: 'normal', dy: -0.18 },
            { lane: 2, kind: 'tank' },
            { lane: 2, kind: 'normal', dy: 0.36, dx: -0.18 },
            { lane: 3, kind: 'normal' },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: -0.28, dx: 0.16 },
        ] },
        { row: 14, spawns: [
            { lane: 1, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.28, dx: -0.14 },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: -0.22, dx: 0.12 },
            { lane: 4, kind: 'normal', dy: 0.15 },
        ] },
        { row: 17, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 0, kind: 'normal', dy: 0.34, dx: 0.16 },
            { lane: 2, kind: 'normal' },
            { lane: 2, kind: 'normal', dy: -0.2, dx: -0.12 },
            { lane: 2, kind: 'normal', dy: 0.3, dx: 0.14 },
            { lane: 3, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: -0.26, dx: -0.1 },
        ] },
        { row: 19, spawns: [
            { lane: 1, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.3, dx: 0.15 },
            { lane: 3, kind: 'normal', dy: -0.18 },
            { lane: 4, kind: 'tank' },
            { lane: 4, kind: 'normal', dy: 0.32, dx: -0.16 },
        ] },
        { row: 22, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 0, kind: 'normal', dy: 0.28, dx: 0.12 },
            { lane: 1, kind: 'normal', dy: -0.22, dx: -0.14 },
            { lane: 2, kind: 'normal' },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: 0.34, dx: 0.16 },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: -0.26, dx: -0.12 },
        ] },
        { row: 24, spawns: [
            { lane: 1, kind: 'normal', dy: 0.15 },
            { lane: 2, kind: 'tank' },
            { lane: 2, kind: 'normal', dy: 0.38, dx: 0.18 },
            { lane: 2, kind: 'normal', dy: -0.3, dx: -0.16 },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: 0.24, dx: 0.1 },
        ] },
        { row: 26, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.2, dx: -0.12 },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: -0.28, dx: 0.14 },
            { lane: 4, kind: 'normal', dy: 0.16 },
        ] },
        { row: 29, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 0, kind: 'normal', dy: 0.32, dx: 0.14 },
            { lane: 2, kind: 'normal' },
            { lane: 2, kind: 'normal', dy: -0.24, dx: -0.15 },
            { lane: 2, kind: 'normal', dy: 0.28, dx: 0.12 },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: 0.3, dx: -0.12 },
        ] },
        { row: 31, spawns: [
            { lane: 1, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.3, dx: 0.16 },
            { lane: 2, kind: 'tank' },
            { lane: 2, kind: 'normal', dy: -0.32, dx: -0.14 },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: 0.26, dx: -0.1 },
            { lane: 4, kind: 'normal', dy: -0.18 },
        ] },
        { row: 33.5, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 0, kind: 'normal', dy: 0.28, dx: 0.12 },
            { lane: 1, kind: 'normal', dy: -0.2 },
            { lane: 3, kind: 'normal' },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: 0.34, dx: -0.14 },
        ] },
        { row: 36, spawns: [
            { lane: 0, kind: 'normal', dy: 0.12 },
            { lane: 1, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.32, dx: -0.15 },
            { lane: 2, kind: 'normal' },
            { lane: 2, kind: 'normal', dy: -0.28, dx: 0.14 },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: 0.24, dx: 0.12 },
            { lane: 4, kind: 'normal', dy: -0.16 },
        ] },
        { row: 38, spawns: [
            { lane: 0, kind: 'tank' },
            { lane: 0, kind: 'normal', dy: 0.36, dx: 0.16 },
            { lane: 2, kind: 'normal' },
            { lane: 2, kind: 'normal', dy: -0.22, dx: -0.12 },
            { lane: 2, kind: 'normal', dy: 0.3, dx: 0.14 },
            { lane: 4, kind: 'tank' },
            { lane: 4, kind: 'normal', dy: -0.3, dx: -0.14 },
        ] },
        { row: 41, spawns: [
            { lane: 1, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.28, dx: 0.14 },
            { lane: 2, kind: 'normal', dy: -0.18 },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: 0.32, dx: -0.15 },
            { lane: 4, kind: 'normal', dy: 0.14 },
        ] },
        { row: 43, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 0, kind: 'normal', dy: 0.3, dx: 0.12 },
            { lane: 2, kind: 'normal' },
            { lane: 2, kind: 'normal', dy: -0.26, dx: -0.14 },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: 0.28, dx: 0.15 },
        ] },
        { row: 46, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 1, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.34, dx: -0.14 },
            { lane: 2, kind: 'normal' },
            { lane: 2, kind: 'normal', dy: -0.22, dx: 0.12 },
            { lane: 2, kind: 'normal', dy: 0.3, dx: -0.12 },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: 0.26, dx: 0.14 },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: -0.28, dx: -0.1 },
        ] },
        { row: 49, spawns: [
            { lane: 0, kind: 'normal', dy: 0.15 },
            { lane: 1, kind: 'tank' },
            { lane: 1, kind: 'normal', dy: 0.36, dx: 0.16 },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: -0.24, dx: -0.12 },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: 0.3, dx: 0.12 },
        ] },
        { row: 52, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 0, kind: 'normal', dy: 0.28, dx: 0.14 },
            { lane: 2, kind: 'tank' },
            { lane: 2, kind: 'normal', dy: -0.3, dx: -0.15 },
            { lane: 2, kind: 'normal', dy: 0.32, dx: 0.12 },
            { lane: 4, kind: 'normal' },
            { lane: 4, kind: 'normal', dy: 0.24, dx: -0.12 },
        ] },
        { row: 55, spawns: [
            { lane: 0, kind: 'normal' },
            { lane: 1, kind: 'normal', dy: 0.2, dx: -0.1 },
            { lane: 1, kind: 'normal', dy: -0.22, dx: 0.14 },
            { lane: 3, kind: 'normal' },
            { lane: 3, kind: 'normal', dy: 0.3, dx: 0.12 },
            { lane: 4, kind: 'normal', dy: -0.16 },
        ] },
    ],
};
