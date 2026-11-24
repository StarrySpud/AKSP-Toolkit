<template>
  <section class="potential-map" aria-labelledby="potential-map-title">
    <header class="map-heading">
      <h2 id="potential-map-title">盟约适配可视化</h2>
      <span>招募池 {{ analysis.poolSize }} 位 · 上场上限 {{ analysis.limit }} 位</span>
    </header>
    <p v-if="!ranked.length" role="status">当前没有未被 Ban 的核心盟约。</p>
    <template v-else>
      <section class="map-section" aria-labelledby="breadth-title">
        <h3 id="breadth-title">核心盟约选择空间</h3>
        <p class="note">先比可满编搭配数，再比满编配对数。数量相同时，激活单条搭配平均所需的上场位越少，排名越高。</p>
        <ol class="breadth-list">
          <li v-for="{ core, rank, fullSides, fullPairs, slots } in ranked" :key="core.name" :class="{ leading: rank === 1 && fullSides > 0 }">
            <div class="breadth-label">
              <strong><span class="rank-number">{{ rank }}</span><CovenantFunctionFrame :tags="tagsFor(core.name)" v-on="covenantTooltipHandlers(core.name)">{{ core.name }}</CovenantFunctionFrame></strong>
              <strong>{{ fullSides }} 条</strong>
            </div>
            <progress :value="fullSides" :max="columns.length || 1" :aria-label="`${core.name}可满编搭配数`"></progress>
            <span class="note">{{ fullPairs }} 组满编配对 · {{ core.count }} 位本系干员</span>
            <span v-if="fullSides" class="note">单条搭配平均需 {{ (slots / fullSides).toFixed(2) }} 个上场位</span>
          </li>
        </ol>
      </section>
      <section class="map-section" aria-labelledby="heatmap-title">
        <h3 id="heatmap-title">核心 × 附加盟约搭配热力图</h3>
        <div class="level-picker" role="group" aria-label="盟约搭配策略">
          <button type="button" :aria-pressed="view === 'base'" @click="view = 'base'">核心一级</button>
          <button type="button" :aria-pressed="advancedView" @click="view = 'advanced'">核心进阶优先级</button>
          <button type="button" :aria-pressed="view === 'multi'" @click="view = 'multi'">多核心盟约</button>
        </div>
        <template v-if="view === 'multi'">
          <p class="note">按一级门槛计算最多能同时激活的核心种类。移除某位干员后，同组盟约无法在上限内同时成立时，该干员为不可替换。</p>
          <p v-if="!multiCoreRows.length" class="note">当前卡池无法在上限内激活核心盟约。</p>
          <template v-else>
            <h4>最多同时激活 {{ multiCoreRows[0].names.length }} 种核心盟约 · {{ multiCoreRows.length }} 种搭配</h4>
            <ul class="multi-core-list">
              <li v-for="row in multiCoreRows" :key="row.names.join(',')">
                <div><CovenantFunctionFrame v-for="name in row.names" :key="name" :tags="tagsFor(name)" v-on="covenantTooltipHandlers(name, 1)">{{ name }}</CovenantFunctionFrame></div>
                <span class="note">最少上场 {{ row.minSlots }} 位 · {{ row.full ? '可满编' : '暂不可满编' }}</span>
                <p>不可替换干员 <strong>{{ row.indispensable.join('、') || '无' }}</strong></p>
              </li>
            </ul>
          </template>
        </template>
        <template v-else>
        <p class="note">数字为同时激活两条盟约所需的最少上场人数。可用其他核心的干员补位。</p>
        <p v-if="advancedView" class="note">可达成的进阶优先，主要类别依次为攻击、经营、生存。</p>
        <div class="category-legend" aria-label="盟约功能类别">
          <CovenantFunctionFrame v-for="{ id, label } in COVENANT_FUNCTIONS" :key="id" :tags="[id]">{{ label }}</CovenantFunctionFrame>
          <span class="note">从内到外是主要类别和次要类别。</span>
        </div>
        <ul class="map-legend" aria-label="热力图图例">
          <li v-for="(state, key) in statuses" :key="key" :data-state="key">{{ state.label }}</li>
        </ul>
        <div v-if="selectedPair" class="pair-detail" aria-live="polite">
          <header>
          <strong>
            <CovenantFunctionFrame :tags="selectedPair.row.tags" v-on="covenantTooltipHandlers(selectedPair.row.name, selectedPair.row.level)">{{ selectedPair.row.name }} Lv.{{ selectedPair.row.level }}</CovenantFunctionFrame>
            × <CovenantFunctionFrame :tags="tagsFor(selectedPair.side.name)" v-on="covenantTooltipHandlers(selectedPair.side.name)">{{ selectedPair.side.name }}</CovenantFunctionFrame>
          </strong>
          <span>{{ statuses[statusOf(selectedPair.side)].label }}</span>
          <span v-if="selectedPair.side.fromHolding">整备区也可计入，符合条件的干员无需占用上场位</span>
          </header>
          <template v-if="selectedPair.side.canActivate">
            <h4>最佳叠层手</h4>
            <p class="note">按性价比排序（叠层等级 − 解锁所需商店等级）。晋升后每 5 层一级，特殊叠层评级以同盟约常规最高级为上限。</p>
            <div class="stacker-groups">
              <section v-for="{ target, candidates } in stackers" :key="target">
                <strong>{{ target }}</strong>
                <p v-if="!candidates.length" class="note">{{ target === HARMONY_COVENANT ? '调和无法叠层。' : '当前搭配暂无可用的叠层手。' }}</p>
                <ol v-else class="stacker-list">
                  <li v-for="candidate in candidates.slice(0, 5)" :key="candidate.name" :title="stackerTooltip(candidate)">
                    <span>{{ candidate.name }}<small v-if="candidate.support"> · 特殊</small><small v-if="candidate.reserve"> · 整备区可用</small></span>
                    <span v-if="candidate.tier" class="stacker-tier">{{ stackerRating(candidate) }}</span>
                    <span v-else class="note">{{ candidate.layers ? `${candidate.layers} 层 · 待评级` : '上限待确认' }}</span>
                    <small v-if="candidate.efficiency !== null" class="stacker-efficiency">{{ efficiencyLabel(candidate) }}</small>
                  </li>
                </ol>
                <details v-if="candidates.length > 5">
                  <summary class="note">其余 {{ candidates.length - 5 }} 位叠层手</summary>
                  <ol class="stacker-list" start="6"><li v-for="candidate in candidates.slice(5)" :key="candidate.name" :title="stackerTooltip(candidate)">
                    <span>{{ candidate.name }}<small v-if="candidate.support"> · 特殊</small></span>
                    <span v-if="candidate.tier">{{ stackerRating(candidate) }}</span>
                    <span v-else class="note">上限待确认</span>
                    <small v-if="candidate.efficiency !== null" class="stacker-efficiency">{{ efficiencyLabel(candidate) }}</small>
                  </li></ol>
                </details>
              </section>
            </div>
          </template>
        </div>
        <div v-if="columns.length && heatmapRows.length" class="map-scroll" tabindex="0" role="region" aria-labelledby="heatmap-title">
          <table>
            <thead><tr>
              <th scope="col">核心盟约</th>
              <th v-for="{ name } in columns" :key="name" scope="col">
                <CovenantFunctionFrame :tags="tagsFor(name)" v-on="covenantTooltipHandlers(name)">{{ name }}</CovenantFunctionFrame>
              </th>
            </tr></thead>
            <tbody><tr v-for="row in heatmapRows" :key="`${row.name}-${row.level}`">
              <th scope="row">
                <CovenantFunctionFrame :tags="row.tags" v-on="covenantTooltipHandlers(row.name, row.level)">{{ row.name }}<template v-if="advancedView"> Lv.{{ row.level }}</template></CovenantFunctionFrame>
              </th>
              <td v-for="side in row.sides" :key="side.name">
                <button type="button" class="heatmap-cell" :data-state="statusOf(side)"
                  :aria-pressed="selectedPair?.row === row && selectedPair.side.name === side.name"
                  :aria-label="`${row.name}${advancedView ? ` Lv.${row.level}` : ''}与${side.name}，${statuses[statusOf(side)].label}${side.canActivate ? `，至少${side.minSlots}人` : ''}`"
                  @click="selection = { core: row.name, level: row.level, side: side.name }">
                  {{ side.minSlots ?? statuses[statusOf(side)].symbol }}
                </button>
              </td>
            </tr></tbody>
          </table>
        </div>
        <p v-else class="note">{{ columns.length ? "当前核心没有可分析的进阶门槛。" : "当前没有未被 Ban 的附加盟约。" }}</p>
        </template>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import { HARMONY_COVENANT } from "../composables/useCovenantStats.js";
import { covenantTooltipHandlers } from "../composables/useCovenantTooltip.js";
import CovenantFunctionFrame from "./CovenantFunctionFrame.vue";
import { additionalCovenantSortRank, COVENANT_FUNCTIONS, getCovenantFunctions } from "./covenantFunctions.js";

const props = defineProps({
  analysis: { type: Object, required: true },
  versionId: String,
  overrides: { type: Object, default: () => ({}) },
});
const view = ref("base");
const advancedView = computed(() => view.value === "advanced");
const multiCoreRows = computed(() => view.value === "multi" ? props.analysis.multiCore() : []);
const selection = ref(null);
const tagsFor = (name, level) => getCovenantFunctions(props.versionId, name, level, props.overrides);
const functionOrder = new Map(COVENANT_FUNCTIONS.map(({ id }, index) => [id, index]));
const statuses = {
  full: { label: "可满编", symbol: "" },
  partial: { label: "仅未满编可激活", symbol: "" },
  blocked: { label: "上限内不可激活", symbol: "—" },
  unknown: { label: "待确认条件", symbol: "?" },
};
const statusOf = (side) => side.unknown ? "unknown" : side.full ? "full" : side.canActivate ? "partial" : "blocked";
const stackerRating = ({ tier, layers, support, period }) => support
  ? `${tier} 级 · 最优额外 +${layers} 层` : `${tier} 级 · ${layers} 层 / ${period}`;
const stackerTooltip = ({ text, detail }) => [text, detail].filter(Boolean).join("\n");
const efficiencyLabel = ({ efficiency, shopLevel }) => `性价比 ${efficiency > 0 ? '+' : ''}${efficiency} · 商店 ${shopLevel} 级`;
const orderedSides = (sides) => [...sides].sort((left, right) =>
  additionalCovenantSortRank(tagsFor(left.name)) - additionalCovenantSortRank(tagsFor(right.name)));
const columns = computed(() => orderedSides(props.analysis.cores[0]?.sides ?? []));
const ranked = computed(() => {
  const compare = (a, b) => b.fullSides - a.fullSides || b.fullPairs - a.fullPairs || a.slots - b.slots;
  const rows = props.analysis.cores.map((core) => {
    const fullSides = core.sides.filter(({ full }) => full);
    return {
      core,
      fullSides: fullSides.length,
      fullPairs: core.pairs.filter(({ full }) => full).length,
      slots: fullSides.reduce((sum, side) => sum + side.minSlots, 0),
    };
  }).sort(compare);
  let rank = 0;
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (!previous || compare(previous, row)) rank = index + 1;
    return { ...row, rank };
  });
});
const heatmapRows = computed(() => {
  if (!advancedView.value) {
    return ranked.value.map(({ core }) => ({ name: core.name, level: 1, tags: tagsFor(core.name), sides: orderedSides(core.sides) }));
  }
  return ranked.value.flatMap(({ core }) => core.advanced.map((entry) => ({
    ...entry, name: core.name, tags: tagsFor(core.name, entry.level), sides: orderedSides(entry.sides),
  }))).sort((left, right) => Number(right.canActivate) - Number(left.canActivate)
    || (functionOrder.get(left.tags[0]) ?? functionOrder.size) - (functionOrder.get(right.tags[0]) ?? functionOrder.size));
});
const selectedPair = computed(() => {
  const row = heatmapRows.value.find(({ name, level }) => name === selection.value?.core && level === selection.value.level);
  const side = row?.sides.find(({ name }) => name === selection.value?.side);
  return side ? { row, side } : null;
});
const stackers = computed(() => {
  const pair = selectedPair.value;
  return pair?.side.canActivate ? props.analysis.stackersFor(pair.row.name, pair.row.level, pair.side.name) : [];
});
</script>

<style scoped>
.potential-map { min-width: 0; min-height: 0; overflow: auto; padding: 4px 0 14px; }
.map-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
h2, h3, p { margin: 0; }
h2 { font-size: 18px; }
h3 { font-size: 14px; }
.map-heading span, .note { color: #abb9c9; font-size: 12px; }
.map-section { min-width: 0; margin-top: 10px; padding: 10px; border: 1px solid #303943; border-radius: 8px; background: #181f28; }
.map-section > .note { margin-top: 4px; }
.level-picker, .category-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 6px; }
.level-picker button { padding: 3px 7px; border: 1px solid #475465; border-radius: 5px; background: #222c38; color: #e1ebf5; font-size: 12px; cursor: pointer; }
.level-picker button[aria-pressed="true"] { border-color: #8acfc1; background: #284a48; }
.breadth-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 178px), 1fr)); gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.breadth-list li { display: grid; gap: 4px; padding: 6px 8px; border: 1px solid #303e4d; border-radius: 6px; background: #1d2733; }
.breadth-list .leading { border-color: #79b8ad; background: #253b40; }
.breadth-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; }
.rank-number { margin-right: 3px; color: #a8ebda; font-variant-numeric: tabular-nums; }
.category-legend { font-size: 12px; }
progress { width: 100%; height: 6px; accent-color: #8acfc1; }
.map-legend { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 0; padding: 0; list-style: none; }
.map-legend li, .heatmap-cell { padding: 3px 6px; border: 1px solid #384758; border-radius: 5px; background: var(--cell-bg, #222c38); color: var(--cell-text, #bcc9d6); font-size: 12px; }
[data-state="full"] { --cell-bg: #284a48; --cell-text: #bef9e8; }
[data-state="partial"] { --cell-bg: #493a2d; --cell-text: #ffe1aa; }
[data-state="unknown"] { --cell-bg: #3d354b; --cell-text: #e1d5f5; }
.pair-detail { margin-top: 8px; font-size: 12px; color: #c3d1df; }
.pair-detail header { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 12px; }
.pair-detail strong { color: #edf2f7; }
h4 { margin: 6px 0 4px; }
.stacker-groups, .multi-core-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 225px), 1fr)); gap: 5px; margin: 6px 0 0; padding: 0; }
.stacker-groups section, .multi-core-list > li { padding: 7px; border: 1px solid #303e4d; border-radius: 6px; background: #1d2733; }
.stacker-list { padding-left: 17px; margin: 4px 0; }
.stacker-list li { padding: 2px 0; }
.stacker-list li > span:last-child { margin-left: 8px; }
.stacker-list small { color: #abb9c9; }
.stacker-list .stacker-efficiency { margin-left: 8px; white-space: nowrap; }
.stacker-tier { color: #a8ebda; }
.multi-core-list { list-style: none; font-size: 12px; }
.multi-core-list p { margin-top: 4px; }
.map-scroll { margin-top: 7px; overflow-x: auto; }
table { width: 100%; border-spacing: 3px; font-size: 12px; white-space: nowrap; }
th { padding: 2px 4px; text-align: center; }
th:first-child { position: sticky; left: 0; z-index: 1; background: #181f28; text-align: left; }
.heatmap-cell { display: block; width: 100%; min-width: 33px; cursor: pointer; font-variant-numeric: tabular-nums; }
.heatmap-cell:hover, .heatmap-cell[aria-pressed="true"] { border-color: #a8ebda; }
.heatmap-cell:focus-visible { outline-offset: 1px; outline: 2px solid #a8ebda; }
</style>
