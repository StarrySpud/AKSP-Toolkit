<template>
  <section class="potential-panel" aria-labelledby="potential-title">
    <header class="potential-heading">
      <h2 id="potential-title">盟约适配分析</h2>
      <span>招募池 {{ analysis.poolSize }} 位 · 上场上限 {{ analysis.limit }} 位</span>
      <ModuleHelp label="盟约适配分析" :text="helpText" />
    </header>
    <p v-if="!analysis.cores.length" role="status">当前没有未被 Ban 的核心盟约。</p>
    <template v-else>
      <div class="core-options" role="group" aria-label="选择分析的核心盟约">
        <button v-for="core in analysis.cores" :key="core.name" type="button"
          :aria-pressed="report.name === core.name" @click="selectedCore = core.name">
          <strong>{{ core.name }}</strong>
          <span>{{ core.count }} 位 · {{ coreSummary(core) }}</span>
        </button>
      </div>

      <section class="potential-section" aria-labelledby="core-potential-title">
        <h3 id="core-potential-title">{{ report.name }}的成阵潜力</h3>
        <ul v-if="report.levels.length" class="core-levels">
          <li v-for="(level, index) in report.levels" :key="level.threshold" :class="{ feasible: level.canActivate }">
            <strong>Lv.{{ index + 1 }} · {{ level.threshold }} 人门槛</strong>
            <CovenantFunctionTags :tags="tagsFor(report.name, index + 1)" />
            <span>{{ levelText(level) }}</span>
          </li>
        </ul>
        <p v-else>当前数据未记录核心盟约的人数门槛。</p>
      </section>

      <section class="potential-section" aria-labelledby="function-coverage-title">
        <h3 id="function-coverage-title">功能覆盖</h3>
        <div class="function-coverage">
          <div v-for="category in coverage" :key="category.id">
            <span>{{ category.label }} <strong>{{ category.count }}</strong></span>
            <progress :max="coverageTotal || 1" :value="category.count" :aria-label="`${category.label}盟约数`"></progress>
          </div>
        </div>
        <p class="potential-note">核心各级分别统计，附加盟约按能否与一级核心同阵统计。主类和次类均计入。</p>
      </section>

      <section class="potential-section" aria-labelledby="additional-potential-title">
        <h3 id="additional-potential-title">附加盟约适配</h3>
        <div class="potential-scroll"><table>
          <thead><tr>
            <th scope="col">附加盟约</th><th scope="col">本系 / 全池干员</th><th scope="col">激活门槛</th>
            <th scope="col">与核心同阵</th><th scope="col">功能类别</th>
          </tr></thead>
          <tbody>
            <tr v-for="side in sortedSides" :key="side.name">
              <th scope="row">{{ side.name }}<small v-if="side.fromHolding">整备区也可计入</small></th>
              <td>{{ side.coreCount }} / {{ side.poolCount }}</td>
              <td>{{ side.threshold ?? "暂无数据" }}</td>
              <td :class="{ feasible: side.canActivate }">{{ side.unknown ? "待确认条件" : levelText(side) }}</td>
              <td>
                <CovenantFunctionTags :tags="tagsFor(side.name)" />
              </td>
            </tr>
            <tr v-if="!sortedSides.length"><td colspan="5">当前没有可分析的附加盟约。</td></tr>
          </tbody>
        </table></div>
      </section>

      <section class="potential-section" aria-labelledby="joint-potential-title">
        <h3 id="joint-potential-title">两条附加盟约能否同时激活</h3>
        <p class="potential-note">每个配对都要求 {{ report.name }} 同时激活。数字是三条盟约同时激活所需的最少上场人数。</p>
        <div v-if="report.pairs.length" class="potential-scroll" tabindex="0" role="region" aria-labelledby="joint-potential-title">
          <table class="joint-matrix">
            <thead><tr>
              <th scope="col">附加盟约</th>
              <th v-for="side in compatible" :key="side.name" scope="col">{{ side.name }}</th>
            </tr></thead>
            <tbody><tr v-for="(left, row) in compatible" :key="left.name">
              <th scope="row">{{ left.name }}</th>
              <td v-for="(right, column) in compatible" :key="right.name"
                :class="{ feasible: pairFor(left.name, right.name)?.canActivate }">
                <span v-if="column <= row">·</span>
                <span v-else-if="pairFor(left.name, right.name)?.canActivate"
                  :title="levelText(pairFor(left.name, right.name))">{{ pairFor(left.name, right.name).minSlots }}{{ pairFor(left.name, right.name).full ? "" : "*" }}</span>
                <span v-else>不可</span>
              </td>
            </tr></tbody>
          </table>
        </div>
        <p v-else class="potential-note">可同阵激活的附加盟约不足两条。</p>
        <p v-if="report.pairs.some((pair) => pair.canActivate && !pair.full)" class="potential-note">* 可激活，但补到上场上限后无法维持该组合。</p>
      </section>
    </template>
    <p class="potential-note">按不同干员和上场人数估算。{{ analysis.ignoredCount ? `未计入 ${analysis.ignoredCount} 个没有阶位的条目。` : "" }}未模拟抽取、晋升、层数、装备和整备区容量。</p>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import ModuleHelp from "../components/ModuleHelp.vue";
import CovenantFunctionTags from "./CovenantFunctionTags.vue";
import { getCovenantFunctions, summarizeCovenantFunctions } from "./covenantFunctions.js";

const props = defineProps({
  version: { type: Object, required: true },
  analysis: { type: Object, required: true },
  overrides: { type: Object, default: () => ({}) },
});

const helpText = [
  "本系干员数统计招募池中同时拥有该核心和附加盟约的不同干员；同阵验证允许其他核心的干员补位。",
  "查看未 Ban 的盟约。Ban 影响招募池，实际阵容的已持有干员仍可激活盟约。",
  "复用人数门槛与调和加成；独行需要恰好一名。远见、奇迹、投资人可从全池凑人数，不必为其另留上场位。",
  "功能覆盖按单条盟约统计。同阵表逐对验证，不能推断三个或更多附加盟约也能一起激活。",
].join("\n");

const tagsFor = (name, level) => getCovenantFunctions(props.version.id, name, level, props.overrides);
const selectedCore = ref("");
const report = computed(() => props.analysis.cores.find(({ name }) => name === selectedCore.value) ?? props.analysis.cores[0]);
const sortedSides = computed(() => [...(report.value?.sides ?? [])].sort((left, right) =>
  Number(right.full) - Number(left.full) || Number(right.canActivate) - Number(left.canActivate)
  || right.coreCount - left.coreCount || right.poolCount - left.poolCount));
const compatible = computed(() => sortedSides.value.filter(({ canActivate }) => canActivate));
const pairKey = (left, right) => JSON.stringify([left, right].sort());
const pairs = computed(() => new Map((report.value?.pairs ?? []).map((pair) => [pairKey(...pair.names), pair])));
const pairFor = (left, right) => pairs.value.get(pairKey(left, right));
const coverageNames = computed(() => [
  ...(report.value?.levels ?? []).flatMap((level, index) =>
    level.canActivate ? [{ name: report.value.name, level: index + 1 }] : []),
  ...compatible.value.map(({ name }) => name),
]);
const coverageTotal = computed(() => coverageNames.value.length);
const coverage = computed(() => summarizeCovenantFunctions(props.version.id, coverageNames.value, props.overrides));

function coreSummary(core) {
  if (!core.levels.length) return "缺门槛";
  const fullLevel = core.levels.findLastIndex(({ full }) => full) + 1;
  if (fullLevel) return `满编 Lv.${fullLevel}`;
  return core.levels[0].canActivate ? "未满编可激活" : "未达门槛";
}

function levelText({ canActivate, full, minSlots }) {
  if (!canActivate) return "上限内不可激活";
  return `至少 ${minSlots} 人 · ${full ? "可满编" : "未满编可激活"}`;
}
</script>

<style scoped>
.potential-panel { min-height: 0; min-width: 0; overflow: auto; padding: 4px 0 14px; }
.potential-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-bottom: 10px; }
.potential-heading span, .core-options span, .core-levels span, .potential-note, small { color: #abb9c9; font-size: 12px; }
h2, h3, p { margin: 0; }
h2 { font-size: 18px; }
h3 { margin-bottom: 8px; font-size: 14px; }
.core-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 114px), 1fr)); gap: 6px; }
.core-options button { display: grid; justify-items: start; gap: 4px; padding: 7px 9px; background: #181f28; color: #edf2f7; border: 1px solid #3b4959; border-radius: 8px; cursor: pointer; text-align: left; }
.core-options button:hover, .core-options button[aria-pressed="true"] { border-color: #8acfc1; background: #243b40; }
.potential-section { min-width: 0; margin-top: 10px; padding: 10px; border: 1px solid #303943; border-radius: 8px; background: #181f28; }
.potential-note { margin-top: 6px; }
.core-levels { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 0; list-style: none; }
.core-levels li { display: grid; gap: 3px; padding: 5px 8px; border-radius: 6px; background: #222d3a; font-size: 13px; }
.function-coverage { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 112px), 1fr)); gap: 8px; }
.function-coverage div { display: grid; gap: 4px; font-size: 13px; }
progress { width: 100%; height: 7px; accent-color: #8acfc1; }
.potential-scroll { overflow-x: auto; margin-top: 6px; }
table { width: 100%; border-collapse: collapse; color: #dce6f0; font-size: 12px; text-align: left; }
th, td { padding: 5px 7px; border-bottom: 1px solid #303943; white-space: nowrap; }
thead th { color: #abb9c9; }
th small { display: block; font-weight: normal; }
.joint-matrix td, .joint-matrix thead th:not(:first-child) { min-width: 2.9em; text-align: center; }
.feasible { color: #a8ebda; }
.joint-matrix td.feasible { background: #253d40; font-weight: 600; }
</style>
