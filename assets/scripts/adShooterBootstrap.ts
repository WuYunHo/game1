import {
    _decorator,
    Camera,
    Canvas,
    Color,
    Component,
    director,
    Director,
    EventMouse,
    EventTouch,
    Game,
    game,
    Graphics,
    input,
    Input,
    instantiate,
    Label,
    Layers,
    Node,
    Prefab,
    ResolutionPolicy,
    resources,
    Scene,
    UITransform,
    view,
} from 'cc';

const { ccclass } = _decorator;

type UpgradeKey = 'fireRate' | 'bulletDamage' | 'multiShot' | 'moveSpeed';
type GateType = 'mul' | 'add';
type RunPhase = 'ready' | 'playing' | 'gameOver';

interface BulletEntity {
    node: Node;
    damage: number;
    speed: number;
}

interface MonsterEntity {
    node: Node;
    hp: number;
    speed: number;
}

interface GateEntity {
    node: Node;
    type: GateType;
    value: number;
    used: boolean;
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
    killsPerUpgrade: number;
}

@ccclass('AdShooterGame')
class AdShooterGame extends Component {
    private worldRoot: Node | null = null;
    private uiRoot: Node | null = null;
    private player: Node | null = null;
    private hudLabel: Label | null = null;
    private endLabel: Label | null = null;
    private upgradePanel: Node | null = null;
    private restartButton: Node | null = null;
    private startPanel: Node | null = null;
    private startButton: Node | null = null;
    private levelRoot: Node | null = null;

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

    private score = 0;
    private kills = 0;
    private level = 1;
    private pendingUpgrade = false;
    private gameOver = false;
    private phase: RunPhase = 'ready';
    private currentUpgradeOptions: UpgradeKey[] = [];

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
        killsPerUpgrade: 6,
    };

    // Put your custom level prefab at: assets/resources/prefabs/Level.prefab
    // Ensure the player node inside prefab is named exactly "Player".
    private readonly levelPrefabPath = 'prefabs/Level';
    private readonly playerNodeName = 'Player';

    onLoad() {
        this.applyPortraitLayout();
        this.ensureCanvas();
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
        if (this.phase !== 'playing' || this.pendingUpgrade || this.gameOver) return;

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

    private ensureCanvas() {
        let canvas = director.getScene()?.getChildByName('Canvas');
        if (!canvas) {
            canvas = new Node('Canvas');
            canvas.layer = Layers.Enum.UI_2D;
            canvas.addComponent(UITransform).setContentSize(view.getVisibleSize());
            canvas.addComponent(Canvas);
            director.getScene()?.addChild(canvas);
            setupCanvasCamera(director.getScene()!);
        }
        this.node.setParent(canvas);
    }

    private createSceneNodes() {
        const { vs, halfH } = this.layout();

        this.worldRoot = new Node('WorldRoot');
        this.worldRoot.layer = Layers.Enum.UI_2D;
        this.worldRoot.addComponent(UITransform).setContentSize(vs);
        this.node.addChild(this.worldRoot);

        this.uiRoot = new Node('UIRoot');
        this.uiRoot.layer = Layers.Enum.UI_2D;
        this.uiRoot.addComponent(UITransform).setContentSize(vs);
        this.node.addChild(this.uiRoot);
        this.createFallbackPlayer();
        this.tryLoadCustomLevelPrefab();

        this.hudLabel = this.createLabelNode('HUD', '', 26, new Color(255, 255, 255, 255));
        this.hudLabel.node.setPosition(0, halfH - 48, 0);
        this.uiRoot.addChild(this.hudLabel.node);

        this.endLabel = this.createLabelNode('End', '', 36, new Color(255, 105, 105, 255));
        this.endLabel.node.active = false;
        this.endLabel.node.setPosition(0, 0, 0);
        this.uiRoot.addChild(this.endLabel.node);

        this.upgradePanel = new Node('UpgradePanel');
        this.upgradePanel.layer = Layers.Enum.UI_2D;
        this.upgradePanel.addComponent(UITransform).setContentSize(Math.min(700, vs.width - 20), 420);
        this.upgradePanel.active = false;
        this.upgradePanel.setPosition(0, 0, 0);
        this.uiRoot.addChild(this.upgradePanel);

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
        const { halfH } = this.layout();
        this.player = this.createRectNode('Player', 72, 42, new Color(80, 220, 255, 255));
        this.player.setPosition(0, -halfH + 100, 0);
        this.worldRoot?.addChild(this.player);
    }

    private tryLoadCustomLevelPrefab() {
        resources.load(this.levelPrefabPath, Prefab, (err, prefab) => {
            if (err || !prefab || !this.worldRoot) {
                return;
            }
            const level = instantiate(prefab);
            level.name = 'CustomLevel';
            this.worldRoot.addChild(level);
            this.levelRoot = level;

            const customPlayer = this.findNodeByName(level, this.playerNodeName);
            if (!customPlayer) {
                return;
            }

            if (this.player && this.player !== customPlayer && this.player.isValid && this.player.parent === this.worldRoot) {
                this.player.destroy();
            }

            customPlayer.layer = Layers.Enum.UI_2D;
            this.player = customPlayer;
            const { halfH } = this.layout();
            if (Math.abs(this.player.position.y) < 1) {
                this.player.setPosition(this.player.position.x, -halfH + 100, this.player.position.z);
            }
        });
    }

    private findNodeByName(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const c of root.children) {
            const found = this.findNodeByName(c, name);
            if (found) return found;
        }
        return null;
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
        if (this.pendingUpgrade) {
            this.confirmUpgradeByTap();
            return;
        }
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
        const { halfW } = this.layout();
        const current = this.player.position.clone();
        const maxX = halfW - 40;
        const desiredX = this.hasTouch ? this.touchX : current.x;
        const targetX = Math.max(-maxX, Math.min(maxX, desiredX));
        const step = this.moveSpeed * dt;
        const nextX = this.moveToward(current.x, targetX, step);
        this.player.setPosition(nextX, current.y, 0);
    }

    private spawnBullets() {
        if (!this.player || !this.worldRoot) return;
        const spread = 28;
        const total = Math.max(1, this.multiShot);
        const startX = -spread * (total - 1) * 0.5;
        for (let i = 0; i < total; i++) {
            const bullet = this.createRectNode('Bullet', 12, 24, new Color(255, 235, 90, 255));
            bullet.setPosition(this.player.position.x + startX + i * spread, this.player.position.y + 36, 0);
            this.worldRoot.addChild(bullet);
            this.bullets.push({ node: bullet, damage: this.bulletDamage, speed: 900 });
        }
    }

    private spawnMonster() {
        if (!this.worldRoot) return;
        const { halfW, halfH } = this.layout();
        const xBound = halfW - 28;
        const x = -xBound + Math.random() * xBound * 2;
        const hp = Math.max(1, Math.floor(1 + this.level * 0.45 + Math.random() * this.level * 0.35));
        const speed = this.monsterBaseSpeed + Math.random() * 70;
        const monster = this.createRectNode('Monster', 56, 56, new Color(255, 120, 120, 255));
        monster.setPosition(x, halfH - 100, 0);
        const hpLabel = this.createLabelNode('HP', `${hp}`, 22, new Color(0, 0, 0, 255));
        monster.addChild(hpLabel.node);
        this.worldRoot.addChild(monster);
        this.monsters.push({ node: monster, hp, speed });
    }

    private spawnGateRow() {
        if (!this.worldRoot) return;
        const { halfW, halfH } = this.layout();
        const gx = Math.min(150, halfW * 0.42);
        const gy = halfH - 200;
        const leftGate = this.createGate(Math.random() > 0.5 ? 'mul' : 'add');
        const rightGate = this.createGate(Math.random() > 0.5 ? 'mul' : 'add');
        leftGate.node.setPosition(-gx, gy, 0);
        rightGate.node.setPosition(gx, gy, 0);
        this.worldRoot.addChild(leftGate.node);
        this.worldRoot.addChild(rightGate.node);
        this.gates.push(leftGate, rightGate);
    }

    private createGate(type: GateType): GateEntity {
        const node = this.createRectNode('Gate', 150, 56, new Color(120, 180, 255, 220));
        const value = type === 'mul' ? (Math.random() > 0.5 ? 2 : 3) : (Math.random() > 0.5 ? 1 : 2);
        const label = this.createLabelNode('GateText', type === 'mul' ? `x${value}` : `+${value}`, 32, new Color(10, 20, 50, 255));
        node.addChild(label.node);
        return { node, type, value, used: false };
    }

    private updateBullets(dt: number) {
        const { halfH } = this.layout();
        const topY = halfH - 20;
        this.bullets = this.bullets.filter((b) => {
            if (!b.node.isValid) return false;
            b.node.setPosition(b.node.position.x, b.node.position.y + b.speed * dt, 0);
            if (b.node.position.y > topY) {
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
            m.node.setPosition(m.node.position.x, m.node.position.y - m.speed * dt, 0);
            if (m.node.position.y < bottomY) {
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
            g.node.setPosition(g.node.position.x, g.node.position.y - 220 * dt, 0);
            if (g.node.position.y < bottomY) {
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
                    if (this.kills > 0 && this.kills % this.tuning.killsPerUpgrade === 0) {
                        this.showUpgradeChoices();
                    }
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

    private showUpgradeChoices() {
        if (!this.upgradePanel || this.pendingUpgrade || this.gameOver) return;
        const { vs, halfW } = this.layout();
        this.pendingUpgrade = true;
        this.upgradePanel.removeAllChildren();
        this.upgradePanel.active = true;
        this.upgradePanel.getComponent(UITransform)?.setContentSize(Math.min(700, vs.width - 20), 420);

        const title = this.createLabelNode('UpgradeTitle', '选择升级', 32, new Color(255, 255, 255, 255));
        title.node.setPosition(0, 150, 0);
        this.upgradePanel.addChild(title.node);

        const options = this.pickUpgrades(3);
        this.currentUpgradeOptions = options;
        const useVertical = halfW * 2 < 600;
        for (let i = 0; i < options.length; i++) {
            const key = options[i];
            const bw = useVertical ? Math.min(200, halfW * 2 - 60) : 180;
            const bh = useVertical ? 72 : 86;
            const btn = this.createRectNode(`Upgrade-${key}`, bw, bh, new Color(100, 220, 150, 255));
            if (useVertical) {
                btn.setPosition(0, 50 - i * 95, 0);
            } else {
                const startX = -220;
                btn.setPosition(startX + i * 220, -20, 0);
            }
            const lb = this.createLabelNode('Text', this.upgradeText(key), 24, new Color(20, 40, 20, 255));
            btn.addChild(lb.node);
            this.upgradePanel.addChild(btn);
            const onChoose = () => {
                this.applyUpgrade(key);
                this.upgradePanel!.active = false;
                this.pendingUpgrade = false;
                this.currentUpgradeOptions = [];
                this.updateHud();
            };
            btn.on(Node.EventType.TOUCH_END, onChoose);
            btn.on(Node.EventType.MOUSE_UP, onChoose);
        }
    }

    private confirmUpgradeByTap() {
        if (!this.pendingUpgrade || this.currentUpgradeOptions.length === 0) {
            return;
        }
        const pick = this.currentUpgradeOptions[Math.floor(Math.random() * this.currentUpgradeOptions.length)];
        this.applyUpgrade(pick);
        if (this.upgradePanel) {
            this.upgradePanel.active = false;
        }
        this.pendingUpgrade = false;
        this.currentUpgradeOptions = [];
        this.updateHud();
    }

    private applyUpgrade(key: UpgradeKey) {
        switch (key) {
            case 'fireRate':
                this.fireInterval = Math.max(0.09, this.fireInterval - 0.05);
                break;
            case 'bulletDamage':
                this.bulletDamage += 1;
                break;
            case 'multiShot':
                this.multiShot = Math.min(9, this.multiShot + 1);
                break;
            case 'moveSpeed':
                this.moveSpeed += 80;
                break;
        }
    }

    private upgradeText(key: UpgradeKey) {
        switch (key) {
            case 'fireRate': return 'ATK SPD +';
            case 'bulletDamage': return 'DMG +';
            case 'multiShot': return 'SHOT +1';
            case 'moveSpeed': return 'MOVE +';
        }
    }

    private pickUpgrades(n: number): UpgradeKey[] {
        const all: UpgradeKey[] = ['fireRate', 'bulletDamage', 'multiShot', 'moveSpeed'];
        const result: UpgradeKey[] = [];
        while (result.length < n && all.length > 0) {
            const idx = Math.floor(Math.random() * all.length);
            result.push(all[idx]);
            all.splice(idx, 1);
        }
        return result;
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
        this.pendingUpgrade = false;
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
        if (this.upgradePanel) {
            this.upgradePanel.active = false;
            this.upgradePanel.removeAllChildren();
        }
        if (this.restartButton) this.restartButton.active = false;
        if (this.startPanel) this.startPanel.active = true;
        this.currentUpgradeOptions = [];
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
        return Math.abs(ap.x - bp.x) * 2 < ta.contentSize.x + tb.contentSize.x &&
            Math.abs(ap.y - bp.y) * 2 < ta.contentSize.y + tb.contentSize.y;
    }

    private isPointInNode(node: Node, x: number, y: number): boolean {
        const ui = node.getComponent(UITransform);
        if (!ui) return false;
        const rect = ui.getBoundingBoxToWorld();
        return rect.contains({ x, y });
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

function mountAdShooter() {
    applyDesignResolution();
    const scene = director.getScene();
    if (!scene) return;

    let canvas = scene.getChildByName('Canvas');
    if (!canvas) {
        canvas = new Node('Canvas');
        canvas.layer = Layers.Enum.UI_2D;
        applyDesignResolution();
        canvas.addComponent(UITransform).setContentSize(view.getVisibleSize());
        canvas.addComponent(Canvas);
        scene.addChild(canvas);
    }
    setupCanvasCamera(scene);

    let root = canvas.getChildByName('AdShooterRoot');
    if (!root) {
        root = new Node('AdShooterRoot');
        root.layer = Layers.Enum.UI_2D;
        root.addComponent(UITransform).setContentSize(view.getVisibleSize());
        canvas.addChild(root);
        root.addComponent(AdShooterGame);
    }
}

game.once(Game.EVENT_GAME_INITED, () => {
    applyDesignResolution();
    director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
        applyDesignResolution();
        mountAdShooter();
    });
    mountAdShooter();
});

