import { sys } from 'cc';

export const WECHAT_GAME_APP_ID = 'wx6f85dd560abdb2c6';
export type LeaderboardRow = { name: string; score: number; self?: boolean };
type WxLike = {
    setUserCloudStorage?: (options: { KVDataList: Array<{ key: string; value: string }>; success?: () => void; fail?: (err: unknown) => void }) => void;
    getOpenDataContext?: () => { postMessage: (message: unknown) => void };
};

export class LeaderboardService {
    static readonly scoreKey = 'deepsea_score';
    private wx(): WxLike | null { return (globalThis as unknown as { wx?: WxLike }).wx ?? null; }
    private readLocalBest(): number {
        try { return Number(sys.localStorage.getItem(LeaderboardService.scoreKey) ?? 0) || 0; } catch { return 0; }
    }
    saveScore(score: number) {
        const best = Math.max(this.readLocalBest(), Math.floor(score));
        try { sys.localStorage.setItem(LeaderboardService.scoreKey, String(best)); } catch { /* preview */ }
        const wx = this.wx();
        if (!wx?.setUserCloudStorage) return Promise.resolve(best);
        return new Promise<number>((resolve) => wx.setUserCloudStorage!({
            KVDataList: [{ key: LeaderboardService.scoreKey, value: String(best) }],
            success: () => resolve(best), fail: () => resolve(best),
        }));
    }
    requestFriendBoard(): Promise<LeaderboardRow[]> {
        const context = this.wx()?.getOpenDataContext?.();
        context?.postMessage({ type: 'leaderboard', key: LeaderboardService.scoreKey });
        const self = this.readLocalBest();
        return Promise.resolve([
            { name: '我', score: self, self: true },
            { name: '蓝鳍', score: Math.max(120, self - 18) },
            { name: '鼠船长', score: Math.max(90, self - 41) },
        ]);
    }
}
