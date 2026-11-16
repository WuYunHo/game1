import {
    _decorator, Color, Component, EventKeyboard, EventMouse, EventTouch, Graphics,
    HorizontalTextAlignment, input, Input, KeyCode, Label, Layers, Node, resources,
    ResolutionPolicy, Sprite, SpriteFrame, UITransform, VerticalTextAlignment, view,
} from 'cc';
import { FishRushModel } from './FishRushModel';
import { Command, composeGame } from './FishRushPresentation';

const { ccclass } = _decorator;
type DrawNode = { node: Node; graphics?: Graphics; label?: Label; sprite?: Sprite; signature: string; poolKey: string };

/** Pure 2D UI renderer: no meshes, lights, perspective cameras or projectiles. */
@ccclass('FishRushGame')
export class FishRushGame extends Component {
    private model = new FishRushModel();
    private drawNodes = new Map<string, DrawNode>();
    private nodePools = new Map<string, DrawNode[]>();
    private frames: Partial<Record<'fish' | 'squirrel', SpriteFrame>> = {};
    private artReady = false;
    private loadError = false;
    private left = false;
    private right = false;
    private pointerDown = false;
    private renderAccumulator = 0;
    private renderDirty = true;
    private readyRendered = false;
    private lastPhase = this.model.phase;

    onLoad() {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.SHOW_ALL);
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
            this.loadFrame('fish', 'art/deepseek-fish/spriteFrame'),
            this.loadFrame('squirrel', 'art/faker-squirrel/spriteFrame'),
        ]).then(() => { if (this.isValid) { this.artReady = true; this.renderDirty = true; } }).catch((error) => {
            this.loadError = true;
            console.error('Fish Rush: character artwork failed to load', error);
        });
    }

    private loadFrame(key: 'fish' | 'squirrel', path: string): Promise<void> {
        return new Promise((resolve, reject) => resources.load(path, SpriteFrame, (error, frame) => {
            if (error || !frame) { reject(error ?? new Error(path)); return; }
            if (this.isValid) this.frames[key] = frame;
            resolve();
        }));
    }

    update(dt: number) {
        if (this.model.phase === 'playing' && (this.left || this.right)) {
            this.model.steer(this.model.targetX + (Number(this.right) - Number(this.left)) * Math.min(dt,0.05) * 2.2);
        }
        this.model.tick(dt);
        if (this.model.phase !== this.lastPhase) {
            this.lastPhase = this.model.phase;
            this.renderDirty = true;
            this.readyRendered = false;
        }
        // Keep the engine's presentation cadence at 60 Hz, but rebuild our
        // dynamic display list at 30 Hz while playing and once while waiting.
        // This avoids allocating and traversing hundreds of fish nodes every
        // update without changing the actual game simulation rate.
        if (this.model.phase === 'ready') {
            if (this.readyRendered && !this.renderDirty) return;
        } else {
            this.renderAccumulator += Math.min(dt, 0.05);
            if (!this.renderDirty && this.renderAccumulator < 1 / 30) return;
            this.renderAccumulator = 0;
        }
        const commands = composeGame(this.model);
        if (!this.artReady) {
            const button = commands.find(c => c.id === 'buttonText');
            if (button) button.text = this.loadError ? '资源加载失败，请重新预览' : '伙伴集结中…';
        }
        this.render(commands);
        this.renderDirty = false;
        if (this.model.phase === 'ready') this.readyRendered = true;
    }

    private render(commands: Command[]) {
        commands = this.batchLargeSchool(commands);
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
            if (item.node.getSiblingIndex() !== index) item.node.setSiblingIndex(index);
            index++;
            const signature = this.commandSignature(c);
            if (signature === item.signature) continue;
            item.signature = signature;
            const x = c.x ?? 360, y = c.y ?? 640;
            const w = c.w ?? 1, h = c.h ?? 1;
            item.node.setPosition(x-360,640-y,0);
            item.node.getComponent(UITransform)!.setContentSize(w,h);
            if (item.label) {
                const l = item.label;
                l.string = c.text ?? '';
                l.fontSize = c.size ?? 24;
                l.lineHeight = (c.size ?? 24) * 1.3;
                l.color = new Color(c.fill ?? '#153d59');
                l.isBold = c.bold ?? true;
                l.horizontalAlign = HorizontalTextAlignment.CENTER;
                l.verticalAlign = VerticalTextAlignment.CENTER;
                l.overflow = Label.Overflow.NONE;
                l.enableWrapText = false;
                l.fontFamily = 'Arial, Microsoft YaHei, sans-serif';
            } else if (item.sprite) {
                item.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                item.sprite.spriteFrame = this.frames[c.asset!] ?? null;
                item.sprite.color = new Color(c.tint ?? '#ffffff');
            } else if (item.graphics) {
                const g = item.graphics;
                g.clear();
                g.fillColor = new Color(c.fill ?? '#ffffff');
                g.strokeColor = new Color(c.stroke ?? '#153d59');
                g.lineWidth = c.line ?? 1;
                if (c.kind === 'school') {
                    this.drawSchoolBatch(g, c.fishGlyphs ?? []);
                } else if (c.kind === 'ellipse') g.ellipse(0,0,w/2,h/2);
                else if (c.kind === 'rect') g.roundRect(-w/2,-h/2,w,h,Math.min(c.radius ?? 0,w/2,h/2));
                else if (c.points?.length) {
                    item.node.setPosition(0,0,0);
                    g.moveTo(c.points[0][0]-360,640-c.points[0][1]);
                    for (const p of c.points.slice(1)) g.lineTo(p[0]-360,640-p[1]);
                    g.close();
                }
                g.fill();
                if(c.stroke) g.stroke();
            }
        }
        for (const [id,item] of this.drawNodes) {
            if (live.has(id)) continue;
            this.releaseDrawNode(item);
            this.drawNodes.delete(id);
        }
    }

    private batchLargeSchool(commands: Command[]): Command[] {
        const fish = commands.filter((c) => c.kind === 'image' && c.asset === 'fish' && c.id.startsWith('fish'));
        if (fish.length <= 64) return commands;
        const fishIds = new Set(fish.map((c) => c.id));
        const shadowIds = new Set(commands
            .filter((c) => c.kind === 'ellipse' && c.id.startsWith('fshadow'))
            .map((c) => c.id));
        const first = commands.findIndex((c) => fishIds.has(c.id) || shadowIds.has(c.id));
        const rest = commands.filter((c) => !fishIds.has(c.id) && !shadowIds.has(c.id));
        const glyphs = fish.map((c) => ({ x: c.x ?? 360, y: c.y ?? 640, size: Math.max(8, c.w ?? 20) }));
        const school: Command = {
            id: 'fishBatch', kind: 'school', x: 360, y: 640, w: 720, h: 1280,
            fishGlyphs: glyphs,
        };
        const insertAt = first < 0 ? rest.length : Math.min(first, rest.length);
        rest.splice(insertAt, 0, school);
        return rest;
    }

    private drawSchoolBatch(g: Graphics, glyphs: Array<{ x: number; y: number; size: number }>) {
        // One Graphics node replaces hundreds of Sprite renderers at large
        // counts. The glyph keeps the same blue hair, white dress and navy
        // outline language while remaining legible at map distance.
        const pass = (color: Color, draw: (px: number, py: number, s: number) => void) => {
            g.fillColor = color;
            for (const glyph of glyphs) draw(glyph.x - 360, 640 - glyph.y, glyph.size);
            g.fill();
        };
        pass(new Color(38, 143, 175, 150), (px, py, s) => {
            g.ellipse(px, py + s * 0.31, s * 0.34, s * 0.09);
        });
        pass(new Color(26, 55, 120, 255), (px, py, s) => {
            g.ellipse(px, py, s * 0.36, s * 0.42);
        });
        pass(new Color(250, 246, 238, 255), (px, py, s) => {
            g.ellipse(px, py + s * 0.09, s * 0.25, s * 0.25);
        });
        pass(new Color(63, 128, 245, 255), (px, py, s) => {
            g.ellipse(px - s * 0.22, py - s * 0.02, s * 0.15, s * 0.23);
            g.ellipse(px + s * 0.22, py - s * 0.02, s * 0.15, s * 0.23);
        });
        pass(new Color(255, 255, 255, 255), (px, py, s) => {
            g.ellipse(px - s * 0.12, py - s * 0.08, s * 0.065, s * 0.09);
            g.ellipse(px + s * 0.12, py - s * 0.08, s * 0.065, s * 0.09);
        });
        pass(new Color(26, 55, 120, 255), (px, py, s) => {
            g.roundRect(px - s * 0.17, py - s * 0.39, s * 0.34, s * 0.09, s * 0.035);
        });
    }

    private poolKey(c: Command): string {
        return c.kind === 'image' ? `image:${c.asset ?? ''}` : c.kind === 'text' ? 'text' : 'graphics';
    }

    private acquireDrawNode(c: Command): DrawNode {
        const poolKey = this.poolKey(c);
        const pool = this.nodePools.get(poolKey);
        const pooled = pool && pool.pop();
        if (pooled) return pooled;
        const node = new Node(c.id);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        this.node.addChild(node);
        const item: DrawNode = { node, signature: '', poolKey };
        if (c.kind === 'text') item.label = node.addComponent(Label);
        else if (c.kind === 'image') item.sprite = node.addComponent(Sprite);
        else item.graphics = node.addComponent(Graphics);
        return item;
    }

    private releaseDrawNode(item: DrawNode) {
        item.node.active = false;
        item.signature = '';
        let pool = this.nodePools.get(item.poolKey);
        if (!pool) {
            pool = [];
            this.nodePools.set(item.poolKey, pool);
        }
        pool.push(item);
    }

    private commandSignature(c: Command): string {
        const points = c.points ? c.points.map((p) => `${p[0]},${p[1]}`).join(';') : '';
        const glyphs = c.kind === 'school' ? (c.fishGlyphs ?? []) : [];
        const schoolSignature = glyphs.length === 0 ? '0' : [
            glyphs.length,
            glyphs[0].x, glyphs[0].y,
            glyphs[glyphs.length >> 1].x, glyphs[glyphs.length >> 1].y,
            glyphs[glyphs.length - 1].x, glyphs[glyphs.length - 1].y,
        ].join(',');
        return [
            c.kind, c.x ?? 360, c.y ?? 640, c.w ?? 1, c.h ?? 1, c.radius ?? 0,
            c.fill ?? '', c.stroke ?? '', c.line ?? 1, c.text ?? '', c.size ?? 24,
            c.bold ?? true, c.asset ?? '', c.tint ?? '', points,
            c.kind === 'school' ? schoolSignature : '',
            c.kind === 'image' ? Boolean(this.frames[c.asset!]) : '',
        ].join('|');
    }

    private move(x: number) {
        if(this.model.phase==='playing') { this.model.steer((x-360)/294); this.renderDirty = true; }
    }
    private tap(x: number,y: number) {
        if(this.model.phase==='playing' || !this.artReady) return;
        if(x<124 || x>596 || y<812 || y>898) return;
        this.model.start(this.model.phase==='won' ? this.model.stage+1 : this.model.stage);
        this.renderDirty = true;
    }
    private onTouchStart(e: EventTouch) { this.pointerDown=true; this.move(e.getUILocation().x); }
    private onTouchMove(e: EventTouch) { if(this.pointerDown) this.move(e.getUILocation().x); }
    private onTouchEnd(e: EventTouch) { this.pointerDown=false; const p=e.getUILocation(); this.tap(p.x,1280-p.y); }
    private onTouchCancel() { this.pointerDown=false; }
    private onMouseDown(e: EventMouse) { if(e.getButton()===0) this.pointerDown=true; }
    private onMouseMove(e: EventMouse) { this.move(e.getUILocation().x); }
    private onMouseUp(e: EventMouse) { if(e.getButton()!==0)return; this.pointerDown=false; const p=e.getUILocation(); this.tap(p.x,1280-p.y); }
    private onKeyDown(e: EventKeyboard) {
        if(e.keyCode===KeyCode.ARROW_LEFT || e.keyCode===KeyCode.KEY_A) this.left=true;
        if(e.keyCode===KeyCode.ARROW_RIGHT || e.keyCode===KeyCode.KEY_D) this.right=true;
        if((e.keyCode===KeyCode.ENTER || e.keyCode===KeyCode.SPACE) && this.model.phase!=='playing') this.tap(360,855);
    }
    private onKeyUp(e: EventKeyboard) {
        if(e.keyCode===KeyCode.ARROW_LEFT || e.keyCode===KeyCode.KEY_A) this.left=false;
        if(e.keyCode===KeyCode.ARROW_RIGHT || e.keyCode===KeyCode.KEY_D) this.right=false;
    }
    onDisable() { this.left=this.right=this.pointerDown=false; }
    onDestroy() {
        input.off(Input.EventType.TOUCH_START,this.onTouchStart,this);
        input.off(Input.EventType.TOUCH_MOVE,this.onTouchMove,this);
        input.off(Input.EventType.TOUCH_END,this.onTouchEnd,this);
        input.off(Input.EventType.TOUCH_CANCEL,this.onTouchCancel,this);
        input.off(Input.EventType.MOUSE_DOWN,this.onMouseDown,this);
        input.off(Input.EventType.MOUSE_MOVE,this.onMouseMove,this);
        input.off(Input.EventType.MOUSE_UP,this.onMouseUp,this);
        input.off(Input.EventType.KEY_DOWN,this.onKeyDown,this);
        input.off(Input.EventType.KEY_UP,this.onKeyUp,this);
    }
}
