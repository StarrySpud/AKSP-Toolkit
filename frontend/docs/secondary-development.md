# 二次开发说明

## 项目历史

上游是 **yeyeye613** 的《明日方舟卫戍协议配队工具》。`dev` 从提交 `12dfc43e4f3fcb3fb3410299c2822a1b8a8dc2d2` 建立并继承其 Git 历史。`upstream` 用于获取原项目更新，本地推送地址指向无效域名。拉取上游更新后应先审查数据、旧版页面与新版评分规则的差异。 [上游仓库](https://github.com/yeyeye613/Arknights-alliance-tool) · [原作者的在线站点](https://yeyeye613.github.io/Arknights-alliance-tool/) · [原项目 README](upstream-readme.md)

## 入口与模块

| 路径 | 职责 |
| --- | --- |
| `frontend/index.html`、`src/main.ts` | 新版入口，挂载 `src/AKSP-Toolkit/AKSP-Toolkit.vue`。 |
| `frontend/backup.html`、`src/backup.ts`、`src/App.vue` | 原配队界面的独立入口。构建后仍可访问 `/AKSP-Toolkit/backup.html`。 |
| `src/data/versions.js`、`src/data/*.json` | 两个游戏版本的干员、盟约、甄选及装备数据。干员按名称查询，盟约的 `group` 区分核心盟约和附加盟约。 |
| `src/components/PoolPanel.vue`、`src/AKSP-Toolkit/HeldLineup.vue` | 干员池和持有棋子。根组件协调点击、拖拽、推荐阵容、终端标签和版本状态。 |
| `src/AKSP-Toolkit/covenantGraph.js`、`drawCovenantGraph.js`、`CovenantAnalysis.vue` | 按盟约成员关系生成拓扑，再用 Canvas 绘图。色谱、显示和交互位于 Vue 组件。 |
| `src/AKSP-Toolkit/covenantWeights.js`、`lineupScoring.js`、`operatorInventory.js` | 权重、干员排名、棋子与阵容评分。 |
| `src/AKSP-Toolkit/endgameOptimizer.js`、`endgameOptimizer.worker.js` | 搜索终局阵容，自动终局方案在 Worker 中生成。 |
| `src/AKSP-Toolkit/toolkitConfiguration.js` | 校验和归一化配置 JSON，格式标记为 `AKSP-Toolkit`，当前 schema 版本为 1。 |
| `frontend/public/resource/image/`、`src/utils/index.js` | 头像、盟约与装备图片，资源 URL 由 Vite base 拼接。 |
| `launcher/` | Windows x64 启动器、内嵌静态资源构建、图标和心跳退出测试。 |

表中 `src/` 路径都相对于 `frontend/`。

## 数据和评分

- 版本注册表提供 `mengyue` 与 `guicheng`。页面在当前版本上读取干员的盟约和特质，核心盟约与附加盟约分别处理。旧版编队和分享码仍由旧版入口维护。
- 新版根组件持有按版本组织的配置与持有状态，通过 props 和事件连接干员池、盟约分析和策略编辑。用户设置保存在浏览器的 `localStorage`。导入后需要确保旧配置字段和两个版本都能正常读取。
- 干员排名由当前图的关系、权重和所启用的排名选项决定。推荐阵容、目标阵容和终局阵容的评分从共享规则读取棋子、已激活盟约、层数、目标标记和策略权重。修改公式时，应同时核对显示和搜索使用的计分。
- 额外盟约数量增加相应盟约的有效计数，阵容人数由棋子决定。规程中远见、奇迹、投资人可以由持有槽计入激活。规程里 Ban 任一核心盟约即排除其所属干员。其余情况下，干员的所有盟约都被 Ban 才会从招募池排除。已有持有棋子的盟约仍可参与阵容统计。
- 盟约适配由 `covenantPotential.js` 根据当前招募池和上场门槛计算。多核心模式列出可同时激活最多种类的组合，并通过逐个移除干员验证是否不可替换。允许整备区参与的词条照实际描述计入。
- `covenantFunctions.js` 单独维护各等级的主次分类，可在「策略编辑 → 盟约分类」修改。`covenantStackerPotential.js` 在点选热力图搭配后核对叠层手能否入阵。晋升后每 5 层分一级，优先显示「叠层等级 − 商店解锁等级」较高的干员，同分优先看叠层等级与层数。同行与整备区按 6 人和 10 枚棋子估算，卡池计算每个干员只计一份。临时层相关词条不计入评级。可验证的上限加成按四舍五入折算。
- 规则改动优先补在 `frontend/src/tests/akspToolkit.spec.js` 和对应的盟约统计测试。组合搜索可先用小数据验证，再到浏览器检查 Worker 在较大的池子里的表现。

### 策略计算的边界

当前策略开发使用简化的盟约关系网。干员连边代表共享盟约或玩家录入的相性，阵容分数来自满足的激活条件与所选权重。同分只表示当前模型给出相同结果。终局搜索的目标是寻找模型下的高分候选，结果还受搜索范围与设置影响。盟约适配与叠层排名用于辅助判断可行性和性价比。

工具没有模拟完整对局。刷新和招募概率、经济曲线、装备获取、站位与阻挡、敌人组成、技能时机及实际触发次数都可能改变实战判断。推荐可作为筛选候选阵容的起点，分数无法代表胜率或真正的最优策略。未能确认的叠层上限会保留为「待确认」。

## 开发和验证

使用 Node.js 24 与 npm。从项目根目录进入 `frontend/` 后运行：

```sh
npm ci
npm run dev -- --host 127.0.0.1
npm run test -- --run
npm run build
```

`npm run build` 先执行 Vue 类型检查，然后输出 `frontend/dist/`。PWA 的页面入口和静态资源使用 `/AKSP-Toolkit/`，项目改名时应一起检查 base、manifest、旧版入口和 Service Worker。Windows 打包见 [试用发布说明](release.md)。

扩展新功能时，可在 Vue 组件之外复用版本数据、拓扑和评分函数。耗时搜索放在 Worker 中，规则测试以固定样本覆盖双版本、重复棋子与晋升、额外盟约和待部署区。
