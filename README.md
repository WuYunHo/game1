# 肥鱼大冒险 · DEEPSEA

Cocos Creator **3.8.7** / TypeScript / 720 × 1280 竖屏休闲游戏。

## 玩法

控制 DeepSeek 蓝白大肥鱼鱼群穿越海岛水道。没有枪械、子弹、伤害或射速升级。

- 初始 5 位伙伴，左右滑动、移动鼠标或按方向键 / A、D 选择路线。
- 大肥鱼采用参考图中的蓝发礼帽、蓝白礼服和金色装饰；飞飞鼠采用参考图中的灰白胖体、黑帽、圆眼镜、胡子和肚皮斑点。
- 蓝色 `×2` 门将鱼群总数翻倍；绿色 `+N` 门加入 N 位伙伴。每排只结算玩家所在半边的一扇门，正中线归右门。
- 戴眼镜、红黑队服的 Faker 大飞鼠头顶显示碰撞消耗的伙伴数。可以绕开普通敌人；碰撞时扣除对应数量，鱼群归零则失败。
- 每关约 60 秒，终点首领无法绕开。保留足够鱼群，击败首领进入下一海域；关数越高敌人越强。
- 鱼群数量不设玩法上限；画面按 16 进化单位绘制，编队最多 6 行。数量增加时自动增加列数并同步缩小精灵、行距和阴影；超过 6×14 个槽位后，额外视觉单位会在已有槽位上错位堆叠，让整群始终留在水道可视区域。
- 鱼群采用合成式视觉进化：16 只初始大肥鱼显示为 1 只大大肥鱼，16 只大大肥鱼再显示为 1 只大大大肥鱼；进化单位会放大并带蓝、金、粉色光晕。逻辑鱼数仍保持精确，用于增益和碰撞。
- 飞飞鼠按波次出现：早期每波 3 只，后段每波最多 5 只，使用不重复路线并带纵深错位；中途 `−5` 会显示 5 只飞飞鼠并排站在一起，Boss 仍是单只。飞门约每 4.3 秒出现，飞飞鼠波次约每 3.3 秒出现，敌人约 4.2 秒抵达玩家，思考窗口更短。选错增益门超过 3 次后，下一只路径飞飞鼠或最终 Boss 会直接击败鱼群；三次以内仍按正常路线结算。
- 点击面板按钮或按 Enter / 空格开始；失败后重开本关，胜利后进入下一关。

## 运行

用 Cocos Creator 3.8.7 打开项目，打开 `assets/scene/main.scene`，点击预览。
如果编辑器在外部文件修改前已打开，请重新加载编辑器并重新打开主场景，让它完成资源导入。

也可运行与 Cocos **共用同一份规则和画面描述**的 Canvas 预览：

```sh
npm run preview
```

- 旧版肥鱼冲关：http://127.0.0.1:4173/
- 新模式「向僵尸开炮 · 前期」：http://127.0.0.1:4173/zombie-gate

预览只用于快速试玩和画面检查，正式游戏仍由 Cocos 运行。
辅助脚本优先使用本地 TypeScript，否则使用 Creator 自带编译器。首次使用前需在 Creator 打开项目一次，以生成 `temp/declarations`。

```sh
npm run typecheck
npm test
```

测试覆盖增益门单次结算、鱼群进化、碰撞扣员、闪避、首领胜负、重开、恢复帧保护、密集波次，以及场景内部引用和 2D 摄像机配置。

## 策划案

转型设计（向僵尸开炮式前期战斗 + 格子地图空间模型）见：

- [`docs/design/`](./docs/design/README.md)

## 结构

- `assets/scripts/FishRushModel.ts`：不依赖引擎的鱼群、波次、关卡和胜负规则。
- `assets/scripts/FishRushPresentation.ts`：海岛、水道、棕榈树、波纹、增益门、角色编队、HUD 和面板的 2D 画面描述。
- `assets/scripts/FishRushGame.ts`：Cocos 输入、SpriteFrame 加载，以及 Sprite / Graphics / Label 渲染适配。
- `assets/scripts/ZombieGateLevel.ts` / `ZombieGateModel.ts` / `ZombieGatePresentation.ts` / `ZombieGateGame.ts`：新模式关卡、规则、画面描述与 Cocos 适配；`main.scene` 已挂 `ZombieGateGame`。
- `assets/scripts/FishRushGame.ts`：旧版肥鱼冲关适配（保留，未挂主场景）。
- `tests/zombie-gate.cjs`：新模式规则单测。
- `FishRushGame` 使用按文本、Graphics、鱼精灵、飞飞鼠精灵分类的节点池；波次和鱼群变化只回收复用节点，不在每帧销毁重建，也不再 JSON 序列化每条绘制命令。
- 连续的矩形、圆形和多边形会合并到 Graphics 批次节点；鱼群使用 16 进化单位，避免大量 Sprite Draw Call，同时保留每个进化单位的角色精灵细节。
- Cocos 适配层在等待界面只提交一次绘制；游戏进行时动态世界按引擎 60Hz 更新，地面、飞门和飞飞鼠共享同一时间轴。
- `assets/scene/main.scene`：仅保留 UI Camera 和 Canvas；入口组件直接挂载 Canvas，保留原脚本 UUID。
- `assets/resources/art/`：角色精灵 + `loading-banner.png`（大肥鱼击倒飞飞鼠加载海报）。`prompts.json` 保存提示词和来源路径。
- `assets/scripts/LoadingUi.ts`：元气骑士风加载界面（banner 框 + 像素加载条），资源就绪且最短展示时间后进入开始面板。
- `assets/scripts/MovePadUi.ts`：局内左右换道像素按钮（按住连跳一格）；与 A/D 共用 `left`/`right` 标志。
- `assets/scripts/CombatHudUi.ts`：局内「按钮/手势」操控切换弹窗 + 暂停/继续图标；选择会写入本地存储。
- `assets/resources/art/loading-splash.png` + `build-templates/wechatgame/splash.png`：替换 Cocos 引擎插屏（构建后生效；编辑器预览仍可能闪默认页）。`settings/v2/packages/builder.json` 的 `splash-setting` 指向该图；改图后可跑 `tools/sync-splash.ps1`。
- `assets/scripts/LeaderboardService.ts`：微信好友排行榜桥接，AppID 为 `wx6f85dd560abdb2c6`；胜利时保存最高分，点击 `TOP` 打开排行榜。
- `build-templates/wechatgame/openDataContext/`：微信开放数据域排行榜模板，构建微信小游戏时放入 `build/wechatgame/openDataContext`。
- `wechatgame.config.json`：微信小游戏构建配置。Cocos 构建时填写同一个 AppID，并勾选生成开放数据域工程模板；再用微信开发者工具导入 `build/wechatgame` 进行预览和上传。
- `preview/`、`tools/`：无需构建依赖的本地试玩工具。

假 3D 效果完全由 2D 透视投影、精灵缩放、前后绘制顺序、椭圆阴影及水道流动构成。主场景不包含网格、灯光或透视摄像机。
已移除旧 FBX、PBR 贴图、模型压缩包、材质、3D 预制体、旧场景背景、子弹和伤害配置，约 **143.49 MiB** 源资源。Creator 的 `library/`、`temp/` 是未纳入版本控制的导入缓存，由编辑器自行维护。

角色为指定形象的 Q 版演绎；目前角色动画采用漂浮和编队移动，无独立逐帧动画。
