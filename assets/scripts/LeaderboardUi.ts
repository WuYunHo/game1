/**
 * Shared WeChat friend-board layout (Soul Knight chrome).
 * Used by ZombieGate presentation and mirrored in openDataContext.
 */
export type LeaderboardRowView = { name: string; score: number; self?: boolean };

export const LB_UI = Object.freeze({
    /** Top-right entry plaque. */
    buttonX: 660,
    buttonY: 48,
    buttonW: 72,
    buttonH: 52,
    /** Modal panel size (centered). */
    panelW: 520,
    panelH: 560,
    rowW: 440,
    rowH: 48,
    rowGap: 58,
    maxRows: 5,
    titleOffsetY: -210,
    listStartOffsetY: -120,
    closeOffsetY: 210,
    closeW: 280,
    closeH: 72,
});

export function leaderboardButtonHit(cx = LB_UI.buttonX, cy = LB_UI.buttonY) {
    // Generous pad — top-right HUD is easy to miss on tall FIXED_WIDTH previews.
    const pad = 14;
    const hw = LB_UI.buttonW * 0.5 + pad;
    const hh = LB_UI.buttonH * 0.5 + pad;
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh, cx, cy };
}

export function leaderboardPanelCenter(playH: number) {
    return { x: 360, y: Math.round(playH * 0.48) };
}

export function leaderboardCloseHit(playH: number) {
    const { x, y } = leaderboardPanelCenter(playH);
    const cy = y + LB_UI.closeOffsetY;
    const hw = LB_UI.closeW * 0.5;
    const hh = LB_UI.closeH * 0.5;
    return { x0: x - hw, x1: x + hw, y0: cy - hh, y1: cy + hh, cx: x, cy };
}
