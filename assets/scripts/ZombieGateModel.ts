/**
 * Engine-independent early-combat rules (向僵尸开炮 style).
 * Map-fixed gates/enemies/crates; player advances on a 5-lane grid.
 */
import {
    resolveGateDef, resolveWeaponCrateDef, type GateKind,
} from './ZombieGateConfig';
import { LEVEL_1, type EnemyKind } from './ZombieGateLevel';

export type Phase = 'ready' | 'playing' | 'won' | 'lost';

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
    lane: number;
    y: number;
    kind: FeedbackKind;
};

export type ShotEvent = {
    id: number;
    fromLane: number;
    toLane: number;
    fromY: number;
    toY: number;
    life: number;
    maxLife: number;
    tier: number;
    damage: number;
};

export type MuzzleFlash = {
    id: number;
    lane: number;
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
    initialUnits: 5,
    maxUnits: 40,
    duration: 60,
    forwardSpeed: 1,
    aggroRange: 4,
    fireRange: 5.5,
    frontEpsilon: 0.2,
    maxWeaponTier: 2,
    chaseLaneInterval: 0.22,
    laneEase: 14,
    /** Lanes 0–1 → left gate (cols 1–5); lanes 2–4 → right gate (cols 6–10). */
    leftLaneMax: 1,
    defaultCrateHp: 20,
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
    playerLane = 2;
    displayLane = 2;
    playerY = 0;
    fireCooldown = 0;
    impact = 0;
    gates: GateEntity[] = [];
    weaponCrates: WeaponCrateEntity[] = [];
    enemies: EnemyEntity[] = [];
    feedback: Feedback[] = [];
    shots: ShotEvent[] = [];
    muzzles: MuzzleFlash[] = [];
    private nextId = 1;

    get weapon(): WeaponDef {
        return WEAPONS[Math.max(0, Math.min(ZG_RULES.maxWeaponTier, this.weaponTier))];
    }

    get timeLeft(): number {
        return Math.max(0, ZG_RULES.duration - this.elapsed);
    }

    start(stage = this.stage) {
        this.stage = stage;
        this.unitCount = ZG_RULES.initialUnits;
        this.peakUnits = this.unitCount;
        this.weaponTier = 0;
        this.score = 0;
        this.kills = 0;
        this.elapsed = 0;
        this.playerLane = 2;
        this.displayLane = 2;
        this.playerY = 0;
        this.fireCooldown = 0;
        this.impact = 0;
        this.feedback = [];
        this.shots = [];
        this.muzzles = [];
        this.nextId = 1;
        this.gates = [];
        this.weaponCrates = [];
        this.enemies = [];
        this.buildLevel();
        this.phase = 'playing';
    }

    shiftLane(delta: number) {
        if (this.phase !== 'playing') return;
        const next = this.playerLane + Math.sign(delta);
        this.playerLane = Math.max(0, Math.min(ZG_RULES.laneCount - 1, next));
    }

    setLane(lane: number) {
        if (this.phase !== 'playing') return;
        this.playerLane = Math.max(0, Math.min(ZG_RULES.laneCount - 1, Math.round(lane)));
    }

    tick(dt: number) {
        dt = Math.max(0, Math.min(dt, 0.05));
        this.clock += dt;
        this.impact = Math.max(0, this.impact - dt * 3);
        this.easeDisplayLanes(dt);
        this.decayFx(dt);
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
            this.notify('鱼群覆灭…', false, this.playerLane, this.playerY, 'info');
            return;
        }
        if (this.elapsed >= ZG_RULES.duration) {
            this.phase = 'won';
            this.score += this.unitCount * 20 + this.weaponTier * 50;
            this.notify('前线守住！', true, this.playerLane, this.playerY, 'info');
        }
    }

    private easeDisplayLanes(dt: number) {
        const step = ZG_RULES.laneEase * dt;
        const toward = (current: number, target: number) => {
            const d = target - current;
            if (Math.abs(d) <= step) return target;
            return current + Math.sign(d) * step;
        };
        this.displayLane = toward(this.displayLane, this.playerLane);
        for (const e of this.enemies) {
            if (e.displayLane === undefined) e.displayLane = e.lane;
            e.displayLane = toward(e.displayLane, e.lane);
        }
    }

    private buildLevel() {
        for (const g of LEVEL_1.gates) {
            const left = resolveGateDef(g.left);
            const right = resolveGateDef(g.right);
            this.gates.push({
                id: this.nextId++, row: g.row, side: 'left',
                defId: left.id, kind: left.kind, value: left.value,
                label: left.label, good: left.good, resolved: false, resolveFlash: 0,
            });
            this.gates.push({
                id: this.nextId++, row: g.row, side: 'right',
                defId: right.id, kind: right.kind, value: right.value,
                label: right.label, good: right.good, resolved: false, resolveFlash: 0,
            });
        }
        for (const crate of LEVEL_1.weaponCrates) {
            const def = resolveWeaponCrateDef(crate.crate);
            this.weaponCrates.push({
                id: this.nextId++,
                lane: crate.lane,
                y: crate.row,
                hp: def.hp,
                maxHp: def.hp,
                tier: def.tier,
                hitFlash: 0,
                claimed: false,
            });
        }
        for (const row of LEVEL_1.enemyRows) {
            for (const spawn of row.spawns) {
                const stats = ENEMY_STATS[spawn.kind];
                this.enemies.push({
                    id: this.nextId++,
                    lane: spawn.lane,
                    displayLane: spawn.lane,
                    y: row.row,
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
        const side = sideForLane(this.playerLane);
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
                this.notify('门后无人…', false, this.playerLane, row, 'info');
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
            this.notify(gate.kind === 'mul' ? `人数×${gate.value}！` : `+${delta} 伙伴！`, true, this.playerLane, gate.row, 'gate');
        } else if (delta < 0) {
            this.notify(gate.kind === 'div' ? `人数÷${gate.value}！` : `−${-delta} 伙伴`, false, this.playerLane, gate.row, 'gate');
        } else {
            this.notify(gate.good ? '人数已满！' : '无人可减', gate.good, this.playerLane, gate.row, 'gate');
        }
        this.peakUnits = Math.max(this.peakUnits, this.unitCount);
    }

    private updateAggroAndChase(dt: number) {
        for (const e of this.enemies) {
            if (e.state === 'dead') continue;
            const ahead = e.y - this.playerY;
            if (e.state === 'idle') {
                if (ahead > 0 && ahead <= ZG_RULES.aggroRange && Math.abs(e.lane - this.playerLane) <= 2) {
                    e.state = 'chase';
                } else {
                    continue;
                }
            }
            if (e.y > this.playerY) {
                e.y = Math.max(this.playerY, e.y - e.speed * dt);
            }
            e.laneStepTimer -= dt;
            if (e.laneStepTimer <= 0 && e.lane !== this.playerLane) {
                e.lane += Math.sign(this.playerLane - e.lane);
                e.laneStepTimer = ZG_RULES.chaseLaneInterval;
            }
        }
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
            const la = Math.abs((a.kind === 'enemy' ? a.ref.lane : a.ref.lane) - this.playerLane);
            const lb = Math.abs((b.kind === 'enemy' ? b.ref.lane : b.ref.lane) - this.playerLane);
            if (la !== lb) return la - lb;
            const ya = a.kind === 'enemy' ? a.ref.y : a.ref.y;
            const yb = b.kind === 'enemy' ? b.ref.y : b.ref.y;
            return ya - yb;
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
            lane: this.playerLane,
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
                const hp = t.kind === 'enemy' ? t.ref.hp : t.ref.hp;
                const dead = t.kind === 'enemy'
                    ? t.ref.state === 'dead' || hp <= 0
                    : t.ref.claimed || hp <= 0;
                return !dead && (hitCounts.get(id) ?? 0) < hitsPerTarget;
            });
            if (!target) break;
            hitCounts.set(target.ref.id, (hitCounts.get(target.ref.id) ?? 0) + 1);
            bulletsLeft -= 1;

            const toLane = target.kind === 'enemy' ? target.ref.displayLane : target.ref.lane;
            const toY = target.ref.y;
            this.shots.push({
                id: this.nextId++,
                fromLane: this.displayLane,
                toLane,
                fromY: this.playerY + 0.35,
                toY,
                life: 0.14,
                maxLife: 0.14,
                tier: this.weaponTier,
                damage: weapon.damage,
            });

            if (target.kind === 'enemy') {
                this.damageEnemy(target.ref, weapon.damage);
            } else {
                this.damageCrate(target.ref, weapon.damage);
            }
        }
        this.enemies = this.enemies.filter(e => e.state !== 'dead');
        this.weaponCrates = this.weaponCrates.filter(c => !c.claimed);
    }

    private damageEnemy(target: EnemyEntity, damage: number) {
        target.hp -= damage;
        target.hitFlash = 0.12;
        if (target.state === 'idle') target.state = 'chase';
        this.notify(`-${damage}`, false, target.lane, target.y + 0.15, 'damage');
        if (target.hp <= 0) {
            target.hp = 0;
            target.state = 'dead';
            this.kills += 1;
            this.score += target.kind === 'tank' ? 40 : 20;
            this.notify(target.kind === 'tank' ? '击破厚皮！' : '击破！', true, target.lane, target.y, 'info');
        }
    }

    private damageCrate(crate: WeaponCrateEntity, damage: number) {
        crate.hp -= damage;
        crate.hitFlash = 0.12;
        this.notify(`-${damage}`, false, crate.lane, crate.y + 0.15, 'damage');
        if (crate.hp > 0) return;
        crate.hp = 0;
        crate.claimed = true;
        const before = this.weaponTier;
        this.weaponTier = Math.max(this.weaponTier, Math.min(ZG_RULES.maxWeaponTier, crate.tier));
        this.score += 60;
        if (this.weaponTier > before) {
            this.notify(`获得武器！${this.weapon.name}`, true, crate.lane, crate.y, 'gate');
        } else if (this.weaponTier >= crate.tier) {
            this.notify('火力已拥有 +60', true, crate.lane, crate.y, 'gate');
        }
    }

    private resolveContact() {
        const survivors: EnemyEntity[] = [];
        for (const e of this.enemies) {
            if (e.state === 'dead') continue;
            const touching = e.y <= this.playerY + ZG_RULES.frontEpsilon
                && Math.abs(e.lane - this.playerLane) <= 0;
            if (!touching) {
                survivors.push(e);
                continue;
            }
            const lost = Math.min(this.unitCount, e.touchCost);
            this.unitCount -= lost;
            this.impact = 1;
            this.notify(`−${lost} 伙伴`, false, this.playerLane, this.playerY, 'info');
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

    private notify(text: string, good: boolean, lane: number, y: number, kind: FeedbackKind) {
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
            id: this.nextId++, text, good, life: maxLife, maxLife, lane, y, kind,
        });
    }
}
