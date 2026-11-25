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

export type EnemySpawn = { lane: number; kind: EnemyKind };
export type EnemyRowBlueprint = { row: number; spawns: EnemySpawn[] };

/** ~60s at forwardSpeed 1 row/s. Growth doors balanced with − / ÷ risk. */
export const LEVEL_1: {
    gates: GateRowBlueprint[];
    weaponCrates: WeaponCrateBlueprint[];
    enemyRows: EnemyRowBlueprint[];
} = {
    gates: [
        { row: 3, left: 'add3', right: 'sub2' },
        { row: 7, left: 'div2', right: 'add4' },
        { row: 11, left: 'add2', right: 'sub3' },
        { row: 15, left: 'mul2', right: 'sub5' },
        { row: 21, left: 'sub2', right: 'add3' },
        { row: 27, left: 'add4', right: 'div2' },
        { row: 35, left: 'sub3', right: 'add5' },
        { row: 45, left: 'mul2', right: 'sub5' },
    ],
    weaponCrates: [
        { row: 8, lane: 1, crate: 'dual' },
        { row: 18, lane: 3, crate: 'dual' },
        { row: 28, lane: 2, crate: 'assault' },
        { row: 40, lane: 4, crate: 'assault' },
    ],
    enemyRows: [
        { row: 5, spawns: [{ lane: 0, kind: 'normal' }, { lane: 2, kind: 'normal' }, { lane: 4, kind: 'normal' }] },
        { row: 9, spawns: [{ lane: 1, kind: 'normal' }, { lane: 2, kind: 'normal' }, { lane: 3, kind: 'normal' }, { lane: 4, kind: 'normal' }] },
        { row: 13, spawns: [
            { lane: 0, kind: 'normal' }, { lane: 1, kind: 'normal' }, { lane: 2, kind: 'tank' },
            { lane: 3, kind: 'normal' }, { lane: 4, kind: 'normal' },
        ] },
        { row: 17, spawns: [{ lane: 0, kind: 'normal' }, { lane: 2, kind: 'normal' }, { lane: 3, kind: 'normal' }] },
        { row: 19, spawns: [{ lane: 1, kind: 'normal' }, { lane: 4, kind: 'tank' }] },
        { row: 23, spawns: [{ lane: 0, kind: 'normal' }, { lane: 1, kind: 'normal' }, { lane: 3, kind: 'normal' }, { lane: 4, kind: 'normal' }] },
        { row: 25, spawns: [{ lane: 2, kind: 'tank' }, { lane: 4, kind: 'normal' }] },
        { row: 29, spawns: [{ lane: 0, kind: 'normal' }, { lane: 2, kind: 'normal' }, { lane: 4, kind: 'normal' }] },
        { row: 31, spawns: [{ lane: 1, kind: 'normal' }, { lane: 2, kind: 'tank' }, { lane: 3, kind: 'normal' }] },
        { row: 33, spawns: [{ lane: 0, kind: 'normal' }, { lane: 4, kind: 'normal' }] },
        { row: 37, spawns: [{ lane: 1, kind: 'normal' }, { lane: 2, kind: 'normal' }, { lane: 3, kind: 'normal' }] },
        { row: 39, spawns: [{ lane: 0, kind: 'tank' }, { lane: 2, kind: 'normal' }, { lane: 4, kind: 'tank' }] },
        { row: 43, spawns: [{ lane: 1, kind: 'normal' }, { lane: 3, kind: 'normal' }] },
        { row: 47, spawns: [{ lane: 0, kind: 'normal' }, { lane: 1, kind: 'normal' }, { lane: 2, kind: 'normal' }, { lane: 3, kind: 'normal' }, { lane: 4, kind: 'normal' }] },
        { row: 51, spawns: [{ lane: 2, kind: 'tank' }, { lane: 4, kind: 'normal' }] },
        { row: 55, spawns: [{ lane: 0, kind: 'normal' }, { lane: 3, kind: 'normal' }] },
    ],
};
