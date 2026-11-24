import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import Toolkit from "../AKSP-Toolkit/AKSP-Toolkit.vue";
import CovenantAnalysis from "../AKSP-Toolkit/CovenantAnalysis.vue";
import OperatorRanking from "../AKSP-Toolkit/OperatorRanking.vue";
import PoolPanel from "../components/PoolPanel.vue";
import { buildCovenantGraph } from "../AKSP-Toolkit/covenantGraph.js";
import { drawCovenantGraph } from "../AKSP-Toolkit/drawCovenantGraph.js";
import { COVENANT_TICKS_PER_POINT, rankOperators } from "../AKSP-Toolkit/covenantWeights.js";
import { buildLineupScoring, getLineupScoreTicks, sumActivatedCovenantScore } from "../AKSP-Toolkit/lineupScoring.js";
import { getStackableLineupCovenants } from "../AKSP-Toolkit/lineupStacking.js";
import { findBestLineups } from "../AKSP-Toolkit/endgameOptimizer.js";
import { changeHeldPieces, getCovenantProgressBonuses, getHeldActivatableCovenants, getHeldOperators, getHeldPurchaseEffects, normalizeInventory, recommendHeldLineup } from "../AKSP-Toolkit/operatorInventory.js";
import { useGameVersion } from "../composables/useGameVersion.js";
import { getHeldCovenantMembers, summarizeRecommendedCovenants } from "../composables/useCovenantStats.js";
import { getGameVersion, isOperatorBanned } from "../data/versions.js";

describe("AKSP-Toolkit 盟约分析", () => {
  it("招募 Ban 只筛选干员池，罗比菈塔和摆渡人在持有槽仍可激活坚守", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    localStorage.setItem("aksp_toolkit_operator_inventory", JSON.stringify({ guicheng: {
      pieces: { 罗比菈塔: { normal: 0, promoted: 1 }, 摆渡人: { normal: 2, promoted: 0 } },
    } }));
    const wrapper = mount(Toolkit);
    try {
      const active = () => wrapper.get(".held-panel .lineup-covenants").text();
      const visiblePool = () => wrapper.findAll(".toolkit-pool .op-unit .name-label").map((item) => item.text());
      expect(active()).toMatch(/2\s*坚守\s*Lv\.1/);
      await wrapper.get('[aria-label="Ban 坚守"]').trigger("click");
      expect(visiblePool()).toEqual(expect.arrayContaining(["罗比菈塔", "摆渡人"]));
      expect(active()).toMatch(/2\s*坚守\s*Lv\.1/);
      await wrapper.get('[aria-label="Ban 助力"]').trigger("click");
      await wrapper.get('[aria-label="Ban 不屈"]').trigger("click");
      expect(visiblePool()).not.toContain("罗比菈塔");
      expect(visiblePool()).not.toContain("摆渡人");
      expect(wrapper.get("#held-lineup-title").text()).toContain("3/8");
      expect(active()).toMatch(/2\s*坚守\s*Lv\.1/);
    } finally {
      wrapper.unmount();
      localStorage.clear();
    }
  });

  it("优先叠层为优推和推荐阵容棋子各应用一次倍率，并允许编辑阶位基础分", () => {
    const version = {
      covenants: { 炎: { group: "core", activateCount: 2 } },
      operators: {
        A: { tier: "Ⅳ", covenants: ["炎"], traits: [{ type: "持续叠加" }, { type: "持续叠加" }] },
        B: { tier: "Ⅳ", covenants: ["炎"], traits: [{ type: "单次叠加" }] },
      },
    };
    const names = ["A", "B"];
    const graph = buildCovenantGraph(version, names.map((name) => ({ name })), []);
    const setup = { weights: {}, layers: {}, targets: new Set(), stackingEnabled: true, stackingCoefficient: 1.23,
      tierBasePoints: [0.5, 0.8, 1.1, 1.4, 1.7, 2], defaultPromoted: true };
    expect(rankOperators(graph, null).map(({ score }) => score)).toEqual([1, 1]);
    expect(rankOperators(graph, null, 1, { stackingEnabled: true }).map(({ score }) => score)).toEqual([1.5, 1]);
    expect(rankOperators(graph, null, 1, setup).map(({ score }) => score)).toEqual([1.23, 1]);
    const [plan] = findBestLineups(buildLineupScoring(version, names, setup), 2, 1);
    expect(plan.score / COVENANT_TICKS_PER_POINT).toBe(8.244);
    expect(plan.score).toBe(getLineupScoreTicks(summarizeRecommendedCovenants(names, version), plan.pieces, version, setup));
    const edited = { ...setup, tierBasePoints: [0.5, 0.8, 1.1, 0.75, 1.7, 2], stackingEnabled: false };
    expect(getLineupScoreTicks(summarizeRecommendedCovenants(names, version), plan.pieces, version, edited)
      / COVENANT_TICKS_PER_POINT).toBe(5);
  });

  it("只为上场干员能叠层的已激活盟约加乘，附加盟约基准分可以为零", () => {
    const version = {
      covenants: { 炎: { group: "core", activateCount: 2 }, 助力: { group: "additional", activateCount: 2 },
        坚守: { group: "additional", activateCount: 2 } },
      operators: {
        A: { tier: "Ⅰ", covenants: ["炎", "助力", "坚守"], traits: [{ type: "持续叠加",
          description: "场上每有一名【坚守】干员，使已激活的【炎】【助力】层数+1" }] },
        B: { tier: "Ⅰ", covenants: ["炎", "助力", "坚守"] },
      },
    };
    const pieces = [{ name: "A" }, { name: "B" }];
    const active = summarizeRecommendedCovenants(pieces, version);
    const stackableCovenants = getStackableLineupCovenants(version, pieces, active.activeNames, {});
    expect(stackableCovenants).toEqual(new Set(["炎", "助力"]));
    expect(getStackableLineupCovenants(version, pieces, ["炎"], {})).toEqual(new Set(["炎"]));
    expect(getStackableLineupCovenants(version, [pieces[1]], active.activeNames, {})).toEqual(new Set());
    const graph = buildCovenantGraph(version, pieces, []);
    const weights = { 助力: 0, 坚守: 0.5 };
    const options = { stackingEnabled: true, stackingCoefficient: 1, stackableCovenants };
    expect(rankOperators(graph, weights, 1, options).map(({ score }) => score)).toEqual([2.9, 2.9]);
    expect(rankOperators(graph, weights, 1, { ...options, stackableCovenantCoefficient: 1.5 })
      .map(({ score }) => score)).toEqual([3.5, 3.5]);
    expect(rankOperators(graph, weights, 1, { ...options, stackingEnabled: false })
      .map(({ score }) => score)).toEqual([2.5, 2.5]);
  });

  it("额外核心和附加盟约赋给已上场干员，更新激活等级并保留显示人数", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    const names = ["余", "拜松", "星极"];
    localStorage.setItem("aksp_toolkit_operator_inventory", JSON.stringify({ guicheng: {
      pieces: Object.fromEntries(names.map((name) => [name, { normal: 1, promoted: 0 }])),
      targetLineup: names.map((name) => ({ name, promoted: false })),
    } }));
    const wrapper = mount(Toolkit);
    const button = (label) => wrapper.findAll("button").find((item) => item.text() === label);
    const active = () => wrapper.get(".held-panel .lineup-covenants").text();
    const score = () => Number(wrapper.get(".held-panel .lineup-network-score strong").text());
    try {
      expect(active()).toContain("暂无激活");
      const before = score();
      await button("额外核心盟约").trigger("click");
      await wrapper.get('[aria-label="炎额外棋子数"]').setValue("1");
      expect(active()).toMatch(/2\s*炎\s*Lv\.1/);
      expect(score()).toBeCloseTo(before + 2);
      await button("额外附加盟约").trigger("click");
      await wrapper.get('[aria-label="坚守额外棋子数"]').setValue("1");
      expect(active()).toMatch(/1\s*坚守\s*Lv\.1/);
      expect(score()).toBeCloseTo(before + 3);
      expect(wrapper.get("#held-lineup-title").text()).toContain("3/8");
      await button("潜在可激活盟约").trigger("click");
      expect(wrapper.findAll(".target-covenant-toggle:not(.inactive)").map((item) => item.text()))
        .toEqual(expect.arrayContaining(["炎", "坚守"]));
      await button("切换为目标阵容").trigger("click");
      expect(score()).toBeCloseTo(before + 3);
      expect(active()).toMatch(/2\s*炎\s*Lv\.1/);
      expect(active()).toMatch(/1\s*坚守\s*Lv\.1/);
      await wrapper.get('[aria-label="移除目标干员 星极"]').trigger("click");
      expect(active()).not.toContain("炎");
      expect(active()).toContain("坚守");
      await button("撤销").trigger("click");
      await wrapper.get('[aria-label="Ban 坚守"]').trigger("click");
      expect(active()).toMatch(/1\s*坚守\s*Lv\.1/);
      expect(score()).toBeCloseTo(before + 3);
    } finally {
      wrapper.unmount();
      localStorage.clear();
    }
  });

  it("定向搜索只将所选终局方案的已激活盟约计为双倍，关闭后恢复排序分", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    localStorage.setItem("aksp_toolkit_operator_inventory", JSON.stringify({ guicheng: {
      endgamePlans: [{ id: "flame", name: "炎队", limit: 8, pieces: ["余", "拜松", "矩"].map((name) => ({ name, promoted: true })) }],
    } }));
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const wrapper = mount(Toolkit);
    const button = (label) => wrapper.findAll("button").find((item) => item.text() === label);
    const score = (name) => Number.parseFloat(wrapper.findAll(".ranking-list button")
      .find((item) => item.get(".rank-name").text() === name).get(".weight-score").text());
    try {
      await button("盟约分析").trigger("click");
      await button("考虑持有").trigger("click");
      await button("定向搜索").trigger("click");
      expect(wrapper.get(".directed-search-note").exists()).toBe(true);
      const baseFlame = score("拜松");
      const baseOther = score("星极");
      await button("策略编辑").trigger("click");
      await wrapper.get(".strategy-lineup .apply-endgame").trigger("click");
      await button("盟约分析").trigger("click");
      expect(wrapper.find(".directed-search-note").exists()).toBe(false);
      expect(score("拜松")).toBe(baseFlame * 2);
      expect(score("星极")).toBe(baseOther);
      await button("启用权重").trigger("click");
      expect(score("拜松")).toBe(baseFlame);
      await button("启用权重").trigger("click");
      await button("定向搜索").trigger("click");
      expect(score("拜松")).toBe(baseFlame);
    } finally {
      wrapper.unmount();
      context.mockRestore();
      localStorage.clear();
    }
  });

  it("远见和奇迹合并场上与持有槽名单，终局搜索也只计一次同名干员", () => {
    const version = getGameVersion("guicheng");
    const heldMembers = getHeldCovenantMembers(["渡桥", "渡桥", "星极", "吉星", "凯瑟琳"], version);
    const summarize = (names) => summarizeRecommendedCovenants(names, version, {}, heldMembers);
    expect(summarize([]).counts).toEqual({ 远见: 2, 奇迹: 2 });
    expect(summarize(["渡桥", "星极"]).counts).toEqual({ 远见: 2, 奇迹: 2 });
    expect(summarize(["寒檀"]).counts).toEqual({ 远见: 3, 奇迹: 2 });
    const options = { weights: {}, layers: {}, targets: new Set(), heldMembers };
    const scoring = buildLineupScoring(version, ["渡桥", "星极", "寒檀"], options);
    const [plan] = findBestLineups(scoring, 1, 1);
    expect(plan.score).toBe(getLineupScoreTicks(summarize(plan.names), plan.pieces, version, options));

    const oneHeld = getHeldCovenantMembers(["渡桥"], version);
    const missingMember = buildLineupScoring(version, ["渡桥", "寒檀"], { ...options, heldMembers: oneHeld });
    expect(findBestLineups(missingMember, 1, 2).map(({ names, score }) => [names[0], score / COVENANT_TICKS_PER_POINT])).toEqual([
      ["寒檀", 2.4], ["渡桥", 0.8],
    ]);
    const withGrant = { ...options, heldMembers: oneHeld, extras: { 远见: 1 } };
    const byRecipient = buildLineupScoring(version, ["渡桥", "星极"], withGrant);
    expect(findBestLineups(byRecipient, 1, 2).map(({ names, score }) => [names[0], score / COVENANT_TICKS_PER_POINT])).toEqual([
      ["星极", 1.8], ["渡桥", 0.8],
    ]);
    expect(summarizeRecommendedCovenants(["星极"], version, withGrant.extras, oneHeld)).toMatchObject({
      counts: { 远见: 1 }, activationCounts: { 远见: 2 }, activeNames: ["远见"],
    });
  });

  it("待部署区能激活远见、奇迹和投资人，卖出后阵容总分立即更新", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    localStorage.setItem("aksp_toolkit_operator_inventory", JSON.stringify({ guicheng: {
      pieces: {
        ...Object.fromEntries(["渡桥", "寒檀", "星极", "吉星", "锡人", "山", "老鲤"]
          .map((name) => [name, { normal: 1, promoted: 0 }])),
        锡人: { normal: 2, promoted: 0 },
        夕: { normal: 0, promoted: 1 },
      },
      lineupSize: 1,
    } }));
    const wrapper = mount(Toolkit);
    try {
      const panel = wrapper.get(".held-panel");
      expect(panel.get("#held-lineup-title").text()).toContain("1/1");
      expect(panel.findAll(".waiting-piece")).toHaveLength(7);
      const deployed = panel.get(".lineup-pieces strong").text();
      expect(panel.findAll(".waiting-piece strong").map((item) => item.text())).not.toContain(deployed);
      expect(panel.get(".lineup-covenants").text()).toContain("远见");
      expect(panel.get(".lineup-covenants").text()).toContain("奇迹");
      expect(panel.findAll(".waiting-piece strong").map((item) => item.text()))
        .toEqual(expect.arrayContaining(["锡人", "山", "老鲤"]));
      expect(panel.get(".lineup-covenants").text()).toMatch(/3\s*投资人\s*Lv\.1/);
      await panel.findAll("button").find((button) => button.text() === "切换为目标阵容").trigger("click");
      expect(panel.get("#held-lineup-title").text()).toContain("0/8");
      expect(panel.get(".lineup-network-score strong").text()).toBe("3.0");
      await panel.get('[aria-label="出售 寒檀"]').trigger("click");
      expect(panel.get(".lineup-network-score strong").text()).toBe("2.0");
      expect(panel.get(".lineup-covenants").text()).toContain("奇迹");
      expect(panel.get(".lineup-covenants").text()).not.toContain("远见");
      await panel.get('[aria-label="出售 山"]').trigger("click");
      expect(panel.get(".lineup-covenants").text()).not.toContain("投资人");
      expect(panel.get(".lineup-network-score strong").text()).toBe("1.0");
    } finally {
      wrapper.unmount();
      localStorage.clear();
    }
  });

  it("终局搜索能从两个版本的真实干员池给出 7、8、9 人满编阵容", () => {
    for (const id of ["mengyue", "guicheng"]) {
      const version = getGameVersion(id);
      const candidates = Object.keys(version.operators).map((name) => ({ name }));
      const setup = { weights: {}, layers: {}, targets: new Set() };
      const scoring = buildLineupScoring(version, candidates, setup);
      const plans = [7, 8, 9].flatMap((size) => findBestLineups(scoring, size, 1));
      expect(plans.map(({ names }) => names.length)).toEqual([7, 8, 9]);
      for (const { names, pieces, score } of plans) {
        expect(getLineupScoreTicks(summarizeRecommendedCovenants(names, version), pieces, version, setup)).toBe(score);
      }
    }
  });

  it("整队盟约达到一级才计分，二级再计一次，终局额外人数可补足门槛", () => {
    const game = getGameVersion("guicheng");
    const version = { ...game, covenants: { 炎: game.covenants.炎, 坚守: game.covenants.坚守 } };
    const team = ["余", "拜松", "余", "星极", "吉星", "寒檀", "伊桑"];
    const setup = { weights: { 炎: 1.5 }, layers: { 炎: 20 }, targets: new Set(["炎"]) };
    const score = (extras, names = team) => sumActivatedCovenantScore(
      summarizeRecommendedCovenants(names, version, extras), version, setup) / COVENANT_TICKS_PER_POINT;
    expect(score()).toBe(0);
    expect(score({ 炎: 1 })).toBe(8);
    expect(score({ 炎: 3 })).toBe(8);
    expect(score({ 炎: 4 })).toBe(20);
    expect(score({ 炎: 4, 坚守: 2 })).toBe(22);
    expect(score({ 炎: 4 }, ["余", "拜松", "余"])).toBe(0);
    expect(score({ 炎: 4 }, [])).toBe(0);
  });

  it("分支限界的前两套方案与逐个枚举相符，含调和、额外盟约和并列方案", () => {
    const version = {
      operators: Object.fromEntries([
        ["A", ["炎", "坚守"]], ["B", ["炎", "坚守"]], ["C", ["炎", "调和"]], ["D", ["炎", "助力"]],
        ["E", ["阿戈尔", "坚守"]], ["F", ["阿戈尔", "助力"]], ["G", ["阿戈尔", "调和"]], ["H", []],
      ].map(([name, covenants]) => [name, { covenants }])),
      covenants: {
        炎: { group: "core", activateCount: 3, effects: [{ condition: "在场5名不同的【炎】干员" }] },
        阿戈尔: { group: "core", activateCount: 3 }, 坚守: { group: "additional", activateCount: 2 },
        助力: { group: "additional", activateCount: 2 }, 调和: { group: "additional", activateCount: 1 },
      },
    };
    for (const extras of [{}, { 炎: 1, 助力: 1 }, { 调和: 1, 阿戈尔: 1 }]) {
      const setup = { weights: { 炎: 1.2 }, layers: { 助力: 7 }, targets: new Set(["坚守"]), extras };
      for (const bans of [new Set(), new Set(["炎", "调和", "坚守"])]) {
        const candidates = Object.keys(version.operators).filter((name) =>
          !isOperatorBanned(version.operators[name].covenants, bans, version));
        const scoring = buildLineupScoring(version, candidates, setup);
        const score = (names) => sumActivatedCovenantScore(summarizeRecommendedCovenants(names, version, extras), version, setup);
        for (const size of [3, 4, 5]) {
          const exhaustive = Array.from({ length: 2 ** candidates.length }, (_, mask) => candidates
            .filter((_, index) => mask & (1 << index))).filter((names) => names.length === size)
            .map(score).sort((a, b) => b - a);
          const best = findBestLineups(scoring, size, 2);
          expect(best.map((plan) => plan.score)).toEqual(exhaustive.slice(0, 2));
          expect(best.map((plan) => score(plan.names))).toEqual(exhaustive.slice(0, 2));
          if (best.length > 1) expect(new Set(best[0].names)).not.toEqual(new Set(best[1].names));
        }
      }
    }
  });

  it("相性羁绊显示头像，目标阵容计入阶位分且可保存为晋升方案", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    localStorage.setItem("aksp_toolkit_operator_inventory", JSON.stringify({ guicheng: {
      lineupView: "target", targetLineupSize: 9, targetLineup: [{ name: "余", promoted: false }, { name: "拜松", promoted: true }],
    } }));
    const wrapper = mount(Toolkit);
    const button = (label) => wrapper.findAll("button").find((item) => item.text() === label);
    const networkScore = () => Number(wrapper.get(".held-panel .lineup-network-score strong").text());
    try {
      expect(networkScore()).toBe(2.4);
      await button("策略编辑").trigger("click");
      expect(wrapper.findAll(".strategy-page nav button").map((item) => item.text()))
        .toEqual(["终局阵容方案", "相性羁绊", "评分设置", "盟约分类"]);
      expect(wrapper.findAll(".auto-endgame h3").map((heading) => heading.attributes("id")))
        .toEqual(["automatic-7", "automatic-8", "automatic-9"]);
      await button("相性羁绊").trigger("click");
      const slots = wrapper.findAll(".affinity-slot");
      for (const [index, name] of [[0, "余"], [1, "拜松"]]) {
        const slot = slots[index];
        await slot.get(".picker-toggle").trigger("click");
        if (index === 1) {
          await slot.get("label:nth-child(2) select").setValue("无附加盟约");
          expect(slot.findAll(".operator-options button").map((item) => item.text())).not.toContain("余");
        }
        const candidate = slot.findAll(".operator-options button").find((item) => item.text() === name);
        expect(candidate.get("img").attributes("src")).toContain(encodeURIComponent(name));
        await candidate.trigger("click");
        await slot.get("form").trigger("submit");
        expect(slot.get(".affinity-operator").text()).toBe(name);
      }
      await button("添加羁绊").trigger("click");
      expect(wrapper.findAll(".affinity-list img")).toHaveLength(2);
      expect(networkScore()).toBe(2.4);
      await button("保存为终局方案").trigger("click");
      const saved = JSON.parse(localStorage.getItem("aksp_toolkit_operator_inventory")).guicheng;
      expect(saved.targetLineup[0].promoted).toBe(false);
      expect(saved.endgamePlans.at(-1)).toMatchObject({ limit: 9, pieces: [
        { name: "余", promoted: true }, { name: "拜松", promoted: true },
      ] });
    } finally {
      wrapper.unmount();
      localStorage.clear();
    }
  });

  it("持有棋子合成与出售后，推荐按加权分数和晋升倍率挑选实际棋子", () => {
    const version = {
      covenants: { 炎: { group: "core", activateCount: 2 }, 坚守: { group: "additional", activateCount: 2 } },
      operators: {
        A: { covenants: ["炎"], tier: "Ⅲ" },
        B: { covenants: ["炎", "坚守"], tier: "Ⅰ" },
        C: { covenants: ["坚守"], tier: "Ⅱ" },
      },
    };
    let pieces = {};
    for (const name of ["A", "A", "A", "A", "B", "B", "C"]) pieces = changeHeldPieces(pieces, name, "buy");
    expect(pieces.A).toEqual({ normal: 1, promoted: 1 });
    const recommendation = () => recommendHeldLineup(version, getHeldOperators(pieces), 4,
      { weights: { 炎: 1.5, 坚守: 2 }, layers: {}, targets: new Set() });
    expect(recommendation().pieces).toEqual(expect.arrayContaining([
      { name: "B", promoted: false }, { name: "A", promoted: true }, { name: "A", promoted: false }, { name: "C", promoted: false },
    ]));
    expect(recommendation().score / COVENANT_TICKS_PER_POINT).toBe(8.6);
    pieces = changeHeldPieces(pieces, "A", "buy");
    pieces = changeHeldPieces(pieces, "A", "sell-promoted");
    expect(pieces.A).toEqual({ normal: 2, promoted: 0 });
    pieces = changeHeldPieces(pieces, "A", "sell-normal");
    expect(pieces.A).toEqual({ normal: 1, promoted: 0 });
    expect(normalizeInventory({ pieces: { A: { normal: 4, promoted: 0 } } }).pieces.A)
      .toEqual({ normal: 1, promoted: 1 });
  });

  it("星极天然享受成对倍率，买入即晋升时改用晋升倍率，旧存档也会合成", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    const version = getGameVersion("guicheng");
    const old = { pieces: { 星极: { normal: 2, promoted: 1 } } };
    expect(normalizeInventory(old, version).pieces.星极).toEqual({ normal: 0, promoted: 2 });
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const wrapper = mount(Toolkit);
    try {
      await wrapper.findAll("nav button").find((button) => button.text() === "盟约分析").trigger("click");
      const operator = () => wrapper.findAll(".ranking-list button")
        .find((button) => button.get(".rank-name").text() === "星极");
      expect(operator().get(".rank-pair").text()).toBe("成对 ×1.2");
      const consider = wrapper.findAll("button").find((button) => button.text() === "考虑持有");
      await consider.trigger("click");
      expect(operator().find(".rank-pair").exists()).toBe(false);
      await consider.trigger("click");
      await operator().trigger("click");
      expect(operator().find(".rank-pair").exists()).toBe(false);
      expect(operator().get(".rank-promotion").text()).toBe("买入晋升 ×1.5");
      await operator().trigger("click");
      expect(wrapper.find('[aria-label="出售 星极"]').exists()).toBe(false);
      expect(wrapper.get('[aria-label="出售晋升棋子 星极"]').element.parentElement.textContent).toContain("晋升 ×1");
      expect(wrapper.get("#held-lineup-title").text()).toContain("1/8");
      expect(operator().get(".rank-pair").text()).toBe("成对 ×1.2");
      await operator().trigger("click");
      await wrapper.get('[aria-label="出售晋升棋子 星极"]').trigger("click");
      expect(wrapper.get('[aria-label="出售 星极"]').element.parentElement.textContent).toContain("普通 ×1");
    } finally {
      wrapper.unmount();
      canvas.mockRestore();
      localStorage.clear();
    }
  });

  it("持有槽最佳组合与逐枚穷举一致，重复上场只计一次盟约人数", () => {
    const version = {
      covenants: {
        炎: { group: "core", activateCount: 2, effects: [{ condition: "在场3名不同的【炎】干员" }] },
        坚守: { group: "additional", activateCount: 2 },
      },
      operators: {
        A: { covenants: ["炎"], tier: "Ⅲ" }, B: { covenants: ["炎", "坚守"], tier: "Ⅰ" },
        C: { covenants: ["坚守"], tier: "Ⅵ" }, D: { covenants: ["炎"], tier: "Ⅱ" },
      },
    };
    const pieces = [
      { name: "A", promoted: true }, { name: "A", promoted: false }, { name: "B", promoted: false },
      { name: "C", promoted: true }, { name: "C", promoted: true }, { name: "D", promoted: false },
    ];
    const held = getHeldOperators({
      A: { normal: 1, promoted: 1 }, B: { normal: 1, promoted: 0 },
      C: { normal: 0, promoted: 2 }, D: { normal: 1, promoted: 0 },
    });
    for (const layers of [{}, { 炎: 30 }, { 坚守: 50 }]) {
      const options = { weights: { 炎: 1.3 }, layers, targets: new Set(["炎"]) };
      const score = (lineup) => getLineupScoreTicks(summarizeRecommendedCovenants(lineup, version), lineup, version, options);
      for (const size of [1, 2, 3, 4, 5, 6]) {
        const combinations = Array.from({ length: 2 ** pieces.length }, (_, mask) => pieces
          .filter((_, index) => mask & (1 << index))).filter((lineup) => lineup.length === size);
        const plan = recommendHeldLineup(version, held, size, options);
        expect(plan.pieces).toHaveLength(size);
        expect(plan.score).toBe(score(plan.pieces));
        expect(plan.score).toBe(Math.max(...combinations.map(score)));
      }
    }
  });

  it("持有槽沿用盟约激活阈值，推荐阵容线性乘算层数与基础权重", () => {
    const version = {
      covenants: {
        炎: { group: "core", activateCount: 2 },
        坚守: { group: "additional", activateCount: 2 },
      },
      operators: {
        A: { covenants: ["炎"] },
        B: { covenants: ["炎", "坚守"] },
        C: { covenants: ["坚守"] },
      },
    };
    const held = getHeldOperators({
      A: { normal: 1, promoted: 1 }, B: { normal: 1, promoted: 0 }, C: { normal: 1, promoted: 0 },
    });
    expect(getHeldActivatableCovenants(version, held.slice(0, 1), {}))
      .toEqual([{ name: "炎", active: false, layers: 0 }]);
    expect(getHeldActivatableCovenants(version, held, { 炎: 10 })).toEqual([
      { name: "炎", active: true, layers: 10 }, { name: "坚守", active: true, layers: 0 },
    ]);
    const recommend = (layers) => recommendHeldLineup(version, held, 2,
      { weights: { 炎: 1.6, 坚守: 2 }, layers: { 炎: layers }, targets: new Set() });
    expect(recommend(0).score).toBe(2 * COVENANT_TICKS_PER_POINT);
    expect(recommend(10)).toMatchObject({ names: ["B", "A"], score: 3 * COVENANT_TICKS_PER_POINT });
    expect(recommend(20)).toMatchObject({ names: ["B", "A"], score: 4 * COVENANT_TICKS_PER_POINT });
  });

  it("考虑持有对达到人数节点给大加成，同名棋子不贡献进度", () => {
    const version = {
      covenants: {
        炎: { group: "core", activateCount: 2 },
        坚守: { group: "additional", activateCount: 2 },
      },
      operators: {
        A: { covenants: ["炎", "坚守"] },
        B: { covenants: ["炎", "坚守"] },
        C: { covenants: ["炎"] },
      },
    };
    const graph = buildCovenantGraph(version, Object.keys(version.operators).map((name) => ({ name })), []);
    const held = [{ name: "A", normal: 1, promoted: 1 }];
    const bonus = getCovenantProgressBonuses(version, graph.nodes, held);
    expect(bonus.has("A")).toBe(false);
    expect(bonus.get("B")).toEqual({ progress: [], milestones: ["炎", "坚守"] });
    expect(getCovenantProgressBonuses(version, graph.nodes, [...held, { name: "C" }]).get("B").milestones).toEqual(["坚守"]);
    expect(rankOperators(graph, null, 1, { purchaseEffects: bonus }).find(({ node }) => node.name === "B").score).toBe(6);
    expect(rankOperators(graph, { 炎: 1.5, 坚守: 2 }, 1, { purchaseEffects: bonus }).find(({ node }) => node.name === "B").score).toBe(14);
    const layeredScore = rankOperators(graph, { 炎: 1.5, 坚守: 2 }, 1, {
      purchaseEffects: bonus, covenantLayers: { 炎: 20 },
    }).find(({ node }) => node.name === "B").score;
    expect(layeredScore).toBe(22);
    const ranked = rankOperators(graph, { 炎: 1.5 }, 1, {
      pairNames: new Set(["A", "B"]), pairCoefficient: 1.6, promotionNames: new Set(["B"]),
    });
    expect(ranked.find(({ node }) => node.name === "A")).toMatchObject({ score: 8, formsPair: true });
    expect(ranked.find(({ node }) => node.name === "B")).toMatchObject({ score: 7.5, formsPair: false, triggersPromotion: true });
  });

  it("考虑持有按人数节点加分，阵容发生实际变化时改乘一次所设倍率", () => {
    const version = {
      covenants: {
        炎: { group: "core", activateCount: 2 },
        坚守: { group: "additional", activateCount: 2 },
      },
      operators: {
        A: { covenants: ["炎", "坚守"] },
        B: { covenants: ["炎", "坚守"] },
        C: { covenants: ["炎"] },
      },
    };
    const weights = { 炎: 1.5, 坚守: 2 };
    const graph = buildCovenantGraph(version, ["A", "B", "C"].map((name) => ({ name })), []);
    const pieces = { A: { normal: 1, promoted: 1 }, C: { normal: 1, promoted: 0 } };
    function effects(limit, inventory = pieces) {
      const recommend = (held) => recommendHeldLineup(version, held, limit, { weights, layers: {}, targets: new Set() });
      const held = getHeldOperators(inventory);
      return getHeldPurchaseEffects(version, graph.nodes, inventory, held, recommend(held), recommend);
    }
    const singleSlot = effects(1);
    expect(singleSlot.get("A")).toEqual({ changesLineup: false });
    expect(singleSlot.get("B")).toEqual({
      progress: [],
      milestones: ["坚守"],
      changesLineup: false,
    });
    const scoreB = (purchaseEffects, rankingWeights, options = {}) =>
      rankOperators(graph, rankingWeights, 1, { purchaseEffects, ...options }).find(({ node }) => node.name === "B");
    expect(scoreB(singleSlot, weights)).toMatchObject({ score: 10, changesLineup: false });
    expect(scoreB(singleSlot, null).score).toBe(4);
    expect(scoreB(singleSlot, null, { covenantLayers: { 坚守: 20 } }).score).toBe(7);

    const threeSlots = effects(3);
    expect(scoreB(threeSlots, weights)).toMatchObject({ score: 12, changesLineup: true });
    expect(scoreB(threeSlots, null).score).toBe(4);
    expect(scoreB(threeSlots, null, { covenantLayers: { 坚守: 20 } }).score).toBe(6);
    expect(scoreB(threeSlots, weights, { heldLineupChangeCoefficient: 1.25 }).score).toBe(7.5);
    expect(scoreB(singleSlot, weights, { heldLineupChangeCoefficient: 1.25 }).score).toBe(10);
    expect(effects(1, { A: { normal: 2, promoted: 0 } }).get("A").changesLineup).toBe(true);
    expect(effects(2, {}).get("B").changesLineup).toBe(true);
  });

  it("核心盟约滑杆不改变一级连线分，优推达到二级节点时使用进阶倍率", () => {
    const version = {
      operators: { A: { covenants: ["炎"] }, B: { covenants: ["炎"] } },
      covenants: { 炎: { group: "core", activateCount: 1, effects: [{ condition: "在场2名不同的【炎】干员" }] } },
    };
    const graph = buildCovenantGraph(version, [{ name: "A" }, { name: "B" }], []);
    const score = (weights, purchaseEffects) => rankOperators(graph, weights, 1, { purchaseEffects })
      .find(({ node }) => node.name === "B").score;
    const bonuses = getCovenantProgressBonuses(version, graph.nodes, [{ name: "A" }]);
    expect(score({ 炎: 1 })).toBe(2);
    expect(score({ 炎: 3 })).toBe(2);
    expect(score({ 炎: 2.5 }, bonuses)).toBe(12);
    expect(score(null, bonuses)).toBe(3);
  });

  it("核心盟约达到二级时计入额外倍率，晋升只翻倍阶位分", () => {
    const operators = Object.fromEntries("ABCDEFGH".split("").map((name) => [name, { covenants: ["炎"] }]));
    const version = {
      covenants: { 炎: { group: "core", activateCount: 3, effects: [{ condition: "在场6名不同的【炎】干员" }] } },
      operators,
    };
    const names = Object.keys(operators).map((name) => ({ name }));
    const progression = names.map((candidate, index) => {
      const { progress, milestones } = getCovenantProgressBonuses(version, [candidate], names.slice(0, index)).get(candidate.name);
      return progress.length + milestones.length * 2;
    });
    expect(progression).toEqual([1, 1, 2, 1, 1, 2, 0, 0]);
    for (const operator of Object.values(operators)) operator.tier = "Ⅵ";
    const held = getHeldOperators(Object.fromEntries("ABCDEF".split("").map((name) => [name,
      { normal: name === "A" ? 0 : 1, promoted: name === "A" ? 1 : 0 }])));
    const recommend = (limit, targets = []) => recommendHeldLineup(version, held, limit,
      { weights: { 炎: 1.6 }, layers: { 炎: 10 }, targets: new Set(targets) }).score / COVENANT_TICKS_PER_POINT;
    expect(recommend(1)).toBe(4);
    expect(recommend(3)).toBe(11);
    expect(recommend(6)).toBe(21.8);
    expect(recommend(6, ["炎"])).toBe(29.6);
  });

  it("优推把当前显示分差等分，边界进入较高分段，同分时显示中性提示", async () => {
    const nodes = [2, 4, 6, 8, 10].map((score) => ({ name: String(score), tier: score < 8 ? "Ⅰ" : "Ⅱ" }));
    const neighbors = new Map(nodes.map((node) => [node, { size: Number(node.name) }]));
    const wrapper = mount(OperatorRanking, { props: { graph: { nodes, edges: [], neighbors }, selectedName: "" } });
    try {
      const labels = () => wrapper.findAll(".ranking-scale li")
        .map((item) => [item.get("strong").text(), item.get("span").text()].join(" "));
      expect(labels())
        .toEqual(["T1 8–10", "T2 6–8", "T3 4–6", "T4 2–4"]);
      const rowBands = () => wrapper.findAll(".ranking-list button").map((item) => item.attributes("data-score-band"));
      expect(rowBands()).toEqual(["T1", "T1", "T2", "T3", "T4"]);
      await wrapper.setProps({ tiers: ["Ⅰ"] });
      expect(labels())
        .toEqual(["T1 5–6", "T2 4–5", "T3 3–4", "T4 2–3"]);
      await wrapper.setProps({ graph: { nodes: nodes.slice(0, 1), edges: [], neighbors } });
      expect(wrapper.text()).toContain("当前干员同分");
      expect(rowBands()).toEqual(["equal"]);
    } finally {
      wrapper.unmount();
    }
  });

  it("分析页购买持有棋子可折叠、调整推荐上限并按版本恢复", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    vi.useFakeTimers();
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    let wrapper = mount(Toolkit);
    const button = (label) => wrapper.findAll("button").find((item) => item.text() === label);
    const openRanking = async () => {
      await button("盟约分析").trigger("click");
      expect(wrapper.get('[aria-label="收起优推干员"]').attributes("aria-expanded")).toBe("true");
    };
    const yu = () => wrapper.findAll(".ranking-list button").find((item) => item.get(".rank-name").text() === "余");
    const pointerClick = (detail) => {
      const event = new MouseEvent("click", { detail, bubbles: true });
      event._vts = Date.now() + 1;
      yu().element.dispatchEvent(event);
    };
    try {
      await openRanking();
      pointerClick(1);
      pointerClick(2);
      await yu().trigger("dblclick");
      await vi.advanceTimersByTimeAsync(500);
      expect(wrapper.find('[aria-label="出售 余"]').exists()).toBe(false);
      expect(yu().find(".rank-terminal").exists()).toBe(true);
      expect(button("考虑持有").attributes("aria-pressed")).toBe("true");
      for (let i = 0; i < 3; i++) {
        pointerClick(1);
        await vi.advanceTimersByTimeAsync(500);
        expect(yu().find(".rank-pair").exists()).toBe(i === 0);
        expect(yu().find(".rank-promotion").exists()).toBe(i === 1);
        if (i === 0) expect(yu().get(".rank-pair").text()).toBe("成对 ×1.2");
        if (i === 1) expect(yu().get(".rank-promotion").text()).toBe("买入晋升 ×1.5");
      }
      expect(wrapper.get('[aria-label="出售晋升棋子 余"]').element.parentElement.textContent).toContain("晋升 ×1");
      expect(wrapper.get("#held-lineup-title").text()).toContain("1/8");
      await wrapper.get(".lineup-header input").setValue(9);
      await wrapper.get('[aria-label="收起当前持有干员"]').trigger("click");
      expect(wrapper.get("#held-panel-content").isVisible()).toBe(false);
      wrapper.unmount();
      const key = "aksp_toolkit_operator_inventory";
      const legacy = JSON.parse(localStorage.getItem(key));
      legacy.guicheng.pieces.余 = { normal: 5, shiny: 0 };
      localStorage.setItem(key, JSON.stringify(legacy));
      wrapper = mount(Toolkit);
      await openRanking();
      expect(button("考虑持有").attributes("aria-pressed")).toBe("true");
      expect(wrapper.get("#held-lineup-title").text()).toContain("3/9");
      await wrapper.get('[aria-label="展开当前持有干员"]').trigger("click");
      await wrapper.get('[aria-label="出售晋升棋子 余"]').trigger("click");
      expect(wrapper.get('[aria-label="出售 余"]').element.parentElement.textContent).toContain("普通 ×2");
      expect(wrapper.get("#held-lineup-title").text()).toContain("2/9");
      await wrapper.findAll(".version-btn").find((item) => item.text().includes("卫戍协议：盟约")).trigger("click");
      expect(wrapper.find('[aria-label="出售 余"]').exists()).toBe(false);
      expect(wrapper.get("#held-lineup-title").text()).toContain("0/8");
      await button("额外核心盟约").trigger("click");
      expect(wrapper.findAll('[aria-label$="额外棋子数"]')).toHaveLength(8);
    } finally {
      wrapper.unmount();
      context.mockRestore();
      vi.useRealTimers();
    }
  });

  it("每个共享盟约各有一条边，规程核心盟约被 Ban 时移除所属干员", () => {
    const guicheng = getGameVersion("guicheng");
    const both = "双盟约测试干员";
    const version = {
      ...guicheng,
      operators: { ...guicheng.operators, [both]: { covenants: ["炎", "坚守"] } },
    };
    const names = Object.keys(version.operators);
    const operators = names.map((name) => ({ name }));
    const graph = buildCovenantGraph(version, operators, []);
    const edges = graph.edges.filter(({ source, target }) =>
      [source.name, target.name].includes("余") && [source.name, target.name].includes(both),
    );
    expect(edges.map(({ covenant }) => covenant).sort()).toEqual(["坚守", "炎"]);
    expect(new Set(edges.map(({ offset }) => offset)).size).toBe(2);
    const additionalBanned = buildCovenantGraph(version, operators, ["坚守"]);
    expect(additionalBanned.nodes.find(({ name }) => name === "余")?.covenants).toEqual(["炎", "坚守"]);
    const coreBanned = buildCovenantGraph(version, operators, ["炎"]);
    expect(coreBanned.nodes.some(({ name }) => name === "余")).toBe(false);
    expect(coreBanned.edges.some(({ covenant }) => covenant === "炎")).toBe(false);
  });

  it("独行、绝技、调和保留盟约归属但不产生连线或关联分", () => {
    const excluded = ["独行", "绝技", "调和"];
    const version = {
      ...getGameVersion("mengyue"),
      operators: {
        A: { covenants: ["炎", ...excluded] },
        B: { covenants: ["炎", ...excluded] },
        C: { covenants: excluded },
      },
    };
    const graph = buildCovenantGraph(version, ["A", "B", "C"].map((name) => ({ name })), []);
    expect(graph.edges.map(({ covenant }) => covenant)).toEqual(["炎"]);
    expect(graph.nodes.find(({ name }) => name === "C").covenants).toEqual(excluded);
    expect(rankOperators(graph, { 炎: 1.5, 独行: 2, 绝技: 2, 调和: 2 }).map(({ degree, score }) => [degree, score]))
      .toEqual([[1, 2], [1, 2], [0, 0]]);
  });

  it("规程只 Ban 叙拉古就从干员池和盟约分析移除忍冬", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    const wrapper = mount(Toolkit, { global: { stubs: { CovenantAnalysis: true } } });
    try {
      expect(wrapper.get("h1").text()).toBe("AKSP-Toolkit");
      const toolbar = wrapper.get(".toolkit-pool .filter-head");
      expect(toolbar.find(".search-input").exists()).toBe(true);
      expect(toolbar.find(".terminal-filter-btn").exists()).toBe(true);
      expect(toolbar.find(".view-switch").exists()).toBe(true);
      expect(wrapper.text()).not.toContain("查找盟约");
      const names = () => wrapper.findAll(".op-unit .name-label").map((item) => item.text());
      const swiftBan = wrapper.get('button[aria-label="Ban 迅捷"]');
      expect(names()).toContain("忍冬");
      await swiftBan.trigger("click");
      expect(names()).toContain("忍冬");
      await swiftBan.trigger("click");
      expect(swiftBan.attributes("aria-pressed")).toBe("false");
      await wrapper.get('button[aria-label="Ban 叙拉古"]').trigger("click");
      expect(names()).not.toContain("忍冬");
      expect(names()).toContain("陨星");
      await wrapper.findAll("nav button").find((button) => button.text() === "盟约分析").trigger("click");
      const graph = wrapper.getComponent({ name: "CovenantAnalysis" });
      expect(graph.props("banned")).toEqual(["叙拉古"]);
      expect(graph.props("operators").map(({ name }) => name)).not.toContain("忍冬");
      expect(graph.props("operators").map(({ name }) => name)).toContain("陨星");
    } finally {
      wrapper.unmount();
    }
  });

  it("切换聚类或聚集终端干员时，盟约连线保持一致", () => {
    const version = getGameVersion("guicheng");
    const operators = Object.keys(version.operators).map((name) => ({ name }));
    const terminalNames = ["余", "拜松"];
    const core = buildCovenantGraph(version, operators, [], { terminalNames });
    const additional = buildCovenantGraph(version, operators, [], { terminalNames, clusterBy: "additional" });
    const terminal = buildCovenantGraph(version, operators, [], {
      terminalNames, clusterBy: "additional", clusterTerminal: true,
    });
    const node = (graph) => graph.nodes.find(({ name }) => name === "余");
    const links = (graph) => graph.edges.map(({ source, target, covenant }) => [source.name, target.name, covenant]);
    expect(node(core)).toMatchObject({ clusterName: "炎", isTerminal: true });
    expect(node(additional)).toMatchObject({ clusterName: "坚守", isTerminal: true });
    expect(node(terminal).clusterName).toBe("终端干员");
    expect(terminal.clusters.find(({ name }) => name === "终端干员").nodes.map(({ name }) => name))
      .toEqual(expect.arrayContaining(terminalNames));
    expect(node(additional).position).not.toEqual(node(terminal).position);
    expect(links(additional)).toEqual(links(core));
    expect(links(terminal)).toEqual(links(core));
    expect(new Set(core.legend.map(({ color }) => color)).size).toBe(core.legend.length);
  });

  it("双击只切换终端标签，单击购入持有槽，标签按版本保存", async () => {
    vi.useFakeTimers();
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    const mountToolkit = () => mount(Toolkit, { global: { stubs: { CovenantAnalysis: true } } });
    let wrapper = mountToolkit();
    const findYu = async () => {
      await wrapper.get(".search-input").setValue("余");
      return wrapper.findAll(".pool-grid .op-unit")
        .find((card) => card.get(".name-label").text() === "余");
    };
    const mouseEvent = (card, event, detail) =>
      card.element.dispatchEvent(new MouseEvent(event, { bubbles: true, detail }));
    const doubleClick = async (card) => {
      mouseEvent(card, "click", 1);
      mouseEvent(card, "click", 2);
      mouseEvent(card, "dblclick", 2);
      vi.advanceTimersByTime(600);
      await wrapper.vm.$nextTick();
    };
    try {
      expect(wrapper.findAll(".tab-item").map((button) => button.text())).not.toContain("终端干员");
      const yu = await findYu();
      await doubleClick(yu);
      expect(yu.find(".terminal-tag").exists()).toBe(true);
      expect(wrapper.find('[aria-label="出售 余"]').exists()).toBe(false);
      await wrapper.findAll("nav button").find((button) => button.text() === "盟约分析").trigger("click");
      expect(wrapper.getComponent({ name: "CovenantAnalysis" }).props("terminalNames")).toEqual(["余"]);

      wrapper.unmount();
      wrapper = mountToolkit();
      expect((await findYu()).find(".terminal-tag").exists()).toBe(true);
      await wrapper.findAll(".version-btn").find((button) => button.text().includes("卫戍协议：盟约")).trigger("click");
      expect(wrapper.find(".terminal-tag").exists()).toBe(false);
      await wrapper.findAll(".version-btn").find((button) => button.text().includes("规程")).trigger("click");
      const restored = await findYu();
      await doubleClick(restored);
      expect(restored.find(".terminal-tag").exists()).toBe(false);
      expect(JSON.parse(localStorage.getItem("aksp_toolkit_terminal_operators")).guicheng).toEqual([]);
      for (let index = 0; index < 2; index++) {
        mouseEvent(restored, "click", 1);
        vi.advanceTimersByTime(600);
      }
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[aria-label="出售 余"]').element.parentElement.textContent).toContain("普通 ×2");
      expect(restored.find(".terminal-tag").exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("设置有独立色谱，可收起并保留各组的顺序和图谱颜色", async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const version = getGameVersion("guicheng");
    const operators = Object.keys(version.operators).map((name) => ({ name }));
    const wrapper = mount(CovenantAnalysis, {
      props: { version, operators, banned: ["坚守"], terminalNames: [] },
    });
    try {
      await wrapper.get('[aria-label="展开设置"]').trigger("click");
      await wrapper.get("select").setValue("余");
      const core = wrapper.get('section.spectrum[aria-label="核心盟约"]');
      const coreLegend = wrapper.get('.color-legend ol[aria-label="核心盟约"]');
      const additionalLegend = wrapper.get('.color-legend ol[aria-label="附加盟约"]');
      expect(wrapper.get(".color-legend").findAll("ol button")).toHaveLength(Object.keys(version.covenants).length);
      expect(additionalLegend.get('[title="坚守 · 已 Ban"] img').attributes("src")).toContain("盟约_坚守.png");
      const coreHighlight = coreLegend.get('[aria-label="高亮炎"]');
      const additionalHighlight = additionalLegend.get('[aria-label="高亮坚守（已 Ban）"]');
      expect(coreHighlight.attributes("aria-pressed")).toBe("false");
      await coreHighlight.trigger("click");
      expect(coreHighlight.attributes("aria-pressed")).toBe("true");
      await additionalHighlight.trigger("click");
      expect(coreHighlight.attributes("aria-pressed")).toBe("false");
      expect(additionalHighlight.attributes("aria-pressed")).toBe("true");
      await additionalHighlight.trigger("click");
      expect(additionalHighlight.attributes("aria-pressed")).toBe("false");
      const entries = () => core.findAll(".spectrum-segment");
      const additionalNames = () => additionalLegend.findAll("li").map((entry) => entry.text());
      const initialAdditionalNames = additionalNames();
      const legend = buildCovenantGraph(version, [], []).legend;
      for (const group of ["core", "additional"]) {
        const hues = legend.filter((entry) => entry.group === group)
          .map(({ color }) => Number(color.match(/hsl\(([\d.]+)/)[1]));
        expect(hues).toContainEqual(expect.any(Number));
        expect(hues.some((hue) => hue < 30)).toBe(true);
        expect(hues.some((hue) => hue > 100 && hue < 160)).toBe(true);
        expect(hues.some((hue) => hue > 200 && hue < 260)).toBe(true);
        expect(hues.some((hue) => hue > 275)).toBe(true);
      }
      const colors = () => entries().map((entry) => entry.element.style.getPropertyValue("--slot-color"));
      const initialColors = colors();
      expect(entries().length + initialAdditionalNames.length).toBe(Object.keys(version.covenants).length);
      expect(entries()[0].get(".covenant-name").text()).toBe("炎");
      expect(entries()[0].get("img").attributes("src")).toContain("盟约_炎.png");
      const summary = wrapper.get(".counts").text();
      await entries()[0].get("button").trigger("keydown", { key: "ArrowRight" });
      expect(entries()[1].get(".covenant-name").text()).toBe("炎");
      expect(coreLegend.findAll("li")[1].text()).toBe("炎");
      expect(colors()).toEqual(initialColors);
      expect(additionalNames()).toEqual(initialAdditionalNames);
      const swatch = document.createElement("span");
      swatch.style.background = initialColors[1];
      expect(wrapper.get(".selection .dot").element.style.background).toBe(swatch.style.background);
      expect(wrapper.get(".counts").text()).toBe(summary);
      expect(additionalLegend.get('[title="坚守 · 已 Ban"]').exists()).toBe(true);
      expect(wrapper.find('section.spectrum[aria-label="附加盟约"]').exists()).toBe(false);
      const thicker = wrapper.get('[aria-label="炎连线调粗"]');
      const thinner = wrapper.get('[aria-label="炎连线调细"]');
      await thicker.trigger("click");
      await thicker.trigger("click");
      expect(thicker.attributes("disabled")).toBeDefined();
      expect(thicker.attributes("title")).toContain("5/5");
      await thinner.trigger("click");
      expect(thicker.attributes("title")).toContain("4/5");
      const dragSource = entries()[1].get(".covenant-card");
      dragSource.element.setPointerCapture = vi.fn();
      const pointer = async (type, x, y) => {
        dragSource.element.dispatchEvent(new PointerEvent(type, {
          pointerId: 1, button: 0, clientX: x, clientY: y,
        }));
        await wrapper.vm.$nextTick();
      };
      await pointer("pointerdown", 30, 20);
      await pointer("pointermove", 100, 80);
      expect(dragSource.classes()).toContain("drag-source");
      const preview = document.body.querySelector(".drag-preview");
      expect(preview.textContent.trim()).toBe("炎");
      expect(preview.style.left).toBe("100px");
      await pointer("pointercancel", 100, 80);
      expect(document.body.querySelector(".drag-preview")).toBeNull();
      vi.spyOn(core.get(".spectrum-ring").element, "getBoundingClientRect")
        .mockReturnValue({ left: 0, top: 0, width: 200, height: 200 });
      const firstFour = entries().slice(0, 4).map((entry) => entry.get(".covenant-name").text());
      await pointer("pointerdown", 30, 20);
      await pointer("pointerup", 174, 124);
      expect(coreLegend.findAll("li").slice(0, 4).map((entry) => entry.text()))
        .toEqual([firstFour[0], firstFour[3], firstFour[2], firstFour[1]]);
      expect(colors()).toEqual(initialColors);

      const editButtons = wrapper.get('[aria-label="编辑色谱"]').findAll("button");
      await editButtons[1].trigger("click");
      expect(wrapper.find('section.spectrum[aria-label="核心盟约"]').exists()).toBe(false);
      expect(wrapper.get('button[aria-label="坚守 · 附加盟约 · 已 Ban"]').exists()).toBe(true);
      expect(wrapper.get('[aria-label="坚守连线调粗"]').attributes("title")).toContain("3/5");
      await editButtons[0].trigger("click");
      await wrapper.get('button[aria-label="收起设置"]').trigger("click");
      expect(wrapper.get("#analysis-settings").element.style.display).toBe("none");
      expect(wrapper.get("canvas").exists()).toBe(true);
      await wrapper.get('button[aria-label="展开设置"]').trigger("click");
      expect(wrapper.get("#analysis-settings").element.style.display).toBe("");
      expect(wrapper.get('section.spectrum[aria-label="核心盟约"]').findAll(".covenant-name")[3].text()).toBe("炎");
    } finally {
      wrapper.unmount();
      context.mockRestore();
    }
  });

  it("渲染器按盟约应用不同线宽", () => {
    const paths = new Map();
    let outlines = 0;
    const ctx = new Proxy({
      stroke(path) {
        if (path) paths.set(this.strokeStyle, { width: this.lineWidth, alpha: this.globalAlpha });
      },
      ellipse() { outlines++; },
      measureText() { return { width: 30 }; },
    }, { get: (target, property) => target[property] ?? (() => {}) });
    vi.stubGlobal("Path2D", class {
      moveTo() {}
      lineTo() {}
    });
    try {
      const version = getGameVersion("guicheng");
      const graph = buildCovenantGraph(version, Object.keys(version.operators).map((name) => ({ name })), []);
      const options = {
        width: 600, height: 450, view: { yaw: 0, pitch: 0, zoom: 1 },
        graph, mode: "name",
        lineLevels: { 炎: 5, 坚守: 1 },
      };
      drawCovenantGraph(ctx, options);
      const stroke = (name) => paths.get(graph.colorByCovenant.get(name));
      expect(stroke("炎").width).toBeGreaterThan(2);
      expect(stroke("坚守").width).toBeLessThan(0.5);
      expect(stroke("乌萨斯").width).toBe(0.75);
      expect(outlines).toBe(0);

      drawCovenantGraph(ctx, { ...options, highlightedCovenant: "炎" });
      expect(stroke("炎").alpha).toBeGreaterThan(0.75);
      expect(stroke("乌萨斯").alpha).toBeLessThan(0.1);
      expect(outlines).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("优推可按关联数或按每条盟约边的权重排序，并定位干员", async () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const version = {
      ...getGameVersion("guicheng"),
      operators: {
        A: { tier: "Ⅰ", covenants: ["炎", "坚守"] },
        B: { tier: "Ⅳ", covenants: ["炎", "坚守"] },
        C: { tier: "Ⅰ", covenants: ["炎"] },
        D: { tier: "Ⅳ", covenants: ["坚守"] },
      },
    };
    const wrapper = mount(CovenantAnalysis, {
      props: {
        version, operators: Object.keys(version.operators).map((name) => ({ name })),
        banned: [], terminalNames: [], covenantWeights: { 炎: 1.2, 坚守: 1.7 },
      },
    });
    const ranking = () => wrapper.findAll(".ranking-list button")
      .map((button) => [button.get(".rank-name").text(), Number(button.attributes("data-degree"))]);
    try {
      expect(wrapper.get(".analysis-rail button").attributes("aria-label")).toBe("收起优推干员");
      expect(wrapper.get("#analysis-settings").element.style.display).toBe("none");
      const actions = wrapper.findAll(".ranking-actions button");
      expect(actions.map((button) => [button.text(), button.attributes("aria-pressed")])).toEqual([
        ["优先叠层", "false"], ["定向搜索", "false"], ["考虑持有", "true"], ["启用权重", "true"],
      ]);
      const weightToggle = wrapper.get(".weight-toggle");
      await weightToggle.trigger("click");
      expect(weightToggle.attributes("aria-pressed")).toBe("false");
      expect(ranking()).toEqual([["A", 3], ["B", 3], ["C", 2], ["D", 2]]);
      await wrapper.findAll(".ranking-list button")[1].trigger("click");
      expect(wrapper.get("select").element.value).toBe("B");
      expect(wrapper.findAll(".ranking-list button")[1].attributes("aria-pressed")).toBe("true");
      await weightToggle.trigger("click");
      expect(weightToggle.attributes("aria-pressed")).toBe("true");
      expect(ranking()).toEqual([["A", 3], ["B", 3], ["C", 2], ["D", 2]]);
      expect(wrapper.findAll(".weight-score").map((item) => item.text())).toEqual(["7.4 分", "7.4 分", "4.0 分", "3.4 分"]);
      await wrapper.setProps({ terminalNames: ["D"], terminalCoefficient: 2.25 });
      expect(ranking()).toEqual([["D", 2], ["A", 3], ["B", 3], ["C", 2]]);
      expect(wrapper.findAll(".weight-score")[0].text()).toMatch(/7\.65 分\s+终端 ×2\.25/);
      expect(wrapper.findAll(".weight-score")[1].text()).toBe("7.4 分");
      await wrapper.get('[aria-label="Ⅳ阶"]').trigger("click");
      expect(ranking()).toEqual([["D", 2], ["B", 3]]);
      expect(wrapper.findAll(".weight-score").map((item) => item.text())).toEqual([
        expect.stringMatching(/^7\.65 分/), "7.4 分",
      ]);
      await wrapper.findAll(".ranking-list button")[0].trigger("dblclick");
      expect(wrapper.emitted("toggle-terminal")).toEqual([["D"]]);
      await wrapper.get('[aria-label="Ⅰ阶"]').trigger("click");
      expect(ranking()).toEqual([["D", 2], ["A", 3], ["B", 3], ["C", 2]]);
      await wrapper.get('[aria-label="Ⅳ阶"]').trigger("click");
      expect(ranking()).toEqual([["A", 3], ["C", 2]]);
      await wrapper.get('[aria-label="Ⅰ阶"]').trigger("click");
      await wrapper.get('[aria-label="Ⅱ阶"]').trigger("click");
      expect(wrapper.get("#analysis-ranking").text()).toContain("所选阶位没有符合条件的干员");
      await wrapper.get('[aria-label="Ⅱ阶"]').trigger("click");
      await weightToggle.trigger("click");
      expect(ranking()).toEqual([["A", 3], ["B", 3], ["C", 2], ["D", 2]]);
      await weightToggle.trigger("click");
      await wrapper.setProps({ banned: ["坚守"] });
      expect(ranking()).toEqual([["A", 2], ["B", 2], ["C", 2]]);
      expect(wrapper.findAll(".weight-score").map((item) => item.text())).toEqual(["5.7 分", "5.7 分", "4.0 分"]);
      await wrapper.setProps({ inventory: normalizeInventory({ covenantLayers: { 炎: 10 } }) });
      expect(wrapper.findAll(".weight-score").map((item) => item.text())).toEqual(["7.7 分", "7.7 分", "6.0 分"]);
      await wrapper.get(".weight-toggle").trigger("click");
      expect(wrapper.findAll(".weight-score").map((item) => item.text())).toEqual(["3.0 分", "3.0 分", "3.0 分"]);
      await wrapper.setProps({ inventory: normalizeInventory({ considerHeld: false }) });
      expect(wrapper.find(".weight-score").exists()).toBe(false);
      await wrapper.get('[aria-label="收起优推干员"]').trigger("click");
      expect(wrapper.get(".analysis").classes()).toContain("sidebar-collapsed");
      expect(wrapper.get('[aria-label="展开设置"]').exists()).toBe(true);
      expect(wrapper.get('[aria-label="展开优推干员"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      context.mockRestore();
    }
  });

  it("策略权重尺同时编辑两类盟约，并将版本权重传给盟约分析", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    const mountToolkit = () => mount(Toolkit, { global: { stubs: { CovenantAnalysis: true } } });
    let wrapper = mountToolkit();
    const openWeights = async () => {
      await wrapper.findAll("nav button").find((tab) => tab.text() === "策略编辑").trigger("click");
      await wrapper.findAll("nav button").find((tab) => tab.text() === "评分设置").trigger("click");
    };
    try {
      await openWeights();
      expect(wrapper.get(".weight-row:has([aria-label='炎二级倍率']) .weight-tag").classes()).toContain("core");
      expect(wrapper.get(".weight-row:has([aria-label='坚守基准分']) .weight-tag").classes()).not.toContain("core");
      expect(wrapper.get('[aria-label="炎二级倍率"]').attributes("max")).toBe("3");
      expect(wrapper.get('[aria-label="坚守基准分"]').attributes("max")).toBe("2");
      expect(wrapper.get('[aria-label="坚守基准分"]').attributes("min")).toBe("0");
      expect(wrapper.get('[aria-label="炎二级倍率"]').attributes("step")).toBe("0.1");
      expect(wrapper.get(".covenant-weight-group:has(#core-weight-rule)").findAll(".ruler span").map((tick) => tick.text()))
        .toEqual(["1.0", "1.5", "2.0", "2.5", "3.0"]);
      for (const [name, value] of [["炎", "2.4"], ["坚守", "1.8"]]) {
        await wrapper.get(`[aria-label="${name}${name === "炎" ? "二级倍率" : "基准分"}"]`).setValue(value);
      }
      const coefficient = () => wrapper.get(".terminal-coefficient input");
      expect(coefficient().element.value).toBe("1");
      await coefficient().setValue("1.75");
      await wrapper.findAll("nav button").find((button) => button.text() === "盟约分析").trigger("click");
      const analysis = wrapper.getComponent({ name: "CovenantAnalysis" });
      expect(analysis.props("covenantWeights")).toEqual({ 炎: 2.4, 坚守: 1.8 });
      expect(analysis.props("terminalCoefficient")).toBe(1.75);
      wrapper.unmount();
      wrapper = mountToolkit();
      await openWeights();
      expect(wrapper.get('[aria-label="坚守基准分"]').element.value).toBe("1.8");
      expect(coefficient().element.value).toBe("1.75");
      await wrapper.findAll(".version-btn").find((button) => button.text().includes("卫戍协议：盟约")).trigger("click");
      expect(wrapper.get('[aria-label="炎二级倍率"]').element.value).toBe("1");
      expect(coefficient().element.value).toBe("1");
    } finally {
      wrapper.unmount();
    }
  });

  it("三页共用持有槽，拖放和分级筛选可以编辑目标阵容", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    const wrapper = mount(Toolkit, { global: { stubs: { CovenantAnalysis: true } } });
    const button = (label) => wrapper.findAll("button").find((item) => item.text() === label);
    const drag = async (from, to) => {
      const data = new Map();
      const dataTransfer = {
        get types() { return [...data.keys()]; },
        setData: (type, value) => data.set(type, value),
        getData: (type) => data.get(type),
      };
      await from.trigger("dragstart", { dataTransfer });
      await to.trigger("dragover", { dataTransfer });
      expect(dataTransfer.dropEffect).toBe("copy");
      await to.trigger("drop", { dataTransfer });
    };
    try {
      await wrapper.get(".search-input").setValue("余");
      await wrapper.get(".pool-grid .op-unit").trigger("click");
      expect(wrapper.find(".my-team").exists()).toBe(false);
      expect(wrapper.findAll(".tab-item").map((tab) => tab.text())).toEqual(["干员池", "装备池"]);
      const panel = wrapper.get(".held-panel");
      const content = panel.get("#held-panel-content");
      expect(panel.get("#held-lineup-title").text()).toContain("1/8");
      await drag(wrapper.get(".pool-grid .op-unit"), panel.get('[aria-labelledby="held-slots-title"]'));
      expect(panel.get("#held-lineup-title").text()).toContain("2/8");
      await panel.get('[aria-label="收起当前持有干员"]').trigger("click");
      expect(content.element.style.display).toBe("none");
      await button("盟约分析").trigger("click");
      expect(wrapper.findAll(".held-panel")).toHaveLength(1);
      const expand = panel.get('[aria-label="展开当前持有干员"]');
      expect(expand.attributes("aria-expanded")).toBe("false");
      await expand.trigger("click");
      expect(content.element.style.display).toBe("");
      expect(content.get('[aria-label="出售 余"]').exists()).toBe(true);
      const recommendation = panel.get(".lineup-pieces").text();
      await button("策略编辑").trigger("click");
      expect(wrapper.get(".strategy-page nav button").text()).toBe("终局阵容方案");
      expect(button("终局阵容方案").attributes("aria-pressed")).toBe("true");
      const editor = wrapper.get(".strategy-lineup");
      expect(editor.get(".endgame-name").element.value).toBe("终局阵容方案");
      expect(editor.find(".operator-picker-form").exists()).toBe(false);
      await editor.get(".picker-toggle").trigger("click");
      const operator = editor.get('[aria-label="目标干员"]');
      const availableNames = () => operator.findAll("option").map((option) => option.text());
      const search = editor.get('input[type="search"]');
      expect(operator.element.disabled).toBe(false);
      expect(availableNames()).toEqual(expect.arrayContaining(["余", "拜松", "星极"]));
      await search.setValue("MC");
      expect(availableNames()).toContain("Miss.Christine");
      await search.setValue("   B S   ");
      expect(availableNames()).toContain("拜松");
      expect(availableNames()).not.toContain("余");
      await editor.get(".operator-picker-form label:nth-child(2) select").setValue("奇迹");
      expect(availableNames()).not.toContain("拜松");
      await editor.get(".operator-picker-form label:nth-child(2) select").setValue("");
      await search.setValue("星极");
      expect(availableNames()).toEqual(["选择干员", "星极"]);
      await search.setValue("");
      await editor.get(".operator-picker-form label:nth-child(1) select").setValue("炎");
      expect(availableNames()).toEqual(expect.arrayContaining(["余", "拜松"]));
      expect(availableNames()).not.toContain("星极");
      await editor.get(".operator-picker-form label:nth-child(2) select").setValue("奇迹");
      expect(availableNames()).not.toContain("拜松");
      await editor.get(".operator-picker-form label:nth-child(1) select").setValue("");
      expect(availableNames()).toContain("星极");
      await editor.get(".operator-picker-form label:nth-child(1) select").setValue("炎");
      await editor.get(".operator-picker-form label:nth-child(2) select").setValue("无附加盟约");
      await editor.get('[aria-label="目标干员"]').setValue("拜松");
      expect(editor.get('[aria-label="目标干员"]').findAll("option").map((option) => option.text())).not.toContain("余");
      await editor.get(".operator-picker-form").trigger("submit");
      expect(editor.get('[aria-label="购入 拜松"]').text()).toContain("晋升");
      expect(panel.get(".lineup-pieces").text()).toBe(recommendation);
      await editor.get(".endgame-name").setValue("炎队");
      await editor.get('.lineup-header input[type="number"]').setValue("9");
      await button("添加方案").trigger("click");
      await button("添加方案").trigger("click");
      const names = () => wrapper.findAll(".strategy-lineup .endgame-name");
      expect(names().map(({ element }) => element.value)).toEqual(["炎队", "终局阵容方案 1", "终局阵容方案 2"]);
      expect(wrapper.findAll(".strategy-lineup")[1].find('[aria-label="购入 拜松"]').exists()).toBe(false);
      await names()[1].setValue("备选队");
      await button("添加方案").trigger("click");
      expect(names().map(({ element }) => element.value)).toEqual(["炎队", "备选队", "终局阵容方案 2", "终局阵容方案 1"]);
      expect(editor.get('[aria-label="购入 拜松"]').exists()).toBe(true);
      await editor.get(".apply-endgame").trigger("click");
      await button("撤销").trigger("click");
      expect(panel.get("#held-lineup-title").text()).toContain("0/9");
      await editor.get(".apply-endgame").trigger("click");
      await button("局内信息").trigger("click");
      expect(panel.get("#held-lineup-title").text()).toContain("1/9");
      expect(panel.get('[aria-label="移除目标干员 拜松"]').exists()).toBe(true);
      const targetPicker = panel.get(".lineup-view");
      expect(targetPicker.find(".operator-picker-form").exists()).toBe(false);
      await targetPicker.get(".picker-toggle").trigger("click");
      await targetPicker.get(".operator-picker-form label:nth-child(1) select").setValue("炎");
      await targetPicker.get(".operator-picker-form label:nth-child(2) select").setValue("坚守");
      await targetPicker.get('[aria-label="目标干员"]').setValue("余");
      await targetPicker.get(".operator-picker-form").trigger("submit");
      await panel.get('[aria-label="改为普通 拜松"]').trigger("click");
      await button("撤销").trigger("click");
      expect(panel.find('[aria-label="移除目标干员 余"]').exists()).toBe(false);
      expect(panel.get('.lineup-view [aria-label="购入 拜松"]').text()).toContain("普通");
      expect(button("撤销").attributes("disabled")).toBeDefined();
      await panel.get('[aria-label="改为晋升 拜松"]').trigger("click");
      expect(button("撤销").attributes("disabled")).toBeDefined();
      await drag(wrapper.get(".pool-grid .op-unit"), panel.get(".lineup-view"));
      expect(panel.get('.lineup-view [aria-label="购入 余"]').text()).toContain("晋升");
      await panel.get('[aria-label="改为普通 余"]').trigger("click");
      expect(panel.get('.lineup-view [aria-label="购入 余"]').text()).toContain("普通");
      await panel.get('[aria-label="移除目标干员 拜松"]').trigger("click");
      await panel.get('[aria-label="改为晋升 余"]').trigger("click");
      await button("撤销").trigger("click");
      expect(panel.get('[aria-label="移除目标干员 拜松"]').exists()).toBe(true);
      expect(panel.get('.lineup-view [aria-label="购入 余"]').text()).toContain("晋升");
      await panel.get('[aria-label="改为普通 余"]').trigger("click");
      await button("清空目标阵容").trigger("click");
      expect(panel.get("#held-lineup-title").text()).toContain("0/9");
      expect(button("清空目标阵容").element.disabled).toBe(true);
      const inventory = () => JSON.parse(localStorage.getItem("aksp_toolkit_operator_inventory")).guicheng;
      expect(inventory().targetLineup).toEqual([]);
      await button("撤销").trigger("click");
      expect(inventory().targetLineup).toEqual([{ name: "拜松", promoted: true }, { name: "余", promoted: false }]);
      expect(panel.get("#held-lineup-title").text()).toContain("2/9");
      await button("清空目标阵容").trigger("click");
      await button("策略编辑").trigger("click");
      expect(wrapper.get('.strategy-lineup [aria-label="购入 拜松"]').exists()).toBe(true);
      for (const remove of wrapper.findAll(".delete-endgame")) await remove.trigger("click");
      expect(wrapper.findAll(".strategy-lineup")).toHaveLength(0);
      expect(wrapper.findAll(".endgame-empty").at(-1).text()).toBe("暂无自定义终局阵容方案。");
      expect(JSON.parse(localStorage.getItem("aksp_toolkit_operator_inventory")).guicheng.endgamePlans).toEqual([]);
      await button("添加方案").trigger("click");
      expect(wrapper.get(".endgame-name").element.value).toBe("终局阵容方案");
      await button("局内信息").trigger("click");
      await button("切换为推荐阵容").trigger("click");
      expect(panel.get(".lineup-pieces").text()).toBe(recommendation);
      await panel.get('.lineup-view [aria-label="购入 余"]').trigger("click");
      expect(panel.get('[aria-label="出售晋升棋子 余"]').element.parentElement.textContent).toContain("晋升 ×1");
      const heldPicker = panel.get('[aria-labelledby="held-slots-title"]');
      await heldPicker.get(".picker-toggle").trigger("click");
      await heldPicker.get('[aria-label="持有槽干员"]').setValue("拜松");
      await heldPicker.get(".operator-picker-form").trigger("submit");
      expect(heldPicker.get('[aria-label="出售 拜松"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  it("同一地址的窗口同步已保存的设置，各自编辑不同盟约时保留两边的修改", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    const first = mount(Toolkit);
    const second = mount(Toolkit);
    const openWeights = async (wrapper) => {
      await wrapper.findAll("nav button").find((tab) => tab.text() === "策略编辑").trigger("click");
      await wrapper.findAll("nav button").find((tab) => tab.text() === "评分设置").trigger("click");
    };
    const syncFromOtherWindow = (key) => window.dispatchEvent(new StorageEvent("storage", {
      key, newValue: localStorage.getItem(key), storageArea: localStorage,
    }));
    const weightKey = "aksp_toolkit_covenant_weights";
    const terminalKey = "aksp_toolkit_terminal_operators";
    const coefficientKey = "aksp_toolkit_terminal_coefficients";
    try {
      await first.get(".search-input").setValue("余");
      await first.get(".pool-grid .op-unit").trigger("dblclick");
      syncFromOtherWindow(terminalKey);
      await second.get(".search-input").setValue("余");
      expect(second.get(".terminal-tag").text()).toContain("终端");

      await openWeights(first);
      await openWeights(second);
      await first.get('[aria-label="炎二级倍率"]').setValue("1.4");
      await second.get('[aria-label="坚守基准分"]').setValue("1.8");
      expect(JSON.parse(localStorage.getItem(weightKey)).guicheng).toEqual({ 炎: 1.4, 坚守: 1.8 });
      syncFromOtherWindow(weightKey);
      await first.get(".terminal-coefficient input").setValue("1.5");
      syncFromOtherWindow(coefficientKey);
      await second.vm.$nextTick();
      expect(first.get('[aria-label="坚守基准分"]').element.value).toBe("1.8");
      expect(second.get('[aria-label="炎二级倍率"]').element.value).toBe("1.4");
      expect(second.get(".terminal-coefficient input").element.value).toBe("1.5");
    } finally {
      first.unmount();
      second.unmount();
    }
  });

  it("导出配置可完整导入到另一份本地存储，并可撤销；无效文件不修改当前设置", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    localStorage.setItem("arknights_saved_teams", JSON.stringify([{
      name: "测试编队", version: "guicheng", team: [{ name: "余", avatar: "http://old.local/avatar.png" }],
    }]));
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    let exported;
    vi.stubGlobal("Blob", class {
      constructor(parts) { exported = parts.join(""); }
    });
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL() { return "blob:toolkit-config-test"; }
      static revokeObjectURL() {}
    });
    let wrapper = mount(Toolkit);
    const button = (label) => wrapper.findAll("button").find((item) => item.text() === label);
    const importFile = async (json) => {
      const input = wrapper.get('input[type="file"]');
      Object.defineProperty(input.element, "files", { configurable: true, value: [{ text: async () => json }] });
      await input.trigger("change");
      await flushPromises();
    };
    const buyFlameOperators = async () => {
      for (const name of ["余", "拜松", "矩"]) {
        await wrapper.findAll(".ranking-list button").find((item) => item.get(".rank-name").text() === name).trigger("click");
      }
    };
    try {
      await wrapper.get('[aria-label="Ban 不屈"]').trigger("click");
      await wrapper.get(".search-input").setValue("余");
      const operator = wrapper.get(".pool-grid .op-unit");
      await operator.trigger("dblclick");
      await button("策略编辑").trigger("click");
      await button("盟约分类").trigger("click");
      await wrapper.get('[aria-label="阿戈尔 Lv.2主要类别"]').setValue("economy");
      await button("评分设置").trigger("click");
      await wrapper.get('[aria-label="炎二级倍率"]').setValue("2.6");
      await wrapper.get(".terminal-coefficient input").setValue("1.25");
      expect(wrapper.get(".pair-coefficient input").element.value).toBe("1.2");
      await wrapper.get(".pair-coefficient input").setValue("1.8");
      const heldMultiplier = () => wrapper.get('[aria-label="考虑持有倍率"]');
      expect(heldMultiplier().element.value).toBe("2");
      await heldMultiplier().setValue("1.6");
      expect(wrapper.get('[aria-label="叠层干员评分倍率"]').element.value).toBe("1.5");
      await wrapper.get('[aria-label="叠层干员评分倍率"]').setValue("1.75");
      expect(wrapper.get('[aria-label="可叠层盟约评分倍率"]').element.value).toBe("1.2");
      await wrapper.get('[aria-label="可叠层盟约评分倍率"]').setValue("1.3");
      await wrapper.get('[aria-label="Ⅳ阶基础分"]').setValue("1.9");
      await wrapper.get('[aria-label="坚守基准分"]').setValue("0");
      await button("终局阵容方案").trigger("click");
      await wrapper.get(".strategy-lineup .picker-toggle").trigger("click");
      await wrapper.get(".strategy-lineup .operator-picker-form label:nth-child(1) select").setValue("炎");
      await wrapper.get(".strategy-lineup .operator-picker-form label:nth-child(2) select").setValue("无附加盟约");
      await wrapper.get('.strategy-lineup [aria-label="目标干员"]').setValue("拜松");
      await wrapper.get(".strategy-lineup .operator-picker-form").trigger("submit");
      await wrapper.get(".strategy-lineup .endgame-name").setValue("炎·终局");
      await wrapper.get(".strategy-lineup .apply-endgame").trigger("click");
      await button("切换为推荐阵容").trigger("click");
      await button("评分设置").trigger("click");
      await button("盟约分析").trigger("click");
      await wrapper.get('[aria-label="展开设置"]').trigger("click");
      await wrapper.get("select").setValue("余");
      await wrapper.get('[aria-label="炎连线调粗"]').trigger("click");
      await wrapper.get('[aria-label="放大图谱"]').trigger("click");
      await wrapper.get('[aria-label="展开优推干员"]').trigger("click");
      expect(button("启用权重").attributes("aria-pressed")).toBe("true");
      await wrapper.get('[aria-label="高亮炎"]').trigger("click");
      await buyFlameOperators();
      expect(wrapper.get(".ranking-list").text()).toContain("改变推荐阵容 ×1.6");
      expect(wrapper.find('.layer-name img[alt="炎"]').exists()).toBe(false);
      await button("显示图标").trigger("click");
      expect(wrapper.get('.layer-name img[alt="炎"]').exists()).toBe(true);
      await wrapper.get('[aria-label="炎层数"]').setValue("10");
      await wrapper.get('[aria-label="炎层数"]').setValue("-1");
      expect(wrapper.get('[aria-label="炎层数"]').element.value).toBe("10");
      expect(button("潜在可激活盟约").attributes("aria-pressed")).toBe("true");
      await wrapper.get('[aria-label="收起盟约设置"]').trigger("click");
      expect(wrapper.get("#held-covenants-content").element.style.display).toBe("none");
      await button("额外核心盟约").trigger("click");
      expect(wrapper.get("#held-covenants-content").element.style.display).toBe("");
      expect(wrapper.findAll('[aria-label$="额外棋子数"]')).toHaveLength(10);
      await wrapper.get('[aria-label="炎额外棋子数"]').setValue("3");
      expect(wrapper.get(".recommended-covenants").text()).toMatch(/3\s*炎\s*Lv\.1/);
      await button("潜在可激活盟约").trigger("click");
      await wrapper.get('[aria-label="炎增加 1 层"]').trigger("click");
      expect(wrapper.get('[aria-label="炎层数"]').element.value).toBe("11");
      await wrapper.get('.layer-stepper [aria-label="炎增加 10 层"]').trigger("click");
      expect(wrapper.get('[aria-label="炎层数"]').element.value).toBe("21");
      await wrapper.get('[aria-label="炎减少 1 层"]').trigger("click");
      await wrapper.get('[aria-label="炎减少 10 层"]').trigger("click");
      expect(wrapper.get('[aria-label="炎层数"]').element.value).toBe("10");
      await wrapper.get('[aria-label="Ⅳ阶"]').trigger("click");
      await wrapper.get('[aria-label="Ⅵ阶"]').trigger("click");
      await wrapper.get("select").setValue("余");
      await wrapper.get(".lineup-header input").setValue("9");
      expect(button("考虑持有").attributes("aria-pressed")).toBe("true");
      await button("启用权重").trigger("click");
      const yuScore = () => Number.parseFloat(wrapper.findAll(".ranking-list button")
        .find((item) => item.get(".rank-name").text() === "余").get(".weight-score").text());
      const scoreAtTenLayers = yuScore();
      await wrapper.get('[aria-label="炎增加 10 层"]').trigger("click");
      expect(yuScore()).toBeGreaterThan(scoreAtTenLayers);
      await wrapper.get('[aria-label="炎减少 10 层"]').trigger("click");
      expect(yuScore()).toBe(scoreAtTenLayers);
      const flameTarget = () => wrapper.get('[aria-label="目标盟约 炎"]');
      const flameCard = () => wrapper.get('.target-covenant-card:has([aria-label="目标盟约 炎"])');
      expect(flameTarget().attributes("aria-pressed")).toBe("false");
      const recommendedScore = () => Number(wrapper.get(".held-panel .lineup-network-score strong").text());
      const originalScore = recommendedScore();
      await flameCard().trigger("click");
      expect(flameTarget().attributes("aria-pressed")).toBe("true");
      expect(flameCard().classes()).toContain("is-target");
      expect(yuScore()).toBeGreaterThan(scoreAtTenLayers);
      expect(recommendedScore()).toBeGreaterThan(originalScore);
      await button("启用权重").trigger("click");
      await button("隐藏图例").trigger("click");
      expect(wrapper.get("#graph-legend").isVisible()).toBe(false);
      expect(button("显示图例")?.element.closest(".view-actions")).toBeTruthy();
      await button("定向搜索").trigger("click");
      const stackingToggle = () => button("优先叠层");
      expect(stackingToggle().attributes("aria-pressed")).toBe("false");
      const scoreBeforeStacking = yuScore();
      const lineupBeforeStacking = recommendedScore();
      await stackingToggle().trigger("click");
      expect(yuScore()).toBeGreaterThan(scoreBeforeStacking * 1.75);
      expect(recommendedScore()).toBeGreaterThan(lineupBeforeStacking);
      await stackingToggle().trigger("click");
      expect(yuScore()).toBe(scoreBeforeStacking);
      await stackingToggle().trigger("click");
      await button("导出配置").trigger("click");
      expect(download).toHaveBeenCalledOnce();
      expect(JSON.parse(exported).covenantFunctions.guicheng.阿戈尔).toEqual({ 2: ["economy"] });
      expect(JSON.parse(exported).analysis.view.zoom).toBe(1.2);
      expect(JSON.parse(exported).analysis.legendHidden).toBe(true);
      expect(JSON.parse(exported).inventory.guicheng.covenantLayers).toEqual({ 炎: 10 });
      expect(JSON.parse(exported).stackingCoefficients.guicheng).toBe(1.75);
      expect(JSON.parse(exported).heldLineupChangeCoefficients.guicheng).toBe(1.6);
      expect(JSON.parse(exported).stackableCovenantCoefficients.guicheng).toBe(1.3);
      expect(JSON.parse(exported).tierBasePoints.guicheng).toEqual([0.5, 0.8, 1.1, 1.9, 1.7, 2]);
      expect(JSON.parse(exported).weights.guicheng.坚守).toBe(0);
      expect(JSON.parse(exported).inventory.guicheng.stackingEnabled).toBe(true);
      expect(JSON.parse(exported).inventory.guicheng.directedSearch).toBe(true);
      expect(JSON.parse(exported).inventory.guicheng.extraCoreCounts).toEqual({ 炎: 3 });
      expect(JSON.parse(exported).inventory.guicheng.targetCovenantNames).toEqual(["炎"]);
      expect(JSON.parse(exported).inventory.guicheng.targetLineup).toEqual([{ name: "拜松", promoted: true }]);
      expect(JSON.parse(exported).inventory.guicheng.endgamePlans[0]).toMatchObject({
        name: "炎·终局", pieces: [{ name: "拜松", promoted: true }],
      });
      expect(exported).not.toContain("old.local");

      wrapper.unmount();
      localStorage.clear();
      useGameVersion().setVersion("mengyue");
      wrapper = mount(Toolkit);
      await importFile(exported);
      expect(wrapper.get(".configuration-status").text()).toContain("已导入");
      expect(button("定向搜索").attributes("aria-pressed")).toBe("true");
      expect(stackingToggle().attributes("aria-pressed")).toBe("true");
      expect(wrapper.get(".version-btn.active").text()).toContain("规程");
      expect(wrapper.get(".weight-toggle").attributes("aria-pressed")).toBe("true");
      expect(wrapper.get("#graph-legend").isVisible()).toBe(false);
      await button("显示图例").trigger("click");
      expect(wrapper.get("#graph-legend").element.style.display).toBe("");
      expect(button("显示图例")).toBeUndefined();
      expect(wrapper.get('[aria-label="高亮炎"]').attributes("aria-pressed")).toBe("true");
      expect(wrapper.get('[aria-label="Ⅳ阶"]').attributes("aria-pressed")).toBe("true");
      expect(wrapper.get('[aria-label="Ⅵ阶"]').attributes("aria-pressed")).toBe("true");
      expect(wrapper.get('[aria-label="出售 余"]').element.parentElement.textContent).toContain("普通 ×1");
      expect(wrapper.get("#held-lineup-title").text()).toContain("3/9");
      await button("切换为目标阵容").trigger("click");
      expect(wrapper.get('.held-panel [aria-label="移除目标干员 拜松"]').exists()).toBe(true);
      await button("切换为推荐阵容").trigger("click");
      expect(wrapper.get('[aria-label="炎层数"]').element.value).toBe("10");
      await button("额外核心盟约").trigger("click");
      expect(wrapper.get('[aria-label="炎额外棋子数"]').element.value).toBe("3");
      await wrapper.get('[aria-label="炎额外棋子数"]').setValue("0");
      await button("潜在可激活盟约").trigger("click");
      expect(wrapper.get('.layer-name img[alt="炎"]').exists()).toBe(true);
      expect(button("考虑持有").attributes("aria-pressed")).toBe("true");
      expect(wrapper.get("select").element.value).toBe("余");
      expect(wrapper.get('[aria-label="炎连线调粗"]').attributes("title")).toContain("4/5");
      expect(wrapper.get(".terminal-coefficient input").element.value).toBe("1.25");
      expect(wrapper.get(".pair-coefficient input").element.value).toBe("1.8");
      expect(heldMultiplier().element.value).toBe("1.6");
      expect(wrapper.get('[aria-label="叠层干员评分倍率"]').element.value).toBe("1.75");
      expect(wrapper.get('[aria-label="可叠层盟约评分倍率"]').element.value).toBe("1.3");
      expect(wrapper.get('[aria-label="Ⅳ阶基础分"]').element.value).toBe("1.9");
      expect(wrapper.get('[aria-label="坚守基准分"]').element.value).toBe("0");
      expect(wrapper.get('[aria-label="炎二级倍率"]').element.value).toBe("2.6");
      expect(wrapper.find(".my-team").exists()).toBe(false);
      expect(wrapper.get('[aria-label="Ban 不屈"]').attributes("aria-pressed")).toBe("true");
      expect(JSON.parse(localStorage.getItem("arknights_saved_teams"))[0].name).toBe("测试编队");
      const yuInRanking = () => wrapper.findAll(".ranking-list button")
        .find((item) => item.get(".rank-name").text() === "余");
      expect(yuInRanking().find(".rank-terminal").exists()).toBe(true);
      await yuInRanking().trigger("dblclick");
      expect(yuInRanking().find(".rank-terminal").exists()).toBe(false);
      expect(JSON.parse(localStorage.getItem("aksp_toolkit_terminal_operators")).guicheng).toEqual([]);

      await wrapper.get('[aria-label="Ⅳ阶"]').trigger("click");
      await wrapper.get('[aria-label="Ⅵ阶"]').trigger("click");
      const inventoryKey = "aksp_toolkit_operator_inventory";
      const savedInventory = () => JSON.parse(localStorage.getItem(inventoryKey)).guicheng;
      await button("清空持有槽").trigger("click");
      expect(wrapper.get("#held-lineup-title").text()).toContain("0/9");
      expect(wrapper.get('.layer-name[title="炎"]').classes()).toContain("inactive");
      expect(wrapper.get(".held-covenants").text()).not.toContain("当前不可激活");
      expect(wrapper.get('[aria-label="炎层数"]').element.value).toBe("10");
      expect(savedInventory().covenantLayers).toEqual({ 炎: 10 });
      await buyFlameOperators();
      expect(wrapper.get('[aria-label="炎层数"]').element.value).toBe("10");
      expect(wrapper.get('.layer-name[title="炎"]').classes()).not.toContain("inactive");
      await button("清空持有槽").trigger("click");
      await button("层数清零").trigger("click");
      expect(savedInventory().covenantLayers).toEqual({});
      expect(flameTarget().attributes("aria-pressed")).toBe("true");
      await flameTarget().trigger("click");
      expect(wrapper.find('[aria-label="炎层数"]').exists()).toBe(false);
      await buyFlameOperators();
      expect(wrapper.get('[aria-label="炎层数"]').element.value).toBe("0");
      await wrapper.get('[aria-label="炎层数"]').setValue("10");
      await button("层数清零").trigger("click");
      expect(wrapper.get('[aria-label="炎层数"]').element.value).toBe("0");
      expect(wrapper.get("#held-lineup-title").text()).toContain("3/9");

      await importFile('{"format":"other"}');
      expect(wrapper.get(".configuration-status").text()).toContain("无法导入");
      expect(wrapper.get('[aria-label="炎二级倍率"]').element.value).toBe("2.6");
      await button("撤销导入").trigger("click");
      await flushPromises();
      expect(wrapper.get(".version-btn.active").text()).toContain("盟约");
      expect(wrapper.find(".weight-toggle").exists()).toBe(false);
      expect(wrapper.find(".team-grid .name-label").exists()).toBe(false);
      expect(JSON.parse(localStorage.getItem("arknights_saved_teams"))).toEqual([]);
    } finally {
      wrapper.unmount();
      download.mockRestore();
      canvas.mockRestore();
      vi.unstubAllGlobals();
    }
  }, 15_000);

  it("干员池可折叠两类 Ban，并且只显示当前可用的终端干员", async () => {
    localStorage.clear();
    useGameVersion().setVersion("guicheng");
    const wrapper = mount(PoolPanel, {
      props: { separateBan: true, terminalNames: ["余", "宴"] },
    });
    const names = () => wrapper.findAll(".pool-grid .name-label").map((entry) => entry.text());
    try {
      const core = wrapper.get('[aria-label="Ban 核心盟约"]');
      const additional = wrapper.get('[aria-label="Ban 附加盟约"]');
      expect(wrapper.get(".filter-body").element.lastElementChild.matches(".ban-section")).toBe(true);
      expect(wrapper.get(".ban-heading h3").text()).toBe("Ban");
      expect(core.get('[aria-label="Ban 炎"]').exists()).toBe(true);
      expect(additional.find('[aria-label="Ban 炎"]').exists()).toBe(false);
      await wrapper.get(".terminal-filter-btn").trigger("click");
      expect(names().sort()).toEqual(["余", "宴"]);
      await additional.get('[aria-label="Ban 不屈"]').trigger("click");
      await wrapper.get(".ban-toggle").trigger("click");
      expect(wrapper.get("#pool-ban-groups").element.style.display).toBe("none");
      expect(wrapper.get(".ban-toggle").attributes("aria-expanded")).toBe("false");
      expect(names()).toEqual(["余"]);
      expect(wrapper.emitted("available-pool").at(-1)[0].operators.length).toBeGreaterThan(1);
      await wrapper.get(".terminal-filter-btn").trigger("click");
      expect(names()).toContain("折桠");
      expect(names()).not.toContain("宴");
    } finally {
      wrapper.unmount();
    }
  });
});
