<template>
  <div class="ranking-tiers" role="group" aria-label="按阶位筛选">
    <button
      v-for="option in RANKING_TIERS"
      :key="option"
      type="button"
      :aria-pressed="tiers.includes(option)"
      :aria-label="`${option}阶`"
      @click="toggleTier(option)"
    >{{ option }}</button>
    <ModuleHelp label="优推干员" :text="rankingHelp" />
  </div>
  <ul v-if="bands.length > 1" class="ranking-scale" aria-label="优推分数分段">
    <li v-for="band in bands" :key="band.id" :data-score-band="band.id">
      <strong>{{ band.id }}</strong>
      <span>{{ formatBoundary(band.min) }}–{{ formatBoundary(band.max) }}</span>
    </li>
  </ul>
  <p v-else-if="bands.length" class="ranking-description">当前干员同分（{{ formatBoundary(bands[0].min) }} 分）</p>
  <ol v-if="entries.length" class="ranking-list">
    <li v-for="({ node, degree, score, progress, milestones, changesLineup, formsPair, triggersPromotion }, index) in entries" :key="node.name">
      <button
        type="button"
        :aria-pressed="node.name === selectedName"
        :data-degree="degree"
        :data-score-band="scoreBand(score)"
        draggable="true"
        aria-keyshortcuts="Alt+Enter Shift+Enter"
        @click="selectOperator($event, node.name)"
        @dragstart="dragOperator($event, node.name)"
        @dblclick="toggleTerminal(node.name)"
        @keydown.alt.enter.prevent="emit('add-target-operator', node.name)"
        @keydown.shift.enter.prevent="toggleTerminal(node.name)"
      >
        <span class="rank-position">{{ index + 1 }}</span>
        <img v-if="node.avatar" :src="node.avatar" alt="" width="30" height="30" loading="lazy" />
        <span class="rank-operator">
          <span class="rank-name">{{ node.name }}</span>
          <small v-if="node.isTerminal" class="rank-terminal">◆ 终端</small>
          <small v-if="triggersPromotion" class="rank-promotion">买入晋升 ×{{ PROMOTION_COEFFICIENT }}</small>
          <small v-else-if="formsPair" class="rank-pair">成对 ×{{ pairCoefficient }}</small>
          <small v-if="stackingEnabled && node.hasStackingTrait && stackingCoefficient !== 1"
            class="rank-stacking">持续叠加 ×{{ stackingCoefficient }}</small>
        </span>
        <span class="rank-metrics">
          <span v-if="showScores" class="weight-score">
            {{ formatRankingScore(score) }} 分
            <small v-if="weights && node.isTerminal && terminalCoefficient !== DEFAULT_TERMINAL_COEFFICIENT">终端 ×{{ terminalCoefficient }}</small>
          </span>
          <span>{{ degree }} 位关联</span>
          <small v-if="changesLineup">改变推荐阵容 ×2</small>
          <template v-else>
            <small v-if="progress.length" :title="progress.join('、')">盟约推进 {{ progress.length }} 项</small>
            <small v-if="milestones.length" :title="milestones.join('、')">触发 {{ milestones.length }} 次</small>
          </template>
        </span>
      </button>
    </li>
  </ol>
  <p v-else class="ranking-description">{{ tiers.length ? "所选阶位没有符合条件的干员。" : "当前图谱没有可排序的干员。" }}</p>
</template>

<script setup>
import { computed, onUnmounted } from "vue";
import ModuleHelp from "../components/ModuleHelp.vue";
import { startOperatorDrag } from "./operatorDrag.js";
import { DEFAULT_PAIR_COEFFICIENT, DEFAULT_STACKING_COEFFICIENT, DEFAULT_TERMINAL_COEFFICIENT, formatRankingScore, PROMOTION_COEFFICIENT, rankOperators, RANKING_TIERS } from "./covenantWeights.js";

const props = defineProps({
  graph: { type: Object, required: true },
  selectedName: { type: String, required: true },
  weights: { type: Object, default: null },
  covenantLayers: { type: Object, default: () => ({}) },
  targetCovenants: { type: Set, default: () => new Set() },
  directedCovenants: { type: Set, default: () => new Set() },
  terminalCoefficient: { type: Number, default: DEFAULT_TERMINAL_COEFFICIENT },
  pairCoefficient: { type: Number, default: DEFAULT_PAIR_COEFFICIENT },
  stackingCoefficient: { type: Number, default: DEFAULT_STACKING_COEFFICIENT },
  stackingEnabled: Boolean,
  pairNames: { type: Set, default: () => new Set() },
  promotionNames: { type: Set, default: () => new Set() },
  tiers: { type: Array, default: () => [] },
  purchaseEffects: { type: Map, default: () => new Map() },
  considerHeld: { type: Boolean, default: false },
});
const emit = defineEmits(["select", "update:tiers", "toggle-terminal", "add-target-operator"]);
const rankingHelp = computed(() => [
  "未选阶位时显示全部。单击购入，双击切换终端标签。可拖入目标阵容，或按 Alt+Enter。",
  props.weights ? "连线按盟约权重 ×（1 + 层数 ÷ 20）计分，终端干员再乘以终端系数。"
    : "同一位关联干员计 1 基础分，盟约层数另加分。",
  props.considerHeld ? "向下一人数节点推进加一次盟约分，到达节点加两次。若购入改变推荐阵容，持有加成改为基础分 ×2。" : "",
  props.considerHeld ? `买入一枚即可成对时总分 ×${props.pairCoefficient}，买入一枚即可晋升时总分 ×${PROMOTION_COEFFICIENT}。` : "",
  props.directedCovenants.size ? `定向搜索 ×2 · ${[...props.directedCovenants].join("、")}`
    : "定向搜索会将满足目标阵容已激活盟约的对应羁绊分乘以 2。",
  `开启「优先叠层」后，有持续叠加特质的干员总分 ×${props.stackingCoefficient}。`,
].filter(Boolean).join("\n"));
const showScores = computed(() => props.weights || props.considerHeld || props.targetCovenants.size || props.directedCovenants.size
  || props.graph.affinityMembers?.size || Object.values(props.covenantLayers).some((count) => count > 0)
  || (props.stackingEnabled && props.stackingCoefficient !== 1 && props.graph.nodes.some((node) => node.hasStackingTrait)));
const ranked = computed(() => rankOperators(props.graph, props.weights, props.terminalCoefficient, {
  purchaseEffects: props.purchaseEffects,
  pairNames: props.pairNames,
  pairCoefficient: props.pairCoefficient,
  stackingCoefficient: props.stackingCoefficient,
  stackingEnabled: props.stackingEnabled,
  promotionNames: props.promotionNames,
  covenantLayers: props.covenantLayers,
  targetCovenants: props.targetCovenants,
  directedCovenants: props.directedCovenants,
}));
const entries = computed(() => props.tiers.length ? ranked.value.filter(({ node }) => props.tiers.includes(node.tier)) : ranked.value);
const bands = computed(() => {
  if (!entries.value.length) return [];
  const min = entries.value.at(-1).score;
  const max = entries.value[0].score;
  if (min === max) return [{ id: "equal", min, max }];
  const span = (max - min) / 4;
  return Array.from({ length: 4 }, (_, index) => ({
    id: `T${4 - index}`,
    min: min + span * index,
    max: index === 3 ? max : min + span * (index + 1),
  })).reverse();
});
const formatBoundary = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 5 }).format;
const purchases = new Map();

function scoreBand(score) {
  return bands.value.find((band) => score >= band.min)?.id;
}

function selectOperator(event, name) {
  if (event.detail === 0) {
    emit("select", name);
  } else if (event.detail === 1) {
    // Match the operator pool's delay so a native double-click can cancel the purchase.
    const timer = setTimeout(() => {
      purchases.delete(name);
      emit("select", name);
    }, 500);
    purchases.set(name, timer);
  }
}

function toggleTerminal(name) {
  cancelPurchase(name);
  emit("toggle-terminal", name);
}

function cancelPurchase(name) {
  clearTimeout(purchases.get(name));
  purchases.delete(name);
}

function dragOperator(event, name) {
  cancelPurchase(name);
  startOperatorDrag(event, name);
}

onUnmounted(() => purchases.forEach((timer) => clearTimeout(timer)));

function toggleTier(tier) {
  emit("update:tiers", props.tiers.includes(tier)
    ? props.tiers.filter((item) => item !== tier)
    : [...props.tiers, tier]);
}
</script>

<style scoped>
.ranking-tiers { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 8px; }
.ranking-tiers button {
  min-width: 27px;
  padding: 3px 6px;
  border: 1px solid #3b4959;
  border-radius: 5px;
  background: #222d3a;
  color: #edf2f7;
  font-size: 12px;
  cursor: pointer;
}
.ranking-tiers button:hover { background: #304153; }
.ranking-tiers button[aria-pressed="true"] { background: #a8ebda; border-color: #a8ebda; color: #11241f; }
.ranking-description { margin: 0 0 8px; color: #abb9c9; font-size: 12px; }
.ranking-scale { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; margin: 0 0 8px; padding: 0; list-style: none; }
.ranking-scale li { display: grid; gap: 2px; padding: 3px 4px; border-top: 3px solid var(--score-color); border-radius: 4px; background: #222d3a; font-size: 11px; text-align: center; }
.ranking-scale strong { color: var(--score-color); }
.ranking-scale span { color: #d2dce6; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
[data-score-band="T1"] { --score-color: #f3c674; }
[data-score-band="T2"] { --score-color: #c2a4f2; }
[data-score-band="T3"] { --score-color: #79bce8; }
[data-score-band="T4"] { --score-color: #92a7be; }
.ranking-list {
  list-style: none;
  margin: 0;
  padding: 0 4px 0 0;
}
.ranking-list li + li { margin-top: 4px; }
.ranking-list button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 7px;
  border: 1px solid #334151;
  border-radius: 7px;
  background: #222d3a;
  color: #edf2f7;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.ranking-list button:hover { background: #304153; }
.ranking-list button[aria-pressed="true"] { border-color: #a8ebda; background: #2c4747; }
.ranking-list button[data-score-band] { border-left: 4px solid var(--score-color, #334151); }
.ranking-list img { border-radius: 5px; object-fit: cover; }
.rank-position { min-width: 2ch; color: #abb9c9; font-variant-numeric: tabular-nums; }
.rank-operator { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; flex: 1; min-width: 0; }
.rank-name { overflow-wrap: anywhere; min-width: 0; }
.rank-terminal { color: #ffe2ab; font-size: 10px; white-space: nowrap; }
.rank-pair, .rank-promotion, .rank-stacking { font-size: 10px; white-space: nowrap; }
.rank-pair { color: #bde9de; }
.rank-promotion { color: #ffe2ab; }
.rank-stacking { color: #c1d7ff; }
.rank-metrics { display: grid; gap: 2px; justify-items: end; color: #a8ebda; white-space: nowrap; font-variant-numeric: tabular-nums; }
.weight-score { color: #ffe3ad; font-weight: 600; }
.weight-score small { margin-left: 3px; color: #c5d2df; font-size: 10px; font-weight: 400; }
</style>
