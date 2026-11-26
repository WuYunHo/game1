/**
 * Engine-independent early-combat rules (向僵尸开炮 style).
 * Map-fixed gates/enemies/crates; player advances on a 5-lane grid.
 */
import {
    resolveGateDef, resolveWeaponCrateDef, type GateKind,
} from './ZombieGateConfig';
import {
    ENEMY_GEN, LEVEL_1, LEVEL_LEAD_IN, generateEnemyRows, generateGateRows, type EnemyKind,
} from './ZombieGateLevel';

export type Phase = 'ready' | 'intro' | 'playing' | 'won' | 'lost';

/** Pixel shards from the start dialog burst (UI-space, top-left origin). */
export type BurstPixel = {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    fill: string;
};

export type WeaponDef = {
    name: string;
    damage: number;
    interval: number;
    pellets: number;
    color: string;
    beam: number;
};

export type GateEntity = {
    id: number;
    row: number;
    side: 'left' | 'right';
    defId: string;
    kind: GateKind;
    value: number;
    label: string;
    good: boolean;
    resolved: boolean;
    resolveFlash: number;
};

/** Width-1 shootable weapon pickup. Destroy to claim its tier. */
export type WeaponCrateEntity = {
    id: number;
    lane: number;
    y: number;
    hp: number;
    maxHp: number;
    tier: number;
    hitFlash: number;
    claimed: boolean;
};

export type EnemyEntity = {
    id: number;
    lane: number;
    displayLane: number;
    y: number;
    /** Visual sub-lane offset in lane widths for staggered stacks. */
    ox: number;
    /** Settled / animated idle offset X in lane widths (visual only). */
    bobX: number;
    /** Settled / animated idle offset Y in world rows (visual only). */
    bobY: number;
    /** >0 while hopping: elapsed time of current hop. */
    hopT: number;
    /** Wait before next hop (randomized per mouse). */
    pauseTimer: number;
    fromBobX: number;
    fromBobY: number;
    toBobX: number;
    toBobY: number;
    hp: number;
    maxHp: number;
    touchCost: number;
    speed: number;
    state: 'idle' | 'chase' | 'dead';
    kind: EnemyKind;
    laneStepTimer: number;
    hitFlash: number;
};

export type FeedbackKind = 'info' | 'damage' | 'gate';

export type Feedback = {
    id: number;
    text: string;
    good: boolean;
    life: number;
    maxLife: number;
    /** Floor column used for horizontal placement. */
    col: number;
    y: number;
    kind: FeedbackKind;
};

export type ShotEvent = {
    id: number;
    fromCol: number;
    toCol: number;
    fromY: number;
    toY: number;
    life: number;
    maxLife: number;
    tier: number;
    damage: number;
};

export type MuzzleFlash = {
    id: number;
    col: number;
    y: number;
    life: number;
    maxLife: number;
    tier: number;
};

export type FireTarget =
    | { kind: 'enemy'; ref: EnemyEntity }
    | { kind: 'crate'; ref: WeaponCrateEntity };

export const ZG_RULES = Object.freeze({
    laneCount: 5,
    /** Playable floor columns (borders excluded). Player steps 1 col per move. */
    playableFirstCol: 1,
    playableLastCol: 20,
    tilesPerLane: 4,
    /** Center column of the middle lane (lane 2 → cols 9–12). */
    centerCol: 11,
    initialUnits: 1,
    maxUnits: 40,
    duration: 72,
    forwardSpeed: 1.75,
    introDuration: 0.7,
    aggroRange: 6.5,
    fireRange: 5.5,
    frontEpsilon: 0.2,
    maxWeaponTier: 2,
    chaseLaneInterval: 0.38,
    /** Ease speed in columns/sec — one-tile steps should feel snappy. */
    laneEase: 22,
    /** Fly-mouse idle: hop a little, bounce, then pause (not continuous buzz). */
    idleBobX: 0.1,
    idleBobY: 0.16,
    idleStepX: 0.07,
    idleStepY: 0.11,
    idleHopDuration: 0.28,
    idleHopBounce: 0.12,
    idlePauseMin: 0.65,
    idlePauseMax: 1.55,
    /** Logical lanes 0–1 → left gate; 2–4 → right (legacy enemy/crate addressing). */
    leftLaneMax: 1,
    /** Playable cols 1–10 → left door; 11–20 → right. */
    leftColMax: 10,
    defaultCrateHp: 20,
    /** Fly-mouse pressure multiplier (forwards to ENEMY_GEN curve). */
    enemyDifficulty: ENEMY_GEN.difficulty,
});

export const WEAPONS: readonly WeaponDef[] = Object.freeze([
    Object.freeze({ name: '小水枪', damage: 1, interval: 0.40, pellets: 1, color: '#7fd0ff', beam: 2 }),
    Object.freeze({ name: '双喷', damage: 1, interval: 0.32, pellets: 2, color: '#ffe566', beam: 3 }),
    Object.freeze({ name: '强袭', damage: 1, interval: 0.24, pellets: 3, color: '#ff9a4d', beam: 5 }),
]);

export const ENEMY_STATS = Object.freeze({
    normal: Object.freeze({ hp: 1, touchCost: 1, speed: 1.55 }),
    tank: Object.freeze({ hp: 3, touchCost: 2, speed: 1.05 }),
});

export function gateLabel(kind: GateKind, value: number): string {
    if (kind === 'add') return `+${value}`;
    if (kind === 'sub') return `−${value}`;
    if (kind === 'mul') return `×${value}`;
    return `÷${value}`;
}

export function sideForLane(lane: number): 'left' | 'right' {
    return lane <= ZG_RULES.leftLaneMax ? 'left' : 'right';
}

/** Player column → which door half is active. */
export function sideForCol(col: number): 'left' | 'right' {
    return col <= ZG_RULES.leftColMax ? 'left' : 'right';
}

export function laneFromCol(col: number): number {
    return Math.max(
        0,
        Math.min(
            ZG_RULES.laneCount - 1,
            Math.floor((col - ZG_RULES.playableFirstCol) / ZG_RULES.tilesPerLane),
        ),
    );
}

export function colInLane(col: number, lane: number): boolean {
    const first = ZG_RULES.playableFirstCol + lane * ZG_RULES.tilesPerLane;
    return col >= first && col < first + ZG_RULES.tilesPerLane;
}

export function laneCenterCol(lane: number): number {
    return ZG_RULES.playableFirstCol + lane * ZG_RULES.tilesPerLane + ZG_RULES.tilesPerLane * 0.5 - 0.5;
}

export class ZombieGateModel {
    phase: Phase = 'ready';
    stage = 1;
    unitCount = ZG_RULES.initialUnits;
    peakUnits = ZG_RULES.initialUnits;
    weaponTier = 0;
    score = 0;
    kills = 0;
    elapsed = 0;
    clock = 0;
    /** Player stands on a floor column (1..20); each shift moves exactly 1 tile. */
    playerCol = ZG_RULES.centerCol;
    displayCol = ZG_RULES.centerCol;
    playerY = 0;
    fireCooldown = 0;
    impact = 0;
    gates: GateEntity[] = [];
    weaponCrates: WeaponCrateEntity[] = [];
    enemies: EnemyEntity[] = [];
    feedback: Feedback[] = [];
    shots: ShotEvent[] = [];
    muzzles: MuzzleFlash[] = [];
    /** Start-dialog shatter shards (only during intro). */
    burstPixels: BurstPixel[] = [];
    introT = 0;
    private nextId = 1;
    private nextBurstId = 1;

    get weapon(): WeaponDef {
        return WEAPONS[Math.max(0, Math.min(ZG_RULES.maxWeaponTier, this.weaponTier))];
    }

    get timeLeft(): number {
        return Math.max(0, ZG_RULES.duration - this.elapsed);
    }

    start(stage = this.stage, opts: { skipIntro?: boolean } = {}) {
        this.stage = stage;
        this.unitCount = ZG_RULES.initialUnits;
        this.peakUnits = this.unitCount;
        this.weaponTier = 0;
        this.score = 0;
        this.kills = 0;
        this.elapsed = 0;
        this.playerCol = ZG_RULES.centerCol;
        this.displayCol = ZG_RULES.centerCol;
        this.playerY = 0;
        this.fireCooldown = 0.35;
        this.impact = 0;
        this.feedback = [];
        this.shots = [];
        this.muzzles = [];
        this.burstPixels = [];
        this.introT = 0;
        this.nextId = 1;
        this.nextBurstId = 1;
        this.gates = [];
        this.weaponCrates = [];
        this.enemies = [];
        this.buildLevel();
        if (opts.skipIntro) {
            this.phase = 'playing';
            return;
        }
        this.phase = 'intro';
        this.introT = ZG_RULES.introDuration;
    }

    /** Presentation seeds shards once after start (needs live play height). */
    seedIntroBurst(pixels: Omit<BurstPixel, 'id'>[]) {
        if (this.phase !== 'intro' || this.burstPixels.length > 0) return;
        this.burstPixels = pixels.map((p) => ({ ...p, id: this.nextBurstId++ }));
    }

    /** Move one floor tile left/right. */
    shiftLane(delta: number) {
        if (this.phase !== 'playing') return;
        const next = this.playerCol + Math.sign(delta);
        this.playerCol = Math.max(ZG_RULES.playableFirstCol, Math.min(ZG_RULES.playableLastCol, next));
    }

    /** Snap to a playable floor column (from pointer X). */
    setLane(col: number) {
        if (this.phase !== 'playing') return;
        this.playerCol = Math.max(
            ZG_RULES.playableFirstCol,
            Math.min(ZG_RULES.playableLastCol, Math.round(col)),
        );
    }

    tick(dt: number) {
        dt = Math.max(0, Math.min(dt, 0.05));
        this.clock += dt;
        this.impact = Math.max(0, this.impact - dt * 3);
        this.easeDisplayLanes(dt);
        this.decayFx(dt);
        if (this.phase === 'intro') {
            this.tickIntro(dt);
            return;
        }
        if (this.phase !== 'playing') return;

        this.elapsed += dt;
        this.playerY += ZG_RULES.forwardSpeed * dt;

        this.resolveGates();
        this.updateAggroAndChase(dt);
        this.fireCooldown -= dt;
        if (this.fireCooldown <= 0) this.fireVolley();
        this.resolveContact();

        if (this.unitCount <= 0) {
            this.unitCount = 0;
            this.phase = 'lost';
            this.notify('鱼群覆灭…', false, this.playerCol, this.playerY, 'info');
            return;
        }
        if (this.elapsed >= ZG_RULES.duration) {
            this.phase = 'won';
            this.score += this.unitCount * 20 + this.weaponTier * 50;
            this.notify('前线守住！', true, this.playerCol, this.playerY, 'info');
        }
    }

    private easeDisplayLanes(dt: number) {
        const step = ZG_RULES.laneEase * dt;
        const toward = (current: number, target: number) => {
            const d = target - current;
            if (Math.abs(d) <= step) return target;
            return current + Math.sign(d) * step;
        };
        this.displayCol = toward(this.displayCol, this.playerCol);
        for (const e of this.enemies) {
            if (e.displayLane === undefined) e.displayLane = e.lane;
            e.displayLane = toward(e.displayLane, e.lane);
        }
    }

    private tickIntro(dt: number) {
        this.introT = Math.max(0, this.introT - dt);
        const live: BurstPixel[] = [];
        for (const p of this.burstPixels) {
            p.life -= dt;
            if (p.life <= 0) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 980 * dt;
            p.vx *= Math.max(0, 1 - dt * 1.2);
            live.push(p);
        }
        this.burstPixels = live;
        if (this.introT <= 0) {
            this.burstPixels = [];
            this.phase = 'playing';
        }
    }

    private buildLevel() {
        const lead = LEVEL_LEAD_IN;
        const gateRows = generateGateRows({
            difficulty: ZG_RULES.enemyDifficulty,
            startUnits: ZG_RULES.initialUnits,
        });
        for (const g of gateRows) {
            const left = resolveGateDef(g.left);
            const right = resolveGateDef(g.right);
            const row = g.row + lead;
            this.gates.push({
                id: this.nextId++, row, side: 'left',
                defId: left.id, kind: left.kind, value: left.value,
                label: left.label, good: left.good, resolved: false, resolveFlash: 0,
            });
            this.gates.push({
                id: this.nextId++, row, side: 'right',
                defId: right.id, kind: right.kind, value: right.value,
                label: right.label, good: right.good, resolved: false, resolveFlash: 0,
            });
        }
        for (const crate of LEVEL_1.weaponCrates) {
            const def = resolveWeaponCrateDef(crate.crate);
            this.weaponCrates.push({
                id: this.nextId++,
                lane: crate.lane,
                y: crate.row + lead,
                hp: def.hp,
                maxHp: def.hp,
                tier: def.tier,
                hitFlash: 0,
                claimed: false,
            });
        }
        const enemyRows = generateEnemyRows({ difficulty: ZG_RULES.enemyDifficulty });
        for (const row of enemyRows) {
            for (const spawn of row.spawns) {
                const stats = ENEMY_STATS[spawn.kind];
                const id = this.nextId++;
                this.enemies.push({
                    id,
                    lane: spawn.lane,
                    displayLane: spawn.lane,
                    y: row.row + lead + (spawn.dy ?? 0),
                    ox: spawn.dx ?? 0,
                    bobX: 0,
                    bobY: 0,
                    hopT: 0,
                    pauseTimer: this.rollIdlePause(id),
                    fromBobX: 0,
                    fromBobY: 0,
                    toBobX: 0,
                    toBobY: 0,
                    hp: stats.hp,
                    maxHp: stats.hp,
                    touchCost: stats.touchCost,
                    speed: stats.speed,
                    state: 'idle',
                    kind: spawn.kind,
                    laneStepTimer: 0,
                    hitFlash: 0,
                });
            }
        }
    }

    private resolveGates() {
        const side = sideForCol(this.playerCol);
        const rows = new Set(this.gates.filter(g => !g.resolved).map(g => g.row));
        for (const row of rows) {
            if (this.playerY + 0.001 < row) continue;
            const chosen = this.gates.find(g => g.row === row && g.side === side && !g.resolved);
            for (const g of this.gates) {
                if (g.row === row) {
                    g.resolved = true;
                    g.resolveFlash = 0.35;
                }
            }
            if (!chosen) continue;
            this.applyGate(chosen);
            if (this.unitCount <= 0) {
                this.unitCount = 0;
                this.phase = 'lost';
                this.notify('门后无人…', false, this.playerCol, row, 'info');
                return;
            }
        }
    }

    private applyGate(gate: GateEntity) {
        const before = this.unitCount;
        if (gate.kind === 'add') {
            this.unitCount = Math.min(ZG_RULES.maxUnits, this.unitCount + gate.value);
        } else if (gate.kind === 'sub') {
            this.unitCount = Math.max(0, this.unitCount - gate.value);
        } else if (gate.kind === 'mul') {
            this.unitCount = Math.min(ZG_RULES.maxUnits, Math.floor(this.unitCount * gate.value));
        } else {
            this.unitCount = Math.max(0, Math.floor(this.unitCount / Math.max(1, gate.value)));
        }
        const delta = this.unitCount - before;
        if (delta > 0) {
            this.score += delta * 10;
            this.notify(gate.kind === 'mul' ? `人数×${gate.value}！` : `+${delta} 伙伴！`, true, this.playerCol, gate.row, 'gate');
        } else if (delta < 0) {
            this.notify(gate.kind === 'div' ? `人数÷${gate.value}！` : `−${-delta} 伙伴`, false, this.playerCol, gate.row, 'gate');
        } else {
            this.notify(gate.good ? '人数已满！' : '无人可减', gate.good, this.playerCol, gate.row, 'gate');
        }
        this.peakUnits = Math.max(this.peakUnits, this.unitCount);
    }

    private updateAggroAndChase(dt: number) {
        for (const e of this.enemies) {
            if (e.state === 'dead') continue;
            this.updateEnemyBob(e, dt);
            const ahead = e.y - this.playerY;
            const playerLane = laneFromCol(this.playerCol);
            if (e.state === 'idle') {
                if (ahead > 0 && ahead <= ZG_RULES.aggroRange && Math.abs(e.lane - playerLane) <= 2) {
                    e.state = 'chase';
                } else {
                    continue;
                }
            }
            if (e.y > this.playerY) {
                e.y = Math.max(this.playerY, e.y - e.speed * dt);
            }
            e.laneStepTimer -= dt;
            if (e.laneStepTimer <= 0 && e.lane !== playerLane) {
                e.lane += Math.sign(playerLane - e.lane);
                e.laneStepTimer = ZG_RULES.chaseLaneInterval;
            }
        }
    }

    /** Fly-mice: hop → tiny bounce → random pause. Tanks stay planted. */
    private updateEnemyBob(e: EnemyEntity, dt: number) {
        if (e.kind !== 'normal') {
            e.bobX = 0;
            e.bobY = 0;
            e.hopT = 0;
            return;
        }
        if (e.state === 'chase') {
            e.hopT = 0;
            e.pauseTimer = 0;
            e.bobX = Math.abs(e.bobX) < 0.002 ? 0 : e.bobX * Math.max(0, 1 - dt * 8);
            e.bobY = Math.abs(e.bobY) < 0.002 ? 0 : e.bobY * Math.max(0, 1 - dt * 8);
            return;
        }

        if (e.hopT > 0) {
            e.hopT += dt;
            const u = Math.min(1, e.hopT / ZG_RULES.idleHopDuration);
            const s = u * u * (3 - 2 * u);
            e.bobX = e.fromBobX + (e.toBobX - e.fromBobX) * s;
            e.bobY = e.fromBobY + (e.toBobY - e.fromBobY) * s
                + Math.sin(Math.PI * u) * ZG_RULES.idleHopBounce;
            if (u >= 1) {
                e.bobX = e.toBobX;
                e.bobY = e.toBobY;
                e.hopT = 0;
                e.pauseTimer = this.rollIdlePause(e.id);
            }
            return;
        }

        e.pauseTimer -= dt;
        if (e.pauseTimer > 0) return;
        this.startIdleHop(e);
    }

    private rollIdlePause(seed = 0): number {
        const span = ZG_RULES.idlePauseMax - ZG_RULES.idlePauseMin;
        return ZG_RULES.idlePauseMin + Math.random() * span + (seed % 5) * 0.04;
    }

    private startIdleHop(e: EnemyEntity) {
        e.fromBobX = e.bobX;
        e.fromBobY = e.bobY;
        let dx = (Math.random() * 2 - 1) * ZG_RULES.idleStepX;
        let dy = (Math.random() * 2 - 1) * ZG_RULES.idleStepY;
        if (Math.random() < 0.5) dy *= 0.3;
        else dx *= 0.3;
        e.toBobX = Math.max(-ZG_RULES.idleBobX, Math.min(ZG_RULES.idleBobX, e.bobX + dx));
        e.toBobY = Math.max(-ZG_RULES.idleBobY, Math.min(ZG_RULES.idleBobY, e.bobY + dy));
        if (Math.abs(e.toBobX - e.fromBobX) + Math.abs(e.toBobY - e.fromBobY) < 0.02) {
            const sign = Math.random() < 0.5 ? -1 : 1;
            if (Math.random() < 0.5) {
                e.toBobX = Math.max(-ZG_RULES.idleBobX, Math.min(ZG_RULES.idleBobX, e.fromBobX + sign * ZG_RULES.idleStepX));
            } else {
                e.toBobY = Math.max(-ZG_RULES.idleBobY, Math.min(ZG_RULES.idleBobY, e.fromBobY + sign * ZG_RULES.idleStepY));
            }
        }
        e.hopT = 1e-4;
    }

    private collectFireTargets(): FireTarget[] {
        const targets: FireTarget[] = [];
        for (const e of this.enemies) {
            if (e.state === 'dead') continue;
            if (e.y <= this.playerY || e.y - this.playerY > ZG_RULES.fireRange) continue;
            targets.push({ kind: 'enemy', ref: e });
        }
        for (const c of this.weaponCrates) {
            if (c.claimed || c.hp <= 0) continue;
            if (c.y <= this.playerY || c.y - this.playerY > ZG_RULES.fireRange) continue;
            targets.push({ kind: 'crate', ref: c });
        }
        targets.sort((a, b) => {
            const la = Math.abs(laneCenterCol(a.ref.lane) - this.playerCol);
            const lb = Math.abs(laneCenterCol(b.ref.lane) - this.playerCol);
            if (la !== lb) return la - lb;
            return a.ref.y - b.ref.y;
        });
        return targets;
    }

    private fireVolley() {
        const weapon = this.weapon;
        this.fireCooldown = weapon.interval;
        const inRange = this.collectFireTargets();
        if (inRange.length === 0) return;

        this.muzzles.push({
            id: this.nextId++,
            col: this.displayCol,
            y: this.playerY + 0.35,
            life: 0.08,
            maxLife: 0.08,
            tier: this.weaponTier,
        });

        const guns = Math.max(1, Math.min(this.unitCount, 16));
        const hitsPerTarget = Math.max(1, weapon.pellets);
        const hitCounts = new Map<number, number>();
        let bulletsLeft = guns * weapon.pellets;
        let guard = 0;
        while (bulletsLeft > 0 && guard++ < 64) {
            const target = inRange.find(t => {
                const id = t.ref.id;
                const hp = t.ref.hp;
                const dead = t.kind === 'enemy'
                    ? t.ref.state === 'dead' || hp <= 0
                    : t.ref.claimed || hp <= 0;
                return !dead && (hitCounts.get(id) ?? 0) < hitsPerTarget;
            });
            if (!target) break;
            hitCounts.set(target.ref.id, (hitCounts.get(target.ref.id) ?? 0) + 1);
            bulletsLeft -= 1;

            const toCol = target.kind === 'enemy'
                ? laneCenterCol(target.ref.displayLane)
                : laneCenterCol(target.ref.lane);
            const toY = target.ref.y;
            // Enemies take flat bullet damage; weapon crates take squad volley damage (n × dmg).
            const hitDamage = target.kind === 'crate'
                ? Math.max(1, this.unitCount) * weapon.damage
                : weapon.damage;
            this.shots.push({
                id: this.nextId++,
                fromCol: this.displayCol,
                toCol,
                fromY: this.playerY + 0.35,
                toY,
                life: 0.14,
                maxLife: 0.14,
                tier: this.weaponTier,
                damage: hitDamage,
            });

            if (target.kind === 'enemy') {
                this.damageEnemy(target.ref, hitDamage);
            } else {
                this.damageCrate(target.ref, hitDamage);
            }
        }
        this.enemies = this.enemies.filter(e => e.state !== 'dead');
        this.weaponCrates = this.weaponCrates.filter(c => !c.claimed);
    }

    private damageEnemy(target: EnemyEntity, damage: number) {
        target.hp -= damage;
        target.hitFlash = 0.12;
        if (target.state === 'idle') target.state = 'chase';
        const col = laneCenterCol(target.lane);
        this.notify(`-${damage}`, false, col, target.y + 0.15, 'damage');
        if (target.hp <= 0) {
            target.hp = 0;
            target.state = 'dead';
            this.kills += 1;
            this.score += target.kind === 'tank' ? 40 : 20;
            this.notify(target.kind === 'tank' ? '击破厚皮！' : '击破！', true, col, target.y, 'info');
        }
    }

    private damageCrate(crate: WeaponCrateEntity, damage: number) {
        crate.hp -= damage;
        crate.hitFlash = 0.12;
        const col = laneCenterCol(crate.lane);
        this.notify(`-${damage}`, false, col, crate.y + 0.15, 'damage');
        if (crate.hp > 0) return;
        crate.hp = 0;
        crate.claimed = true;
        const before = this.weaponTier;
        this.weaponTier = Math.max(this.weaponTier, Math.min(ZG_RULES.maxWeaponTier, crate.tier));
        this.score += 60;
        if (this.weaponTier > before) {
            this.notify(`获得武器！${this.weapon.name}`, true, col, crate.y, 'gate');
        } else if (this.weaponTier >= crate.tier) {
            this.notify('火力已拥有 +60', true, col, crate.y, 'gate');
        }
    }

    private resolveContact() {
        const survivors: EnemyEntity[] = [];
        for (const e of this.enemies) {
            if (e.state === 'dead') continue;
            const touching = e.y <= this.playerY + ZG_RULES.frontEpsilon
                && colInLane(this.playerCol, e.lane);
            if (!touching) {
                survivors.push(e);
                continue;
            }
            const lost = Math.min(this.unitCount, e.touchCost);
            this.unitCount -= lost;
            this.impact = 1;
            this.notify(`−${lost} 伙伴`, false, this.playerCol, this.playerY, 'info');
        }
        this.enemies = survivors;
    }

    private decayFx(dt: number) {
        for (const f of this.feedback) f.life -= dt;
        this.feedback = this.feedback.filter(f => f.life > 0);
        for (const s of this.shots) s.life -= dt;
        this.shots = this.shots.filter(s => s.life > 0);
        for (const m of this.muzzles) m.life -= dt;
        this.muzzles = this.muzzles.filter(m => m.life > 0);
        for (const g of this.gates) g.resolveFlash = Math.max(0, (g.resolveFlash ?? 0) - dt);
        for (const e of this.enemies) e.hitFlash = Math.max(0, (e.hitFlash ?? 0) - dt);
        for (const c of this.weaponCrates) c.hitFlash = Math.max(0, (c.hitFlash ?? 0) - dt);
    }

    private notify(text: string, good: boolean, col: number, y: number, kind: FeedbackKind) {
        if (kind === 'damage') {
            const damageCount = this.feedback.filter(f => f.kind === 'damage').length;
            if (damageCount >= 12) {
                const oldest = this.feedback.find(f => f.kind === 'damage');
                if (oldest) oldest.life = 0;
                this.feedback = this.feedback.filter(f => f.life > 0);
            }
        }
        const maxLife = kind === 'damage' ? 0.55 : kind === 'gate' ? 1.45 : 1.2;
        this.feedback.push({
            id: this.nextId++, text, good, life: maxLife, maxLife, col, y, kind,
        });
    }
}
