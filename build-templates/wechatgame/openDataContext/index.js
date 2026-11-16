const SCORE_KEY = 'deepsea_score';

wx.onMessage((message) => {
  if (!message || message.type !== 'leaderboard') return;
  const key = message.key || SCORE_KEY;
  wx.getFriendCloudStorage({
    keyList: [key],
    success: (result) => draw(result.data || [], key),
    fail: () => draw([], key),
  });
});

function draw(users) {
  const canvas = sharedCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.width || 720;
  const height = canvas.height || 960;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff6dc';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#153d59';
  ctx.font = 'bold 42px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('FRIENDS', width / 2, 76);
  const rows = users.map((user) => {
    const item = (user.KVDataList || []).find((kv) => kv.key === SCORE_KEY);
    return { name: user.nickname || 'PLAYER', score: Number(item && item.value) || 0 };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
  rows.forEach((row, index) => {
    const y = 140 + index * 68;
    ctx.fillStyle = index === 0 ? '#b8f2db' : '#f6e8b8';
    roundRect(ctx, 50, y - 40, width - 100, 52, 18);
    ctx.fillStyle = '#153d59';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${index + 1}  ${row.name}`, 78, y - 6);
    ctx.textAlign = 'right';
    ctx.fillText(String(row.score), width - 78, y - 6);
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}

// Paint an immediate placeholder so SubContextView never flashes an empty
// white canvas while getFriendCloudStorage is resolving.
draw([]);
