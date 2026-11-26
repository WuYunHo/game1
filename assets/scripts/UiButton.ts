/**
 * Shared Cocos Button factory — all interactive plaques should go through here.
 */
import {
    Button, Color, EventMouse, EventTouch, Graphics, HorizontalTextAlignment, Label,
    Layers, Node, UITransform, VerticalTextAlignment,
} from 'cc';

export type UiButtonHandle = {
    node: Node;
    button: Button;
    label: Label | null;
    setLabel: (text: string) => void;
    setSize: (w: number, h: number) => void;
};

export type UiClickButtonOpts = {
    name: string;
    width: number;
    height: number;
    label?: string;
    fontSize?: number;
    /** Nearly-invisible hit fill alpha (1–255). Visual chrome can still come from compose. */
    hitAlpha?: number;
    onClick: () => void;
};

export type UiHoldButtonOpts = {
    name: string;
    width: number;
    height: number;
    label?: string;
    fontSize?: number;
    hitAlpha?: number;
    onDown: () => void;
    onUp: () => void;
};

function paintHit(g: Graphics, w: number, h: number, alpha: number) {
    g.clear();
    g.fillColor = new Color(255, 255, 255, Math.max(1, Math.min(255, alpha)));
    g.rect(-w * 0.5, -h * 0.5, w, h);
    g.fill();
}

function attachLabel(node: Node, text: string, fontSize: number): Label {
    const child = new Node('Label');
    child.layer = Layers.Enum.UI_2D;
    child.addComponent(UITransform).setContentSize(node.getComponent(UITransform)!.contentSize);
    node.addChild(child);
    const label = child.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize * 1.2;
    label.isBold = true;
    label.color = new Color(255, 246, 232, 255);
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.overflow = Label.Overflow.NONE;
    label.enableWrapText = false;
    label.fontFamily = 'Arial Black, Impact, Microsoft YaHei, sans-serif';
    return label;
}

/** Click / tap Button — preferred for all one-shot UI actions. */
export function createClickButton(parent: Node, opts: UiClickButtonOpts): UiButtonHandle {
    const node = new Node(opts.name);
    node.layer = Layers.Enum.UI_2D;
    const ui = node.addComponent(UITransform);
    ui.setContentSize(opts.width, opts.height);

    const g = node.addComponent(Graphics);
    paintHit(g, opts.width, opts.height, opts.hitAlpha ?? 1);

    const button = node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    button.target = node;
    button.interactable = true;

    const label = opts.label != null
        ? attachLabel(node, opts.label, opts.fontSize ?? 18)
        : null;

    node.on(Button.EventType.CLICK, () => {
        opts.onClick();
    }, parent);

    // Swallow so global gesture lane-drag does not steal the press.
    node.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; }, parent);
    node.on(Node.EventType.MOUSE_UP, (e: EventMouse) => {
        if (e.getButton() === 0) e.propagationStopped = true;
    }, parent);

    parent.addChild(node);
    return {
        node,
        button,
        label,
        setLabel: (text) => { if (label) label.string = text; },
        setSize: (w, h) => {
            ui.setContentSize(w, h);
            paintHit(g, w, h, opts.hitAlpha ?? 1);
            if (label) label.node.getComponent(UITransform)?.setContentSize(w, h);
        },
    };
}

/** Hold Button — used for continuous lane pads (press = down, release = up). */
export function createHoldButton(parent: Node, opts: UiHoldButtonOpts): UiButtonHandle {
    const node = new Node(opts.name);
    node.layer = Layers.Enum.UI_2D;
    const ui = node.addComponent(UITransform);
    ui.setContentSize(opts.width, opts.height);

    const g = node.addComponent(Graphics);
    paintHit(g, opts.width, opts.height, opts.hitAlpha ?? 1);

    const button = node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    button.target = node;
    button.interactable = true;

    const label = opts.label != null
        ? attachLabel(node, opts.label, opts.fontSize ?? 18)
        : null;

    const down = (e: EventTouch | EventMouse) => {
        e.propagationStopped = true;
        opts.onDown();
    };
    const up = (e: EventTouch | EventMouse) => {
        e.propagationStopped = true;
        opts.onUp();
    };
    node.on(Node.EventType.TOUCH_START, down, parent);
    node.on(Node.EventType.TOUCH_END, up, parent);
    node.on(Node.EventType.TOUCH_CANCEL, up, parent);
    node.on(Node.EventType.MOUSE_DOWN, (e: EventMouse) => {
        if (e.getButton() !== 0) return;
        down(e);
    }, parent);
    node.on(Node.EventType.MOUSE_UP, (e: EventMouse) => {
        if (e.getButton() !== 0) return;
        up(e);
    }, parent);

    parent.addChild(node);
    return {
        node,
        button,
        label,
        setLabel: (text) => { if (label) label.string = text; },
        setSize: (w, h) => {
            ui.setContentSize(w, h);
            paintHit(g, w, h, opts.hitAlpha ?? 1);
            if (label) label.node.getComponent(UITransform)?.setContentSize(w, h);
        },
    };
}

/** Compose (cx,cy top-left Y-down) → parent local center-origin Y-up. */
export function placeUiButton(node: Node, cx: number, cy: number, playW: number, playH: number) {
    node.setPosition(cx - playW * 0.5, playH * 0.5 - cy, 0);
}
