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
    instantiate,
    Label,
    Layers,
    Node,
    ResolutionPolicy,
    Scene,
    UITransform,
    Vec3,
    view,
} from 'cc';

const { ccclass, property } = _decorator;

type GateType = 'mul' | 'add';
type RunPhase = 'ready' | 'playing' | 'gameOver';

interface BulletEntity {
    node: Node;
    damage: number;
    speed: number;
    lane: number;
    z: number;
}

interface MonsterEntity {
    node: Node;
    hp: number;
    speed: number;
    lane: number;
    z: number;
}

interface GateEntity {
    node: Node;
    type: GateType;
    value: number;
    used: boolean;
    speed: number;
    laneStart: number;
    laneEnd: number;
    centerLane: number;
    z: number;
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
    private readonly laneCount = 12;
    private readonly gateWidthInLanes = 6;
    private readonly gridRows = 40;
    private readonly worldLaneWidth = 1.6;
    private readonly farDepth = 42;
    private readonly nearDepth = 10;
    private readonly playY = -2.8;
    private readonly playerZ = 6;
    private readonly monsterSpawnZ = 44;
    private readonly gateSpawnZ = 36;
    private readonly bulletSpeed3D = 28;
    private readonly gateSpeed3D = 4.2;
    private readonly showGrid = false;
    private readonly showDebugMarker = false;
    private worldRoot: Node | null = null;
    private uiRoot: Node | null = null;
    private gridOverlay: Node | null = null;
    private world3DRoot: Node | null = null;
    private cubeTemplate: Node | null = null;
    private debugMarker: Node | null = null;

    @property(Camera)
    projectorCamera: Camera | null = null;

    private readonly tmpScreen = new Vec3();
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
    private playerLane = 5.5;
    private targetLane = 5.5;

    private score = 0;
    private kills = 0;
    private level = 1;
    private gameOver = false;
    private phase: RunPhase = 'ready';

    private fireInterval = 0.28;
    private bulletDamage = 1;
    private multiShot = 1;
    private laneMoveSpeed = 12;
    private monsterBaseSpeed = 6.5;

    private tuning: TuningConfig = {
        baseFireInterval: 0.28,
        minFireInterval: 0.08,
        baseMonsterSpawnInterval: 0.85,
        minMonsterSpawnInterval: 0.2,
        gateSpawnInterval: 3,
        levelUpIntervalSec: 12,
        baseMonsterSpeed: 6.5,
        monsterSpeedPerLevel: 0.45,
    };

    onLoad() {
        this.applyPortraitLayout();
        const scene = director.getScene()!;
        setupCanvasCamera(scene);
        this.setupPerspectiveProjector(scene);
        this.createSceneNodes();
        this.bindInput();
        this.resetRun();
    }

    private setupPerspectiveProjector(scene: Scene) {
        const mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
        if (this.projectorCamera) {
            if (mainCam && this.projectorCamera === mainCam) {
                this.projectorCamera = null;
            } else {
                this.configureProjectorCamera(this.projectorCamera);
                this.projectorCamera.node.setPosition(0, 13, -18);
                this.projectorCamera.node.lookAt(new Vec3(0, 0, 20));
                return;
            }
        }
        let camNode = scene.getChildByName('PerspectiveProjector');
        if (!camNode) {
            camNode = new Node('PerspectiveProjector');
            scene.addChild(camNode);
        }
        let cam = camNode.getComponent(Camera);
        if (!cam) {
            cam = camNode.addComponent(Camera);
        }
        this.configureProjectorCamera(cam);
        camNode.setPosition(0, 13, -18);
        camNode.lookAt(new Vec3(0, 0, 20));
        this.projectorCamera = cam;
    }

    private configureProjectorCamera(cam: Camera) {
        cam.projection = 1;
        cam.fov = 45;
        cam.near = 0.1;
        cam.far = 2000;
        // Real 3D rendering camera for gameplay entities.
        cam.visibility = 0xffffffff;
        cam.clearFlags = 14 as never;
        cam.priority = 0;
        (cam as unknown as { clearColor: Color }).clearColor = new Color(20, 28, 46, 255);
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
        this.createOrUpdateGridOverlay();
        this.setup3DWorld(scene);

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

    private setup3DWorld(scene: Scene | null) {
        if (!scene) return;
        let root = scene.getChildByName('World3D');
        if (!root) {
            root = new Node('World3D');
            root.layer = Layers.Enum.DEFAULT;
            scene.addChild(root);
        }
        this.world3DRoot = root;

        const maybeCube = this.node.getChildByName('view')?.getChildByName('Cube') ?? null;
        this.cubeTemplate = maybeCube;
        if (this.cubeTemplate) {
            this.cubeTemplate.active = false;
            this.cubeTemplate.layer = Layers.Enum.DEFAULT;
        }

        if (this.showDebugMarker) {
            if (this.debugMarker?.isValid) {
                this.debugMarker.destroy();
            }
            this.debugMarker = this.create3DEntityNode('DebugMarker', 4, 4, 4);
            this.debugMarker.setPosition(0, 2.5, 20);
        }
    }

    private createFallbackPlayer() {
        const existed = this.world3DRoot?.getChildByName('Player') ?? null;
        if (existed) {
            this.player = existed;
            return;
        }
        this.player = this.create3DEntityNode('Player', 2.4, 1.0, 3.2);
        this.set3DPosition(this.player, this.playerLane, this.playerZ, this.playY + 1.0);
        this.playerLane = (this.laneCount - 1) * 0.5;
        this.targetLane = this.playerLane;
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
        this.targetLane = this.uiXToLane(p.x);
    }

    private onMouseMove(event: EventMouse) {
        const p = event.getUILocation();
        this.targetLane = this.uiXToLane(p.x);
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
        // Keep horizontal movement tightly synced with pointer.
        this.playerLane = this.targetLane;
        this.set3DPosition(this.player, this.playerLane, this.playerZ, this.playY + 1.0);
    }

    private spawnBullets() {
        if (!this.player || !this.world3DRoot) return;
        const spreadInLane = 0.42;
        const total = Math.max(1, this.multiShot);
        const startLane = this.playerLane - spreadInLane * (total - 1) * 0.5;
        for (let i = 0; i < total; i++) {
            const bullet = this.create3DEntityNode('Bullet', 0.35, 0.35, 1.1);
            const z = this.playerZ + 1.5;
            const lane = startLane + i * spreadInLane;
            this.set3DPosition(bullet, lane, z, this.playY + 1.2);
            this.bullets.push({ node: bullet, damage: this.bulletDamage, speed: this.bulletSpeed3D, lane, z });
        }
    }

    private spawnMonster() {
        if (!this.world3DRoot) return;
        const lane = Math.floor(Math.random() * this.laneCount);
        const hp = Math.max(1, Math.floor(1 + this.level * 0.45 + Math.random() * this.level * 0.35));
        const speed = this.monsterBaseSpeed + Math.random() * 0.8;
        const monster = this.create3DEntityNode('Monster', 2.0, 2.0, 2.0);
        const z = this.monsterSpawnZ;
        this.set3DPosition(monster, lane, z, this.playY + 1.0);
        this.monsters.push({ node: monster, hp, speed, lane, z });
    }

    private spawnGateRow() {
        if (!this.world3DRoot) return;
        const z = this.gateSpawnZ;
        const leftGate = this.createGate(Math.random() > 0.5 ? 'mul' : 'add', 0, this.gateWidthInLanes - 1);
        const rightGate = this.createGate(Math.random() > 0.5 ? 'mul' : 'add', this.gateWidthInLanes, this.laneCount - 1);
        leftGate.z = z;
        rightGate.z = z;
        this.set3DPosition(leftGate.node, leftGate.centerLane, z, this.playY + 1.0);
        this.set3DPosition(rightGate.node, rightGate.centerLane, z, this.playY + 1.0);
        this.gates.push(leftGate, rightGate);
    }

    private createGate(type: GateType, laneStart: number, laneEnd: number): GateEntity {
        const laneSpan = laneEnd - laneStart + 1;
        const node = this.create3DEntityNode('Gate', laneSpan * 1.2, 1.2, 1.4);
        const value = type === 'mul' ? (Math.random() > 0.5 ? 2 : 3) : (Math.random() > 0.5 ? 1 : 2);
        return {
            node,
            type,
            value,
            used: false,
            speed: this.gateSpeed3D,
            laneStart,
            laneEnd,
            centerLane: (laneStart + laneEnd) * 0.5,
            z: this.gateSpawnZ,
        };
    }

    private updateBullets(dt: number) {
        this.bullets = this.bullets.filter((b) => {
            if (!b.node.isValid) return false;
            b.z += b.speed * dt;
            this.set3DPosition(b.node, b.lane, b.z, this.playY + 1.2);
            if (b.z > this.monsterSpawnZ + 6) {
                b.node.destroy();
                return false;
            }
            return true;
        });
    }

    private updateMonsters(dt: number) {
        this.monsters = this.monsters.filter((m) => {
            if (!m.node.isValid) return false;
            m.z -= m.speed * dt;
            this.set3DPosition(m.node, m.lane, m.z, this.playY + 1.0);
            if (m.z < this.playerZ - 5) {
                m.node.destroy();
                return false;
            }
            return true;
        });
    }

    private updateGates(dt: number) {
        this.gates = this.gates.filter((g) => {
            if (!g.node.isValid) return false;
            g.z -= g.speed * dt;
            this.set3DPosition(g.node, g.centerLane, g.z, this.playY + 1.0);
            if (g.z < this.playerZ - 3) {
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
                if (!this.isBulletHitMonster(bullet, monster)) continue;

                monster.hp -= bullet.damage;
                bullet.node.destroy();
                this.bullets.splice(bi, 1);

                if (monster.hp <= 0) {
                    this.score += 10;
                    this.kills += 1;
                    this.spawnFloatingText(this.playerUiXByLane(monster.lane), 180, '+10', new Color(255, 225, 120, 255));
                    monster.node.destroy();
                    this.monsters.splice(mi, 1);
                    this.updateHud();
                }
                break;
            }
        }

        for (const gate of this.gates) {
            if (gate.used || !gate.node.isValid) continue;
            if (!this.isPlayerHitGate(gate)) continue;
            gate.used = true;
            gate.node.destroy();
            this.applyGate(gate);
        }

        for (const monster of this.monsters) {
            if (!monster.node.isValid) continue;
            if (this.isPlayerHitMonster(monster)) {
                this.triggerGameOver();
                return;
            }
        }
    }

    private applyGate(gate: GateEntity) {
        const popY = -360;
        if (gate.type === 'mul') {
            this.multiShot = Math.min(9, this.multiShot * gate.value);
            this.spawnFloatingText(this.playerUiXByLane(this.playerLane), popY, `SHOT x${gate.value}`, new Color(120, 220, 255, 255));
        } else {
            this.bulletDamage += gate.value;
            this.spawnFloatingText(this.playerUiXByLane(this.playerLane), popY, `DMG +${gate.value}`, new Color(180, 255, 130, 255));
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
        this.hudLabel.string = `Score ${this.score}  Kills ${this.kills}  Lv ${this.level}\nDMG ${this.bulletDamage}  Shot ${this.multiShot}  ASPD ${(1 / this.fireInterval).toFixed(1)}  Lane ${this.getPlayerLaneIndex() + 1}/${this.laneCount}`;
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
        this.laneMoveSpeed = 12;
        this.monsterBaseSpeed = this.tuning.baseMonsterSpeed;
        this.phase = 'ready';
        this.playerLane = (this.laneCount - 1) * 0.5;
        this.targetLane = this.playerLane;

        if (this.player) {
            this.set3DPosition(this.player, this.playerLane, this.playerZ, this.playY + 1.0);
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

    private create3DEntityNode(name: string, sx: number, sy: number, sz: number): Node {
        let node: Node;
        if (this.cubeTemplate) {
            node = instantiate(this.cubeTemplate);
        } else {
            node = new Node(name);
        }
        node.name = name;
        node.active = true;
        node.layer = Layers.Enum.DEFAULT;
        node.setScale(sx, sy, sz);
        this.world3DRoot?.addChild(node);
        return node;
    }

    private set3DPosition(node: Node, lane: number, z: number, y: number) {
        node.setPosition(this.laneToWorldX(lane), y, z);
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

    private createOrUpdateGridOverlay() {
        if (!this.worldRoot) return;
        const { vs, halfH } = this.layout();
        const topY = halfH - 140;
        const bottomY = -halfH + 120;
        const rowHeight = (topY - bottomY) / this.gridRows;

        let overlay = this.worldRoot.getChildByName('GridOverlay');
        if (!overlay) {
            overlay = new Node('GridOverlay');
            overlay.layer = Layers.Enum.UI_2D;
            overlay.addComponent(UITransform).setContentSize(vs);
            this.worldRoot.addChild(overlay);
        }
        this.gridOverlay = overlay;
        this.gridOverlay.setSiblingIndex(0);
        this.gridOverlay.setPosition(0, 0, 0);
        this.gridOverlay.active = this.showGrid;

        let g = this.gridOverlay.getComponent(Graphics);
        if (!g) g = this.gridOverlay.addComponent(Graphics);
        g.clear();
        g.lineWidth = 2;
        g.strokeColor = new Color(120, 170, 230, 130);

        // Draw horizontal row lines.
        for (let r = 0; r <= this.gridRows; r++) {
            const y = topY - r * rowHeight;
            const leftX = this.laneToRenderX(-0.5, y);
            const rightX = this.laneToRenderX(this.laneCount - 0.5, y);
            g.moveTo(leftX, y);
            g.lineTo(rightX, y);
        }

        // Draw vertical lane boundaries (curved by perspective).
        for (let laneEdge = 0; laneEdge <= this.laneCount; laneEdge++) {
            const lanePos = laneEdge - 0.5;
            const startY = topY;
            const startX = this.laneToRenderX(lanePos, startY);
            g.moveTo(startX, startY);
            for (let r = 1; r <= this.gridRows; r++) {
                const y = topY - r * rowHeight;
                const x = this.laneToRenderX(lanePos, y);
                g.lineTo(x, y);
            }
        }

        g.stroke();
    }

    private getPlayerLaneIndex(): number {
        return Math.max(0, Math.min(this.laneCount - 1, Math.round(this.playerLane)));
    }

    private uiXToLane(uiX: number): number {
        const { vs } = this.layout();
        if (vs.width <= 1) return this.getPlayerLaneIndex();
        const ratio = Math.max(0, Math.min(0.9999, uiX / vs.width));
        return this.laneCount - 1 - Math.floor(ratio * this.laneCount);
    }

    private laneToWorldX(lane: number): number {
        const centered = (lane + 0.5) - this.laneCount * 0.5;
        return centered * this.worldLaneWidth;
    }

    private laneToRenderX(lane: number, y: number): number {
        return this.projectXByY(this.laneToWorldX(lane), y);
    }

    private playerUiXByLane(lane: number): number {
        return this.worldToScreenUi(this.laneToWorldX(lane), this.playerZ).x;
    }

    private isBulletHitMonster(bullet: BulletEntity, monster: MonsterEntity): boolean {
        const laneHit = Math.abs(bullet.lane - monster.lane) <= 0.45;
        const zHit = Math.abs(bullet.z - monster.z) <= 1.2;
        return laneHit && zHit;
    }

    private isPlayerHitGate(gate: GateEntity): boolean {
        if (!this.player) return false;
        const lane = this.getPlayerLaneIndex();
        const inLaneRange = lane >= gate.laneStart && lane <= gate.laneEnd;
        const zHit = Math.abs(this.playerZ - gate.z) <= 1.1;
        return inLaneRange && zHit;
    }

    private isPlayerHitMonster(monster: MonsterEntity): boolean {
        if (!this.player) return false;
        const laneHit = Math.abs(this.playerLane - monster.lane) <= 0.45;
        const zHit = Math.abs(this.playerZ - monster.z) <= 1.0;
        return laneHit && zHit;
    }

    private getPerspectiveTByY(y: number): number {
        const { halfH } = this.layout();
        const farY = halfH - 140;
        const nearY = -halfH + 120;
        const raw = (y - farY) / (nearY - farY);
        return Math.max(0, Math.min(1, raw));
    }

    private depthByY(y: number): number {
        const t = this.getPerspectiveTByY(y);
        return this.farDepth + (this.nearDepth - this.farDepth) * t;
    }

    private worldToScreenUi(worldX: number, depth: number): Vec3 {
        const { halfH } = this.layout();
        const fovDeg = this.projectorCamera?.fov ?? 38;
        const clampedDepth = Math.max(0.1, depth);
        const focal = halfH / Math.tan((fovDeg * Math.PI / 180) * 0.5);
        const x = worldX * focal / clampedDepth;
        this.tmpScreen.set(x, 0, 0);
        return this.tmpScreen;
    }

    private projectXByY(worldX: number, y: number): number {
        const screen = this.worldToScreenUi(worldX, this.depthByY(y));
        return screen.x;
    }

    private applyPerspectiveScale(node: Node, y: number, farScale: number, nearScale: number) {
        const depth = this.depthByY(y);
        const nearW = this.worldToScreenUi(this.worldLaneWidth * 0.5, this.nearDepth).x
            - this.worldToScreenUi(-this.worldLaneWidth * 0.5, this.nearDepth).x;
        const currW = this.worldToScreenUi(this.worldLaneWidth * 0.5, depth).x
            - this.worldToScreenUi(-this.worldLaneWidth * 0.5, depth).x;
        const ratio = nearW === 0 ? 1 : Math.abs(currW / nearW);
        const s = Math.max(farScale, Math.min(nearScale, nearScale * ratio));
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
    mainCam.projection = 0;
    mainCam.clearFlags = 0 as never;
    mainCam.priority = 10;
    mainCam.visibility = Layers.Enum.UI_2D;
    const cvs = canvasNode.getComponent(Canvas);
    if (cvs) {
        // 3.8+ Canvas.camera 为只读；序列化字段为 _cameraComponent（与 main.scene 一致）
        (cvs as unknown as { _cameraComponent: Camera | null })._cameraComponent = mainCam;
    }
}


