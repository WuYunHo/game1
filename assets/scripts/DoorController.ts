import { _decorator, Color, Component, Label, Layers, Node, UITransform, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

type DoorType = 'mul' | 'add';

@ccclass('DoorController')
export class DoorController extends Component {
    @property
    textAnchorName = 'TextAnchor';

    private uiRoot: Node | null = null;
    private labelNode: Node | null = null;
    private label: Label | null = null;
    private readonly tmpAnchorPos = new Vec3();

    bindUiRoot(uiRoot: Node | null) {
        this.uiRoot = uiRoot;
        if (this.labelNode && this.labelNode.isValid && uiRoot && this.labelNode.parent !== uiRoot) {
            uiRoot.addChild(this.labelNode);
        }
    }

    setGateText(type: DoorType, value: number) {
        const text = type === 'mul' ? `x${value}` : `+${value}`;
        const color = type === 'mul'
            ? new Color(120, 220, 255, 255)
            : new Color(180, 255, 130, 255);
        const label = this.ensureLabel();
        if (!label) return;
        label.string = text;
        label.color = color;
    }

    syncLabel(x: number, y: number) {
        if (!this.labelNode || !this.labelNode.isValid) return;
        this.labelNode.setPosition(x, y, 0);
    }

    getAnchorWorldPosition(out: Vec3): boolean {
        const anchor = this.findTextAnchor();
        if (!anchor || !anchor.isValid) return false;
        anchor.getWorldPosition(this.tmpAnchorPos);
        out.set(this.tmpAnchorPos.x, this.tmpAnchorPos.y, this.tmpAnchorPos.z);
        return true;
    }

    dispose() {
        if (this.labelNode && this.labelNode.isValid) {
            this.labelNode.destroy();
        }
        this.labelNode = null;
        this.label = null;
    }

    onDestroy() {
        this.dispose();
    }

    private ensureLabel(): Label | null {
        if (this.label && this.label.isValid) return this.label;
        if (!this.uiRoot || !this.uiRoot.isValid) return null;
        const node = new Node('DoorText');
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform).setContentSize(220, 64);
        const lb = node.addComponent(Label);
        lb.fontSize = 34;
        lb.lineHeight = 40;
        lb.string = '';
        this.uiRoot.addChild(node);
        this.labelNode = node;
        this.label = lb;
        return lb;
    }

    private findTextAnchor(): Node | null {
        if (!this.node || !this.node.isValid) return null;
        const anchor = this.node.getChildByName(this.textAnchorName);
        return anchor ?? this.node;
    }
}
