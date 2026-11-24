# AKSP-Toolkit

《明日方舟》卫戍协议的非官方配队工具，支持「盟约」与「规程」两个游戏版本。

- **局内信息**可筛选干员、管理持有棋子、查看推荐阵容与已激活盟约。
- **盟约分析**可查看干员关系图，按盟约、权重和当前持有情况排序。
- **策略编辑**可调整评分、记录相性羁绊、管理目标阵容和终局阵容方案。

## 推荐结果怎么理解

优推干员、推荐阵容和自动终局方案是基于盟约关系网的简化辅助计算。工具按当前卡池、盟约激活门槛、层数与自定义评分设置给出候选。分数反映这套模型下的表现，无法证明该阵容在实战中最优。抽卡经济、站位、装备、敌人和技能时机等因素需要玩家自行判断。

## 试用

网页版本可直接在浏览器使用。 [GitHub Pages 在线试用](https://starryspud.github.io/AKSP-Toolkit/)

配置保存在当前浏览器中。换电脑、浏览器或从本机版切换到在线版时，可以在页头 **导出配置**，再到目标环境 **导入配置**。导入会替换对应的本地设置。

试用反馈请附游戏版本、复现步骤、预期结果和实际结果。可以附脱敏后的配置文件。

## 本地开发

使用 Node.js 24。在项目根目录执行以下命令。

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

默认开发地址为 `http://127.0.0.1:5173/AKSP-Toolkit/`。在 `frontend/` 运行 `npm run test -- --run` 执行测试，运行 `npm run build` 生成静态站点。

- [二次开发与架构](frontend/docs/secondary-development.md)
- [Windows 打包与试用发布](frontend/docs/release.md)
- [原项目 README](frontend/docs/upstream-readme.md)

## 来源和授权

AKSP-Toolkit 基于 yeyeye613 的《明日方舟卫戍协议配队工具》，保留原 Git 历史。游戏数据来源包含 PRTS 明日方舟中文 Wiki。Windows 图标使用了游戏匹配界面的机器人素材图层。 [原项目](https://github.com/yeyeye613/Arknights-alliance-tool) · [PRTS 规程数据](https://prts.wiki/w/卫戍协议·规程/PRTS盟约记录) · [机器人图层来源](https://github.com/ArknightsAssets/ArknightsAssets2/tree/cn/assets/dyn/ui/autochess/%5Buc%5Dautochessouter/matching/auto_chess_matching)

原作者同意公开部署网页，并确认上游代码采用 MIT。PRTS 的原创资料沿用 CC BY-NC-SA 4.0，项目将其整理为配队工具使用的数据；游戏图片和原文等素材的权利归原权利人。 [原作者回复](https://github.com/yeyeye613/Arknights-alliance-tool/issues/1#issuecomment-7094747283) · [上游代码许可](LICENSE-UPSTREAM) · [第三方资料说明](frontend/public/NOTICE.txt)
