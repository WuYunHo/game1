/**
 * In-combat left/right lane buttons (Soul Knight plaques, discrete shift).
 */
export const MOVE_PAD = Object.freeze({
    buttonW: 132,
    buttonH: 108,
    /** Distance from left/right screen edge to button center. */
    sideInset: 88,
    /** Distance from bottom of design space to button center. */
    bottomInset: 128,
});

export function movePadCenters(playH: number) {
    const cy = playH - MOVE_PAD.bottomInset;
    return {
        left: { cx: MOVE_PAD.sideInset, cy },
        right: { cx: 720 - MOVE_PAD.sideInset, cy },
    };
}

export function movePadHit(
    side: 'left' | 'right',
    playH: number,
    pad = 10,
) {
    const { left, right } = movePadCenters(playH);
    const c = side === 'left' ? left : right;
    const hw = MOVE_PAD.buttonW * 0.5 + pad;
    const hh = MOVE_PAD.buttonH * 0.5 + pad;
    return {
        x0: c.cx - hw, x1: c.cx + hw,
        y0: c.cy - hh, y1: c.cy + hh,
        cx: c.cx, cy: c.cy,
    };
}

/** True if compose-space point sits on either lane button. */
export function hitMovePad(x: number, y: number, playH: number): 'left' | 'right' | null {
    const L = movePadHit('left', playH);
    if (x >= L.x0 && x <= L.x1 && y >= L.y0 && y <= L.y1) return 'left';
    const R = movePadHit('right', playH);
    if (x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1) return 'right';
    return null;
}
