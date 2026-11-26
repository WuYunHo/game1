const SCORE_KEY = 'deepsea_score';

// Soul Knight chrome — keep in sync with assets/scripts/LeaderboardUi.ts
const COLORS = {
  bg: '#121820',
  panel: '#1a242c',
  row: '#1c2830',
  rowSelf: '#243840',
  hi: '#4a5a64',
  hiSelf: '#3aa0b8',
  text: '#fff6e8',
  muted: '#8a9aa4',
  score: '#ffe566',
  outline: '#141414',
};

wx.onMessage((message) => {
  if (!message || message.type !== 'leaderboard') return;
  const key = message.key || SCORE_KEY;
  wx.getFriendCloudStorage({
    keyList: [key],
    success: (result) => draw(result.data || [], key),
    fail: () => draw([], key),
  });
});

function draw(users, key) {
  const canvas = sharedCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.width || 520;
  const height = canvas.height || 560;
  ctx.clearRect(0, 0, width, height);

  // Outer black outline + body (pixel plaque).
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(4, 4, width - 8, height - 8);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(18, 18, width - 36, height - 36);

  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 34px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('好友排行榜', width / 2, 64);
  ctx.fillStyle = COLORS.muted;
  ctx.font = 'bold 18px Arial';
  ctx.fillText('微信好友 · 最高分', width / 2, 94);

  const scoreKey = key || SCORE_KEY;
  const rows = users.map((user) => {
    const item = (user.KVDataList || []).find((kv) => kv.key === scoreKey);
    return { name: user.nickname || 'PLAYER', score: Number(item && item.value) || 0 };
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  if (!rows.length) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = 'bold 22px Arial';
    ctx.fillText('暂无好友数据', width / 2, height / 2);
    return;
  }

  rows.forEach((row, index) => {
    const y = 130 + index * 58;
    ctx.fillStyle = COLORS.outline;
    ctx.fillRect(36, y - 28, width - 72, 52);
    ctx.fillStyle = index === 0 ? COLORS.rowSelf : COLORS.row;
    ctx.fillRect(40, y - 24, width - 80, 44);
    ctx.fillStyle = index === 0 ? COLORS.hiSelf : COLORS.hi;
    ctx.fillRect(42, y - 22, width - 84, 3);

    ctx.fillStyle = index === 0 ? '#7fd0e0' : '#c8d0d8';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(String(index + 1), 56, y + 6);
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 20px Arial';
    ctx.fillText(row.name, 92, y + 6);
    ctx.fillStyle = index === 0 ? COLORS.score : COLORS.text;
    ctx.textAlign = 'right';
    ctx.fillText(String(row.score), width - 56, y + 6);
  });
}

// Placeholder so SubContextView never flashes empty white.
draw([]);
