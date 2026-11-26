const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../tools/typescript.cjs').register();
const {
    ZombieGateModel, ZG_RULES, WEAPONS, sideForLane, sideForCol, gateLabel, ENEMY_STATS,
} = require('../assets/scripts/ZombieGateModel.ts');
const { GATE_DEFS, WEAPON_CRATE_DEFS, resolveGateDef } = require('../assets/scripts/ZombieGateConfig.ts');
const {
    composeZombieGate, laneToX, worldToScreenY, laneFromX, BOARD_COLS, BORDER_LEFT, BORDER_RIGHT,
    GATE_COLS_LEFT, GATE_COLS_RIGHT, TILE_W, FISH_DRAW_PX, ENEMY_DRAW_PX, TANK_DRAW_PX,
} = require('../assets/scripts/ZombieGatePresentation.ts');

const play = () => {
    const m = new ZombieGateModel();
    m.start(1, { skipIntro: true });
    return m;
};

const enemy = (partial = {}) => ({
    id: 1, lane: 2, displayLane: 2, y: 4, ox: 0,
    bobX: 0, bobY: 0, hopT: 0, pauseTimer: 1,
    fromBobX: 0, fromBobY: 0, toBobX: 0, toBobY: 0,
    hp: 3, maxHp: 3, touchCost: 1, speed: 1.5,
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

test('start plays intro burst then enters playing without moving yet', () => {
    const { buildIntroBurstPixels } = require('../assets/scripts/ZombieGatePresentation.ts');
    const m = new ZombieGateModel();
    m.start();
    assert.equal(m.phase, 'intro');
    m.seedIntroBurst(buildIntroBurstPixels());
    assert.ok(m.burstPixels.length >= 40);
    const y0 = m.playerY;
    m.tick(0.05);
    assert.equal(m.playerY, y0);
    assert.equal(m.phase, 'intro');
    for (let i = 0; i < 30; i++) m.tick(0.05);
    assert.equal(m.phase, 'playing');
    assert.equal(m.burstPixels.length, 0);
});

test('first gate and enemy sit far ahead so they scroll in from the top', () => {
    const { LEVEL_LEAD_IN } = require('../assets/scripts/ZombieGateLevel.ts');
    const m = play();
    const firstGate = Math.min(...m.gates.map(g => g.row));
    const firstEnemy = Math.min(...m.enemies.map(e => e.y));
    assert.ok(firstGate >= LEVEL_LEAD_IN + 4, `gate ${firstGate}`);
    assert.ok(firstEnemy >= LEVEL_LEAD_IN + 4, `enemy ${firstEnemy}`);
    assert.ok(LEVEL_LEAD_IN >= 30, 'lead-in should clear the opening viewport');
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

test('lane shifts move exactly one floor tile and clamp', () => {
    const m = play();
    assert.equal(m.playerCol, ZG_RULES.centerCol);
    m.shiftLane(-1);
    assert.equal(m.playerCol, ZG_RULES.centerCol - 1);
    m.setLane(99);
    assert.equal(m.playerCol, ZG_RULES.playableLastCol);
    m.setLane(0);
    assert.equal(m.playerCol, ZG_RULES.playableFirstCol);
});

test('displayCol eases toward the column after a discrete shift', () => {
    const m = play();
    const from = m.playerCol;
    m.shiftLane(-1);
    assert.equal(m.playerCol, from - 1);
    assert.equal(m.displayCol, from);
    m.tick(0.02);
    assert.ok(m.displayCol < from && m.displayCol > from - 1);
    for (let i = 0; i < 40; i++) m.tick(0.05);
    assert.ok(Math.abs(m.displayCol - (from - 1)) < 1e-6);
});

test('sideForLane splits evenly for equal-width gates', () => {
    assert.equal(sideForLane(0), 'left');
    assert.equal(sideForLane(1), 'left');
    assert.equal(sideForLane(2), 'right');
    assert.equal(sideForLane(4), 'right');
    assert.equal(ZG_RULES.leftLaneMax, 1);
    assert.equal(sideForCol(10), 'left');
    assert.equal(sideForCol(11), 'right');
});

test('add and sub gates change the squad with caps', () => {
    const m = play();
    m.enemies = [];
    m.weaponCrates = [];
    m.gates = [
        gate({ id: 1, row: 1, side: 'left', defId: 'add3' }),
        gate({ id: 2, row: 1, side: 'right', defId: 'sub2' }),
    ];
    m.playerCol = 2;
    m.playerY = 0.99;
    m.tick(0.02);
    assert.equal(m.unitCount, 4); // 1 + 3

    m.gates = [
        gate({ id: 3, row: 2, side: 'left', defId: 'sub5' }),
        gate({ id: 4, row: 2, side: 'right', defId: 'add2' }),
    ];
    m.unitCount = 8;
    m.playerCol = 2;
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
    m.playerCol = 14;
    m.playerY = 0.99;
    m.tick(0.02);
    assert.equal(m.unitCount, 5);

    m.gates = [
        gate({ id: 3, row: 2, side: 'left', defId: 'mul2' }),
        gate({ id: 4, row: 2, side: 'right', defId: 'sub1' }),
    ];
    m.playerCol = 2;
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

test('fly-mouse density ramps with progress and respects difficulty', () => {
    const {
        generateEnemyRows, evaluateEnemyPlan, densityAt, ENEMY_GEN,
    } = require('../assets/scripts/ZombieGateLevel.ts');
    assert.ok(densityAt(0.1, 1) < densityAt(0.7, 1));
    const plan = evaluateEnemyPlan(generateEnemyRows({ difficulty: 1, seed: ENEMY_GEN.seed }));
    assert.ok(plan.early < plan.late, `early ${plan.early} should be < late ${plan.late}`);
    assert.ok(plan.total >= 24 && plan.total <= 75, `total ${plan.total}`);
    assert.ok(plan.maxPack <= 10);
    const easy = evaluateEnemyPlan(generateEnemyRows({ difficulty: 0.7, seed: 7 }));
    const hard = evaluateEnemyPlan(generateEnemyRows({ difficulty: 1.35, seed: 7 }));
    assert.ok(hard.total > easy.total, `hard ${hard.total} vs easy ${easy.total}`);

    const m = play();
    assert.ok(m.enemies.length >= 28, `spawned ${m.enemies.length}`);
    const first = Math.min(...m.enemies.map(e => e.y));
    const last = Math.max(...m.enemies.map(e => e.y));
    const early = m.enemies.filter(e => (e.y - first) / (last - first + 1e-6) < 0.25).length;
    const late = m.enemies.filter(e => (e.y - first) / (last - first + 1e-6) >= 0.55).length;
    assert.ok(early < late, `runtime early ${early} vs late ${late}`);
});

test('idle fly-mice hop then pause instead of buzzing', () => {
    const m = play();
    m.gates = [];
    m.weaponCrates = [];
    m.enemies = [
        enemy({ id: 3, kind: 'normal', state: 'idle', y: 20, lane: 0, pauseTimer: 0, hopT: 0 }),
        enemy({ id: 4, kind: 'tank', state: 'idle', y: 20, lane: 4 }),
    ];
    const fly = m.enemies[0];
    const flyY = fly.y;
    m.tick(0.02);
    assert.equal(fly.y, flyY);
    assert.ok(fly.hopT > 0, 'should start a hop after pause ends');
    // Mid-hop should lift via bounce without changing logic y.
    m.tick(0.12);
    assert.ok(fly.hopT > 0);
    assert.ok(fly.bobY > fly.fromBobY || Math.abs(fly.bobX - fly.fromBobX) > 0.001);
    // Finish hop → enter randomized pause, settle at target.
    for (let i = 0; i < 20 && fly.hopT > 0; i++) m.tick(0.05);
    assert.equal(fly.hopT, 0);
    assert.ok(fly.pauseTimer >= ZG_RULES.idlePauseMin);
    const settledX = fly.bobX;
    const settledY = fly.bobY;
    m.tick(0.05);
    assert.equal(fly.bobX, settledX);
    assert.equal(fly.bobY, settledY);
    assert.equal(m.enemies[1].bobX, 0);
    assert.equal(m.enemies[1].bobY, 0);
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

test('gate curve keeps a 1-fish start alive on the optimal path', () => {
    const {
        generateGateRows, evaluateGatePlan, ENEMY_GEN,
    } = require('../assets/scripts/ZombieGateLevel.ts');
    const { resolveGateDef } = require('../assets/scripts/ZombieGateConfig.ts');
    const rows = generateGateRows({
        difficulty: 1,
        seed: ENEMY_GEN.gateSeed,
        startUnits: 1,
    });
    assert.equal(rows.length, 5);
    const plan = evaluateGatePlan(rows, 1);
    assert.ok(plan.minUnits >= 1, `optimal path died: min=${plan.minUnits}`);
    assert.ok(plan.finalUnits >= 3, `expected gentle growth, got ${plan.finalUnits}`);
    assert.ok(plan.doubleBad <= 1, 'double-penalty should be rare / late');
    const first = rows[0];
    const firstDefs = [resolveGateDef(first.left), resolveGateDef(first.right)];
    assert.ok(firstDefs.some(g => g.kind === 'add' && g.value === 1), 'first door offers +1');
    assert.ok(firstDefs.every(g => !(g.kind === 'sub' && g.value >= 2)), 'first door never −2+');
    const mulRows = rows.filter(row => resolveGateDef(row.left).kind === 'mul' || resolveGateDef(row.right).kind === 'mul');
    assert.equal(mulRows.length, 0, '×2 should not appear in early stage');

    const m = play();
    assert.equal(m.gates.length, 10); // 5 rows × 2 sides
});

test('squad uses 品字形 rows: leader on top, then 2, then 3', () => {
    const { squadOffset, squadLayoutBottom } = require('../assets/scripts/ZombieGatePresentation.ts');
    const a = squadOffset(0, 20, 18);
    const b = squadOffset(1, 20, 18);
    const c = squadOffset(2, 20, 18);
    const d = squadOffset(3, 20, 18);
    const e = squadOffset(4, 20, 18);
    const f = squadOffset(5, 20, 18);
    assert.equal(a.ox, 0);
    assert.equal(a.oy, 0);
    assert.equal(b.oy, c.oy);
    assert.ok(b.oy > a.oy, 'second row is below the leader on screen');
    assert.ok(b.ox < 0 && c.ox > 0, 'second row is a pair');
    assert.equal(d.oy, e.oy);
    assert.equal(e.oy, f.oy);
    assert.ok(d.oy > b.oy, 'third row sits further below');
    assert.equal(e.ox, 0, 'third-row middle is centered');
    assert.ok(d.ox < 0 && f.ox > 0);
    assert.equal(squadLayoutBottom(1, 18), 0);
    assert.equal(squadLayoutBottom(3, 18), b.oy);
    assert.equal(squadLayoutBottom(6, 18), d.oy);
    assert.ok(squadLayoutBottom(6, 18) > squadLayoutBottom(3, 18));
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
    m.playerCol = ZG_RULES.centerCol;
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
    // Crates sit after LEVEL_LEAD_IN — stand near the first crate so it is on-screen.
    m.playerY = Math.max(0, m.weaponCrates[0].y - 4);
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
    // Keep both samples inside the same camera integer row.
    m.playerY = 9.4;
    const a = composeZombieGate(m, null).find(c => c.id === 'floor');
    m.playerY = 9.85;
    const b = composeZombieGate(m, null).find(c => c.id === 'floor');
    assert.equal(a.floorSnap, b.floorSnap, 'same integer camera row → same floor geometry');
    assert.equal(a.graphicsCommands.length, b.graphicsCommands.length);
    assert.ok(a.scrollY < b.scrollY, 'fractional scroll should increase');
    // ~1 rect/tile (no 4-layer bevels). Visible rows ≈ H/ROW_PX + pad, cols = 22.
    const maxTiles = Math.ceil(1280 / (720 / 22) + 6) * 22;
    assert.ok(a.graphicsCommands.length <= maxTiles, `too many floor cmds: ${a.graphicsCommands.length}`);
    assert.ok(a.graphicsCommands.length > BOARD_COLS * 10, 'expected a full visible floor');
    const snap0 = a.floorSnap;
    m.playerY = 9.4 + 1;
    const c = composeZombieGate(m, null).find(c => c.id === 'floor');
    assert.equal(c.floorSnap, snap0 + 1);
});
