/**
 * In-combat utility plaques: control-mode switch + pause/resume.
 * Anchored on the left edge (`leftSide`), stacked vertically under the progress rail.
 */
export type ControlMode = 'buttons' | 'gesture';

export const CONTROL_MODE_KEY = 'deepsea_control_mode';

export const COMBAT_HUD = Object.freeze({
    iconW: 72,
    iconH: 52,
    /** Left-edge column center X (mirrors TOP inset from the right). */
    leftSideX: 60,
    /** First utility icon Y (below progress rail). */
    controlY: 148,
    /** Second utility icon Y — stacked under control. */
    pauseY: 216,
    popupW: 480,
    popupH: 360,
    optionW: 400,
    optionH: 72,
});

export function combatIconHit(cx: number, cy: number, pad = 10) {
    const hw = COMBAT_HUD.iconW * 0.5 + pad;
    const hh = COMBAT_HUD.iconH * 0.5 + pad;
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh, cx, cy };
}

export function controlIconHit() {
    return combatIconHit(COMBAT_HUD.leftSideX, COMBAT_HUD.controlY);
}

export function pauseIconHit() {
    return combatIconHit(COMBAT_HUD.leftSideX, COMBAT_HUD.pauseY);
}

export function controlPopupCenter(playH: number) {
    return { x: 360, y: Math.round(playH * 0.46) };
}

export function controlOptionHit(playH: number, index: 0 | 1) {
    const { x, y } = controlPopupCenter(playH);
    const cy = y - 20 + index * 96;
    const hw = COMBAT_HUD.optionW * 0.5;
    const hh = COMBAT_HUD.optionH * 0.5;
    return { x0: x - hw, x1: x + hw, y0: cy - hh, y1: cy + hh, cx: x, cy };
}

export function controlCloseHit(playH: number) {
    const { x, y } = controlPopupCenter(playH);
    const cy = y + 140;
    return { x0: x - 140, x1: x + 140, y0: cy - 36, y1: cy + 36, cx: x, cy };
}
