import {
    _decorator, Color, Component, EventKeyboard, EventMouse, EventTouch, Graphics,
    HorizontalTextAlignment, ImageAsset, input, Input, KeyCode, Label, Layers, Node,
    resources, ResolutionPolicy, Sprite, SpriteFrame, Texture2D, UITransform,
    VerticalTextAlignment, view, Widget,
} from 'cc';
import { ZombieGateModel } from './ZombieGateModel';
import {
    composeZombieGate, DrawCommand, getPlayHeight, colFromX,
    leaderboardCloseHit, setPlayHeight, startButtonHit, W,
} from './ZombieGatePresentation';
import { LeaderboardRow, LeaderboardService } from './LeaderboardService';
import { LB_UI } from './LeaderboardUi';

const { ccclass } = _decorator;
type DrawNode = {
    node: Node;
    graphics?: Graphics;
    label?: Label;
    sprite?: Sprite;
    signature: string;
    poolKey: string;
    lastSibling: number;
};

/** Cocos adapter for the grid early-combat mode (no Boss). */
@ccclass('ZombieGateGame')
export class ZombieGateGame extends Component {
    private model = new ZombieGateModel();
    private drawNodes = new Map<string, DrawNode>();
    private nodePools = new Map<string, DrawNode[]>();
    private frames: Partial<Record<'fish' | 'squirrel', SpriteFrame>> = {};
    private artReady = false;
    private loadError = false;
    private left = false;
    private right = false;
    private pointerDown = false;
    private laneCool = 0;
    private renderDirty = true;
    private readyRendered = false;
    private lastPhase = this.model.phase;
    private hover: { x: number; y: number } | null = null;
    private leaderboard = new LeaderboardService();
    private leaderboardOpen = false;
    private leaderboardRows: LeaderboardRow[] = [];
    private subContextNode: Node | null = null;
    private subContextShowTimer: ReturnType<typeof setTimeout> | null = null;
    private lbHitNode: Node | null = null;
    private lbCloseHitNode: Node | null = null;
    private lbToggleAt = 0;
    private playHeight = 1280;

    onLoad() {
        // FIXED_WIDTH: fill left/right; grow height to match device (no letterbox bars).
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
        this.syncPlaySize();
        this.ensureCanvasWidget();
        this.ensureLeaderboardHitNodes();
        view.on('canvas-resize', this.onCanvasResize, this);
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
        Promise.all([
            this.loadFrame('fish', 'art/deepseek-fish'),
            this.loadFrame('squirrel', 'art/faker-squirrel'),
        ]).then(() => {
            if (this.isValid) { this.artReady = true; this.renderDirty = true; }
        }).catch((error) => {
            this.loadError = true;
            this.artReady = true;
            this.renderDirty = true;
            console.error('Zombie Gate: character artwork failed to load', error);
        });
    }

    private onCanvasResize() {
        this.syncPlaySize();
        this.ensureCanvasWidget();
        this.layoutLeaderboardHitNodes();
        this.renderDirty = true;
    }

    /** Match presentation + node size to the actual FIXED_WIDTH visible height. */
    private syncPlaySize() {
        const visible = view.getVisibleSize();
        const h = Math.max(960, Math.round(visible.height));
        setPlayHeight(h);
        this.playHeight = getPlayHeight();
    }

    /** Stretch root to full visible area (width locked to 720 design). */
    private ensureCanvasWidget() {
        const h = this.playHeight;
        const ui = this.node.getComponent(UITransform);
        if (ui) ui.setContentSize(W, h);
        let widget = this.node.getComponent(Widget);
        if (!widget) widget = this.node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
        widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        widget.updateAlignment();
        // Widget can clobber size — re-assert design size used by compose + hit tests.
        if (ui) ui.setContentSize(W, this.playHeight);
        this.layoutLeaderboardHitNodes();
    }

    /** UILocation is bottom-left / Y-up → compose top-left / Y-down. */
    private pointerToCompose(uiLoc: { x: number; y: number }): { x: number; y: number } {
        const h = this.node.getComponent(UITransform)?.contentSize.height || this.playHeight;
        return { x: uiLoc.x, y: h - uiLoc.y };
    }

    /** Real UI hit targets so the TOP-right plaque receives Cocos node events. */
    private ensureLeaderboardHitNodes() {
        if (!this.lbHitNode?.isValid) {
            this.lbHitNode = this.makeHitNode('LbOpenHit', LB_UI.buttonW + 36, LB_UI.buttonH + 36, () => {
                void this.toggleLeaderboard();
            });
        }
        if (!this.lbCloseHitNode?.isValid) {
            this.lbCloseHitNode = this.makeHitNode('LbCloseHit', LB_UI.closeW + 24, LB_UI.closeH + 24, () => {
                if (this.leaderboardOpen) this.closeLeaderboard();
            });
            this.lbCloseHitNode.active = false;
        }
        this.layoutLeaderboardHitNodes();
    }

    private makeHitNode(name: string, w: number, h: number, onClick: () => void): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        const ui = node.addComponent(UITransform);
        ui.setContentSize(w, h);
        // Opaque-enough Graphics so UI hit-testing accepts the node.
        const g = node.addComponent(Graphics);
        g.fillColor = new Color(255, 255, 255, 1);
        g.rect(-w * 0.5, -h * 0.5, w, h);
        g.fill();
        node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            onClick();
        }, this);
        node.on(Node.EventType.MOUSE_UP, (e: EventMouse) => {
            if (e.getButton() !== 0) return;
            e.propagationStopped = true;
            onClick();
        }, this);
        this.node.addChild(node);
        return node;
    }

    private layoutLeaderboardHitNodes() {
        const h = this.playHeight;
        if (this.lbHitNode?.isValid) {
            // Compose (buttonX, buttonY) → local center-origin / Y-up.
            this.lbHitNode.setPosition(LB_UI.buttonX - W * 0.5, h * 0.5 - LB_UI.buttonY, 0);
            this.lbHitNode.setSiblingIndex(this.node.children.length - 1);
            this.lbHitNode.active = true;
        }
        if (this.lbCloseHitNode?.isValid) {
            const close = leaderboardCloseHit(h);
            this.lbCloseHitNode.setPosition(close.cx - W * 0.5, h * 0.5 - close.cy, 0);
            this.lbCloseHitNode.active = this.leaderboardOpen;
            if (this.leaderboardOpen) this.lbCloseHitNode.setSiblingIndex(this.node.children.length - 1);
        }
    }

    private flushLeaderboardFrame() {
        this.renderDirty = true;
        const commands = composeZombieGate(this.model, this.hover, {
            open: this.leaderboardOpen,
            rows: this.leaderboardRows,
        });
        this.render(commands);
        this.renderDirty = false;
        this.layoutLeaderboardHitNodes();
    }

    /** Prefer spriteFrame sub-asset; fall back to ImageAsset → Texture2D → SpriteFrame. */
    private loadFrame(key: 'fish' | 'squirrel', basePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            resources.load(`${basePath}/spriteFrame`, SpriteFrame, (sfErr, frame) => {
                if (!sfErr && frame) {
                    if (this.isValid) {
                        this.applyNearestFilter(frame);
                        this.frames[key] = frame;
                    }
                    resolve();
                    return;
                }
                resources.load(basePath, ImageAsset, (imgErr, image) => {
                    if (imgErr || !image) {
                        reject(sfErr ?? imgErr ?? new Error(basePath));
                        return;
                    }
                    if (!this.isValid) { resolve(); return; }
                    const texture = new Texture2D();
                    texture.image = image;
                    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
                    const created = new SpriteFrame();
                    created.texture = texture;
                    this.frames[key] = created;
                    resolve();
                });
            });
        });
    }

    /** Keep character art blocky (Soul Knight / pixel look). */
    private applyNearestFilter(frame: SpriteFrame) {
        const texture = frame.texture as Texture2D | null;
        if (texture && typeof texture.setFilters === 'function') {
            texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        }
    }

    start() {
        this.syncPlaySize();
        this.ensureCanvasWidget();
        this.ensureLeaderboardHitNodes();
        this.renderDirty = true;
    }

    update(dt: number) {
        const visibleH = Math.max(960, Math.round(view.getVisibleSize().height));
        if (visibleH !== this.playHeight) {
            this.syncPlaySize();
            this.ensureCanvasWidget();
            this.renderDirty = true;
            this.readyRendered = false;
        }
        const step = Math.min(dt, 0.05);
        this.laneCool = Math.max(0, this.laneCool - step);
        if (!this.leaderboardOpen && this.model.phase === 'playing' && this.laneCool <= 0) {
            if (this.left !== this.right) {
                this.model.shiftLane(this.right ? 1 : -1);
                this.laneCool = 0.08;
                this.renderDirty = true;
            }
        }
        this.model.tick(dt);
        if (this.model.phase !== this.lastPhase) {
            if (this.model.phase === 'won') void this.leaderboard.saveScore(this.model.score);
            this.lastPhase = this.model.phase;
            this.renderDirty = true;
            this.readyRendered = false;
        }
        if (this.model.phase === 'ready' && this.readyRendered && !this.renderDirty && !this.leaderboardOpen) return;

        const commands = composeZombieGate(this.model, this.hover, {
            open: this.leaderboardOpen,
            rows: this.leaderboardRows,
        });
        if (!this.artReady) {
            const button = commands.find(c => c.id === 'buttonText');
            if (button) button.text = '伙伴集结中…';
        } else if (this.loadError && this.model.phase === 'ready') {
            const sub = commands.find(c => c.id === 'sub');
            if (sub) sub.text = '角色图未导入，可先试玩 · 请在编辑器刷新资源';
        }
        this.render(commands);
        this.renderDirty = false;
        if (this.model.phase === 'ready' && !this.leaderboardOpen) this.readyRendered = true;
    }

    private render(commands: DrawCommand[]) {
        // Do NOT merge moving world rects into one Graphics — that forced clear+redraw every frame (~30fps).
        const live = new Set<string>();
        let index = 0;
        for (const c of commands) {
            live.add(c.id);
            let item = this.drawNodes.get(c.id);
            if (!item) {
                item = this.acquireDrawNode(c);
                item.node.name = c.id;
                this.drawNodes.set(c.id, item);
            }
            item.node.active = true;
            if (item.lastSibling !== index) {
                item.lastSibling = index;
                item.node.setSiblingIndex(index);
            }
            index++;

            const cx = W / 2;
            const cy = this.playHeight / 2;
            const x = c.x ?? cx, y = c.y ?? cy;
            const w = c.w ?? 1, h = c.h ?? 1;
            const scrollY = c.scrollY ?? 0;
            // Lines are stroked in absolute space; keep node at origin.
            if (c.kind === 'line') item.node.setPosition(0, 0, 0);
            else item.node.setPosition(x - cx, cy - y - scrollY, 0);

            // Content signature excludes x/y — camera scroll only moves nodes (battle-style).
            const signature = this.contentSignature(c);
            if (signature === item.signature) continue;
            item.signature = signature;
            item.node.getComponent(UITransform)!.setContentSize(Math.max(w, 1), Math.max(h, 1));
            const alpha = c.alpha == null ? 255 : Math.round(Math.max(0, Math.min(1, c.alpha)) * 255);
            if (item.label) {
                const l = item.label;
                l.string = c.text ?? '';
                l.fontSize = c.size ?? 24;
                l.lineHeight = (c.size ?? 24) * 1.3;
                const color = new Color(c.fill ?? '#153d59');
                color.a = alpha;
                l.color = color;
                l.isBold = c.bold ?? true;
                l.horizontalAlign = HorizontalTextAlignment.CENTER;
                l.verticalAlign = VerticalTextAlignment.CENTER;
                l.overflow = Label.Overflow.NONE;
                l.enableWrapText = false;
                l.fontFamily = 'Arial Black, Impact, Microsoft YaHei, sans-serif';
            } else if (item.sprite) {
                item.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                const frame = this.frames[c.asset as 'fish' | 'squirrel'] ?? null;
                item.sprite.spriteFrame = frame;
                item.sprite.color = new Color(255, 255, 255, alpha);
                let g = item.node.getComponent(Graphics);
                if (!frame) {
                    if (!g) g = item.node.addComponent(Graphics);
                    g.clear();
                    const body = c.asset === 'squirrel'
                        ? new Color(196, 165, 116, alpha)
                        : new Color(74, 163, 255, alpha);
                    g.fillColor = body;
                    g.ellipse(0, 0, w * 0.42, h * 0.42);
                    g.fill();
                    g.fillColor = new Color(255, 255, 255, alpha);
                    g.ellipse(-w * 0.12, h * 0.08, w * 0.08, h * 0.08);
                    g.ellipse(w * 0.12, h * 0.08, w * 0.08, h * 0.08);
                    g.fill();
                } else if (g) {
                    g.clear();
                }
            } else if (item.graphics) {
                const g = item.graphics;
                g.clear();
                if (c.kind === 'graphicsBatch') {
                    this.drawGraphicsBatch(g, c.graphicsCommands ?? []);
                } else if (c.kind === 'line') {
                    const stroke = new Color(c.stroke ?? '#ffe566');
                    stroke.a = alpha;
                    g.strokeColor = stroke;
                    g.lineWidth = c.line ?? 3;
                    const cx = W / 2;
                    const cy = this.playHeight / 2;
                    g.moveTo((c.x ?? 0) - cx, cy - (c.y ?? 0));
                    g.lineTo((c.x2 ?? 0) - cx, cy - (c.y2 ?? 0));
                    g.stroke();
                } else {
                    const fill = new Color(c.fill ?? '#ffffff');
                    fill.a = alpha;
                    g.fillColor = fill;
                    g.strokeColor = new Color(c.stroke ?? '#153d59');
                    g.lineWidth = c.line ?? 1;
                    if (c.kind === 'ellipse') g.ellipse(0, 0, w / 2, h / 2);
                    else g.rect(-w / 2, -h / 2, w, h);
                    g.fill();
                    if (c.stroke) g.stroke();
                }
            }
        }
        for (const [id, item] of this.drawNodes) {
            if (live.has(id)) continue;
            this.releaseDrawNode(item);
            this.drawNodes.delete(id);
        }
    }

    private drawGraphicsBatch(g: Graphics, commands: DrawCommand[]) {
        // Group by fill color and issue one fill() per group — critical for the floor batch.
        const cx = W / 2;
        const cy = this.playHeight / 2;
        let i = 0;
        while (i < commands.length) {
            const fill = commands[i].fill ?? '#ffffff';
            g.fillColor = new Color(fill);
            const start = i;
            while (i < commands.length && (commands[i].fill ?? '#ffffff') === fill) {
                const c = commands[i];
                const x = c.x ?? cx, y = c.y ?? cy;
                const w = c.w ?? 1, h = c.h ?? 1;
                const rad = c.radius ?? 0;
                if (c.kind === 'ellipse') g.ellipse(x - cx, cy - y, w / 2, h / 2);
                else if (rad > 0) g.roundRect(x - cx - w / 2, cy - y - h / 2, w, h, Math.min(rad, w / 2, h / 2));
                else g.rect(x - cx - w / 2, cy - y - h / 2, w, h);
                i++;
            }
            g.fill();
            // Optional strokes only for the rare batched items that need them.
            for (let j = start; j < i; j++) {
                const c = commands[j];
                if (!c.stroke) continue;
                const x = c.x ?? cx, y = c.y ?? cy;
                const w = c.w ?? 1, h = c.h ?? 1;
                g.strokeColor = new Color(c.stroke);
                g.lineWidth = c.line ?? 1;
                const rad = c.radius ?? 0;
                if (rad > 0) g.roundRect(x - cx - w / 2, cy - y - h / 2, w, h, Math.min(rad, w / 2, h / 2));
                else g.rect(x - cx - w / 2, cy - y - h / 2, w, h);
                g.stroke();
            }
        }
    }

    private poolKey(c: DrawCommand): string {
        if (c.kind === 'image') return `image:${c.asset ?? ''}`;
        if (c.kind === 'text') return 'text';
        if (c.kind === 'line') return 'line';
        return 'graphics';
    }

    private acquireDrawNode(c: DrawCommand): DrawNode {
        const poolKey = this.poolKey(c);
        const pool = this.nodePools.get(poolKey);
        const pooled = pool?.pop();
        if (pooled) return pooled;
        const node = new Node(c.id);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        this.node.addChild(node);
        const item: DrawNode = { node, signature: '', poolKey, lastSibling: -1 };
        if (c.kind === 'text') item.label = node.addComponent(Label);
        else if (c.kind === 'image') item.sprite = node.addComponent(Sprite);
        else item.graphics = node.addComponent(Graphics);
        return item;
    }

    private releaseDrawNode(item: DrawNode) {
        item.node.active = false;
        item.signature = '';
        item.lastSibling = -1;
        let pool = this.nodePools.get(item.poolKey);
        if (!pool) {
            pool = [];
            this.nodePools.set(item.poolKey, pool);
        }
        pool.push(item);
    }

    /** Shape/style only — positions update via setPosition without Graphics.clear. */
    private contentSignature(c: DrawCommand): string {
        if (c.kind === 'graphicsBatch') {
            const batched = c.graphicsCommands ?? [];
            if (c.id === 'floor') return ['floor', c.floorSnap ?? '', batched.length].join('|');
            // Intro shards move every frame — include a sample point so Graphics redraws.
            if (c.id === 'introBurst') {
                const a = batched[0];
                const b = batched[batched.length - 1];
                return ['burst', batched.length, a?.x, a?.y, b?.x, b?.y].join('|');
            }
            return ['gb', c.id, batched.length, batched[0]?.fill, batched[batched.length - 1]?.fill].join('|');
        }
        if (c.kind === 'line') {
            // Lines are absolute strokes; include endpoints so they redraw while flying.
            return ['line', c.x, c.y, c.x2, c.y2, c.stroke, c.line, c.alpha ?? 1].join('|');
        }
        return [
            c.kind, c.w ?? 1, c.h ?? 1, c.radius ?? 0,
            c.fill ?? '', c.stroke ?? '', c.line ?? 1, c.text ?? '', c.size ?? 24,
            c.bold ?? true, c.asset ?? '', c.alpha ?? 1,
            c.kind === 'image' ? Boolean(this.frames[c.asset as 'fish' | 'squirrel']) : '',
        ].join('|');
    }

    private move(x: number) {
        if (this.leaderboardOpen || this.model.phase !== 'playing') return;
        this.model.setLane(colFromX(x));
        this.renderDirty = true;
    }

    private setHover(x: number, y: number) {
        this.hover = { x, y };
        this.renderDirty = true;
    }

    private tap(x: number, y: number) {
        // Fallback hit for top-right "排行" if node events are blocked by preview input.
        if (x >= 560 && y <= 120) {
            void this.toggleLeaderboard();
            return;
        }
        if (this.leaderboardOpen) {
            const close = leaderboardCloseHit(this.playHeight);
            if (x >= close.x0 && x <= close.x1 && y >= close.y0 && y <= close.y1) {
                this.closeLeaderboard();
            }
            return;
        }
        if (this.model.phase === 'playing' || this.model.phase === 'intro' || !this.artReady) return;
        const btn = startButtonHit();
        if (x < btn.x0 || x > btn.x1 || y < btn.y0 || y > btn.y1) return;
        this.model.start(this.model.stage);
        this.readyRendered = false;
        this.renderDirty = true;
    }

    private async toggleLeaderboard() {
        // Node hit + global input can both fire for one click — debounce.
        const now = Date.now();
        if (now - this.lbToggleAt < 250) return;
        this.lbToggleAt = now;

        if (this.leaderboardOpen) {
            this.closeLeaderboard();
            return;
        }
        this.leaderboardOpen = true;
        this.readyRendered = false;
        this.ensureLeaderboardHitNodes();
        this.ensureWechatSubContext();
        if (this.subContextShowTimer) {
            clearTimeout(this.subContextShowTimer);
            this.subContextShowTimer = null;
        }
        const best = Math.max(this.model.score, 0);
        this.leaderboardRows = [
            { name: '我', score: best, self: true },
            { name: '蓝鳍', score: Math.max(120, best - 18) },
            { name: '鼠船长', score: Math.max(90, best - 41) },
        ];
        this.flushLeaderboardFrame();
        this.subContextShowTimer = setTimeout(() => {
            if (this.leaderboardOpen && this.subContextNode?.isValid) this.subContextNode.active = true;
            this.subContextShowTimer = null;
        }, 250);
        try {
            this.leaderboardRows = await this.leaderboard.requestFriendBoard();
        } catch {
            /* preview keeps placeholder rows */
        }
        if (this.leaderboardOpen) this.flushLeaderboardFrame();
    }

    private closeLeaderboard() {
        this.leaderboardOpen = false;
        if (this.subContextShowTimer) {
            clearTimeout(this.subContextShowTimer);
            this.subContextShowTimer = null;
        }
        if (this.subContextNode?.isValid) this.subContextNode.active = false;
        this.flushLeaderboardFrame();
    }

    private ensureWechatSubContext() {
        const wx = (globalThis as unknown as { wx?: unknown }).wx;
        if (!wx || this.subContextNode?.isValid) return;
        const node = new Node('LeaderboardSubContext');
        node.layer = Layers.Enum.UI_2D;
        const ui = node.addComponent(UITransform);
        ui.setContentSize(LB_UI.panelW, LB_UI.panelH);
        this.node.addChild(node);
        try { node.addComponent('cc.SubContextView' as never); } catch (error) {
            console.warn('SubContextView unavailable until WeChat build', error);
        }
        node.active = false;
        this.subContextNode = node;
    }

    private onTouchStart(e: EventTouch) {
        this.pointerDown = true;
        const p = this.pointerToCompose(e.getUILocation());
        this.setHover(p.x, p.y);
        this.move(p.x);
    }
    private onTouchMove(e: EventTouch) {
        const p = this.pointerToCompose(e.getUILocation());
        this.setHover(p.x, p.y);
        if (this.pointerDown) this.move(p.x);
    }
    private onTouchEnd(e: EventTouch) {
        this.pointerDown = false;
        const p = this.pointerToCompose(e.getUILocation());
        this.tap(p.x, p.y);
    }
    private onTouchCancel() { this.pointerDown = false; }
    private onMouseDown(e: EventMouse) {
        if (e.getButton() !== 0) return;
        this.pointerDown = true;
        const p = this.pointerToCompose(e.getUILocation());
        this.setHover(p.x, p.y);
    }
    private onMouseMove(e: EventMouse) {
        const p = this.pointerToCompose(e.getUILocation());
        this.setHover(p.x, p.y);
        if (this.pointerDown) this.move(p.x);
    }
    private onMouseUp(e: EventMouse) {
        if (e.getButton() !== 0) return;
        this.pointerDown = false;
        const p = this.pointerToCompose(e.getUILocation());
        this.tap(p.x, p.y);
    }
    private onKeyDown(e: EventKeyboard) {
        if (e.keyCode === KeyCode.ARROW_LEFT || e.keyCode === KeyCode.KEY_A) this.left = true;
        if (e.keyCode === KeyCode.ARROW_RIGHT || e.keyCode === KeyCode.KEY_D) this.right = true;
        if (e.keyCode === KeyCode.KEY_T) {
            void this.toggleLeaderboard();
            return;
        }
        if ((e.keyCode === KeyCode.ENTER || e.keyCode === KeyCode.SPACE)
            && this.model.phase !== 'playing' && this.model.phase !== 'intro' && !this.leaderboardOpen) {
            const btn = startButtonHit();
            this.tap(btn.cx, btn.cy);
        }
    }
    private onKeyUp(e: EventKeyboard) {
        if (e.keyCode === KeyCode.ARROW_LEFT || e.keyCode === KeyCode.KEY_A) this.left = false;
        if (e.keyCode === KeyCode.ARROW_RIGHT || e.keyCode === KeyCode.KEY_D) this.right = false;
    }

    onDisable() { this.left = this.right = this.pointerDown = false; }
    onDestroy() {
        if (this.subContextShowTimer) clearTimeout(this.subContextShowTimer);
        view.off('canvas-resize', this.onCanvasResize, this);
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }
}
