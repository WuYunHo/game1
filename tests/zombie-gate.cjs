const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../tools/typescript.cjs').register();
const {
    ZombieGateModel, ZG_RULES, WEAPONS, sideForLane, gateLabel, ENEMY_STATS,
} = require('../assets/scripts/ZombieGateModel.ts');
const { GATE_DEFS, WEAPON_CRATE_DEFS, resolveGateDef } = require('../assets/scripts/ZombieGateConfig.ts');
const {
    composeZombieGate, laneToX, worldToScreenY, laneFromX, BOARD_COLS, BORDER_LEFT, BORDER_RIGHT,
} = require('../assets/scripts/ZombieGatePresentation.ts');

const play = () => {
    const m = new ZombieGateModel();
    m.start();
    return m;
};

const enemy = (partial = {}) => ({
    id: 1, lane: 2, displayLane: 2, y: 4, hp: 3, maxHp: 3, touchCost: 1, speed: 1.5,
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

test('sideForLane uses leftLaneMax inclusive', () => {
    assert.equal(sideForLane(0), 'left');
    assert.equal(sideForLane(2), 'left');
    assert.equal(sideForLane(3), 'right');
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

test('destroying a weapon crate claims its weapon tier', () => {
    const m = play();
    m.gates = [];
    m.enemies = [];
    m.weaponTier = 0;
    m.weaponCrates = [{
        id: 9, lane: 2, y: 2, hp: 2, maxHp: 20, tier: 1, hitFlash: 0, claimed: false,
    }];
    m.unitCount = 5;
    m.fireCooldown = 0;
    m.playerY = 0;
    m.tick(0.02); // chips 1 (pellets=1 per target)
    assert.equal(m.weaponCrates[0].hp, 1);
    m.fireCooldown = 0;
    m.tick(0.02);
    assert.equal(m.weaponCrates.length, 0);
    assert.equal(m.weaponTier, 1);
    assert.equal(m.weapon.name, WEAPONS[1].name);
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

test('board is 12 cols with side borders and fills screen mapping', () => {
    assert.equal(BOARD_COLS, 12);
    assert.equal(BORDER_LEFT, 0);
    assert.equal(BORDER_RIGHT, 11);
    assert.equal(laneFromX(0), 0);
    assert.equal(laneFromX(719), 4);
    assert.ok(laneToX(0) > 60); // inside playable, not on left border
    assert.ok(laneToX(4) < 660);
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
