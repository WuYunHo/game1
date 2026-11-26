/**
 * Boot loading screen — Soul Knight plaque chrome + banner + chunky bar.
 */
import type { DrawCommand } from './ZombieGatePresentation';

export const LOAD_UI = Object.freeze({
    bannerW: 656,
    bannerH: 368,
    barW: 520,
    barH: 28,
    barShellH: 40,
    /** Match engine splash poster (~35% bar) so the handoff looks continuous. */
    startProgress: 0.35,
    minMs: 900,
});

export type LoadingViewState = {
    /** 0..1 displayed fill (already eased). */
    progress: number;
    /** True once banner sprite is available. */
    bannerReady: boolean;
};

function pushPlaque(
    cmds: DrawCommand[],
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    hi = '#6a7a88',
) {
    cmds.push({
        id: `${id}-out`, kind: 'rect',
        x, y, w: w + 6, h: h + 6, fill: '#141414', radius: 0,
    });
    cmds.push({
        id: `${id}-body`, kind: 'rect',
        x, y, w, h, fill, radius: 0,
    });
    cmds.push({
        id: `${id}-hi`, kind: 'rect',
        x, y: y - h * 0.5 + 2, w: w - 4, h: 3, fill: hi, radius: 0,
    });
}

/** Full-screen boot UI in top-left compose coords. */
export function composeLoadingScreen(
    playW: number,
    playH: number,
    state: LoadingViewState,
): DrawCommand[] {
    const cmds: DrawCommand[] = [];
    const cx = playW * 0.5;
    const p = Math.max(0, Math.min(1, state.progress));
    const pct = Math.round(p * 100);

    // Quiet dungeon wash (matches floor palette).
    cmds.push({
        id: 'loadBg', kind: 'rect',
        x: cx, y: playH * 0.5, w: playW, h: playH, fill: '#0e141a', radius: 0,
    });
    // Soft vignette bands — keep composition focused on banner.
    cmds.push({
        id: 'loadBandTop', kind: 'rect',
        x: cx, y: 48, w: playW, h: 96, fill: '#121820', radius: 0,
    });
    cmds.push({
        id: 'loadBandBot', kind: 'rect',
        x: cx, y: playH - 56, w: playW, h: 112, fill: '#121820', radius: 0,
    });

    cmds.push({
        id: 'loadTitle', kind: 'text',
        x: cx, y: Math.round(playH * 0.12),
        text: '肥鱼大冒险', size: 42, bold: true, fill: '#fff6e8',
    });
    cmds.push({
        id: 'loadSub', kind: 'text',
        x: cx, y: Math.round(playH * 0.12) + 40,
        text: 'DEEPSEA · 向僵尸开炮', size: 16, bold: true, fill: '#8a9aa4',
    });

    const bannerY = Math.round(playH * 0.42);
    pushPlaque(cmds, 'loadBannerFrame', cx, bannerY, LOAD_UI.bannerW, LOAD_UI.bannerH, '#1a242c', '#7a8894');
    if (state.bannerReady) {
        cmds.push({
            id: 'loadBanner', kind: 'image',
            x: cx, y: bannerY,
            w: LOAD_UI.bannerW - 16, h: LOAD_UI.bannerH - 16,
            asset: 'banner',
        });
    } else {
        cmds.push({
            id: 'loadBannerPlace', kind: 'rect',
            x: cx, y: bannerY, w: LOAD_UI.bannerW - 16, h: LOAD_UI.bannerH - 16,
            fill: '#243038', radius: 0,
        });
        cmds.push({
            id: 'loadBannerHint', kind: 'text',
            x: cx, y: bannerY, text: '大肥鱼出击中…', size: 22, bold: true, fill: '#7a8894',
        });
    }

    const barY = Math.round(playH * 0.72);
    pushPlaque(cmds, 'loadBarShell', cx, barY, LOAD_UI.barW + 24, LOAD_UI.barShellH, '#2b3540', '#7a8894');
    cmds.push({
        id: 'loadBarTrack', kind: 'rect',
        x: cx, y: barY, w: LOAD_UI.barW, h: LOAD_UI.barH, fill: '#121820', radius: 0,
    });
    if (p > 0.01) {
        const fillW = Math.max(8, LOAD_UI.barW * p);
        cmds.push({
            id: 'loadBarFillOut', kind: 'rect',
            x: cx - LOAD_UI.barW * 0.5 + fillW * 0.5, y: barY,
            w: fillW, h: LOAD_UI.barH, fill: '#141414', radius: 0,
        });
        cmds.push({
            id: 'loadBarFill', kind: 'rect',
            x: cx - LOAD_UI.barW * 0.5 + fillW * 0.5, y: barY,
            w: Math.max(4, fillW - 4), h: LOAD_UI.barH - 6, fill: '#2a7f94', radius: 0,
        });
        cmds.push({
            id: 'loadBarShine', kind: 'rect',
            x: cx - LOAD_UI.barW * 0.5 + fillW * 0.5, y: barY - 8,
            w: Math.max(4, fillW - 10), h: 3, fill: '#7fd0e0', radius: 0,
        });
    }

    cmds.push({
        id: 'loadPct', kind: 'text',
        x: cx, y: barY + 52,
        text: `加载中 ${pct}%`, size: 22, bold: true, fill: '#ffe566',
    });
    cmds.push({
        id: 'loadTip', kind: 'text',
        x: cx, y: barY + 86,
        text: '格子换道 · 过门成长 · 自动射击', size: 16, bold: true, fill: '#8a9aa4',
    });

    return cmds;
}
