/** Canvas/Cocos-agnostic draw commands for the grid early-combat mode. */
import {
    ZombieGateModel, ZG_RULES, WEAPONS, sideForCol,
    type BurstPixel, type GateEntity, type EnemyEntity, type WeaponCrateEntity, type Feedback, type ShotEvent,
} from './ZombieGateModel';
import {
    LB_UI, leaderboardButtonHit, leaderboardCloseHit, leaderboardPanelCenter,
    type LeaderboardRowView,
} from './LeaderboardUi';

export type { LeaderboardRowView };
export { leaderboardButtonHit, leaderboardCloseHit };

export type DrawCommand = {
    id: string;
    kind: 'rect' | 'ellipse' | 'text' | 'line' | 'image' | 'graphicsBatch';
    x?: number; y?: number; w?: number; h?: number;
    x2?: number; y2?: number;
    fill?: string; stroke?: string; line?: number;
    text?: string; size?: number; bold?: boolean;
    radius?: number; asset?: string; alpha?: number;
    graphicsCommands?: DrawCommand[];
    /** Floor: integer camera row used to build geometry (rebuild only when this changes). */
    floorSnap?: number;
    /** Floor: fractional scroll in screen px; move node, do not redraw Graphics. */
    scrollY?: number;
};

/** Design width stays 720 (FIXED_WIDTH). Height follows the real visible area. */
export const W = 720;
let H = 1280;
/**
 * Denser Soul Knight-like floor: more / smaller tiles.
 * 22 cols = borders + 5 lanes × 4 tiles (playable 1..20).
 */
export const BOARD_COLS = 22;
export const BORDER_LEFT = 0;
export const BORDER_RIGHT = BOARD_COLS - 1;
/** Playable columns 1..20 → 5 logical lanes × 4 tiles. */
export const TILES_PER_LANE = 4;
export const PLAYABLE_FIRST_COL = 1;
/** Soft seams — Soul Knight floors are quiet, not high-contrast outlines. */
const CELL_GAP = 1;
export const TILE_W = W / BOARD_COLS;
/** Square tiles so the checkerboard can fill the screen edge-to-edge. */
export const ROW_PX = TILE_W;
const LANE_W = TILE_W * TILES_PER_LANE;
const CELL_W = LANE_W - CELL_GAP;
const GATE_H = Math.max(12, (ROW_PX - CELL_GAP) * 0.55);
/**
 * Character ≈ 1.5~2 tiles (Soul Knight: unit covers ~2×2 small floor cells).
 * Tile ≈ 32.7px → fish ~1.75, fly ~1.85, tank ~2.1 tiles.
 */
export const FISH_DRAW_PX = 56;
export const ENEMY_DRAW_PX = 60;
export const TANK_DRAW_PX = 68;
/** Equal-width gates: 10 playable tiles each. */
export const GATE_COLS_LEFT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const GATE_COLS_RIGHT = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;
const GATE_TILES = GATE_COLS_LEFT.length;

export function getPlayHeight(): number { return H; }
export function getPlayCenterY(): number { return H * 0.5; }
/** Call when canvas visible size changes (FIXED_WIDTH → height varies). */
export function setPlayHeight(height: number) {
    const next = Math.max(960, Math.round(height));
    if (next === H) return;
    H = next;
    floorCacheSnap = Number.NaN;
    floorCacheCmds = [];
    floorCacheH = 0;
}

/** Lower on screen (closer to device bottom) — Soul Knight-style fight lane. */
function playerScreenY(): number { return H * 0.84; }
function visibleRows(): number { return Math.ceil(H / ROW_PX) + 2; }

export function colToX(col: number): number {
    return (col + 0.5) * TILE_W;
}

/** Logical lane 0..4 → center X inside that lane's tile span. */
export function laneToX(lane: number): number {
    const firstCol = PLAYABLE_FIRST_COL + lane * TILES_PER_LANE;
    return (firstCol + TILES_PER_LANE * 0.5) * TILE_W;
}

/** Pointer X → playable floor column (1 tile per step). */
export function colFromX(x: number): number {
    const col = Math.floor(x / TILE_W);
    return Math.max(PLAYABLE_FIRST_COL, Math.min(BORDER_RIGHT - 1, col));
}

/** @deprecated Prefer colFromX — kept for older tests that speak in lanes. */
export function laneFromX(x: number): number {
    const col = colFromX(x);
    return Math.max(0, Math.min(ZG_RULES.laneCount - 1, Math.floor((col - PLAYABLE_FIRST_COL) / TILES_PER_LANE)));
}

export function worldToScreenY(worldY: number, cameraY: number): number {
    return H - (worldY - cameraY) * ROW_PX;
}

export function cameraForPlayer(playerY: number): number {
    return playerY - (H - playerScreenY()) / ROW_PX;
}

/** Cached floor geometry — avoid reallocating ~900 rect cmds every frame. */
let floorCacheSnap = Number.NaN;
let floorCacheH = 0;
let floorCacheCmds: DrawCommand[] = [];

function buildFloorTiles(floorSnap: number): DrawCommand[] {
    if (floorSnap === floorCacheSnap && floorCacheH === H && floorCacheCmds.length > 0) return floorCacheCmds;
    const floorByFill = new Map<string, DrawCommand[]>();
    const pushFloor = (id: string, x: number, y: number, w: number, h: number, fill: string) => {
        let bucket = floorByFill.get(fill);
        if (!bucket) {
            bucket = [];
            floorByFill.set(fill, bucket);
        }
        bucket.push({ id, kind: 'rect', x, y, w, h, radius: 0, fill });
    };
    // Cover full viewport including negative world rows (early game / tall FIXED_WIDTH).
    const rowStart = floorSnap - 2;
    const rowEnd = floorSnap + visibleRows() + 1;
    const tw = TILE_W - CELL_GAP;
    const th = ROW_PX - CELL_GAP;
    for (let row = rowStart; row <= rowEnd; row++) {
        const y = worldToScreenY(row, floorSnap);
        if (y < -ROW_PX || y > H + ROW_PX) continue;
        for (let col = 0; col < BOARD_COLS; col++) {
            const isBorder = col === BORDER_LEFT || col === BORDER_RIGHT;
            const dark = (row + col) % 2 === 0;
            // Quiet stone — tiny contrast, no hard outline look.
            const fill = isBorder
                ? (dark ? '#121820' : '#151c24')
                : (dark ? '#3a4a56' : '#3e4e5a');
            pushFloor(`f-${row}-${col}`, colToX(col), y, tw, th, fill);
        }
    }
    const floorTiles: DrawCommand[] = [];
    for (const bucket of floorByFill.values()) floorTiles.push(...bucket);
    floorCacheSnap = floorSnap;
    floorCacheH = H;
    floorCacheCmds = floorTiles;
    return floorTiles;
}

/** Start-button hit box in top-left UI coords (y grows downward). */
export function startButtonHit(): { x0: number; x1: number; y0: number; y1: number; cx: number; cy: number } {
    const cy = Math.round(H * 0.668);
    return { x0: 180, x1: 540, y0: cy - 43, y1: cy + 43, cx: W / 2, cy };
}

export type LeaderboardViewState = {
    open: boolean;
    rows: LeaderboardRowView[];
};

export function composeZombieGate(
    model: ZombieGateModel,
    hover: { x: number; y: number } | null = null,
    leaderboard: LeaderboardViewState = { open: false, rows: [] },
): DrawCommand[] {
    const cmds: DrawCommand[] = [];
    const cameraY = cameraForPlayer(model.playerY);
    const playerSide = sideForCol(model.playerCol);

    // Floor = 1 Graphics node; rebuild only when floorSnap changes (cached).
    const floorSnap = Math.floor(cameraY);
    const scrollY = (cameraY - floorSnap) * ROW_PX;
    cmds.push({
        id: 'floor',
        kind: 'graphicsBatch',
        x: W / 2, y: H / 2, w: W, h: H,
        floorSnap,
        scrollY,
        graphicsCommands: buildFloorTiles(floorSnap),
    });

    for (const gate of model.gates) drawGate(cmds, gate, cameraY, model, playerSide);
    for (const crate of model.weaponCrates) drawWeaponCrate(cmds, crate, cameraY);
    for (const enemy of model.enemies) drawEnemy(cmds, enemy, cameraY);

    for (const shot of model.shots) drawShot(cmds, shot, cameraY, model);
    for (const muzzle of model.muzzles) {
        const t = muzzle.life / muzzle.maxLife;
        const weapon = WEAPONS[muzzle.tier] ?? WEAPONS[0];
        const size = 18 + muzzle.tier * 10;
        cmds.push({
            id: `muzzle-${muzzle.id}`, kind: 'ellipse',
            x: colToX(muzzle.col), y: worldToScreenY(muzzle.y, cameraY),
            w: size * (1.2 - t * 0.4), h: size * (0.9 - t * 0.3),
            fill: weapon.color, alpha: 0.35 + t * 0.55,
        });
    }

    drawSquad(cmds, model, cameraY);

    for (const f of model.feedback) drawFeedback(cmds, f, cameraY);

    drawHud(cmds, model, hover, leaderboard.open);

    if (model.impact > 0) {
        cmds.push({
            id: 'impact', kind: 'rect',
            x: W / 2, y: H / 2, w: W, h: H, fill: '#b42828', alpha: 0.18 * model.impact,
        });
    }

    if (model.phase === 'intro') {
        ensureIntroBurst(model);
        drawIntroBurst(cmds, model);
    } else if (model.phase !== 'playing' && !leaderboard.open) {
        drawPanel(cmds, model, hover);
    }

    if (leaderboard.open) drawLeaderboard(cmds, leaderboard.rows, hover);

    return cmds;
}

/** Shatter the start plaque + CTA into chunky pixels (once per intro). */
export function buildIntroBurstPixels(): Omit<BurstPixel, 'id'>[] {
    const btn = startButtonHit();
    const panelY = Math.round(H * 0.594);
    const colors = ['#3a2a1c', '#8a6a48', '#241810', '#fff6e8', '#2a7f94', '#3aa0b8', '#7fd0e0', '#c8b090', '#141414'];
    const pixels: Omit<BurstPixel, 'id'>[] = [];
    const pushBlock = (cx: number, cy: number, bw: number, bh: number, count: number, speed: number) => {
        for (let i = 0; i < count; i++) {
            const px = cx + (Math.random() - 0.5) * bw;
            const py = cy + (Math.random() - 0.5) * bh;
            const ang = Math.random() * Math.PI * 2;
            const spd = speed * (0.55 + Math.random() * 0.9);
            const life = 0.35 + Math.random() * 0.45;
            pixels.push({
                x: px,
                y: py,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 120 - Math.random() * 220,
                life,
                maxLife: life,
                size: 4 + Math.floor(Math.random() * 8),
                fill: colors[Math.floor(Math.random() * colors.length)],
            });
        }
    };
    pushBlock(W / 2, panelY, 480, 190, 42, 420);
    pushBlock(W / 2, btn.cy, 340, 80, 28, 520);
    return pixels;
}

function ensureIntroBurst(model: ZombieGateModel) {
    if (model.burstPixels.length > 0) return;
    model.seedIntroBurst(buildIntroBurstPixels());
}

function drawIntroBurst(cmds: DrawCommand[], model: ZombieGateModel) {
    if (model.burstPixels.length === 0) return;
    const graphicsCommands: DrawCommand[] = [];
    for (const p of model.burstPixels) {
        const t = Math.max(0, p.life / p.maxLife);
        // Shrink slightly as shards fade.
        const s = Math.max(2, p.size * (0.55 + t * 0.45));
        graphicsCommands.push({
            id: `bp-${p.id}`,
            kind: 'rect',
            x: p.x,
            y: p.y,
            w: s,
            h: s,
            fill: p.fill,
            radius: 0,
        });
    }
    cmds.push({
        id: 'introBurst',
        kind: 'graphicsBatch',
        x: W / 2,
        y: H / 2,
        w: W,
        h: H,
        graphicsCommands,
    });
}

function drawGate(
    cmds: DrawCommand[],
    gate: GateEntity,
    cameraY: number,
    model: ZombieGateModel,
    playerSide: 'left' | 'right',
) {
    const y = worldToScreenY(gate.row, cameraY);
    if (y < -60 || y > H + 60) return;
    // Both sides are the same type / footprint (GATE_TILES each).
    const cols = gate.side === 'left' ? GATE_COLS_LEFT : GATE_COLS_RIGHT;
    const approaching = !gate.resolved && gate.row - model.playerY < 5 && gate.row >= model.playerY - 0.2;
    const chosenSide = approaching && gate.side === playerSide;
    const flash = gate.resolveFlash;
    const dim = gate.resolved && flash <= 0;
    const body = dim
        ? '#3a4650'
        : gate.good
            ? (gate.kind === 'mul' ? '#2a6a9c' : '#248a52')
            : (gate.kind === 'div' ? '#7a3560' : '#8e3a3a');
    const hi = dim ? '#4a5660' : (gate.good ? '#5ecf8a' : '#d07070');
    const shade = dim ? '#2a3238' : (gate.good ? '#145a38' : '#5a2020');
    const outline = dim ? '#1a2228'
        : chosenSide ? '#f2f2f2'
            : approaching ? '#c8d8e0' : '#0a1014';
    const brickW = TILE_W - 4;
    const brickH = GATE_H;
    const midX = (colToX(cols[0]) + colToX(cols[cols.length - 1])) / 2;

    const gateW = TILE_W * GATE_TILES - 2;
    // Pixel frame rails (hard edges, no radius).
    cmds.push({
        id: `gate-rail-top-${gate.id}`, kind: 'rect',
        x: midX, y: y - brickH * 0.5 - 3,
        w: gateW, h: 3, fill: outline, radius: 0,
    });
    cmds.push({
        id: `gate-rail-bot-${gate.id}`, kind: 'rect',
        x: midX, y: y + brickH * 0.5 + 3,
        w: gateW, h: 3, fill: outline, radius: 0,
    });

    for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const x = colToX(col);
        const pop = flash > 0 ? 1 + flash * 0.2 : 1;
        const bw = brickW * pop;
        const bh = brickH * pop;
        // Outline block
        cmds.push({
            id: `gate-out-${gate.id}-${col}`, kind: 'rect',
            x, y, w: bw + 4, h: bh + 4, fill: outline, radius: 0,
        });
        // Body
        cmds.push({
            id: `gate-body-${gate.id}-${col}`, kind: 'rect',
            x, y, w: bw, h: bh, fill: body, radius: 0,
        });
        // Top highlight + bottom shade (chunky pixel bevel)
        cmds.push({
            id: `gate-hi-${gate.id}-${col}`, kind: 'rect',
            x, y: y - bh * 0.5 + 2, w: bw - 4, h: 3, fill: hi, radius: 0,
        });
        cmds.push({
            id: `gate-sh-${gate.id}-${col}`, kind: 'rect',
            x, y: y + bh * 0.5 - 2, w: bw - 4, h: 3, fill: shade, radius: 0,
        });
        // Mortar notch between bricks
        if (i < cols.length - 1) {
            cmds.push({
                id: `gate-mortar-${gate.id}-${col}`, kind: 'rect',
                x: x + TILE_W * 0.5 - 1, y, w: 2, h: bh + 2, fill: outline, radius: 0,
            });
        }
    }

    cmds.push({
        id: `gate-label-${gate.id}`, kind: 'text',
        x: midX, y,
        text: gate.label,
        size: flash > 0 ? 24 : 20,
        bold: true,
        fill: '#ffffff',
    });
}

function drawWeaponCrate(cmds: DrawCommand[], crate: WeaponCrateEntity, cameraY: number) {
    const x = laneToX(crate.lane);
    const y = worldToScreenY(crate.y, cameraY);
    if (y < -60 || y > H + 60) return;
    const weapon = WEAPONS[crate.tier] ?? WEAPONS[1];
    const ratio = Math.max(0, crate.hp / crate.maxHp);
    // Gift-box footprint ≈ 1.5 tiles (banner top gifts), hard black outline.
    const box = Math.round(TILE_W * 1.55);
    cmds.push({
        id: `crate-out-${crate.id}`, kind: 'rect',
        x, y, w: box + 6, h: box + 6, fill: '#141414', radius: 0,
    });
    cmds.push({
        id: `crate-${crate.id}`, kind: 'rect',
        x, y, w: box, h: box, fill: '#5a3d8a', radius: 0,
    });
    cmds.push({
        id: `crate-lid-${crate.id}`, kind: 'rect',
        x, y: y - box * 0.28, w: box, h: Math.round(box * 0.28), fill: weapon.color, radius: 0,
    });
    cmds.push({
        id: `crate-ribbon-${crate.id}`, kind: 'rect',
        x, y, w: 6, h: box, fill: '#ffe566', radius: 0,
    });
    pushHudText(cmds, `crate-icon-${crate.id}`, x, y - 4, '枪', 18, '#ffffff');
    cmds.push({
        id: `crate-name-${crate.id}`, kind: 'text',
        x, y: y + 14, text: weapon.name, size: 11, bold: true, fill: '#fff6e8',
    });
    const barW = box - 8;
    cmds.push({
        id: `crate-hpout-${crate.id}`, kind: 'rect',
        x, y: y + box * 0.42, w: barW + 4, h: 8, fill: '#141414', radius: 0,
    });
    cmds.push({
        id: `crate-hpbg-${crate.id}`, kind: 'rect',
        x, y: y + box * 0.42, w: barW, h: 4, fill: '#2a1010', radius: 0,
    });
    if (ratio > 0) {
        cmds.push({
            id: `crate-hp-${crate.id}`, kind: 'rect',
            x: x - barW * 0.5 + (barW * ratio) * 0.5, y: y + box * 0.42, w: barW * ratio, h: 4,
            fill: weapon.color, radius: 0,
        });
    }
    cmds.push({
        id: `crate-hptext-${crate.id}`, kind: 'text',
        x, y: y + box * 0.58, text: `${Math.ceil(crate.hp)}`, size: 11, bold: true, fill: '#fff6e8',
    });
    if (crate.hitFlash > 0) {
        cmds.push({
            id: `crate-flash-${crate.id}`, kind: 'rect',
            x, y, w: box + 2, h: box + 2,
            fill: '#ffffff', alpha: Math.min(0.5, crate.hitFlash * 4), radius: 0,
        });
    }
}

function drawEnemy(cmds: DrawCommand[], enemy: EnemyEntity, cameraY: number) {
    const x = Math.round(laneToX(enemy.displayLane) + (enemy.ox + (enemy.bobX ?? 0)) * LANE_W);
    const y = Math.round(worldToScreenY(enemy.y + (enemy.bobY ?? 0), cameraY));
    if (y < -60 || y > H + 60) return;
    const size = enemy.kind === 'tank' ? TANK_DRAW_PX : ENEMY_DRAW_PX;
    const barW = Math.max(20, size - 4);
    cmds.push({
        id: `enemy-${enemy.id}`, kind: 'image',
        x, y, w: size, h: size, asset: 'squirrel',
    });
    // Hit flash only — soft alpha shadows/flashes split Graphics batches and cost FPS.
    if (enemy.hitFlash > 0.04) {
        cmds.push({
            id: `enemy-flash-${enemy.id}`, kind: 'rect',
            x, y, w: size * 0.9, h: size * 0.9,
            fill: '#ffffff', alpha: Math.min(0.45, enemy.hitFlash * 3), radius: 0,
        });
    }
    if (enemy.state === 'chase') {
        cmds.push({
            id: `aggro-${enemy.id}`, kind: 'text',
            x, y: y - size * 0.55, text: '!', size: 20, bold: true, fill: '#ff6b6b',
        });
    }
    // Skip full HP bars on normals — saves dozens of Graphics nodes per frame.
    if (enemy.kind === 'tank' || enemy.hp < enemy.maxHp) {
        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        cmds.push({
            id: `hpbg-${enemy.id}`, kind: 'rect',
            x, y: y + size * 0.58, w: barW, h: 5, fill: '#2a1010', radius: 0,
        });
        if (ratio > 0) {
            cmds.push({
                id: `hp-${enemy.id}`, kind: 'rect',
                x: x - barW * 0.5 + (barW * ratio) * 0.5, y: y + size * 0.58, w: barW * ratio, h: 5,
                fill: ratio < 0.35 ? '#ff5050' : '#ff9a4d', radius: 0,
            });
        }
    }
}

function drawShot(cmds: DrawCommand[], shot: ShotEvent, cameraY: number, model: ZombieGateModel) {
    const weapon = WEAPONS[shot.tier] ?? WEAPONS[0];
    const t = shot.life / shot.maxLife;
    cmds.push({
        id: `shot-${shot.id}`, kind: 'line',
        x: colToX(shot.fromCol), y: worldToScreenY(shot.fromY, cameraY),
        x2: colToX(shot.toCol), y2: worldToScreenY(shot.toY, cameraY),
        stroke: weapon.color, line: weapon.beam,
        alpha: 0.35 + t * 0.65,
    });
    // Impact spark at target.
    cmds.push({
        id: `spark-${shot.id}`, kind: 'ellipse',
        x: colToX(shot.toCol), y: worldToScreenY(shot.toY, cameraY),
        w: 10 + shot.tier * 6, h: 10 + shot.tier * 6,
        fill: weapon.color, alpha: t * 0.8,
    });
    void model;
}

/**
 * 品字形：头鱼在最上（第一排），往下每排多 1 只（1 / 2 / 3 / 3…），居中对齐。
 * screen y 向下增大，所以后排用正 oy。
 */
export function squadOffset(index: number, stackX: number, stackY: number): { ox: number; oy: number } {
    let remaining = Math.max(0, index);
    let row = 0;
    while (true) {
        const cols = Math.min(row + 1, 3);
        if (remaining < cols) {
            return {
                ox: (remaining - (cols - 1) * 0.5) * stackX,
                oy: row * stackY,
            };
        }
        remaining -= cols;
        row++;
    }
}

/** Bottom of the 品字形 stack relative to the leader (positive = below). */
export function squadLayoutBottom(count: number, stackY: number): number {
    const n = Math.max(0, Math.floor(count));
    if (n <= 0) return 0;
    return squadOffset(n - 1, 1, stackY).oy;
}

function drawSquad(cmds: DrawCommand[], model: ZombieGateModel, cameraY: number) {
    const x = colToX(model.displayCol);
    const y = worldToScreenY(model.playerY, cameraY);
    const visual = Math.min(model.unitCount, 8);
    const weapon = model.weapon;
    const size = FISH_DRAW_PX;
    const stackX = Math.round(size * 0.38);
    const stackY = Math.round(size * 0.34);
    // Anchor foot + weapon pips under the whole formation, not under the leader alone.
    const stackBottom = squadLayoutBottom(visual, stackY);
    const footY = y + stackBottom + size * 0.42;
    const pipY = footY + 22;

    for (let i = 0; i < visual; i++) {
        const { ox, oy } = squadOffset(i, stackX, stackY);
        cmds.push({
            id: `unit-${i}`, kind: 'image',
            x: Math.round(x + ox), y: Math.round(y + oy), w: size, h: size, asset: 'fish',
        });
    }
    if (model.unitCount > 8) {
        cmds.push({
            id: 'unit-more', kind: 'text',
            x: x + size * 0.75, y: y - size * 0.7, text: `×${model.unitCount}`, size: 16, bold: true, fill: weapon.color,
        });
    }

    // Opaque foot disc sits under the rear row.
    cmds.push({
        id: 'squad-pad-out', kind: 'ellipse',
        x, y: footY, w: TILE_W * 1.15, h: 14, fill: '#141414',
    });
    cmds.push({
        id: 'squad-pad', kind: 'ellipse',
        x, y: footY, w: TILE_W * 1.0, h: 10, fill: '#e8c84a',
    });

    // Weapon pips always below the fish stack.
    for (let t = 0; t <= ZG_RULES.maxWeaponTier; t++) {
        const on = t <= model.weaponTier;
        const px = x - 34 + t * 34;
        pushPixelRing(cmds, `wpip-${t}`, px, pipY, 28, on ? (WEAPONS[t]?.color ?? '#ffe566') : '#6a6a6a', on);
    }
}

/** Soul Knight UI: hard black outline plaque (no rounded app chrome). */
function pushPixelPlaque(
    cmds: DrawCommand[],
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    hi = '#6a7a88',
) {
    cmds.push({
        id: `${id}-out`, kind: 'rect',
        x, y, w: w + 6, h: h + 6, fill: '#141414', radius: 0,
    });
    cmds.push({
        id: `${id}-body`, kind: 'rect',
        x, y, w, h, fill, radius: 0,
    });
    cmds.push({
        id: `${id}-hi`, kind: 'rect',
        x, y: y - h * 0.5 + 2, w: w - 4, h: 3, fill: hi, radius: 0,
    });
}

/** Circular skill button: opaque only (alpha would split Graphics batches). */
function pushPixelRing(
    cmds: DrawCommand[],
    id: string,
    x: number,
    y: number,
    size: number,
    accent: string,
    lit: boolean,
) {
    cmds.push({
        id: `${id}-out`, kind: 'ellipse',
        x, y, w: size + 6, h: size + 6, fill: '#141414',
    });
    cmds.push({
        id: `${id}-disk`, kind: 'ellipse',
        x, y, w: size, h: size, fill: lit ? accent : '#3a3a3a',
    });
}

/** Plaques already have black chrome — one Label is enough (9× outline killed FPS). */
function pushHudText(
    cmds: DrawCommand[],
    id: string,
    x: number,
    y: number,
    text: string,
    size: number,
    fill: string,
) {
    cmds.push({ id, kind: 'text', x, y, text, size, bold: true, fill });
}

function drawFeedback(cmds: DrawCommand[], f: Feedback, cameraY: number) {
    const t = f.life / f.maxLife;
    const rise = (1 - t) * (f.kind === 'damage' ? 36 : f.kind === 'gate' ? 28 : 20);
    const size = f.kind === 'damage' ? 22 : f.kind === 'gate' ? 28 : 24;
    const fill = f.kind === 'damage' ? '#ffe566'
        : f.good ? '#9dffb0' : '#ff8f8f';
    const x = colToX(f.col);
    const y = worldToScreenY(f.y, cameraY) - 28 - rise;
    const alpha = Math.min(1, t * 1.4);
    // Single shadow offset, not 8-way outline (Label storm).
    cmds.push({
        id: `fb-${f.id}-s`, kind: 'text',
        x: x + 2, y: y + 2, text: f.text, size, bold: true, fill: '#141414', alpha,
    });
    cmds.push({
        id: `fb-${f.id}`, kind: 'text',
        x, y, text: f.text, size, bold: true, fill, alpha,
    });
}

function drawHud(
    cmds: DrawCommand[],
    model: ZombieGateModel,
    hover: { x: number; y: number } | null,
    boardOpen: boolean,
) {
    const weapon = model.weapon;
    // Segmented top UI + leaderboard entry (SK plaques, not rounded pills).
    pushPixelPlaque(cmds, 'hudUnits', 108, 48, 150, 52, '#2b3540', '#7a8894');
    pushHudText(cmds, 'hudUnitsText', 108, 48, `人数 ${model.unitCount}`, 22, '#fff6e8');

    pushPixelPlaque(cmds, 'hudWeapon', 320, 48, 200, 52, '#243038', weapon.color);
    pushHudText(cmds, 'hudWeaponName', 320, 36, weapon.name, 20, weapon.color);
    cmds.push({
        id: 'hudWeaponMeta', kind: 'text',
        x: 320, y: 58, text: `伤${weapon.damage} 弹${weapon.pellets}`, size: 13, bold: true, fill: '#d8e4ec',
    });

    pushPixelPlaque(cmds, 'hudTime', 520, 48, 120, 52, '#2b3540', '#7a8894');
    pushHudText(cmds, 'hudTimeText', 520, 48, `${Math.ceil(model.timeLeft)}s`, 22, '#b4ebf4');

    const boardBtn = leaderboardButtonHit();
    const boardHot = !!(hover && hover.x >= boardBtn.x0 && hover.x <= boardBtn.x1
        && hover.y >= boardBtn.y0 && hover.y <= boardBtn.y1);
    pushPixelPlaque(
        cmds,
        'hudBoard',
        boardBtn.cx,
        boardBtn.cy,
        boardHot || boardOpen ? LB_UI.buttonW + 6 : LB_UI.buttonW,
        boardHot || boardOpen ? LB_UI.buttonH + 4 : LB_UI.buttonH,
        boardOpen ? '#2a7f94' : '#2b3540',
        boardHot ? '#7fd0e0' : '#7a8894',
    );
    pushHudText(cmds, 'hudBoardText', boardBtn.cx, boardBtn.cy, '排行', 18, '#fff6e8');

    // Chunky outlined progress rail.
    const progress = Math.min(1, model.elapsed / ZG_RULES.duration);
    cmds.push({
        id: 'hudProgressOut', kind: 'rect',
        x: W / 2, y: 92, w: 644, h: 14, fill: '#141414', radius: 0,
    });
    cmds.push({
        id: 'hudProgressBg', kind: 'rect',
        x: W / 2, y: 92, w: 636, h: 8, fill: '#1a242c', radius: 0,
    });
    if (progress > 0) {
        cmds.push({
            id: 'hudProgress', kind: 'rect',
            x: 42 + 318 * progress, y: 92, w: Math.max(4, 636 * progress), h: 8,
            fill: weapon.color, radius: 0,
        });
    }

    pushPixelPlaque(cmds, 'hudScore', W / 2, H - 40, 360, 40, '#2b3540', '#7a8894');
    pushHudText(cmds, 'hudScoreText', W / 2, H - 40, `得分 ${model.score} · 击破 ${model.kills}`, 18, '#fff6e8');
}

function drawPanel(
    cmds: DrawCommand[],
    model: ZombieGateModel,
    hover: { x: number; y: number } | null,
) {
    const btn = startButtonHit();
    const panelY = Math.round(H * 0.594);
    // Wooden / dungeon plaque frame (SK difficulty sign vibe).
    pushPixelPlaque(cmds, 'panel', W / 2, panelY, 500, 210, '#3a2a1c', '#8a6a48');
    cmds.push({
        id: 'panelInner', kind: 'rect',
        x: W / 2, y: panelY, w: 470, h: 180, fill: '#241810', radius: 0,
    });
    const title = model.phase === 'ready' ? '向僵尸开炮 · 前期'
        : model.phase === 'won' ? '前线守住！' : '鱼群覆灭';
    const sub = model.phase === 'ready'
        ? '格子换道 · 过门成长 · 自动射击'
        : `得分 ${model.score}  人数峰值 ${model.peakUnits}`;
    pushHudText(cmds, 'title', W / 2, panelY - 50, title, 34, '#fff6e8');
    cmds.push({ id: 'sub', kind: 'text', x: W / 2, y: panelY - 2, text: sub, size: 18, bold: true, fill: '#c8b090' });

    const hot = !!(hover && hover.x >= btn.x0 && hover.x <= btn.x1 && hover.y >= btn.y0 && hover.y <= btn.y1);
    const btnFill = hot ? '#3aa0b8' : '#2a7f94';
    // Chunky CTA with black outline (not rounded pill).
    cmds.push({
        id: 'buttonOut', kind: 'rect',
        x: W / 2, y: btn.cy, w: 366, h: 92, fill: '#141414', radius: 0,
    });
    cmds.push({
        id: 'button', kind: 'rect',
        x: W / 2, y: btn.cy, w: 354, h: 80, fill: btnFill, radius: 0,
    });
    cmds.push({
        id: 'buttonHi', kind: 'rect',
        x: W / 2, y: btn.cy - 34, w: 340, h: 4, fill: '#7fd0e0', radius: 0,
    });
    pushHudText(
        cmds,
        'buttonText',
        W / 2,
        btn.cy,
        model.phase === 'ready' ? '开始战斗' : model.phase === 'won' ? '再来一局' : '重新挑战',
        30,
        '#ffffff',
    );
}

/** Friend board modal — same SK plaque language as HUD / start panel. */
function drawLeaderboard(
    cmds: DrawCommand[],
    rows: LeaderboardRowView[],
    hover: { x: number; y: number } | null,
) {
    const { x, y } = leaderboardPanelCenter(H);
    cmds.push({
        id: 'lbScrim', kind: 'rect',
        x: W / 2, y: H / 2, w: W, h: H, fill: '#0a1218', alpha: 0.55, radius: 0,
    });
    pushPixelPlaque(cmds, 'lbPanel', x, y, LB_UI.panelW, LB_UI.panelH, '#1a242c', '#6a7a88');
    cmds.push({
        id: 'lbInner', kind: 'rect',
        x, y, w: LB_UI.panelW - 28, h: LB_UI.panelH - 28, fill: '#121820', radius: 0,
    });
    pushHudText(cmds, 'lbTitle', x, y + LB_UI.titleOffsetY, '好友排行榜', 30, '#fff6e8');
    cmds.push({
        id: 'lbSub', kind: 'text',
        x, y: y + LB_UI.titleOffsetY + 34, text: '微信好友 · 最高分', size: 16, bold: true, fill: '#8a9aa4',
    });

    const list = rows.slice(0, LB_UI.maxRows);
    if (list.length === 0) {
        pushHudText(cmds, 'lbEmpty', x, y, '暂无好友数据', 20, '#7a8894');
    } else {
        list.forEach((row, index) => {
            const ry = y + LB_UI.listStartOffsetY + index * LB_UI.rowGap;
            const fill = row.self ? '#243840' : '#1c2830';
            const hi = row.self ? '#3aa0b8' : '#4a5a64';
            pushPixelPlaque(cmds, `lbRow${index}`, x, ry, LB_UI.rowW, LB_UI.rowH, fill, hi);
            pushHudText(
                cmds,
                `lbRank${index}`,
                x - 170,
                ry,
                `${index + 1}`,
                20,
                row.self ? '#7fd0e0' : '#c8d0d8',
            );
            pushHudText(
                cmds,
                `lbName${index}`,
                x - 40,
                ry,
                row.name,
                18,
                row.self ? '#fff6e8' : '#d8e4ec',
            );
            pushHudText(
                cmds,
                `lbScore${index}`,
                x + 160,
                ry,
                String(row.score),
                20,
                row.self ? '#ffe566' : '#fff6e8',
            );
        });
    }

    const close = leaderboardCloseHit(H);
    const hot = !!(hover && hover.x >= close.x0 && hover.x <= close.x1
        && hover.y >= close.y0 && hover.y <= close.y1);
    cmds.push({
        id: 'lbCloseOut', kind: 'rect',
        x: close.cx, y: close.cy, w: LB_UI.closeW + 8, h: LB_UI.closeH + 8, fill: '#141414', radius: 0,
    });
    cmds.push({
        id: 'lbClose', kind: 'rect',
        x: close.cx, y: close.cy, w: LB_UI.closeW, h: LB_UI.closeH, fill: hot ? '#3aa0b8' : '#2a7f94', radius: 0,
    });
    cmds.push({
        id: 'lbCloseHi', kind: 'rect',
        x: close.cx, y: close.cy - 30, w: LB_UI.closeW - 16, h: 4, fill: '#7fd0e0', radius: 0,
    });
    pushHudText(cmds, 'lbCloseText', close.cx, close.cy, '关闭', 26, '#ffffff');
}
