/** Canvas/Cocos-agnostic draw commands for the grid early-combat mode. */
import {
    ZombieGateModel, ZG_RULES, WEAPONS, sideForLane,
    type GateEntity, type EnemyEntity, type WeaponCrateEntity, type Feedback, type ShotEvent,
} from './ZombieGateModel';

export type DrawCommand = {
    id: string;
    kind: 'rect' | 'ellipse' | 'text' | 'line' | 'image' | 'graphicsBatch';
    x?: number; y?: number; w?: number; h?: number;
    x2?: number; y2?: number;
    fill?: string; stroke?: string; line?: number;
    text?: string; size?: number; bold?: boolean;
    radius?: number; asset?: string; alpha?: number;
    graphicsCommands?: DrawCommand[];
};

const W = 720;
const H = 1280;
/** Full-bleed board: 12 columns fill the screen; col 0 / 11 are side borders. */
export const BOARD_COLS = 12;
export const BORDER_LEFT = 0;
export const BORDER_RIGHT = BOARD_COLS - 1;
/** Playable columns 1..10 → 5 logical lanes × 2 tiles. */
export const TILES_PER_LANE = 2;
export const PLAYABLE_FIRST_COL = 1;
const CELL_GAP = 2;
const TILE_W = W / BOARD_COLS;
/** Square tiles so the checkerboard can fill the screen edge-to-edge. */
const ROW_PX = TILE_W;
const LANE_W = TILE_W * TILES_PER_LANE;
const CELL_W = LANE_W - CELL_GAP;
const GATE_H = Math.max(14, (ROW_PX - CELL_GAP) * 0.5);
/** Equal-width gates: 5 playable tiles each (same type / footprint). */
export const GATE_COLS_LEFT = [1, 2, 3, 4, 5] as const;
export const GATE_COLS_RIGHT = [6, 7, 8, 9, 10] as const;
/** Player sits near lower third; camera scrolls the full-height board. */
const PLAYER_SCREEN_Y = H * 0.72;
const VISIBLE_ROWS = Math.ceil(H / ROW_PX) + 2;

export function colToX(col: number): number {
    return (col + 0.5) * TILE_W;
}

/** Logical lane 0..4 → center X inside playable columns 1..10. */
export function laneToX(lane: number): number {
    const firstCol = PLAYABLE_FIRST_COL + lane * TILES_PER_LANE;
    return (firstCol + 1) * TILE_W;
}

export function laneFromX(x: number): number {
    const col = Math.floor(x / TILE_W);
    const playable = Math.max(PLAYABLE_FIRST_COL, Math.min(BORDER_RIGHT - 1, col));
    return Math.max(0, Math.min(ZG_RULES.laneCount - 1, Math.floor((playable - PLAYABLE_FIRST_COL) / TILES_PER_LANE)));
}

export function worldToScreenY(worldY: number, cameraY: number): number {
    return H - (worldY - cameraY) * ROW_PX;
}

export function cameraForPlayer(playerY: number): number {
    return playerY - (H - PLAYER_SCREEN_Y) / ROW_PX;
}

export function composeZombieGate(model: ZombieGateModel, hover: { x: number; y: number } | null = null): DrawCommand[] {
    const cmds: DrawCommand[] = [];
    const cameraY = cameraForPlayer(model.playerY);
    const playerSide = sideForLane(model.playerLane);

    // One Graphics node for the whole floor. Tiles are grouped by fill color so
    // the renderer can issue ~4 fill() calls instead of one per cell.
    const floorByFill = new Map<string, DrawCommand[]>();
    const rowStart = Math.floor(cameraY) - 1;
    const rowEnd = Math.ceil(cameraY + VISIBLE_ROWS);
    const tw = TILE_W - CELL_GAP;
    const th = ROW_PX - CELL_GAP;
    for (let row = rowStart; row <= rowEnd; row++) {
        if (row < -2) continue;
        const y = worldToScreenY(row, cameraY);
        if (y < -ROW_PX || y > H + ROW_PX) continue;
        for (let col = 0; col < BOARD_COLS; col++) {
            const isBorder = col === BORDER_LEFT || col === BORDER_RIGHT;
            const dark = (row + col) % 2 === 0;
            const fill = isBorder
                ? (dark ? '#0c141c' : '#101820')
                : (dark ? '#1f3a48' : '#1a323e');
            let bucket = floorByFill.get(fill);
            if (!bucket) {
                bucket = [];
                floorByFill.set(fill, bucket);
            }
            bucket.push({
                id: `f-${row}-${col}`, kind: 'rect',
                x: colToX(col), y, w: tw, h: th, radius: 0, fill,
            });
        }
    }
    const floorTiles: DrawCommand[] = [];
    for (const bucket of floorByFill.values()) floorTiles.push(...bucket);
    cmds.push({
        id: 'floor',
        kind: 'graphicsBatch',
        x: W / 2, y: H / 2, w: W, h: H,
        graphicsCommands: floorTiles,
    });

    // Opaque lane / side hints (no alpha — keeps later primitive batching intact).
    cmds.push({
        id: 'laneGlow', kind: 'rect',
        x: laneToX(model.displayLane), y: H / 2,
        w: CELL_W + 4, h: H,
        fill: '#243f4c', radius: 0,
    });

    const bandY = worldToScreenY(model.playerY + 3.2, cameraY);
    const leftBandX = (colToX(GATE_COLS_LEFT[0]) + colToX(GATE_COLS_LEFT[4])) / 2;
    const rightBandX = (colToX(GATE_COLS_RIGHT[0]) + colToX(GATE_COLS_RIGHT[4])) / 2;
    cmds.push({
        id: 'sideLeft', kind: 'rect',
        x: leftBandX, y: bandY,
        w: TILE_W * 5 - 4, h: 6,
        fill: playerSide === 'left' ? '#3aa0b8' : '#2a4552', radius: 0,
    });
    cmds.push({
        id: 'sideRight', kind: 'rect',
        x: rightBandX, y: bandY,
        w: TILE_W * 5 - 4, h: 6,
        fill: playerSide === 'right' ? '#3aa0b8' : '#2a4552', radius: 0,
    });

    const frontY = worldToScreenY(model.playerY, cameraY);
    cmds.push({
        id: 'front', kind: 'rect',
        x: W / 2, y: frontY, w: TILE_W * (BOARD_COLS - 2), h: 3, fill: '#7fd0e0', radius: 0,
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
            x: laneToX(model.displayLane), y: worldToScreenY(muzzle.y, cameraY),
            w: size * (1.2 - t * 0.4), h: size * (0.9 - t * 0.3),
            fill: weapon.color, alpha: 0.35 + t * 0.55,
        });
    }

    drawSquad(cmds, model, cameraY);

    for (const f of model.feedback) drawFeedback(cmds, f, cameraY);

    drawHud(cmds, model);

    if (model.impact > 0) {
        cmds.push({
            id: 'impact', kind: 'rect',
            x: W / 2, y: H / 2, w: W, h: H, fill: '#b42828', alpha: 0.18 * model.impact,
        });
    }

    if (model.phase !== 'playing') drawPanel(cmds, model, hover);

    return cmds;
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
    // Both sides are the same type: exactly 5 board tiles wide.
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

    // Pixel frame rails (hard edges, no radius).
    cmds.push({
        id: `gate-rail-top-${gate.id}`, kind: 'rect',
        x: midX, y: y - brickH * 0.5 - 3,
        w: TILE_W * 5 - 2, h: 3, fill: outline, radius: 0,
    });
    cmds.push({
        id: `gate-rail-bot-${gate.id}`, kind: 'rect',
        x: midX, y: y + brickH * 0.5 + 3,
        w: TILE_W * 5 - 2, h: 3, fill: outline, radius: 0,
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
    const crateH = Math.max(GATE_H + 8, ROW_PX - 6);
    cmds.push({
        id: `crate-${crate.id}`, kind: 'rect',
        x, y, w: CELL_W - 8, h: crateH,
        fill: '#5a3d8a', stroke: weapon.color, line: 2, radius: 3,
    });
    cmds.push({
        id: `crate-icon-${crate.id}`, kind: 'text',
        x, y: y - 6, text: '枪', size: 20, bold: true, fill: weapon.color,
    });
    cmds.push({
        id: `crate-name-${crate.id}`, kind: 'text',
        x, y: y + 10, text: weapon.name, size: 13, bold: true, fill: '#ffffff',
    });
    cmds.push({
        id: `crate-hpbg-${crate.id}`, kind: 'rect',
        x, y: y + crateH * 0.42, w: 52, h: 6, fill: '#2a1010', radius: 2,
    });
    if (ratio > 0) {
        cmds.push({
            id: `crate-hp-${crate.id}`, kind: 'rect',
            x: x - 26 + 26 * ratio, y: y + crateH * 0.42, w: 52 * ratio, h: 6,
            fill: weapon.color, radius: 2,
        });
    }
    cmds.push({
        id: `crate-hptext-${crate.id}`, kind: 'text',
        x, y: y + crateH * 0.58, text: `${Math.ceil(crate.hp)}`, size: 12, fill: '#e8f7ff',
    });
    if (crate.hitFlash > 0) {
        cmds.push({
            id: `crate-flash-${crate.id}`, kind: 'rect',
            x, y, w: CELL_W - 4, h: crateH + 2,
            fill: '#ffffff', alpha: Math.min(0.5, crate.hitFlash * 4), radius: 3,
        });
    }
}

function drawEnemy(cmds: DrawCommand[], enemy: EnemyEntity, cameraY: number) {
    const x = laneToX(enemy.displayLane);
    const y = worldToScreenY(enemy.y, cameraY);
    if (y < -60 || y > H + 60) return;
    const size = enemy.kind === 'tank' ? 70 : 56;
    cmds.push({
        id: `enemy-shadow-${enemy.id}`, kind: 'ellipse',
        x, y: y + size * 0.35, w: size * 0.7, h: 14, fill: '#000000', alpha: 0.35,
    });
    cmds.push({
        id: `enemy-${enemy.id}`, kind: 'image',
        x, y, w: size, h: size, asset: 'squirrel',
    });
    if (enemy.hitFlash > 0) {
        cmds.push({
            id: `enemy-flash-${enemy.id}`, kind: 'rect',
            x, y, w: size * 0.9, h: size * 0.9,
            fill: '#ffffff', alpha: Math.min(0.55, enemy.hitFlash * 4), radius: 8,
        });
    }
    if (enemy.state === 'chase') {
        cmds.push({
            id: `aggro-${enemy.id}`, kind: 'text',
            x, y: y - size * 0.55, text: '!', size: 28, bold: true, fill: '#ff6b6b',
        });
    }
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    cmds.push({
        id: `hpbg-${enemy.id}`, kind: 'rect',
        x, y: y + size * 0.55, w: 48, h: 8, fill: '#2a1010', radius: 2,
    });
    if (ratio > 0) {
        cmds.push({
            id: `hp-${enemy.id}`, kind: 'rect',
            x: x - 24 + 24 * ratio, y: y + size * 0.55, w: 48 * ratio, h: 8,
            fill: ratio < 0.35 ? '#ff5050' : '#ff9a4d', radius: 2,
        });
    }
}

function drawShot(cmds: DrawCommand[], shot: ShotEvent, cameraY: number, model: ZombieGateModel) {
    const weapon = WEAPONS[shot.tier] ?? WEAPONS[0];
    const t = shot.life / shot.maxLife;
    cmds.push({
        id: `shot-${shot.id}`, kind: 'line',
        x: laneToX(shot.fromLane), y: worldToScreenY(shot.fromY, cameraY),
        x2: laneToX(shot.toLane), y2: worldToScreenY(shot.toY, cameraY),
        stroke: weapon.color, line: weapon.beam,
        alpha: 0.35 + t * 0.65,
    });
    // Impact spark at target.
    cmds.push({
        id: `spark-${shot.id}`, kind: 'ellipse',
        x: laneToX(shot.toLane), y: worldToScreenY(shot.toY, cameraY),
        w: 10 + shot.tier * 6, h: 10 + shot.tier * 6,
        fill: weapon.color, alpha: t * 0.8,
    });
    void model;
}

function drawSquad(cmds: DrawCommand[], model: ZombieGateModel, cameraY: number) {
    const x = laneToX(model.displayLane);
    const y = worldToScreenY(model.playerY, cameraY);
    const visual = Math.min(model.unitCount, 8);
    const weapon = model.weapon;

    // Soft ground marker under squad.
    cmds.push({
        id: 'squad-pad', kind: 'rect',
        x, y: y + 28, w: CELL_W * 0.92, h: 16,
        fill: weapon.color, alpha: 0.22, radius: 3,
    });

    for (let i = 0; i < visual; i++) {
        const ox = ((i % 3) - 1) * 18;
        const oy = -Math.floor(i / 3) * 16;
        cmds.push({
            id: `unit-${i}`, kind: 'image',
            x: x + ox, y: y + oy, w: 52, h: 52, asset: 'fish',
        });
    }
    if (model.unitCount > 8) {
        cmds.push({
            id: 'unit-more', kind: 'text',
            x: x + 42, y: y - 36, text: `×${model.unitCount}`, size: 22, bold: true, fill: weapon.color,
        });
    }

    // Weapon tier pips with empty slots visible.
    for (let t = 0; t <= ZG_RULES.maxWeaponTier; t++) {
        const on = t <= model.weaponTier;
        cmds.push({
            id: `wpip-${t}`, kind: 'rect',
            x: x - 30 + t * 22, y: y + 46, w: 16, h: 10,
            fill: on ? (WEAPONS[t]?.color ?? '#ffe566') : '#2a3a44',
            stroke: on ? '#ffffff' : '#1a242c',
            line: 1,
            radius: 2,
        });
    }
}

function drawFeedback(cmds: DrawCommand[], f: Feedback, cameraY: number) {
    const t = f.life / f.maxLife;
    const rise = (1 - t) * (f.kind === 'damage' ? 36 : f.kind === 'gate' ? 28 : 20);
    const size = f.kind === 'damage' ? 22 : f.kind === 'gate' ? 30 : 26;
    const fill = f.kind === 'damage' ? '#ffe566'
        : f.good ? '#9dffb0' : '#ff8f8f';
    cmds.push({
        id: `fb-${f.id}`, kind: 'text',
        x: laneToX(f.lane),
        y: worldToScreenY(f.y, cameraY) - 28 - rise,
        text: f.text, size, bold: true, fill,
        alpha: Math.min(1, t * 1.4),
    });
}

function drawHud(cmds: DrawCommand[], model: ZombieGateModel) {
    const weapon = model.weapon;
    cmds.push({
        id: 'hudPanel', kind: 'rect',
        x: W / 2, y: 52, w: 680, h: 72, fill: '#0f1f28', radius: 10, stroke: '#2a4a58', line: 2,
    });
    cmds.push({
        id: 'hudUnits', kind: 'text',
        x: 118, y: 52, text: `人数 ${model.unitCount}`, size: 28, bold: true, fill: '#e8f7ff',
    });
    cmds.push({
        id: 'hudWeapon', kind: 'text',
        x: 340, y: 40, text: weapon.name, size: 24, bold: true, fill: weapon.color,
    });
    cmds.push({
        id: 'hudWeaponMeta', kind: 'text',
        x: 340, y: 66, text: `伤害${weapon.damage} · 弹${weapon.pellets}`, size: 16, fill: '#9ec8d4',
    });
    cmds.push({
        id: 'hudTime', kind: 'text',
        x: 560, y: 52, text: `${Math.ceil(model.timeLeft)}s`, size: 28, bold: true, fill: '#b4ebf4',
    });
    // Progress bar along bottom of HUD.
    const progress = Math.min(1, model.elapsed / ZG_RULES.duration);
    cmds.push({
        id: 'hudProgressBg', kind: 'rect',
        x: W / 2, y: 88, w: 640, h: 6, fill: '#1a2c36', radius: 2,
    });
    cmds.push({
        id: 'hudProgress', kind: 'rect',
        x: 40 + 320 * progress, y: 88, w: 640 * progress, h: 6, fill: weapon.color, radius: 2,
    });
    cmds.push({
        id: 'hudScore', kind: 'text',
        x: W / 2, y: H - 36, text: `得分 ${model.score} · 击破 ${model.kills}`, size: 22, fill: '#9ec8d4',
    });
}

function drawPanel(
    cmds: DrawCommand[],
    model: ZombieGateModel,
    hover: { x: number; y: number } | null,
) {
    cmds.push({
        id: 'panel', kind: 'rect',
        x: W / 2, y: 760, w: 520, h: 220, fill: '#0d1c24', radius: 12, stroke: '#3d6f82', line: 3,
    });
    const title = model.phase === 'ready' ? '向僵尸开炮 · 前期'
        : model.phase === 'won' ? '前线守住！' : '鱼群覆灭';
    const sub = model.phase === 'ready'
        ? '格子换道 · 过门成长 · 自动射击'
        : `得分 ${model.score}  人数峰值 ${model.peakUnits}`;
    cmds.push({ id: 'title', kind: 'text', x: W / 2, y: 720, text: title, size: 40, bold: true, fill: '#e8f7ff' });
    cmds.push({ id: 'sub', kind: 'text', x: W / 2, y: 768, text: sub, size: 22, fill: '#9ec8d4' });
    const btnFill = hover && hover.x >= 124 && hover.x <= 596 && hover.y >= 812 && hover.y <= 898
        ? '#3aa0b8' : '#2a7f94';
    cmds.push({ id: 'button', kind: 'rect', x: W / 2, y: 855, w: 360, h: 86, fill: btnFill, radius: 10 });
    cmds.push({
        id: 'buttonText', kind: 'text',
        x: W / 2, y: 855,
        text: model.phase === 'ready' ? '开始战斗' : model.phase === 'won' ? '再来一局' : '重新挑战',
        size: 32, bold: true, fill: '#ffffff',
    });
}
