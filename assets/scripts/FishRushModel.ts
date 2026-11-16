/** Engine-independent rules. Coordinates: x -1..1, depth 0 (horizon)..1 (contact). */
export type Phase = 'ready' | 'playing' | 'won' | 'lost';
export type Gate = { kind: 'add' | 'mul'; value: number };
export type Encounter = {
    id: number; kind: 'gate' | 'enemy' | 'boss'; depth: number; x: number;
    cost: number; gates?: [Gate, Gate];
};
export type Feedback = { id: number; text: string; good: boolean; life: number; x: number };

export const RULES = Object.freeze({
    initialFish: 5,
    duration: 60,
    travelTime: 4.2,
    wrongGateLimit: 3,
});

export class FishRushModel {
    phase: Phase = 'ready';
    stage = 1;
    fish: number = RULES.initialFish;
    peakFish: number = RULES.initialFish;
    score = 0;
    private wrongGateSelections = 0;
    private pathDefeatArmed = false;
    elapsed = 0;
    clock = 0;
    x = 0;
    targetX = 0;
    encounters: Encounter[] = [];
    feedback: Feedback[] = [];
    impact = 0;
    private nextId = 1;
    private nextGate = 0;
    private nextEnemy = 2.8;
    private bossSpawned = false;

    constructor(private random: () => number = Math.random) {}

    start(stage = this.stage) {
        this.stage = stage;
        this.fish = RULES.initialFish;
        this.peakFish = this.fish;
        this.score = 0;
        this.wrongGateSelections = 0;
        this.pathDefeatArmed = false;
        this.elapsed = 0;
        this.x = this.targetX = 0;
        this.encounters = [];
        this.feedback = [];
        this.nextGate = 0;
        this.nextEnemy = 2.8;
        this.bossSpawned = false;
        this.impact = 0;
        this.phase = 'playing';
    }

    steer(x: number) { this.targetX = Math.max(-0.78, Math.min(0.78, x)); }

    tick(dt: number) {
        // Bound resume gaps; do not jump through gates after backgrounding the app.
        dt = Math.max(0, Math.min(dt, 0.05));
        this.clock += dt;
        this.impact = Math.max(0, this.impact - dt * 3);
        for (const f of this.feedback) f.life -= dt;
        this.feedback = this.feedback.filter(f => f.life > 0);
        if (this.phase !== 'playing') return;
        this.elapsed += dt;
        this.x += (this.targetX - this.x) * Math.min(1, dt * 18);

        if (this.elapsed >= this.nextGate && this.nextGate < 48) {
            const n = Math.floor(this.nextGate / 4.3);
            const a: Gate = { kind: n % 3 === 0 ? 'mul' : 'add', value: n % 3 === 0 ? 2 : 3 + n };
            const b: Gate = { kind: n % 3 === 1 ? 'mul' : 'add', value: n % 3 === 1 ? 2 : 2 + n };
            const gates: [Gate, Gate] = this.random() < 0.5 ? [a, b] : [b, a];
            this.encounters.push({ id: this.nextId++, kind: 'gate', depth: 0, x: 0, cost: 0, gates });
            this.nextGate += 4.3;
        }
        if (this.elapsed >= this.nextEnemy && this.nextEnemy < 49) {
            const wave = Math.min(5, 3 + Math.floor(this.elapsed / 15) + Math.floor((this.stage - 1) / 2));
            const lanes = [-0.72, -0.36, 0, 0.36, 0.72];
            const laneOffset = Math.floor(this.random() * lanes.length);
            for (let i = 0; i < wave; i++) {
                this.encounters.push({ id: this.nextId++, kind: 'enemy',
                    x: lanes[(i + laneOffset) % lanes.length],
                    // A tiny stagger makes each mid-run enemy readable instead of
                    // collapsing the whole wave into a single sprite.
                    depth: i * 0.018,
                    cost: Math.ceil(2.5 + this.elapsed * 0.12 + (this.stage - 1) * 1.2) });
            }
            this.nextEnemy += 3.3;
        }
        if (!this.bossSpawned && this.elapsed >= RULES.duration - RULES.travelTime) {
            this.bossSpawned = true;
            this.encounters.push({ id: this.nextId++, kind: 'boss', depth: 0, x: 0, cost: 18 + this.stage * 6 });
            this.notify('大飞鼠首领来袭！', false, 0);
        }
        for (const e of this.encounters) {
            e.depth += dt / RULES.travelTime;
            if (e.depth < 1) continue;
            if (e.kind === 'gate') {
                const selectedIndex = this.x < 0 ? 0 : 1;
                const g = e.gates![selectedIndex];
                const other = e.gates![selectedIndex === 0 ? 1 : 0];
                const before = this.fish;
                const resultFor = (gate: Gate) => gate.kind === 'mul' ? before * gate.value : before + gate.value;
                const selectedResult = resultFor(g);
                const otherResult = resultFor(other);
                if (selectedResult < otherResult) {
                    this.wrongGateSelections += 1;
                    if (this.wrongGateSelections > RULES.wrongGateLimit) this.pathDefeatArmed = true;
                }
                this.fish = selectedResult;
                this.peakFish = Math.max(this.peakFish, this.fish);
                this.score += (this.fish - before) * 10;
                this.notify(this.fish === before ? '鱼群已满！' : `+${this.fish - before} 伙伴！`, true, this.x);
            } else if (e.kind === 'boss') {
                if (this.pathDefeatArmed) {
                    this.fish = 0;
                    this.phase = 'lost';
                    this.notify('飞飞鼠首领击败了鱼群', false, this.x);
                    break;
                }
                const lost = Math.min(Math.max(0, this.fish - 1), e.cost);
                this.fish -= lost;
                this.impact = 1;
                this.score += e.cost * 20;
                if (this.fish <= 0) { this.phase = 'lost'; break; }
                this.phase = 'won';
                this.score += this.fish * 50;
                this.notify('首领突破！', true, this.x);
                break;
            } else if (Math.abs(this.x - e.x) < 0.24) {
                if (this.pathDefeatArmed) {
                    this.fish = 0;
                    this.phase = 'lost';
                    this.notify('路径飞飞鼠击败了鱼群', false, this.x);
                    break;
                }
                const lost = Math.min(this.fish, e.cost);
                this.fish -= lost;
                this.impact = 1;
                this.notify(`−${lost} 伙伴`, false, this.x);
                if (this.fish <= 0) { this.phase = 'lost'; break; }
                this.score += e.cost * 20;
            } else {
                this.score += 25;
                this.notify('灵巧闪避 +25', true, this.x);
            }
        }
        this.encounters = this.encounters.filter(e => e.depth < 1);
    }

    private notify(text: string, good: boolean, x: number) {
        this.feedback.push({ id: this.nextId++, text, good, x, life: 1.35 });
    }
}
