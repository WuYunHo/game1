const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../tools/typescript.cjs').register();
const {
    ZombieGateModel, ZG_RULES, WEAPONS, sideForLane, gateLabel, ENEMY_STATS,
} = require('../assets/scripts/ZombieGateModel.ts');
const { GATE_DEFS, WEAPON_CRATE_DEFS, resolveGateDef } = require('../assets/scripts/ZombieGateConfig.ts');
const {
    composeZombieGate, laneToX, worldToScreenY, laneFromX, BOARD_COLS, BORDER_LEFT, BORDER_RIGHT,
    GATE_COLS_LEFT, GATE_COLS_RIGHT, TILE_W, FISH_DRAW_PX, ENEMY_DRAW_PX, TANK_DRAW_PX,
} = require('../assets/scripts/ZombieGatePresentation.ts');

const play = () => {
    const m = new ZombieGateModel();
    m.start();
    return m;
};

const enemy = (partial = {}) => ({
    id: 1, lane: 2, displayLane: 2, y: 4, ox: 0, hp: 3, maxHp: 3, touchCost: 1, speed: 1.5,
    state: 'idle', kind: 'normal', laneStepTimer: 0, hitFlash: 0,
    ...partial,
});

const gate = (partial) => {
    const def = resolveGateDef(partial.defId || 'add3');
    return {
        id: 1, row: 1, side: 'left', resolved: false, resolveFlash: 0,
        defId: def.id, kind: def.kind, value: def.value, label: def.label, good: def.good,
        ...partial,
    };
};

test('ready state does not advance until start', () => {
    const m = new ZombieGateModel();
    m.tick(1);
    assert.equal(m.phase, 'ready');
    assert.equal(m.playerY, 0);
    assert.equal(m.unitCount, ZG_RULES.initialUnits);
});

test('gate config table covers growth and penalty kinds', () => {
    assert.ok(GATE_DEFS.add3);
    assert.ok(GATE_DEFS.sub2);
    assert.ok(GATE_DEFS.mul2);
    assert.ok(GATE_DEFS.div2);
    assert.equal(gateLabel('sub', 2), '−2');
    assert.equal(gateLabel('div', 2), '÷2');
    assert.equal(WEAPON_CRATE_DEFS.dual.hp, 20);
    assert.equal(WEAPON_CRATE_DEFS.assault.tier, 2);
});

test('lane shifts are discrete and clamped', () => {
    const m = play();
    assert.equal(m.playerLane, 2);
    m.shiftLane(-1);
    assert.equal(m.playerLane, 1);
    m.setLane(99);
    assert.equal(m.playerLane, ZG_RULES.laneCount - 1);
});

test('displayLane eases toward logical lane after a discrete shift', () => {
    const m = play();
    m.shiftLane(-1);
    assert.equal(m.playerLane, 1);
    assert.equal(m.displayLane, 2);
    m.tick(0.02);
    assert.ok(m.displayLane < 2 && m.displayLane > 1);
    for (let i = 0; i < 40; i++) m.tick(0.05);
    assert.ok(Math.abs(m.displayLane - 1) < 1e-6);
});

test('sideForLane splits evenly for equal-width gates', () => {
    assert.equal(sideForLane(0), 'left');
    assert.equal(sideForLane(1), 'left');
    assert.equal(sideForLane(2), 'right');
    assert.equal(sideForLane(4), 'right');
    assert.equal(ZG_RULES.leftLaneMax, 1);
});

test('add and sub gates change the squad with caps', () => {
    const m = play();
    m.enemies = [];
    m.weaponCrates = [];
    m.gates = [
        gate({ id: 1, row: 1, side: 'left', defId: 'add3' }),
        gate({ id: 2, row: 1, side: 'right', defId: 'sub2' }),
    ];
    m.playerLane = 0;
    m.playerY = 0.99;
    m.tick(0.02);
    assert.equal(m.unitCount, 8);

    m.gates = [
        gate({ id: 3, row: 2, side: 'left', defId: 'sub5' }),
        gate({ id: 4, row: 2, side: 'right', defId: 'add2' }),
    ];
    m.playerY = 1.99;
    m.tick(0.02);
    assert.equal(m.unitCount, 3);
});

test('div and mul gates apply integer population changes', () => {
    const m = play();
    m.enemies = [];
    m.weaponCrates = [];
    m.unitCount = 10;
    m.gates = [
        gate({ id: 1, row: 1, side: 'right', defId: 'div2' }),
        gate({ id: 2, row: 1, side: 'left', defId: 'mul2' }),
    ];
    m.playerLane = 4;
    m.playerY = 0.99;
    m.tick(0.02);
    assert.equal(m.unitCount, 5);

    m.gates = [
        gate({ id: 3, row: 2, side: 'left', defId: 'mul2' }),
        gate({ id: 4, row: 2, side: 'right', defId: 'sub1' }),
    ];
    m.playerLane = 0;
    m.playerY = 1.99;
    m.tick(0.02);
    assert.equal(m.unitCount, 10);
});

test('level spawns map-fixed weapon crates with hp 20 and width-1 lane', () => {
    const m = play();
    assert.ok(m.weaponCrates.length >= 1);
    const crate = m.weaponCrates[0];
    assert.equal(crate.maxHp, 20);
    assert.ok(crate.lane >= 0 && crate.lane <= 4);
    assert.equal(crate.claimed, false);
});

test('level packs dense staggered fly-mice including same-lane stacks', () => {
    const m = play();
    assert.ok(m.enemies.length >= 90, `expected dense pack, got ${m.enemies.length}`);
    const staggered = m.enemies.filter(e => e.ox !== 0 || Math.abs(e.y % 1) > 0.001);
    assert.ok(staggered.length >= 40, 'expected many dx/dy stack offsets');
    const byLaneY = new Map();
    for (const e of m.enemies) {
        const key = `${e.lane}:${e.y.toFixed(2)}`;
        byLaneY.set(key, (byLaneY.get(key) || 0) + 1);
    }
    // Same logical lane can host multiple flies (distinct y via dy).
    const laneCounts = [0, 1, 2, 3, 4].map(lane => m.enemies.filter(e => e.lane === lane).length);
    assert.ok(Math.min(...laneCounts) >= 8, 'every lane should feel crowded');
});

test('weapon crate takes squad damage n per pellet hit', () => {
    const m = play();
    m.gates = [];
    m.enemies = [];
    m.weaponTier = 0; // pellets = 1
    m.unitCount = 5;
    m.weaponCrates = [{
        id: 9, lane: 2, y: 2, hp: 20, maxHp: 20, tier: 1, hitFlash: 0, claimed: false,
    }];
    m.fireCooldown = 0;
    m.playerY = 0;
    m.tick(0.02);
    assert.equal(m.weaponCrates[0].hp, 15); // -5
    assert.ok(m.feedback.some(f => f.kind === 'damage' && f.text === '-5'));
});

test('assault pellets apply -n three times to a weapon crate', () => {
    const m = play();
    m.gates = [];
    m.enemies = [];
    m.weaponTier = 2; // pellets = 3, damage = 1
    m.unitCount = 4;
    m.weaponCrates = [{
        id: 9, lane: 2, y: 2, hp: 40, maxHp: 40, tier: 2, hitFlash: 0, claimed: false,
    }];
    m.fireCooldown = 0;
    m.playerY = 0;
    m.tick(0.02);
    assert.equal(m.weaponCrates[0].hp, 28); // -4 * 3
    assert.equal(m.feedback.filter(f => f.text === '-4').length, 3);
});

test('destroying a weapon crate claims its weapon tier', () => {
    const m = play();
    m.gates = [];
    m.enemies = [];
    m.weaponTier = 0;
    m.unitCount = 5;
    m.weaponCrates = [{
        id: 9, lane: 2, y: 2, hp: 5, maxHp: 20, tier: 1, hitFlash: 0, claimed: false,
    }];
    m.fireCooldown = 0;
    m.playerY = 0;
    m.tick(0.02); // -5 → claimed
    assert.equal(m.weaponCrates.length, 0);
    assert.equal(m.weaponTier, 1);
    assert.equal(m.weapon.name, WEAPONS[1].name);
});

test('level includes double-penalty gate rows', () => {
    const { LEVEL_1 } = require('../assets/scripts/ZombieGateLevel.ts');
    const { resolveGateDef } = require('../assets/scripts/ZombieGateConfig.ts');
    assert.ok(LEVEL_1.gates.length <= 5, 'gates should be sparse');
    const doubleBad = LEVEL_1.gates.filter(row => {
        const l = resolveGateDef(row.left);
        const r = resolveGateDef(row.right);
        return !l.good && !r.good;
    });
    assert.ok(doubleBad.length >= 2, 'expected at least two double-penalty rows');
    const mulRows = LEVEL_1.gates.filter(row => resolveGateDef(row.left).kind === 'mul' || resolveGateDef(row.right).kind === 'mul');
    assert.equal(mulRows.length, 1, '×2 should appear once');
});

test('compose has no lane column tint', () => {
    const m = play();
    m.phase = 'playing';
    const commands = composeZombieGate(m, null);
    assert.equal(commands.some(c => c.id === 'laneGlow'), false);
});

test('default bullet damage is 1 and normal fly-mouse hp is 1', () => {
    assert.equal(WEAPONS[0].damage, 1);
    assert.equal(ENEMY_STATS.normal.hp, 1);
});

test('one volley cannot focus-melt a tank; damage spreads 1 hp at a time', () => {
    const m = play();
    m.gates = [];
    m.weaponCrates = [];
    m.unitCount = 10;
    m.weaponTier = 0;
    m.fireCooldown = 0;
    m.enemies = [enemy({ y: 2, hp: 3, maxHp: 3, kind: 'tank' })];
    m.playerY = 0;
    m.tick(0.02);
    assert.equal(m.enemies.length, 1);
    assert.equal(m.enemies[0].hp, 2);
});

test('idle enemies do not move until aggro range', () => {
    const m = play();
    m.gates = [];
    m.weaponCrates = [];
    m.enemies = [enemy({ y: 10 })];
    m.playerY = 0;
    m.tick(0.05);
    assert.equal(m.enemies[0].state, 'idle');
    m.playerY = 7;
    m.tick(0.05);
    assert.equal(m.enemies[0].state, 'chase');
});

test('contact on the same lane subtracts units and can lose', () => {
    const m = play();
    m.gates = [];
    m.weaponCrates = [];
    m.unitCount = 2;
    m.enemies = [enemy({ y: 0.05, touchCost: 2, state: 'chase' })];
    m.playerLane = 2;
    m.playerY = 0;
    m.tick(0.02);
    assert.equal(m.unitCount, 0);
    assert.equal(m.phase, 'lost');
});

test('surviving until duration wins', () => {
    const m = play();
    m.gates = [];
    m.enemies = [];
    m.weaponCrates = [];
    m.elapsed = ZG_RULES.duration - 0.01;
    m.tick(0.02);
    assert.equal(m.phase, 'won');
});

test('board is 22 cols with denser tiles and side borders', () => {
    assert.equal(BOARD_COLS, 22);
    assert.equal(BORDER_LEFT, 0);
    assert.equal(BORDER_RIGHT, 21);
    assert.equal(laneFromX(0), 0);
    assert.equal(laneFromX(719), 4);
    assert.ok(laneToX(0) > TILE_W); // inside playable, not on left border
    assert.ok(laneToX(4) < 700);
});

test('left and right gates are the same 10-tile footprint', () => {
    assert.equal(GATE_COLS_LEFT.length, 10);
    assert.equal(GATE_COLS_RIGHT.length, 10);
    assert.deepEqual([...GATE_COLS_LEFT], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual([...GATE_COLS_RIGHT], [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
});

test('units span about 1.5~2 floor tiles like Soul Knight', () => {
    assert.ok(Math.abs(TILE_W - 720 / 22) < 0.01);
    const fishTiles = FISH_DRAW_PX / TILE_W;
    const enemyTiles = ENEMY_DRAW_PX / TILE_W;
    const tankTiles = TANK_DRAW_PX / TILE_W;
    assert.ok(fishTiles >= 1.5 && fishTiles <= 2.0, `fish ${fishTiles.toFixed(2)} tiles`);
    assert.ok(enemyTiles >= 1.5 && enemyTiles <= 2.1, `enemy ${enemyTiles.toFixed(2)} tiles`);
    assert.ok(tankTiles >= 1.8 && tankTiles <= 2.3, `tank ${tankTiles.toFixed(2)} tiles`);
    assert.ok(FISH_DRAW_PX <= ENEMY_DRAW_PX);
    assert.ok(ENEMY_DRAW_PX < TANK_DRAW_PX);
});

test('presentation draws crates and keeps command ids unique', () => {
    const m = play();
    m.playerY = 6;
    const commands = composeZombieGate(m, { x: 360, y: 850 });
    assert.equal(new Set(commands.map(c => c.id)).size, commands.length);
    assert.ok(commands.some(c => String(c.id).startsWith('crate-')));
    assert.ok(commands.some(c => c.id === 'floor' && c.kind === 'graphicsBatch'));
    assert.ok((commands.find(c => c.id === 'floor').graphicsCommands || []).length >= 12);
    assert.ok(Number.isFinite(laneToX(2)));
    assert.ok(Number.isFinite(worldToScreenY(3, 1)));
});

test('floor rebuilds on row snap only and uses one rect per tile', () => {
    const m = play();
    m.phase = 'playing';
    m.playerY = 10.1;
    const a = composeZombieGate(m, null).find(c => c.id === 'floor');
    m.playerY = 10.9;
    const b = composeZombieGate(m, null).find(c => c.id === 'floor');
    assert.equal(a.floorSnap, b.floorSnap, 'same integer camera row → same floor geometry');
    assert.equal(a.graphicsCommands.length, b.graphicsCommands.length);
    assert.ok(a.scrollY < b.scrollY, 'fractional scroll should increase');
    // ~1 rect/tile (no 4-layer bevels). Visible rows ≈ H/ROW_PX + pad, cols = 22.
    const maxTiles = Math.ceil(1280 / (720 / 22) + 6) * 22;
    assert.ok(a.graphicsCommands.length <= maxTiles, `too many floor cmds: ${a.graphicsCommands.length}`);
    assert.ok(a.graphicsCommands.length > BOARD_COLS * 10, 'expected a full visible floor');
    const snap0 = a.floorSnap;
    m.playerY = 10.1 + 1;
    const c = composeZombieGate(m, null).find(c => c.id === 'floor');
    assert.equal(c.floorSnap, snap0 + 1);
});
