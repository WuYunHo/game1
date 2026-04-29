import {
    Animation,
    AnimationClip,
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
    JsonAsset,
    Label,
    Layers,
    Material,
    MeshRenderer,
    Node,
    Prefab,
    resources,
    ResolutionPolicy,
    Scene,
    SkeletalAnimation,
    UITransform,
    Vec3,
    Vec4,
    view,
} from 'cc';
import { DoorController } from 'db://assets/scripts/DoorController';

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
    door: DoorController | null;
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

interface SkylineEntity {
    node: Node;
    x: number;
    z: number;
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

interface MonsterConfig {
    id: string | number;
    name: string;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    hpBase: number;
    hpGrowth: number;
    speedBase: number;
    speedRand: number;
    hitRadiusLane: number;
    hitRadiusZ: number;
    scoreKill: number;
    spawnWeight: number;
    minLevel: number;
    maxLevel: number;
}

interface GateConfig {
    id: string;
    name: string;
    effectType: 'mulShot' | 'addDamage';
    effectValue: number;
    laneSpanMin: number;
    laneSpanMax: number;
    height: number;
    thickness: number;
    speed: number;
    spawnWeight: number;
    minLevel: number;
    maxLevel: number;
}

interface BulletConfig {
    id: string;
    name: string;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    damageBase: number;
    damageGrowth: number;
    speed: number;
    spreadStepLane: number;
    hitRadiusLane: number;
    hitRadiusZ: number;
    fireIntervalBase: number;
    minFireInterval: number;
    unlockLevel: number;
}

@ccclass('AdShooterGame')
class AdShooterGame extends Component {
    private readonly laneCount = 12;
    private readonly gateWidthInLanes = 6;
    private readonly gridCellSize = 10;
    private readonly worldLaneWidth = 1;
    private readonly farDepth = 72;
    private readonly nearDepth = 10;
    private readonly playY = -2.8;
    @property
    playerZ = 4.5;
    private readonly monsterSpawnZ = 72;
    private readonly gateSpawnZ = 72;
    private readonly bulletSpeed3D = 28;
    private readonly gateSpeed3D = 2;
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

    @property(Prefab)
    gatePrefab: Prefab | null = null;

    @property
    gatePrefabScale = 1;

    @property(Node)
    roadSurface: Node | null = null;
    @property
    roadSpeed = 16;
    @property
    skylineEnabled = true;
    @property
    skylineParallax = 0.32;
    @property
    skylineCountPerSide = 8;

    private readonly tmpScreen = new Vec3();
    private readonly tmpGateAnchorWorld = new Vec3();
    private readonly tmpRoadTiling = new Vec4();
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
    private skylineEntities: SkylineEntity[] = [];
    private roadRenderer: MeshRenderer | null = null;
    private roadMaterialInstance: Material | null = null;
    private roadUvOffsetY = 0;

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
    private bulletSpreadStepLane = 0.42;
    private bulletHitRadiusLane = 0.45;
    private bulletHitRadiusZ = 1.2;
    private currentBulletConfig: BulletConfig | null = null;
    private monsterConfigs: MonsterConfig[] = [];
    private monsterPrefabById: Record<string, Prefab | null> = {};
    private monsterClipById: Record<string, AnimationClip | null> = {};
    private playerPrefab: Prefab | null = null;
    private playerClip: AnimationClip | null = null;
    private gateConfigs: GateConfig[] = [];
    private bulletConfigs: BulletConfig[] = [];
    private readonly baseAliveMonsterTarget = 12;
    private readonly aliveMonsterTargetPerLevel = 2;
    private readonly maxAliveMonsterTarget = 48;
    private readonly maxSpawnPerFrame = 4;

    private tuning: TuningConfig = {
        baseFireInterval: 0.28,
        minFireInterval: 0.08,
        baseMonsterSpawnInterval: 0.425,
        minMonsterSpawnInterval: 0.1,
        gateSpawnInterval: 12,
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
        this.setupRoadLoop();
        this.bindInput();
        Promise.all([this.loadGameplayConfigs(), this.preloadPlayerRenderable()]).then(
            () => {
                this.createOrReplacePlayerFromAsset();
                this.resetRun();
            },
            () => this.resetRun(),
        );
    }

    private setupPerspectiveProjector(scene: Scene) {
        const mainCam = scene.getChildByName('Main Camera')?.getComponent(Camera) ?? null;
        if (this.projectorCamera) {
            if (mainCam && this.projectorCamera === mainCam) {
                this.projectorCamera = null;
            } else {
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
        this.projectorCamera = cam;
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
        this.updateRoadLoop(dt);
        this.updateSkyline(dt);
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
        while (this.fireTimer >= fireStep) {
            this.fireTimer -= fireStep;
            this.spawnBullets();
        }

        const spawnStep = Math.max(this.tuning.minMonsterSpawnInterval, this.tuning.baseMonsterSpawnInterval - this.level * 0.02);
        let spawnedByTimer = 0;
        while (this.monsterTimer >= spawnStep && spawnedByTimer < this.maxSpawnPerFrame) {
            this.monsterTimer -= spawnStep;
            this.spawnMonster();
            spawnedByTimer++;
        }
        this.fillMonsterToTarget(spawnedByTimer);

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
        this.setupSkyline();
    }

    private setupSkyline() {
        for (const skyline of this.skylineEntities) {
            if (skyline.node.isValid) skyline.node.destroy();
        }
        this.skylineEntities = [];
        if (!this.skylineEnabled || !this.world3DRoot) return;

        const count = Math.max(4, Math.floor(this.skylineCountPerSide));
        const nearZ = this.playerZ - 8;
        const farZ = this.monsterSpawnZ + 12;
        const spanZ = farZ - nearZ;
        const leftBaseX = -7.6;
        const rightBaseX = 7.6;

        for (let i = 0; i < count; i++) {
            const t = count <= 1 ? 0 : i / (count - 1);
            const baseZ = nearZ + spanZ * t;
            this.createSkylineBlock(leftBaseX, baseZ);
            this.createSkylineBlock(rightBaseX, baseZ);
        }
    }

    private createSkylineBlock(sideBaseX: number, z: number) {
        const sx = 1.6 + Math.random() * 1.8;
        const sy = 4.0 + Math.random() * 7.0;
        const sz = 1.8 + Math.random() * 2.8;
        const xJitter = (Math.random() - 0.5) * 1.1;
        const zJitter = (Math.random() - 0.5) * 5.5;
        const sign = sideBaseX >= 0 ? 1 : -1;
        const roadHalfWidth = this.laneCount * this.worldLaneWidth * 0.5;
        const roadEdgePadding = 0.6;
        const minAbsX = roadHalfWidth + sx * 0.5 + roadEdgePadding;
        const x = sign * Math.max(minAbsX, Math.abs(sideBaseX + xJitter));
        const node = this.create3DEntityNode('SkylineBlock', sx, sy, sz);
        const y = this.playY + sy * 0.5;
        const finalZ = z + zJitter;
        node.setPosition(x, y, finalZ);
        this.skylineEntities.push({ node, x, z: finalZ });
    }

    private updateSkyline(dt: number) {
        if (!this.skylineEnabled || this.skylineEntities.length === 0) return;
        const speed = Math.max(0, this.roadSpeed * this.skylineParallax);
        const nearZ = this.playerZ - 12;
        const spacing = 4.5;

        let maxZ = Number.NEGATIVE_INFINITY;
        for (const skyline of this.skylineEntities) {
            if (!skyline.node.isValid) continue;
            if (skyline.z > maxZ) maxZ = skyline.z;
        }

        for (const skyline of this.skylineEntities) {
            if (!skyline.node.isValid) continue;
            skyline.z -= speed * dt;
            if (skyline.z < nearZ) {
                skyline.z = maxZ + spacing;
                maxZ = skyline.z;
            }
            skyline.node.setPosition(skyline.x, skyline.node.position.y, skyline.z);
        }
    }

    private setupRoadLoop() {
        if (!this.roadSurface || !this.roadSurface.isValid) {
            this.roadSurface = this.findRoadSurfaceFallback();
        }
        this.roadRenderer = this.roadSurface?.getComponent(MeshRenderer) ?? null;
        if (this.roadSurface) {
            this.applyShadowFlags(this.roadSurface, false, true);
        }
        this.roadMaterialInstance = null;
        if (this.roadRenderer) {
            const shared = this.roadRenderer.getSharedMaterial(0) ?? this.roadRenderer.getMaterial(0);
            if (shared) {
                const instanced = new Material();
                instanced.copy(shared);
                this.roadRenderer.setMaterial(instanced, 0);
                this.roadMaterialInstance = instanced;
            }
        }
        this.roadUvOffsetY = 0;
    }

    private updateRoadLoop(dt: number) {
        const speed = Math.max(0, this.roadSpeed);
        this.roadUvOffsetY = (this.roadUvOffsetY + speed * dt * 0.05) % 1;
        this.tmpRoadTiling.set(1, 1, 0, this.roadUvOffsetY);
        const mat = this.roadMaterialInstance ?? this.roadRenderer?.getMaterialInstance(0) ?? this.roadRenderer?.getMaterial(0) ?? null;
        if (mat) {
            // Different Cocos versions/effects may expose different uniform names.
            mat.setProperty('tilingOffset', this.tmpRoadTiling);
        }
    }

    private findRoadSurfaceFallback(): Node | null {
        const inWorld = this.world3DRoot?.getChildByName('Road') ?? null;
        if (inWorld) return inWorld;
        return this.world3DRoot?.getChildByName('roadBase') ?? null;
    }

    private async loadGameplayConfigs() {
        const [monsterOk, gateOk, bulletOk] = await Promise.all([
            this.loadJsonConfig<MonsterConfig[]>('config/monster_config'),
            this.loadJsonConfig<GateConfig[]>('config/gate_config'),
            this.loadJsonConfig<BulletConfig[]>('config/bullet_config'),
        ]);

        this.monsterConfigs = monsterOk ?? this.defaultMonsterConfigs();
        this.gateConfigs = gateOk ?? this.defaultGateConfigs();
        this.bulletConfigs = bulletOk ?? this.defaultBulletConfigs();
        await this.preloadMonsterPrefabs();
        this.currentBulletConfig = this.bulletConfigs[0] ?? null;
    }

    private loadJsonConfig<T>(path: string): Promise<T | null> {
        return new Promise((resolve) => {
            resources.load(path, JsonAsset, (err, asset) => {
                if (err || !asset) {
                    resolve(null);
                    return;
                }
                resolve(asset.json as T);
            });
        });
    }

    private async preloadMonsterPrefabs() {
        this.monsterPrefabById = {};
        this.monsterClipById = {};
        const tasks = this.monsterConfigs.map(async (cfg) => {
            const key = String(cfg.id);
            const path = `animation/monster/monster${key}/monster_fbx`;
            const prefab = await this.loadMonsterRenderablePrefab(path);
            const clip = await this.loadMonsterAnimationClip(path);
            this.monsterPrefabById[key] = prefab;
            this.monsterClipById[key] = clip;
        });
        await Promise.all(tasks);
    }

    private async preloadPlayerRenderable() {
        const basePath = 'animation/player/player1/player_bfx';
        this.playerPrefab = await this.loadMonsterRenderablePrefab(basePath);
        this.playerClip = await this.loadMonsterAnimationClip(basePath);
    }

    private loadPrefab(path: string): Promise<Prefab | null> {
        return new Promise((resolve) => {
            resources.load(path, Prefab, (err, prefab) => {
                if (err || !prefab) {
                    resolve(null);
                    return;
                }
                resolve(prefab);
            });
        });
    }

    private async loadMonsterRenderablePrefab(basePath: string): Promise<Prefab | null> {
        const direct = await this.loadPrefab(basePath);
        if (direct) return direct;

        // FBX import often exposes scene sub-asset as a prefab.
        for (const subPath of [`${basePath}@6799a`, `${basePath}.fbx@6799a`]) {
            const prefab = await this.loadPrefab(subPath);
            if (prefab) return prefab;
        }

        const byDir = await this.loadFirstPrefabInDir(this.dirname(basePath));
        if (byDir) return byDir;
        return null;
    }

    private loadFirstPrefabInDir(dirPath: string): Promise<Prefab | null> {
        return new Promise((resolve) => {
            resources.loadDir(dirPath, Prefab, (err, assets) => {
                if (err || !assets || assets.length === 0) {
                    resolve(null);
                    return;
                }
                resolve(assets[0] ?? null);
            });
        });
    }

    private async loadMonsterAnimationClip(basePath: string): Promise<AnimationClip | null> {
        const direct = await this.loadAnimationClip(basePath);
        if (direct) return direct;

        for (const subPath of [`${basePath}@58675`, `${basePath}.fbx@58675`]) {
            const clip = await this.loadAnimationClip(subPath);
            if (clip) return clip;
        }

        const byDir = await this.loadFirstAnimationClipInDir(this.dirname(basePath));
        if (byDir) return byDir;
        return null;
    }

    private loadAnimationClip(path: string): Promise<AnimationClip | null> {
        return new Promise((resolve) => {
            resources.load(path, AnimationClip, (err, clip) => {
                if (err || !clip) {
                    resolve(null);
                    return;
                }
                resolve(clip);
            });
        });
    }

    private loadFirstAnimationClipInDir(dirPath: string): Promise<AnimationClip | null> {
        return new Promise((resolve) => {
            resources.loadDir(dirPath, AnimationClip, (err, assets) => {
                if (err || !assets || assets.length === 0) {
                    resolve(null);
                    return;
                }
                resolve(assets[0] ?? null);
            });
        });
    }

    private dirname(path: string): string {
        const idx = path.lastIndexOf('/');
        if (idx <= 0) return '';
        return path.slice(0, idx);
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

    private createOrReplacePlayerFromAsset() {
        if (!this.world3DRoot || !this.playerPrefab) return;
        if (this.player?.isValid) {
            this.player.destroy();
            this.player = null;
        }

        const node = instantiate(this.playerPrefab);
        node.name = 'Player';
        node.active = true;
        node.layer = Layers.Enum.DEFAULT;
        // Player FBX forward is already aligned with gameplay forward.
        node.setRotationFromEuler(0, 0, 0);
        node.setScale(2, 2, 2);
        this.world3DRoot.addChild(node);
        this.applyShadowFlags(node, true, true);
        this.player = node;
        this.playLoopAnimation(node, this.playerClip);
        this.set3DPosition(node, this.playerLane, this.playerZ, this.playY + 1.0);
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
        const spreadInLane = this.bulletSpreadStepLane;
        const total = Math.max(1, this.multiShot);
        const startLane = this.playerLane - spreadInLane * (total - 1) * 0.5;
        for (let i = 0; i < total; i++) {
            const cfg = this.currentBulletConfig;
            const bullet = this.create3DEntityNode('Bullet', cfg?.scaleX ?? 0.35, cfg?.scaleY ?? 0.35, cfg?.scaleZ ?? 1.1);
            const z = this.playerZ + 1.5;
            const lane = startLane + i * spreadInLane;
            this.set3DPosition(bullet, lane, z, this.playY + 1.2);
            this.bullets.push({ node: bullet, damage: this.bulletDamage, speed: cfg?.speed ?? this.bulletSpeed3D, lane, z });
        }
    }

    private spawnMonster() {
        if (!this.world3DRoot) return;
        const cfg = this.pickWeightedByLevel(this.monsterConfigs, this.level, (x) => x.spawnWeight) ?? this.defaultMonsterConfigs()[0];
        const lane = Math.floor(Math.random() * this.laneCount);
        const hp = Math.max(1, Math.floor(cfg.hpBase + this.level * cfg.hpGrowth));
        const speed = cfg.speedBase + Math.random() * Math.max(0, cfg.speedRand);
        const monster = this.createMonsterNode(cfg);
        const z = this.monsterSpawnZ;
        this.set3DPosition(monster, lane, z, this.playY + 1.0);
        this.monsters.push({ node: monster, hp, speed, lane, z });
    }

    private createMonsterNode(cfg: MonsterConfig): Node {
        const key = String(cfg.id);
        const prefab = this.monsterPrefabById[key];
        if (prefab) {
            const node = instantiate(prefab);
            node.name = `Monster_${key}`;
            node.active = true;
            node.layer = Layers.Enum.DEFAULT;
            // FBX forward axis often differs from gameplay forward; flip to face player.
            node.setRotationFromEuler(0, 180, 0);
            node.setScale(cfg.scaleX, cfg.scaleY, cfg.scaleZ);
            this.world3DRoot?.addChild(node);
            this.applyShadowFlags(node, true, true);
            this.playMonsterLoopAnimation(node, key);
            return node;
        }
        return this.create3DEntityNode('Monster', cfg.scaleX, cfg.scaleY, cfg.scaleZ);
    }

    private playMonsterLoopAnimation(root: Node, monsterId: string) {
        const fallbackClip = this.monsterClipById[monsterId] ?? null;
        this.playLoopAnimation(root, fallbackClip);
    }

    private playLoopAnimation(root: Node, fallbackClip: AnimationClip | null) {
        let played = false;

        const skeletalList = root.getComponentsInChildren(SkeletalAnimation);
        for (const skeletal of skeletalList) {
            const clip = skeletal.clips[0] ?? fallbackClip;
            if (!clip) continue;
            if (skeletal.clips.indexOf(clip) < 0) {
                skeletal.addClip(clip);
            }
            clip.wrapMode = AnimationClip.WrapMode.Loop;
            skeletal.defaultClip = clip;
            let state = skeletal.getState(clip.name);
            if (!state) state = skeletal.createState(clip, clip.name);
            state.wrapMode = AnimationClip.WrapMode.Loop;
            state.repeatCount = Infinity;
            skeletal.play(clip.name);
            played = true;
        }

        const animationList = root.getComponentsInChildren(Animation);
        for (const anim of animationList) {
            const clip = anim.clips[0] ?? fallbackClip;
            if (!clip) continue;
            if (anim.clips.indexOf(clip) < 0) {
                anim.addClip(clip);
            }
            clip.wrapMode = AnimationClip.WrapMode.Loop;
            anim.defaultClip = clip;
            let state = anim.getState(clip.name);
            if (!state) state = anim.createState(clip, clip.name);
            state.wrapMode = AnimationClip.WrapMode.Loop;
            state.repeatCount = Infinity;
            anim.play(clip.name);
            played = true;
        }

        if (!played && fallbackClip) {
            const anim = root.getComponent(Animation) ?? root.addComponent(Animation);
            if (anim.clips.indexOf(fallbackClip) < 0) {
                anim.addClip(fallbackClip);
            }
            fallbackClip.wrapMode = AnimationClip.WrapMode.Loop;
            anim.defaultClip = fallbackClip;
            let state = anim.getState(fallbackClip.name);
            if (!state) state = anim.createState(fallbackClip, fallbackClip.name);
            state.wrapMode = AnimationClip.WrapMode.Loop;
            state.repeatCount = Infinity;
            anim.play(fallbackClip.name);
        }
    }

    private spawnGateRow() {
        if (!this.world3DRoot) return;
        const z = this.gateSpawnZ;
        const leftGate = this.createGateInHalf(0, this.gateWidthInLanes - 1);
        const rightGate = this.createGateInHalf(this.gateWidthInLanes, this.laneCount - 1);
        leftGate.z = z;
        rightGate.z = z;
        this.set3DPosition(leftGate.node, leftGate.centerLane, z, this.playY + 1.0);
        this.set3DPosition(rightGate.node, rightGate.centerLane, z, this.playY + 1.0);
        this.gates.push(leftGate, rightGate);
    }

    private createGateInHalf(halfStart: number, halfEnd: number): GateEntity {
        const cfg = this.pickWeightedByLevel(this.gateConfigs, this.level, (x) => x.spawnWeight) ?? this.defaultGateConfigs()[0];
        const maxSpanByHalf = halfEnd - halfStart + 1;
        const laneSpan = Math.max(1, Math.min(maxSpanByHalf, this.randInt(cfg.laneSpanMin, cfg.laneSpanMax)));
        const localStart = halfStart + Math.floor((maxSpanByHalf - laneSpan) * 0.5);
        const laneStart = localStart;
        const laneEnd = laneStart + laneSpan - 1;
        const type: GateType = cfg.effectType === 'mulShot' ? 'mul' : 'add';
        const value = cfg.effectValue;
        const node = this.createGateNode();
        const door = node.getComponent(DoorController);
        door?.bindUiRoot(this.uiRoot);
        door?.setGateText(type, value);
        return {
            node,
            door,
            type,
            value,
            used: false,
            speed: cfg.speed > 0 ? cfg.speed : this.gateSpeed3D,
            laneStart,
            laneEnd,
            centerLane: (laneStart + laneEnd) * 0.5,
            z: this.gateSpawnZ,
        };
    }

    private createGateNode(): Node {
        if (this.gatePrefab) {
            const node = instantiate(this.gatePrefab);
            node.name = 'Gate';
            node.active = true;
            node.layer = Layers.Enum.DEFAULT;
            const scale = this.gatePrefabScale > 0 ? this.gatePrefabScale : 1;
            node.setScale(scale, scale, scale);
            this.world3DRoot?.addChild(node);
            return node;
        }
        const scale = this.gatePrefabScale > 0 ? this.gatePrefabScale : 1;
        return this.create3DEntityNode('Gate', scale, scale, scale);
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
            if (!g.node.isValid) {
                g.door?.dispose();
                return false;
            }
            g.z -= g.speed * dt;
            this.set3DPosition(g.node, g.centerLane, g.z, this.playY + 1.0);
            const hasAnchor = g.door?.getAnchorWorldPosition(this.tmpGateAnchorWorld) ?? false;
            const worldX = hasAnchor ? this.tmpGateAnchorWorld.x : this.laneToWorldX(g.centerLane);
            const worldY = hasAnchor ? this.tmpGateAnchorWorld.y : (this.playY + 2.2);
            const worldZ = hasAnchor ? this.tmpGateAnchorWorld.z : g.z;
            const ui = this.worldToUiByGameCamera(worldX, worldY, worldZ);
            g.door?.syncLabel(ui.x, ui.y);
            if (g.z < this.playerZ - 3) {
                g.door?.dispose();
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
                    const cfg = this.monsterConfigForScale(monster.node.scale.x, monster.node.scale.y, monster.node.scale.z);
                    this.score += cfg?.scoreKill ?? 10;
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
            gate.door?.dispose();
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
        this.currentBulletConfig = this.pickBulletConfigForLevel(this.level);
        this.fireInterval = this.currentBulletConfig?.fireIntervalBase ?? this.tuning.baseFireInterval;
        this.tuning.minFireInterval = this.currentBulletConfig?.minFireInterval ?? this.tuning.minFireInterval;
        this.bulletDamage = Math.max(1, Math.floor((this.currentBulletConfig?.damageBase ?? 1) + this.level * (this.currentBulletConfig?.damageGrowth ?? 0)));
        this.multiShot = 1;
        this.laneMoveSpeed = 12;
        this.monsterBaseSpeed = this.tuning.baseMonsterSpeed;
        this.bulletSpreadStepLane = this.currentBulletConfig?.spreadStepLane ?? 0.42;
        this.bulletHitRadiusLane = this.currentBulletConfig?.hitRadiusLane ?? 0.45;
        this.bulletHitRadiusZ = this.currentBulletConfig?.hitRadiusZ ?? 1.2;
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
        for (const g of this.gates) {
            g.door?.dispose();
            if (g.node.isValid) g.node.destroy();
        }
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
        this.applyShadowFlags(node, true, true);
        return node;
    }

    private applyShadowFlags(node: Node, castShadow: boolean, receiveShadow: boolean) {
        const renderers = node.getComponentsInChildren(MeshRenderer);
        const castMode = castShadow ? 1 : 0;
        const receiveMode = receiveShadow ? 1 : 0;
        for (const renderer of renderers) {
            const r = renderer as unknown as { shadowCastingMode: number; shadowReceivingMode: number };
            r.shadowCastingMode = castMode;
            r.shadowReceivingMode = receiveMode;
        }
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
        const { vs, halfW, halfH } = this.layout();
        const step = this.gridCellSize;

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
        g.lineWidth = 1;
        g.strokeColor = new Color(120, 170, 230, 130);

        // Draw fixed 20x20 cells in UI space.
        for (let x = -halfW; x <= halfW; x += step) {
            g.moveTo(x, -halfH);
            g.lineTo(x, halfH);
        }

        for (let y = -halfH; y <= halfH; y += step) {
            g.moveTo(-halfW, y);
            g.lineTo(halfW, y);
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

    private gateUiYByAnchor(worldY: number, z: number): number {
        const span = Math.max(0.1, this.gateSpawnZ - this.playerZ);
        const t = Math.max(0, Math.min(1, (this.gateSpawnZ - z) / span));
        const perspectiveY = 220 - 520 * t;
        return perspectiveY + (worldY - this.playY) * 28;
    }

    private worldToUiByGameCamera(worldX: number, worldY: number, worldZ: number): Vec3 {
        if (this.projectorCamera && this.uiRoot) {
            this.tmpGateAnchorWorld.set(worldX, worldY, worldZ);
            this.projectorCamera.convertToUINode(this.tmpGateAnchorWorld, this.uiRoot, this.tmpScreen);
            return this.tmpScreen;
        }
        const uiX = this.worldToScreenUi(worldX, worldZ).x;
        const uiY = this.gateUiYByAnchor(worldY, worldZ);
        this.tmpScreen.set(uiX, uiY, 0);
        return this.tmpScreen;
    }

    private isBulletHitMonster(bullet: BulletEntity, monster: MonsterEntity): boolean {
        const laneHit = Math.abs(bullet.lane - monster.lane) <= this.bulletHitRadiusLane;
        const zHit = Math.abs(bullet.z - monster.z) <= this.bulletHitRadiusZ;
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

    private aliveMonsterTarget(): number {
        const raw = this.baseAliveMonsterTarget + (this.level - 1) * this.aliveMonsterTargetPerLevel;
        return Math.max(this.baseAliveMonsterTarget, Math.min(this.maxAliveMonsterTarget, raw));
    }

    private fillMonsterToTarget(spawnedThisFrame: number) {
        const target = this.aliveMonsterTarget();
        let need = target - this.monsters.length;
        let budget = Math.max(0, this.maxSpawnPerFrame - spawnedThisFrame);
        while (need > 0 && budget > 0) {
            this.spawnMonster();
            need--;
            budget--;
        }
    }

    private randInt(min: number, max: number): number {
        const lo = Math.floor(Math.min(min, max));
        const hi = Math.floor(Math.max(min, max));
        return lo + Math.floor(Math.random() * (hi - lo + 1));
    }

    private pickWeightedByLevel<T extends { minLevel: number; maxLevel: number }>(
        list: T[],
        level: number,
        weightFn: (x: T) => number,
    ): T | null {
        const candidates = list.filter((x) => level >= x.minLevel && level <= x.maxLevel);
        if (candidates.length === 0) return null;
        let total = 0;
        for (const item of candidates) total += Math.max(0, weightFn(item));
        if (total <= 0) return candidates[0];
        let roll = Math.random() * total;
        for (const item of candidates) {
            roll -= Math.max(0, weightFn(item));
            if (roll <= 0) return item;
        }
        return candidates[candidates.length - 1];
    }

    private pickBulletConfigForLevel(level: number): BulletConfig | null {
        const allowed = this.bulletConfigs.filter((x) => level >= x.unlockLevel);
        return allowed.length > 0 ? allowed[allowed.length - 1] : this.bulletConfigs[0] ?? null;
    }

    private monsterConfigForScale(x: number, y: number, z: number): MonsterConfig | null {
        for (const cfg of this.monsterConfigs) {
            if (cfg.scaleX === x && cfg.scaleY === y && cfg.scaleZ === z) return cfg;
        }
        return null;
    }

    private defaultMonsterConfigs(): MonsterConfig[] {
        return [
            {
                id: 1,
                name: 'Default',
                scaleX: 2.0,
                scaleY: 2.0,
                scaleZ: 2.0,
                hpBase: 1,
                hpGrowth: 0,
                speedBase: 2,
                speedRand: 0,
                hitRadiusLane: 0.45,
                hitRadiusZ: 1.2,
                scoreKill: 10,
                spawnWeight: 100,
                minLevel: 1,
                maxLevel: 999,
            },
        ];
    }

    private defaultGateConfigs(): GateConfig[] {
        return [
            {
                id: 'g_mul_2',
                name: 'x2 Shot',
                effectType: 'mulShot',
                effectValue: 2,
                laneSpanMin: 6,
                laneSpanMax: 6,
                height: 1.2,
                thickness: 1.4,
                speed: 2,
                spawnWeight: 90,
                minLevel: 1,
                maxLevel: 999,
            },
            {
                id: 'g_add_2',
                name: '+2 Damage',
                effectType: 'addDamage',
                effectValue: 2,
                laneSpanMin: 6,
                laneSpanMax: 6,
                height: 1.2,
                thickness: 1.4,
                speed: 2,
                spawnWeight: 75,
                minLevel: 1,
                maxLevel: 999,
            },
        ];
    }

    private defaultBulletConfigs(): BulletConfig[] {
        return [
            {
                id: 'b_default',
                name: 'Default Bullet',
                scaleX: 0.35,
                scaleY: 0.35,
                scaleZ: 1.1,
                damageBase: 1,
                damageGrowth: 0.15,
                speed: 28,
                spreadStepLane: 0.42,
                hitRadiusLane: 0.45,
                hitRadiusZ: 1.2,
                fireIntervalBase: 0.28,
                minFireInterval: 0.08,
                unlockLevel: 1,
            },
            {
                id: 'b_fast',
                name: 'Fast Bullet',
                scaleX: 0.28,
                scaleY: 0.28,
                scaleZ: 1.2,
                damageBase: 1,
                damageGrowth: 0.2,
                speed: 34,
                spreadStepLane: 0.38,
                hitRadiusLane: 0.42,
                hitRadiusZ: 1.1,
                fireIntervalBase: 0.24,
                minFireInterval: 0.07,
                unlockLevel: 4,
            },
        ];
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


