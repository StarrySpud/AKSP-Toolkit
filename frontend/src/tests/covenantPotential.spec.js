import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CovenantPotential from "../AKSP-Toolkit/CovenantPotential.vue";
import CovenantPotentialMap from "../AKSP-Toolkit/CovenantPotentialMap.vue";
import CovenantFunctionEditor from "../AKSP-Toolkit/CovenantFunctionEditor.vue";
import { getCovenantFunctions, summarizeCovenantFunctions } from "../AKSP-Toolkit/covenantFunctions.js";
import { analyzeCovenantPotential } from "../AKSP-Toolkit/covenantPotential.js";
import { getGameVersion } from "../data/versions.js";

const operatorsWith = (memberships) => Object.fromEntries(Object.entries(memberships)
  .map(([name, covenants]) => [name, { tier: "Ⅰ", covenants }]));
const roster = (version) => Object.keys(version.operators).map((name) => ({ name }));
const side = (report, name) => report.sides.find((covenant) => covenant.name === name);

const version = {
  id: "guicheng", banStrategy: "faction",
  covenants: {
    炎: { group: "core", activateCount: 2, effects: [{ condition: "在场3名不同的【炎】干员" }] },
    精准: { group: "additional", activateCount: 2 },
    远见: { group: "additional", activateCount: 2 },
  },
  operators: operatorsWith({ A: ["炎"], B: ["炎"], C: ["精准"], D: ["精准"], E: ["远见"], F: ["远见"] }),
};

describe("盟约适配分析", () => {
  it("逐条能激活不等于能同阵激活，也不会把池外人员计入", () => {
    const pool = [...roster(version), { name: "A" }];
    const small = analyzeCovenantPotential(version, pool, [], 4);
    const [report] = small.cores;
    expect(small.poolSize).toBe(6);
    expect(report.count).toBe(2);
    expect(report.levels).toMatchObject([{ full: true, minSlots: 2 }, { canActivate: false }]);
    expect(side(report, "精准")).toMatchObject({ coreCount: 0, poolCount: 2, minSlots: 4, full: true });
    expect(side(report, "远见")).toMatchObject({ fromHolding: false, full: true });
    expect(report.pairs).toEqual([{ names: ["精准", "远见"], canActivate: false, full: false, minSlots: null }]);
    expect(analyzeCovenantPotential(version, pool, [], 6).cores[0].pairs[0]).toMatchObject({ full: true, minSlots: 6 });
    expect(analyzeCovenantPotential(version, pool, ["炎"], 4).cores).toEqual([]);
    expect(analyzeCovenantPotential(version, pool, ["精准"], 4).cores[0].sides.map(({ name }) => name)).toEqual(["远见"]);
  });

  it("调和占用上场位，独行和绝技不纳入适配", () => {
    const special = {
      ...version,
      covenants: {
        炎: version.covenants.炎, 调和: { group: "additional", activateCount: 1 },
        独行: { group: "additional", activateCount: 1 }, 绝技: { group: "additional", activateCount: 2 },
      },
      operators: operatorsWith({ A: ["炎"], B: ["调和"], C: ["独行"], D: ["独行"] }),
    };
    const [report] = analyzeCovenantPotential(special, roster(special), [], 4).cores;
    expect(report.levels).toMatchObject([{ full: true, minSlots: 2 }, { canActivate: false }]);
    expect(side(report, "独行")).toBeUndefined();
    expect(side(report, "绝技")).toBeUndefined();
  });

  it("两个版本的盟约都有独立分类，同一个盟约可计入多个功能", () => {
    for (const id of ["mengyue", "guicheng"]) {
      for (const name of Object.keys(getGameVersion(id).covenants)) {
        expect(getCovenantFunctions(id, name).length, name).toBeGreaterThan(0);
      }
    }
    expect(getCovenantFunctions("guicheng", "阿戈尔")).toEqual(["survival", "attack"]);
    expect(getCovenantFunctions("guicheng", "阿戈尔", 2)).toEqual(["survival"]);
    expect(getCovenantFunctions("guicheng", "乌萨斯")).toEqual(["attack", "survival"]);
    expect(getCovenantFunctions("guicheng", "乌萨斯", 2)).toEqual(["survival", "attack"]);
    expect(getCovenantFunctions("mengyue", "炎", 3)).toEqual(["attack", "survival"]);
    expect(summarizeCovenantFunctions("guicheng", ["阿戈尔", "远见"]).map(({ count }) => count)).toEqual([1, 1, 1]);
  });

  it("进阶使用独立人数门槛和彩色分类，可手动调整排序优先级", async () => {
    const data = getGameVersion("guicheng");
    const analysis = analyzeCovenantPotential(data, roster(data), [], 8);
    const wrapper = mount(CovenantPotentialMap, { props: { analysis, versionId: data.id } });
    const editor = mount(CovenantFunctionEditor, { props: { version: data, overrides: {} } });
    try {
      const base = wrapper.get('[aria-label^="乌萨斯与精准，"]');
      expect(base.exists()).toBe(true);
      expect(wrapper.findAll("thead th").find((th) => th.text() === "精准").get(".function-frame").attributes("title")).toBe("主类 攻击");
      await wrapper.findAll(".level-picker button")[1].trigger("click");
      const rank = () => wrapper.findAll("tbody th").map((row) => row.text());
      expect(rank()[0]).not.toContain("阿戈尔");
      const survival = wrapper.get('[aria-label^="阿戈尔 Lv.2与精准，"]');
      const header = survival.element.closest("tr").querySelector("th");
      expect(header.querySelector(".function-frame").title).toBe("主类 生存");
      expect(analysis.cores.find(({ name }) => name === "阿戈尔").advanced[0].threshold).toBe(6);
      const rings = wrapper.get('[title="主类 生存、次类 攻击"]').findAll('.function-ring');
      expect(rings.map((ring) => ring.element.style.inset)).toEqual(["0px", "-3px"]);

      const select = editor.get('[aria-label="阿戈尔 Lv.2主要类别"]');
      expect(select.element.closest(".entry").textContent).toContain("立刻复活");
      await select.setValue("attack");
      expect(editor.emitted("change").at(-1)).toEqual(["阿戈尔", 2, ["attack"]]);
      await wrapper.setProps({ overrides: { 阿戈尔: { 2: ["attack"] } } });
      expect(rank().findIndex((row) => row.includes("阿戈尔")))
        .toBeLessThan(rank().findIndex((row) => row.includes("乌萨斯")));
    } finally {
      editor.unmount();
      wrapper.unmount();
    }
  });

  it("面板随上场上限更新同阵矩阵", async () => {
    const analyze = (limit, bans = []) => analyzeCovenantPotential(version, roster(version), bans, limit);
    const wrapper = mount(CovenantPotential, { props: { version, analysis: analyze(4) } });
    try {
      expect(wrapper.find(".joint-matrix td.feasible").exists()).toBe(false);
      expect(wrapper.get(".joint-matrix").text()).toContain("不可");
      await wrapper.setProps({ analysis: analyze(6) });
      expect(wrapper.get(".joint-matrix td.feasible").text()).toBe("6");
      await wrapper.setProps({ analysis: analyze(6, ["炎"]) });
      expect(wrapper.get('[role="status"]').text()).toContain("没有未被 Ban 的核心盟约");
    } finally {
      wrapper.unmount();
    }
  });

  it("可视化按满编选项排序，并可查看核心与附加的搭配详情", async () => {
    const competitive = {
      ...version,
      covenants: { 萨尔贡: { group: "core", activateCount: 2 }, ...version.covenants },
      operators: { ...version.operators, G: { tier: "Ⅰ", covenants: ["萨尔贡"] } },
    };
    const analyze = (bans) => analyzeCovenantPotential(competitive, roster(competitive), bans, 4);
    const wrapper = mount(CovenantPotentialMap, { props: { analysis: analyze([]) } });
    try {
      expect(wrapper.get(".breadth-list li").text()).toContain("炎");
      const cell = wrapper.get('[aria-label="炎与精准，可满编，至少4人"]');
      await cell.trigger("click");
      expect(wrapper.get(".pair-detail").text()).toContain("最佳叠层手");
      expect(wrapper.get('[aria-label="萨尔贡与精准，上限内不可激活"]').text()).toBe("—");
      await wrapper.setProps({ analysis: analyze(["精准"]) });
      expect(wrapper.find(".pair-detail").exists()).toBe(false);
      expect(wrapper.get("table").text()).not.toContain("精准");
      const fewerSlots = {
        ...competitive,
        operators: {
          ...competitive.operators,
          G: { tier: "Ⅰ", covenants: ["萨尔贡", "精准"] },
          H: { tier: "Ⅰ", covenants: ["萨尔贡"] },
        },
      };
      await wrapper.setProps({ analysis: analyzeCovenantPotential(fewerSlots, roster(fewerSlots), [], 4) });
      expect(wrapper.get(".breadth-list li").text()).toContain("萨尔贡");
      expect(wrapper.get(".breadth-list li").text()).toContain("平均需 3.50 个上场位");
    } finally {
      wrapper.unmount();
    }
  });

  it("按明确的整备区词条腾出上场位，但仍要求池内凑足人数", () => {
    const reserve = Object.fromEntries(["远见", "奇迹", "投资人"].map((name, index) => [name, {
      group: "additional", activateCount: index === 2 ? 3 : 2,
      effects: [{ description: `整备区的【${name}】干员也可用于激活盟约` }],
    }]));
    const data = {
      ...version, covenants: { ...version.covenants, ...reserve },
      operators: operatorsWith({ A: ["炎"], B: ["炎"], C: ["精准"], D: ["精准"],
        E: Object.keys(reserve), F: Object.keys(reserve), G: ["投资人"] }),
    };
    const [report] = analyzeCovenantPotential(data, roster(data), [], 2).cores;
    for (const name of Object.keys(reserve)) expect(side(report, name)).toMatchObject({ fromHolding: true, minSlots: 2, full: true });
    expect(side(report, "精准").canActivate).toBe(false);
    expect(analyzeCovenantPotential(data, roster(data).filter(({ name }) => name !== "G"), [], 2)
      .cores[0].sides.find(({ name }) => name === "投资人").canActivate).toBe(false);
  });

  it("列出最多核心组合，并通过逐一剔除找出不可替换干员", async () => {
    const data = {
      ...version, covenants: { ...version.covenants, 萨尔贡: { group: "core", activateCount: 2 },
        谢拉格: { group: "core", activateCount: 2 }, 调和: { group: "additional", activateCount: 1 } },
      operators: operatorsWith({ A: ["炎"], B: ["炎"], C: ["萨尔贡"], D: ["调和"], E: ["谢拉格"], F: ["精准"] }),
    };
    const analysis = analyzeCovenantPotential(data, roster(data), [], 3);
    expect(analysis.multiCore()).toEqual([
      { names: ["炎", "萨尔贡"], indispensable: ["C", "D"], canActivate: true, full: true, minSlots: 3 },
      { names: ["炎", "谢拉格"], indispensable: ["D", "E"], canActivate: true, full: true, minSlots: 3 },
      { names: ["萨尔贡", "谢拉格"], indispensable: ["C", "D", "E"], canActivate: true, full: true, minSlots: 3 },
    ]);
    const wrapper = mount(CovenantPotentialMap, { props: { analysis } });
    await wrapper.findAll(".level-picker button")[2].trigger("click");
    expect(wrapper.text()).toContain("最多同时激活 2 种核心盟约");
    expect(wrapper.get(".multi-core-list").text()).toContain("不可替换干员 C、D");
    wrapper.unmount();
  });

  it("只推荐可入阵的叠层手，按性价比排序并限制特殊级别", () => {
    const operators = operatorsWith({ A: ["炎"], B: ["炎"], C: ["精准"], D: ["精准"], E: ["精准"], F: ["远见"] });
    const trait = (upgraded) => [{ type: "持续叠加", upgraded }];
    operators.C.traits = trait("每次开启技能时使已激活的【精准】层数+2（每场战斗至多叠加11层）");
    operators.D.traits = trait("身前一格干员每场战斗的叠层上限+200%");
    operators.D.tier = "Ⅴ";
    operators.E.traits = trait("使已激活的【精准】层数+5");
    operators.F.traits = trait("使已激活的【精准】层数+50");
    const data = { ...version, operators };
    const [, precision] = analyzeCovenantPotential(data, roster(data), [], 4).stackersFor("炎", 1, "精准");
    expect(precision.candidates).toMatchObject([
      { name: "C", support: false, tier: 3, layers: 11, shopLevel: 1, efficiency: 2 },
      { name: "E", support: false, tier: 1, layers: 5, shopLevel: 1, efficiency: 0 },
      { name: "D", support: true, tier: 3, layers: 22, shopLevel: 5, efficiency: -2 },
    ]);
  });

  it("用实际规程卡池排除被 Ban 的核心，并保留其他核心的数据", () => {
    const actual = getGameVersion("guicheng");
    const result = analyzeCovenantPotential(actual, roster(actual), ["叙拉古", "迅捷"], 8);
    expect(result.cores).toHaveLength(9);
    expect(result.ignoredCount).toBe(2);
    expect(result.cores.find(({ name }) => name === "炎").levels[0]).toMatchObject({ full: true });
    expect(result.cores.every(({ sides }) => sides.every(({ name }) => name !== "迅捷"))).toBe(true);
  });

  it("可在实际规程池计算多核心和卡西米尔进阶搭配的叠层手", () => {
    const actual = getGameVersion("guicheng");
    const analysis = analyzeCovenantPotential(actual, roster(actual), [], 8);
    const combos = analysis.multiCore();
    expect(combos[0].names.length).toBeGreaterThan(2);
    const [casimir, precision] = analysis.stackersFor("卡西米尔", 2, "精准");
    expect(casimir.candidates.find(({ name }) => name === "砾")).toMatchObject({ layers: 24, tier: 5 });
    expect(precision.candidates.find(({ name }) => name === "迷迭香")).toMatchObject({ layers: 20, tier: 4 });
    expect(casimir.candidates.find(({ name }) => name === "焰尾")).toMatchObject({ layers: 20, tier: 4, efficiency: -1 });
    const [iberia, defense] = analysis.stackersFor("伊比利亚", 1, "坚守");
    expect(iberia.candidates.find(({ name }) => name === "旅骨")).toMatchObject({ layers: 16, tier: 4, efficiency: 1 });
    expect(defense.candidates.find(({ name }) => name === "旅骨")).toMatchObject({ layers: 12, tier: 3, efficiency: 0 });
    expect(defense.candidates.find(({ name }) => name === "罗比菈塔")).toMatchObject({ layers: 24, tier: 5, efficiency: 2 });
    expect(defense.candidates.find(({ name }) => name === "淬羽赫默")).toMatchObject({ layers: 20, tier: 4 });
    const [ursus] = analysis.stackersFor("乌萨斯", 1, "精准");
    expect(ursus.candidates.some(({ name }) => ["塔露拉", "折桠", "乌啾", "烈夏"].includes(name))).toBe(false);
  });

  it("Mon3tr 将有上限的花费叠层纳入增幅，四舍五入且不提升固定单次收益", () => {
    const operators = operatorsWith({ A: ["炎"], B: ["炎"], C: ["精准"], D: ["精准"], Mon3tr: ["精准"] });
    const trait = (upgraded) => [{ type: "持续叠加", upgraded }];
    operators.C.traits = trait("本回合每消耗3资金，使已激活的【精准】层数+2（每回合至多叠加11层）");
    operators.D.traits = trait("使已激活的【精准】层数+50");
    operators.Mon3tr.traits = trait("周围八格干员每场战斗的叠层上限+60%");
    const data = { ...version, operators };
    const [, side] = analyzeCovenantPotential(data, roster(data), [], 4).stackersFor("炎", 1, "精准");
    expect(side.candidates.find(({ name }) => name === "Mon3tr")).toMatchObject({ layers: 7, tier: 2 });
  });
});
