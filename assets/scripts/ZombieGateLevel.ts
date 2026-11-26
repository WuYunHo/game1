/** Static early-combat level: crates + generated gate/enemy curves. */
import { resolveGateDef, type GateDef, type GateDefId, type WeaponCrateDefId } from './ZombieGateConfig';

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
 * Empty runway before the first door/pack so content scrolls in from the top
 * instead of packing the opening frame.
 */
export const LEVEL_LEAD_IN = 36;

/** Shared stage pressure (enemies + gates). */
export const ENEMY_GEN = Object.freeze({
    /** 0.7 easy · 1.0 normal · 1.3 hard */
    difficulty: 1.0,
    /** Combat stretch after lead-in (world rows). */
    combatLength: 56,
    /** Base gap between packs (early game stretches this). */
    rowStep: 3.15,
    seed: 20260326,
    gateSeed: 20260327,
    /** Assumed opening squad size when validating gate survival. */
    startUnits: 1,
});

export type EnemyGenOpts = {
    difficulty?: number;
    seed?: number;
    combatLength?: number;
};

export type GateGenOpts = {
    difficulty?: number;
    seed?: number;
    combatLength?: number;
    startUnits?: number;
};

function clamp01(t: number): number {
    return Math.max(0, Math.min(1, t));
}

function smoothstep(t: number): number {
    const x = clamp01(t);
    return x * x * (3 - 2 * x);
}

/** Deterministic 0..1 RNG (mulberry32). */
export function makeRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Expected flies in one pack at progress t.
 * Warm-up is sparse; mid/late climb; slight taper near the end.
 */
export function densityAt(t: number, difficulty = ENEMY_GEN.difficulty): number {
    const tt = clamp01(t);
    const warm = smoothstep((tt - 0.06) / 0.3); // ~0 until 0.06, ~1 by 0.36
    const rise = smoothstep(tt / 0.78);
    const peak = 0.9 + rise * 5.4; // ~0.9 → ~6.3 before warm/D
    const taper = tt > 0.88 ? 1 - ((tt - 0.88) / 0.12) * 0.2 : 1;
    const earlyMul = 0.22 + 0.78 * warm;
    return Math.max(0, peak * earlyMul * taper * difficulty);
}

export function tankChanceAt(t: number, difficulty = ENEMY_GEN.difficulty): number {
    if (t < 0.2) return 0;
    return Math.min(0.32, (0.03 + t * 0.2) * difficulty);
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
}

function buildPack(count: number, t: number, difficulty: number, rand: () => number): EnemySpawn[] {
    const n = Math.max(0, Math.min(10, count));
    if (n <= 0) return [];

    const laneOrder = [0, 1, 2, 3, 4];
    shuffleInPlace(laneOrder, rand);
    const laneCounts = [0, 0, 0, 0, 0];
    const spawns: EnemySpawn[] = [];
    let tanks = 0;
    const maxTanks = t < 0.45 ? 1 : 2;

    for (let i = 0; i < n; i++) {
        // Prefer emptiest lane so early packs spread; late packs may stack.
        let lane = 0;
        if (i < 5 && rand() < 0.7) {
            lane = laneOrder[i];
        } else {
            lane = 0;
            for (let L = 1; L < 5; L++) {
                if (laneCounts[L] < laneCounts[lane]) lane = L;
            }
            if (rand() < 0.35) lane = laneOrder[i % 5];
        }
        const stack = laneCounts[lane];
        laneCounts[lane] += 1;

        let kind: EnemyKind = 'normal';
        if (stack === 0 && tanks < maxTanks && rand() < tankChanceAt(t, difficulty)) {
            kind = 'tank';
            tanks += 1;
        }

        const spawn: EnemySpawn = { lane, kind };
        if (stack > 0) {
            spawn.dy = (stack % 2 === 0 ? 1 : -1) * (0.2 + rand() * 0.16);
            spawn.dx = (rand() - 0.5) * 0.34;
        } else if (rand() < 0.25) {
            spawn.dx = (rand() - 0.5) * 0.16;
        }
        spawns.push(spawn);
    }
    return spawns;
}

/** Build the fly-mouse timeline from a difficulty curve (deterministic with seed). */
export function generateEnemyRows(opts: EnemyGenOpts = {}): EnemyRowBlueprint[] {
    const difficulty = opts.difficulty ?? ENEMY_GEN.difficulty;
    const length = opts.combatLength ?? ENEMY_GEN.combatLength;
    const rand = makeRng(opts.seed ?? ENEMY_GEN.seed);
    const rows: EnemyRowBlueprint[] = [];

    let row = 5.5; // local offset; LEVEL_LEAD_IN still applied in buildLevel
    while (row <= length) {
        const t = row / length;
        const budget = densityAt(t, difficulty);
        let count = Math.floor(budget);
        if (rand() < budget - count) count += 1;
        // Opening packs: hard cap so the first screen stays readable.
        if (t < 0.2) count = Math.min(count, Math.max(1, Math.round(1.8 * difficulty)));
        else if (t < 0.38) count = Math.min(count, Math.max(2, Math.round(3.5 * difficulty)));

        if (count > 0) {
            rows.push({
                row: Math.round(row * 10) / 10,
                spawns: buildPack(count, t, difficulty, rand),
            });
        }

        const earlyGap = t < 0.22 ? 1.55 : t < 0.4 ? 1.2 : 1;
        const step = ENEMY_GEN.rowStep * (0.82 + rand() * 0.4) * earlyGap;
        row += step;
    }
    return rows;
}

/** Lightweight plan metrics for tuning / tests. */
export function evaluateEnemyPlan(rows: EnemyRowBlueprint[], combatLength = ENEMY_GEN.combatLength) {
    const total = rows.reduce((n, r) => n + r.spawns.length, 0);
    const tanks = rows.reduce((n, r) => n + r.spawns.filter(s => s.kind === 'tank').length, 0);
    const early = rows
        .filter(r => r.row / combatLength < 0.25)
        .reduce((n, r) => n + r.spawns.length, 0);
    const late = rows
        .filter(r => r.row / combatLength >= 0.55)
        .reduce((n, r) => n + r.spawns.length, 0);
    const maxPack = rows.reduce((m, r) => Math.max(m, r.spawns.length), 0);
    return { total, tanks, early, late, maxPack, packs: rows.length };
}

function applyGateToUnits(units: number, def: GateDef): number {
    if (def.kind === 'add') return units + def.value;
    if (def.kind === 'sub') return Math.max(0, units - def.value);
    if (def.kind === 'mul') return Math.floor(units * def.value);
    return Math.max(0, Math.floor(units / Math.max(1, def.value)));
}

function bestUnitsAfter(units: number, left: GateDefId, right: GateDefId): number {
    const a = applyGateToUnits(units, resolveGateDef(left));
    const b = applyGateToUnits(units, resolveGateDef(right));
    return Math.max(a, b);
}

function swapSides(left: GateDefId, right: GateDefId, rand: () => number): { left: GateDefId; right: GateDefId } {
    return rand() < 0.5 ? { left, right } : { left: right, right: left };
}

/**
 * Pick a left/right pair that never soft-locks a careful player.
 * Early: always a +1 growth vs mild penalty. Harsh pairs only when units can absorb them.
 */
function pickGatePair(
    index: number,
    t: number,
    difficulty: number,
    units: number,
    rand: () => number,
): { left: GateDefId; right: GateDefId } {
    const D = difficulty;
    let left: GateDefId;
    let right: GateDefId;

    if (units <= 1 || index === 0) {
        // Opening: +1 vs −1 only (never −2 while alone).
        ({ left, right } = swapSides('add1', 'sub1', rand));
    } else if (units <= 2 || t < 0.28) {
        ({ left, right } = swapSides('add1', 'sub1', rand));
    } else if (t < 0.45) {
        ({ left, right } = swapSides(D >= 1.15 ? 'add1' : 'add2', 'sub1', rand));
    } else if (t < 0.62) {
        if (D >= 1.2 && units >= 4) ({ left, right } = swapSides('add2', 'sub2', rand));
        else ({ left, right } = swapSides('add2', 'sub1', rand));
    } else if (t < 0.78) {
        if (D >= 1.05 && units >= 4) ({ left, right } = swapSides('add1', 'div2', rand));
        else ({ left, right } = swapSides('add2', 'sub2', rand));
    } else {
        // Late: allow a true risk row only if the better door still leaves ≥1.
        if (D >= 1.1 && units >= 5) ({ left, right } = swapSides('sub1', 'sub2', rand));
        else if (units >= 4) ({ left, right } = swapSides('add1', 'div2', rand));
        else ({ left, right } = swapSides('add2', 'sub1', rand));
    }

    // Safety net: if even the better door would wipe the squad, force a growth door.
    if (bestUnitsAfter(units, left, right) < 1) {
        ({ left, right } = swapSides('add1', units <= 2 ? 'sub1' : 'sub2', rand));
    }
    return { left, right };
}

/** Build gate rows from the same difficulty timeline as enemies. */
export function generateGateRows(opts: GateGenOpts = {}): GateRowBlueprint[] {
    const difficulty = opts.difficulty ?? ENEMY_GEN.difficulty;
    const length = opts.combatLength ?? ENEMY_GEN.combatLength;
    const rand = makeRng(opts.seed ?? ENEMY_GEN.gateSeed);
    let units = Math.max(1, opts.startUnits ?? ENEMY_GEN.startUnits);

    // Five doors spaced through the run (local rows; lead-in applied in buildLevel).
    const stamps = [0.1, 0.28, 0.46, 0.64, 0.82];
    const rows: GateRowBlueprint[] = [];
    for (let i = 0; i < stamps.length; i++) {
        const t = stamps[i];
        const row = Math.round(t * length * 10) / 10;
        const pair = pickGatePair(i, t, difficulty, units, rand);
        rows.push({ row, left: pair.left, right: pair.right });
        units = bestUnitsAfter(units, pair.left, pair.right);
    }
    return rows;
}

export function evaluateGatePlan(
    rows: GateRowBlueprint[],
    startUnits = ENEMY_GEN.startUnits,
) {
    let units = startUnits;
    let minUnits = units;
    let doubleBad = 0;
    let growthDoors = 0;
    for (const row of rows) {
        const L = resolveGateDef(row.left);
        const R = resolveGateDef(row.right);
        if (!L.good && !R.good) doubleBad += 1;
        if (L.good) growthDoors += 1;
        if (R.good) growthDoors += 1;
        units = bestUnitsAfter(units, row.left, row.right);
        minUnits = Math.min(minUnits, units);
    }
    return { finalUnits: units, minUnits, doubleBad, growthDoors, gates: rows.length };
}

/**
 * Crates stay authored; gates/enemies are generated from DIFFICULTY.
 */
export const LEVEL_1: {
    weaponCrates: WeaponCrateBlueprint[];
} = {
    weaponCrates: [
        { row: 8, lane: 1, crate: 'dual' },
        { row: 18, lane: 3, crate: 'dual' },
        { row: 28, lane: 2, crate: 'assault' },
        { row: 40, lane: 4, crate: 'assault' },
    ],
};
