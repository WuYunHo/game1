import {
    _decorator,
    Camera,
    Canvas,
    Color,
    Component,
    director,
    EventMouse,
    EventTouch,
    Graphics,
    input,
    Input,
    Label,
    Layers,
    Node,
    ResolutionPolicy,
    Scene,
    UITransform,
    view,
} from 'cc';

const { ccclass } = _decorator;

type GateType = 'mul' | 'add';
type RunPhase = 'ready' | 'playing' | 'gameOver';

interface BulletEntity {
    node: Node;
    damage: number;
    speed: number;
    worldX: number;
}

interface MonsterEntity {
    node: Node;
    hp: number;
    speed: number;
    worldX: number;
}

interface GateEntity {
    node: Node;
    type: GateType;
    value: number;
    used: boolean;
    speed: number;
    worldX: number;
}

interface FloatingTextEntity {
    node: Node;
    life: number;
    speed: number;
}

interface TuningConfig {
    baseFireInterval: number;
    minFireInterval: number;
    baseMonsterSpawnInterval: number;
    minMonsterSpawnInterval: number;
    gateSpawnInterval: number;
    levelUpIntervalSec: number;
    baseMonsterSpeed: number;
    monsterSpeedPerLevel: number;
}

@ccclass('AdShooterGame')
class AdShooterGame extends Component {
    private worldRoot: Node | null = null;
    private uiRoot: Node | null = null;
    private player: Node | null = null;
    private hudLabel: Label | null = null;
    private endLabel: Label | null = null;
    private restartButton: Node | null = null;
    private startPanel: Node | null = null;
    private startButton: Node | null = null;

    private bullets: BulletEntity[] = [];
    private monsters: MonsterEntity[] = [];
    private gates: GateEntity[] = [];
    private floatingTexts: FloatingTextEntity[] = [];

    private fireTimer = 0;
    private monsterTimer = 0;
    private gateTimer = 0;
    private difficultyTimer = 0;
    private touchX = 0;
    private hasTouch = false;
    private playerWorldX = 0;

    private score = 0;
    private kills = 0;
    private level = 1;
    private gameOver = false;
    private phase: RunPhase = 'ready';

    private fireInterval = 0.28;
    private bulletDamage = 1;
    private multiShot = 1;
    private moveSpeed = 650;
    private monsterBaseSpeed = 130;

    private tuning: TuningConfig = {
        baseFireInterval: 0.28,
        minFireInterval: 0.08,
        baseMonsterSpawnInterval: 0.85,
        minMonsterSpawnInterval: 0.2,
        gateSpawnInterval: 3,
        levelUpIntervalSec: 12,
        baseMonsterSpeed: 130,
        monsterSpeedPerLevel: 12,
    };

    onLoad() {
        this.applyPortraitLayout();
        setupCanvasCamera(director.getScene()!);
        this.createSceneNodes();
        this.bindInput();
        this.resetRun();
    }

    private applyPortraitLayout() {
        applyDesignResolution();
    }

    private layout() {
        const vs = view.getVisibleSize();
        const halfW = vs.width * 0.5;
        const halfH = vs.height * 0.5;
        return { vs, halfW, halfH };
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouch, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    update(dt: number) {
        if (this.phase !== 'playing' || this.gameOver) return;

        this.difficultyTimer += dt;
        this.fireTimer += dt;
        this.monsterTimer += dt;
        this.gateTimer += dt;

        this.updatePlayer(dt);
        this.updateBullets(dt);
        this.updateMonsters(dt);
        this.updateGates(dt);
        this.updateFloatingTexts(dt);
        this.handleCollisions();

        const fireStep = Math.max(this.tuning.minFireInterval, this.fireInterval);
        if (this.fireTimer >= fireStep) {
            this.fireTimer = 0;
            this.spawnBullets();
        }

        const spawnStep = Math.max(this.tuning.minMonsterSpawnInterval, this.tuning.baseMonsterSpawnInterval - this.level * 0.02);
        if (this.monsterTimer >= spawnStep) {
            this.monsterTimer = 0;
            this.spawnMonster();
        }

        if (this.gateTimer >= this.tuning.gateSpawnInterval) {
            this.gateTimer = 0;
            this.spawnGateRow();
        }

        if (this.difficultyTimer >= this.tuning.levelUpIntervalSec) {
            this.difficultyTimer = 0;
            this.level += 1;
            this.monsterBaseSpeed += this.tuning.monsterSpeedPerLevel;
            this.updateHud();
        }
    }

    private createSceneNodes() {
        const { vs, halfH } = this.layout();

        const scene = director.getScene();
        const canvas = scene?.getChildByName('Canvas') ?? null;
        this.uiRoot = canvas?.getChildByName('BattleScene') ?? canvas;
        if (!this.uiRoot) {
            this.uiRoot = new Node('UIRoot');
            this.uiRoot.layer = Layers.Enum.UI_2D;
            this.uiRoot.addComponent(UITransform).setContentSize(vs);
            this.node.addChild(this.uiRoot);
        }

        // Current BattleContent/BattleScene assets are still UI-based.
        // Keep gameplay entities under Canvas branch to ensure rendering.
        let world = this.uiRoot.getChildByName('WorldRoot2D');
        if (!world) {
            world = new Node('WorldRoot2D');
            world.layer = Layers.Enum.UI_2D;
            world.addComponent(UITransform).setContentSize(vs);
            this.uiRoot.addChild(world);
        }
        this.worldRoot = world;

        this.createFallbackPlayer();

        this.hudLabel = this.createLabelNode('HUD', '', 26, new Color(255, 255, 255, 255));
        this.hudLabel.node.setPosition(0, halfH - 48, 0);
        this.uiRoot.addChild(this.hudLabel.node);

        this.endLabel = this.createLabelNode('End', '', 36, new Color(255, 105, 105, 255));
        this.endLabel.node.active = false;
        this.endLabel.node.setPosition(0, 0, 0);
        this.uiRoot.addChild(this.endLabel.node);

        this.restartButton = this.createRectNode('RestartButton', 220, 72, new Color(255, 180, 100, 255));
        this.restartButton.setPosition(0, -halfH + 180, 0);
        this.restartButton.active = false;
        const restartText = this.createLabelNode('RestartText', 'RESTART', 28, new Color(60, 30, 0, 255));
        this.restartButton.addChild(restartText.node);
        this.uiRoot.addChild(this.restartButton);
        this.restartButton.on(Node.EventType.TOUCH_END, () => this.resetRun());
        this.restartButton.on(Node.EventType.MOUSE_UP, () => this.resetRun());

        const panelW = Math.min(360, vs.width - 32);
        const panelH = 300;
        this.startPanel = this.createRectNode('StartPanel', panelW, panelH, new Color(30, 40, 70, 220));
        this.startPanel.setPosition(0, 0, 0);
        this.uiRoot.addChild(this.startPanel);
        const startTitle = this.createLabelNode('StartTitle', 'Arcade Shooter', 40, new Color(255, 255, 255, 255));
        startTitle.node.setPosition(0, 70, 0);
        this.startPanel.addChild(startTitle.node);
        const startHint = this.createLabelNode('StartHint', '左右滑动 选更强的门', 22, new Color(200, 220, 255, 255));
        startHint.node.setPosition(0, 0, 0);
        this.startPanel.addChild(startHint.node);
        this.startButton = this.createRectNode('StartButton', 200, 64, new Color(120, 240, 140, 255));
        this.startButton.setPosition(0, -80, 0);
        const startText = this.createLabelNode('StartText', 'START', 30, new Color(20, 60, 20, 255));
        this.startButton.addChild(startText.node);
        this.startPanel.addChild(this.startButton);
        this.startButton.on(Node.EventType.TOUCH_END, () => this.beginRun());
        this.startButton.on(Node.EventType.MOUSE_UP, () => this.beginRun());
    }

    private createFallbackPlayer() {
        const existed = this.worldRoot?.getChildByName('Player') ?? null;
        if (existed) {
            this.player = existed;
            return;
        }
        const { halfH } = this.layout();
        this.player = this.createRectNode('Player', 72, 42, new Color(80, 220, 255, 255));
        this.player.setPosition(0, -halfH + 100, 0);
        this.playerWorldX = 0;
        this.applyPerspectiveScale(this.player, this.player.position.y, 0.52, 1);
        this.worldRoot?.addChild(this.player);
    }

    private bindInput() {
        input.on(Input.EventType.TOUCH_START, this.onTouch, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouch, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    private onTouch() {
        const last = input.getTouch(0);
        if (!last) return;
        const p = last.getUILocation();
        this.touchX = p.x - this.layout().halfW;
        this.hasTouch = true;
    }

    private onMouseMove(event: EventMouse) {
        const p = event.getUILocation();
        this.touchX = p.x - this.layout().halfW;
        this.hasTouch = true;
    }

    private onTouchEnd(event: EventTouch) {
        const p = event.getUILocation();
        this.handleUiTap(p.x, p.y);
    }

    private onMouseUp(event: EventMouse) {
        const p = event.getUILocation();
        this.handleUiTap(p.x, p.y);
    }

    private handleUiTap(x: number, y: number) {
        if (this.phase === 'ready') {
            this.beginRun();
            return;
        }
        if (this.phase === 'gameOver') {
            this.resetRun();
        }
    }

    private updatePlayer(dt: number) {
        if (!this.player) return;
        const { halfW, halfH } = this.layout();
        const current = this.player.position.clone();
        const maxX = halfW - 40;
        const desiredX = this.hasTouch ? this.touchX : this.playerWorldX;
        const targetX = Math.max(-maxX, Math.min(maxX, desiredX));
        const step = this.moveSpeed * dt;
        this.playerWorldX = this.moveToward(this.playerWorldX, targetX, step);
        const y = -halfH + 100;
        const renderX = this.projectXByY(this.playerWorldX, y);
        this.player.setPosition(renderX, y, 0);
        this.applyPerspectiveScale(this.player, y, 0.52, 1);
    }

    private spawnBullets() {
        if (!this.player || !this.worldRoot) return;
        const spread = 28;
        const total = Math.max(1, this.multiShot);
        const startX = -spread * (total - 1) * 0.5;
        for (let i = 0; i < total; i++) {
            const bullet = this.createRectNode('Bullet', 12, 24, new Color(255, 235, 90, 255));
            const y = this.player.position.y + 36;
            const worldX = this.playerWorldX + startX + i * spread;
            bullet.setPosition(this.projectXByY(worldX, y), y, 0);
            this.applyPerspectiveScale(bullet, y, 0.35, 0.9);
            this.worldRoot.addChild(bullet);
            this.bullets.push({ node: bullet, damage: this.bulletDamage, speed: 900, worldX });
        }
    }

    private spawnMonster() {
        if (!this.worldRoot) return;
        const { halfW, halfH } = this.layout();
        const xBound = halfW - 28;
        const worldX = -xBound + Math.random() * xBound * 2;
        const hp = Math.max(1, Math.floor(1 + this.level * 0.45 + Math.random() * this.level * 0.35));
        const speed = this.monsterBaseSpeed + Math.random() * 70;
        const monster = this.createRectNode('Monster', 56, 56, new Color(255, 120, 120, 255));
        const y = halfH - 100;
        monster.setPosition(this.projectXByY(worldX, y), y, 0);
        this.applyPerspectiveScale(monster, y, 0.45, 1.3);
        const hpLabel = this.createLabelNode('HP', `${hp}`, 22, new Color(0, 0, 0, 255));
        monster.addChild(hpLabel.node);
        this.worldRoot.addChild(monster);
        this.monsters.push({ node: monster, hp, speed, worldX });
    }

    private spawnGateRow() {
        if (!this.worldRoot) return;
        const { halfW, halfH } = this.layout();
        const gx = Math.min(150, halfW * 0.42);
        const gy = halfH - 200;
        const leftGate = this.createGate(Math.random() > 0.5 ? 'mul' : 'add');
        const rightGate = this.createGate(Math.random() > 0.5 ? 'mul' : 'add');
        leftGate.worldX = -gx;
        rightGate.worldX = gx;
        leftGate.node.setPosition(this.projectXByY(leftGate.worldX, gy), gy, 0);
        rightGate.node.setPosition(this.projectXByY(rightGate.worldX, gy), gy, 0);
        this.applyPerspectiveScale(leftGate.node, gy, 0.5, 1.25);
        this.applyPerspectiveScale(rightGate.node, gy, 0.5, 1.25);
        this.worldRoot.addChild(leftGate.node);
        this.worldRoot.addChild(rightGate.node);
        this.gates.push(leftGate, rightGate);
    }

    private createGate(type: GateType): GateEntity {
        const node = this.createRectNode('Gate', 150, 56, new Color(120, 180, 255, 220));
        const value = type === 'mul' ? (Math.random() > 0.5 ? 2 : 3) : (Math.random() > 0.5 ? 1 : 2);
        const label = this.createLabelNode('GateText', type === 'mul' ? `x${value}` : `+${value}`, 32, new Color(10, 20, 50, 255));
        node.addChild(label.node);
        return { node, type, value, used: false, speed: 220, worldX: 0 };
    }

    private updateBullets(dt: number) {
        const { halfH } = this.layout();
        const topY = halfH - 20;
        this.bullets = this.bullets.filter((b) => {
            if (!b.node.isValid) return false;
            const y = b.node.position.y + b.speed * dt;
            b.node.setPosition(this.projectXByY(b.worldX, y), y, 0);
            this.applyPerspectiveScale(b.node, y, 0.35, 0.9);
            if (y > topY) {
                b.node.destroy();
                return false;
            }
            return true;
        });
    }

    private updateMonsters(dt: number) {
        const { halfH } = this.layout();
        const bottomY = -halfH - 40;
        this.monsters = this.monsters.filter((m) => {
            if (!m.node.isValid) return false;
            const y = m.node.position.y - m.speed * dt;
            m.node.setPosition(this.projectXByY(m.worldX, y), y, 0);
            this.applyPerspectiveScale(m.node, y, 0.45, 1.35);
            if (y < bottomY) {
                m.node.destroy();
                return false;
            }
            return true;
        });
    }

    private updateGates(dt: number) {
        const { halfH } = this.layout();
        const bottomY = -halfH + 20;
        this.gates = this.gates.filter((g) => {
            if (!g.node.isValid) return false;
            const y = g.node.position.y - g.speed * dt;
            g.node.setPosition(this.projectXByY(g.worldX, y), y, 0);
            this.applyPerspectiveScale(g.node, y, 0.5, 1.25);
            if (y < bottomY) {
                g.node.destroy();
                return false;
            }
            return true;
        });
    }

    private updateFloatingTexts(dt: number) {
        this.floatingTexts = this.floatingTexts.filter((f) => {
            if (!f.node.isValid) return false;
            f.life -= dt;
            f.node.setPosition(f.node.position.x, f.node.position.y + f.speed * dt, 0);
            if (f.life <= 0) {
                f.node.destroy();
                return false;
            }
            return true;
        });
    }

    private handleCollisions() {
        if (!this.player) return;

        for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
            const bullet = this.bullets[bi];
            if (!bullet.node.isValid) continue;
            for (let mi = this.monsters.length - 1; mi >= 0; mi--) {
                const monster = this.monsters[mi];
                if (!monster.node.isValid) continue;
                if (!this.aabbOverlap(bullet.node, monster.node)) continue;

                monster.hp -= bullet.damage;
                bullet.node.destroy();
                this.bullets.splice(bi, 1);

                if (monster.hp <= 0) {
                    this.score += 10;
                    this.kills += 1;
                    this.spawnFloatingText(monster.node.position.x, monster.node.position.y + 25, '+10', new Color(255, 225, 120, 255));
                    monster.node.destroy();
                    this.monsters.splice(mi, 1);
                    this.updateHud();
                } else {
                    const hpLabel = monster.node.getComponentInChildren(Label);
                    if (hpLabel) hpLabel.string = `${monster.hp}`;
                }
                break;
            }
        }

        for (const gate of this.gates) {
            if (gate.used || !gate.node.isValid) continue;
            if (!this.aabbOverlap(this.player, gate.node)) continue;
            gate.used = true;
            gate.node.destroy();
            this.applyGate(gate);
        }

        for (const monster of this.monsters) {
            if (!monster.node.isValid) continue;
            if (this.aabbOverlap(this.player, monster.node)) {
                this.triggerGameOver();
                return;
            }
        }
    }

    private applyGate(gate: GateEntity) {
        const { halfH } = this.layout();
        const popY = -halfH + 100;
        if (gate.type === 'mul') {
            this.multiShot = Math.min(9, this.multiShot * gate.value);
            this.spawnFloatingText(this.player?.position.x ?? 0, popY, `SHOT x${gate.value}`, new Color(120, 220, 255, 255));
        } else {
            this.bulletDamage += gate.value;
            this.spawnFloatingText(this.player?.position.x ?? 0, popY, `DMG +${gate.value}`, new Color(180, 255, 130, 255));
        }
        this.score += 15;
        this.updateHud();
    }

    private triggerGameOver() {
        this.gameOver = true;
        this.phase = 'gameOver';
        if (this.endLabel) {
            this.endLabel.string = `FAILED\nScore ${this.score}\nTap RESTART`;
            this.endLabel.node.active = true;
        }
        if (this.restartButton) this.restartButton.active = true;
    }

    private updateHud() {
        if (!this.hudLabel) return;
        this.hudLabel.string = `Score ${this.score}  Kills ${this.kills}  Lv ${this.level}\nDMG ${this.bulletDamage}  Shot ${this.multiShot}  ASPD ${(1 / this.fireInterval).toFixed(1)}`;
    }

    private spawnFloatingText(x: number, y: number, text: string, color: Color) {
        if (!this.uiRoot) return;
        const label = this.createLabelNode('FloatText', text, 24, color);
        label.node.setPosition(x, y, 0);
        this.uiRoot.addChild(label.node);
        this.floatingTexts.push({ node: label.node, life: 0.8, speed: 85 });
    }

    private beginRun() {
        this.phase = 'playing';
        this.gameOver = false;
        if (this.startPanel) this.startPanel.active = false;
        if (this.endLabel) this.endLabel.node.active = false;
        if (this.restartButton) this.restartButton.active = false;
    }

    private resetRun() {
        this.clearEntities();
        this.score = 0;
        this.kills = 0;
        this.level = 1;
        this.gameOver = false;
        this.fireTimer = 0;
        this.monsterTimer = 0;
        this.gateTimer = 0;
        this.difficultyTimer = 0;
        this.fireInterval = this.tuning.baseFireInterval;
        this.bulletDamage = 1;
        this.multiShot = 1;
        this.moveSpeed = 650;
        this.monsterBaseSpeed = this.tuning.baseMonsterSpeed;
        this.phase = 'ready';

        if (this.player) {
            const { halfH } = this.layout();
            this.player.setPosition(0, -halfH + 100, 0);
        }
        if (this.endLabel) {
            this.endLabel.node.active = false;
            this.endLabel.string = '';
        }
        if (this.restartButton) this.restartButton.active = false;
        if (this.startPanel) this.startPanel.active = true;
        this.updateHud();
    }

    private clearEntities() {
        for (const b of this.bullets) if (b.node.isValid) b.node.destroy();
        for (const m of this.monsters) if (m.node.isValid) m.node.destroy();
        for (const g of this.gates) if (g.node.isValid) g.node.destroy();
        for (const f of this.floatingTexts) if (f.node.isValid) f.node.destroy();
        this.bullets = [];
        this.monsters = [];
        this.gates = [];
        this.floatingTexts = [];
    }

    private createRectNode(name: string, width: number, height: number, color: Color): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(width, height);
        const g = node.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-width / 2, -height / 2, width, height);
        g.fill();
        return node;
    }

    private createLabelNode(name: string, text: string, size: number, color: Color): Label {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(360, 70);
        const lb = node.addComponent(Label);
        lb.string = text;
        lb.fontSize = size;
        lb.lineHeight = size + 6;
        lb.color = color;
        return lb;
    }

    private aabbOverlap(a: Node, b: Node): boolean {
        const ta = a.getComponent(UITransform);
        const tb = b.getComponent(UITransform);
        if (!ta || !tb) return false;
        const ap = a.worldPosition;
        const bp = b.worldPosition;
        const aw = ta.contentSize.x * Math.abs(a.worldScale.x);
        const ah = ta.contentSize.y * Math.abs(a.worldScale.y);
        const bw = tb.contentSize.x * Math.abs(b.worldScale.x);
        const bh = tb.contentSize.y * Math.abs(b.worldScale.y);
        return Math.abs(ap.x - bp.x) * 2 < aw + bw &&
            Math.abs(ap.y - bp.y) * 2 < ah + bh;
    }

    private getPerspectiveTByY(y: number): number {
        const { halfH } = this.layout();
        const farY = halfH - 140;
        const nearY = -halfH + 120;
        const raw = (y - farY) / (nearY - farY);
        return Math.max(0, Math.min(1, raw));
    }

    private projectXByY(worldX: number, y: number): number {
        const t = this.getPerspectiveTByY(y);
        const widthFactor = 0.22 + 0.78 * t; // far narrower, near wider
        return worldX * widthFactor;
    }

    private applyPerspectiveScale(node: Node, y: number, farScale: number, nearScale: number) {
        const t = this.getPerspectiveTByY(y);
        const curved = t * t;
        const s = farScale + (nearScale - farScale) * curved;
        node.setScale(s, s, 1);
    }

    private moveToward(from: number, to: number, delta: number): number {
        if (Math.abs(to - from) <= delta) return to;
        return from + Math.sign(to - from) * delta;
    }
}

function applyDesignResolution() {
    view.setDesignResolutionSize(720, 1280, ResolutionPolicy.SHOW_ALL);
}

function setupCanvasCamera(scene: Scene) {
    const canvasNode = scene.getChildByName('Canvas');
    const mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera);
    if (!canvasNode || !mainCam) {
        return;
    }
    mainCam.visibility = mainCam.visibility | Layers.Enum.UI_2D;
    const cvs = canvasNode.getComponent(Canvas);
    if (cvs) {
        // 3.8+ Canvas.camera 为只读；序列化字段为 _cameraComponent（与 main.scene 一致）
        (cvs as unknown as { _cameraComponent: Camera | null })._cameraComponent = mainCam;
    }
}


