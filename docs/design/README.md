# 策划案目录

本目录存放《肥鱼大冒险 / DEEPSEA》向「向僵尸开炮式玩法 + 元气骑士式画面」转型的设计文档。

| 文档 | 内容 |
|---|---|
| [00-产品定位与目标.md](./00-产品定位与目标.md) | 产品一句话、参考拆解、范围边界 |
| [01-玩法总览.md](./01-玩法总览.md) | 核心循环、阶段划分、胜负与成长 |
| [02-空间与镜头.md](./02-空间与镜头.md) | 地图静止、格子移动、镜头与相对运动 |
| [03-前期战斗-MVP.md](./03-前期战斗-MVP.md) | 首期可玩范围、规则、验收清单 |
| [04-门与武器成长.md](./04-门与武器成长.md) | 门类型、数值原则、武器档位 |
| [05-敌人与追击AI.md](./05-敌人与追击AI.md) | 刷怪、站岗、发现后追击 |
| [06-开发计划与里程碑.md](./06-开发计划与里程碑.md) | 分期任务、技术落点、风险 |

## 当前决策摘要

- **玩法主核**：独立复刻「向僵尸开炮」——过门攒人数/武器，自动射击清怪；Boss 后置。
- **首期只做前期战斗**：无 Boss、无完整 Roguelike 地牢。
- **空间模型**：门与多数物体相对地图静止；玩家在地图上前进；仅「发现玩家后的飞飞鼠」主动追击。
- **像素手感**：车道/门对齐网格，左右换道离散（俄罗斯方块式格子感），避免无级滑动造成的违和。
- **技术路线**：不在现有 `FishRushModel` 上硬改；新建规则层 `ZombieGateModel`，Presentation / Cocos 适配可复用节点池与竖屏基建。

## 代码落点（已落地 M1–M3）

| 文件 | 说明 |
|---|---|
| `assets/scripts/ZombieGateConfig.ts` | 门 / 武器箱配置表 |
| `assets/scripts/ZombieGateLevel.ts` | 第 1 关门行 / 武器箱 / 敌行 |
| `assets/scripts/ZombieGateModel.ts` | 规则层 |
| `assets/scripts/ZombieGatePresentation.ts` | 画面描述 |
| `assets/scripts/ZombieGateGame.ts` | Cocos 适配（主场景入口） |
| `tests/zombie-gate.cjs` | 单测 |
| `preview/zombie-gate.html` | 试玩页（`/zombie-gate`） |
| `assets/scene/main.scene` | Canvas 挂载 `ZombieGateGame` |

下一阶段：M5 Boss（后置）或继续调数值 / 微信实机手感。

## 维护约定

- 规则变更先改本文档，再改代码与测试。
- 数值表以 `03` / `04` 为准；实现偏离需在对应文档注明「已落地差异」。
