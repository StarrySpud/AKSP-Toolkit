<template>
  <section class="scoring-settings" aria-labelledby="scoring-settings-title">
    <header class="section-heading">
      <h2 id="scoring-settings-title">评分设置</h2>
      <ModuleHelp label="评分设置" :text="helpText" />
    </header>

    <section class="scoring-section" aria-labelledby="multipliers-title">
      <h3 id="multipliers-title">评分倍率</h3>
      <div class="coefficient-grid">
        <label v-for="field in coefficients" :key="field.key" class="coefficient" :class="`${field.key}-coefficient`">
          <span>{{ field.label }}</span>
          <span class="multiplier-input"><span aria-hidden="true">×</span>
            <input type="number" :aria-label="field.label" :min="field.min" step="0.01" :value="field.value"
              @change="changeCoefficient($event, field)" />
          </span>
        </label>
      </div>
    </section>

    <section class="scoring-section" aria-labelledby="lineup-scoring-title">
      <h3 id="lineup-scoring-title">阵容阶位基础分</h3>
      <div class="tier-scores">
        <label v-for="(tier, index) in RANKING_TIERS" :key="tier">
          <span>{{ tier }}阶</span>
          <input type="number" :aria-label="`${tier}阶基础分`" min="0" step="0.01"
            :value="tierBasePoints[index]" @change="changeTierPoints($event, index)" />
        </label>
      </div>
    </section>

    <section class="scoring-section" aria-labelledby="scoring-covenants-title">
      <h3 id="scoring-covenants-title">盟约基准分</h3>
      <div class="covenant-grids">
        <section v-for="group in covenantGroups" :key="group.id" class="covenant-weight-group">
          <h4>{{ group.title }}</h4>
          <p v-if="group.id === CORE_GROUP" id="core-weight-rule" class="weight-rule">
            一级固定 {{ CORE_COVENANT_BASE_WEIGHT }} 分，滑杆调节二级及以上的额外倍率。
          </p>
          <div class="weight-grid">
            <div class="ruler" aria-hidden="true">
              <span v-for="tick in group.ticks" :key="tick">{{ tick.toFixed(1) }}</span>
            </div>
            <label v-for="entry in group.entries" :key="entry.name" class="weight-row">
              <span class="weight-tag" :class="{ core: group.id === CORE_GROUP }">
                <img :src="getIconUrl(entry.name)" alt="" width="18" height="18" loading="lazy" />{{ entry.name }}
              </span>
              <input type="range" :aria-label="`${entry.name}${group.id === CORE_GROUP ? '二级倍率' : '基准分'}`"
                :aria-describedby="group.id === CORE_GROUP ? 'core-weight-rule' : undefined" :min="group.min"
                :max="group.max" :step="WEIGHT_STEP" :value="entry.weight"
                :style="{ '--weight-position': `${(entry.weight - group.min) / (group.max - group.min) * 100}%` }"
                @input="emit('change', entry.name, $event.target.valueAsNumber)" />
              <output>{{ entry.weight.toFixed(1) }}</output>
            </label>
          </div>
        </section>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed } from "vue";
import ModuleHelp from "../components/ModuleHelp.vue";
import { ADDITIONAL_GROUP, CORE_GROUP, getCovenantsByGroup } from "../data/versions.js";
import { getIconUrl } from "../utils/index.js";
import {
  CORE_COVENANT_BASE_WEIGHT, getCovenantWeightMax, getCovenantWeightMin, normalizeCovenantWeight,
  normalizeHeldLineupChangeCoefficient, normalizePairCoefficient,
  normalizeStackableCovenantCoefficient, normalizeStackingCoefficient, normalizeTerminalCoefficient, RANKING_TIERS, WEIGHT_STEP,
} from "./covenantWeights.js";
import { normalizeTierBasePoints } from "./lineupScoring.js";

const props = defineProps({
  version: { type: Object, required: true },
  weights: { type: Object, required: true },
  terminalCoefficient: { type: Number, required: true },
  pairCoefficient: { type: Number, required: true },
  heldLineupChangeCoefficient: { type: Number, required: true },
  stackingCoefficient: { type: Number, required: true },
  stackableCovenantCoefficient: { type: Number, required: true },
  tierBasePoints: { type: Array, required: true },
});
const emit = defineEmits([
  "change", "change-terminal-coefficient", "change-pair-coefficient", "change-stacking-coefficient",
  "change-held-lineup-change-coefficient", "change-stackable-covenant-coefficient", "change-tier-base-points",
]);
const helpText = [
  "终端干员系数在优推开启权重时生效。成对干员系数在开启考虑持有时生效。",
  "开启「考虑持有」后，若购入干员会改变推荐阵容，优推基础分乘以考虑持有倍率，替代人数节点加分。",
  "开启「优先叠层」后，叠层干员评分倍率用于优推干员总分及推荐阵容的棋子分。",
  "推荐阵容中的已激活盟约若可由上场干员叠层，其盟约分在优推中再乘以可叠层盟约评分倍率。",
  "盟约基准分用于阵容计分，也用于开启权重后的优推排序。",
].join("\n");
const coefficients = computed(() => [
  { key: "terminal", label: "终端干员系数", min: 0, value: props.terminalCoefficient, normalize: normalizeTerminalCoefficient },
  { key: "pair", label: "成对干员系数", min: 1, value: props.pairCoefficient, normalize: normalizePairCoefficient },
  { key: "held-lineup-change", label: "考虑持有倍率", min: 1, value: props.heldLineupChangeCoefficient, normalize: normalizeHeldLineupChangeCoefficient },
  { key: "stacking", label: "叠层干员评分倍率", min: 1, value: props.stackingCoefficient, normalize: normalizeStackingCoefficient },
  { key: "stackable-covenant", label: "可叠层盟约评分倍率", min: 1, value: props.stackableCovenantCoefficient, normalize: normalizeStackableCovenantCoefficient },
]);
const covenantGroups = computed(() => [
  { id: CORE_GROUP, title: "核心盟约" }, { id: ADDITIONAL_GROUP, title: "附加盟约" },
].map((group) => {
  const min = getCovenantWeightMin(group.id);
  const max = getCovenantWeightMax(group.id);
  return {
    ...group, min, max,
    ticks: Array.from({ length: (max - min) * 2 + 1 }, (_, index) => min + index / 2),
    entries: getCovenantsByGroup(props.version, group.id)
      .map((name) => ({ name, weight: normalizeCovenantWeight(props.weights[name], group.id) })),
  };
}));

function changeCoefficient(event, field) {
  const input = event.target;
  const value = input.valueAsNumber;
  const coefficient = Number.isFinite(value) && value >= field.min ? field.normalize(value) : field.value;
  input.value = String(coefficient);
  if (coefficient !== field.value) emit(`change-${field.key}-coefficient`, coefficient);
}

function changeTierPoints(event, index) {
  const input = event.target;
  const value = input.valueAsNumber;
  const points = [...props.tierBasePoints];
  if (Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100))) {
    points[index] = value;
  }
  const normalized = normalizeTierBasePoints(points);
  input.value = String(normalized[index]);
  if (normalized[index] !== props.tierBasePoints[index]) emit("change-tier-base-points", normalized);
}
</script>

<style scoped>
.scoring-settings { padding: 14px 16px 18px; border: 1px solid #303943; border-radius: 10px; background: #181f28; text-align: left; }
.section-heading { display: flex; align-items: center; gap: 6px; }
h2, h3, h4 { margin: 0; }
h2 { font-size: 17px; }
h3 { margin-bottom: 8px; font-size: 14px; }
h4 { margin-bottom: 9px; color: #c5d2df; font-size: 13px; }
.scoring-section { margin-top: 14px; }
.coefficient-grid, .covenant-grids { display: grid; gap: 8px; }
.coefficient-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 228px), 1fr)); }
.covenant-grids { grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); align-items: start; }
.coefficient, .covenant-weight-group { min-width: 0; padding: 8px 10px; border: 1px solid #374456; border-radius: 7px; background: #1d2733; }
.coefficient { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #edf2f7; font-size: 13px; }
.multiplier-input { display: inline-flex; align-items: center; gap: 4px; color: #a8ebda; }
.multiplier-input input, .tier-scores input { width: 76px; padding: 4px 6px; border: 1px solid #526175; border-radius: 5px; background: #151d27; color: #edf2f7; font-variant-numeric: tabular-nums; }
.tier-scores { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; font-size: 12px; }
.tier-scores label { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 5px; background: #1d2733; color: #c5d2df; }
.tier-scores input { width: 60px; }
.weight-grid { display: grid; grid-template-columns: max-content minmax(0, 1fr) 3ch; align-items: center; gap: 4px 9px; }
.weight-row { display: contents; }
.weight-rule { margin: 0 0 8px; color: #c5d2df; font-size: 12px; }
.ruler { grid-column: 2; display: flex; justify-content: space-between; margin-inline: 7px; border-bottom: 1px solid #526175; color: #c5d2df; font-size: 11px; font-variant-numeric: tabular-nums; }
.ruler span { position: relative; width: 0; display: flex; justify-content: center; padding-bottom: 4px; }
.ruler span::after { position: absolute; bottom: 0; width: 1px; height: 3px; background: currentColor; content: ""; }
.weight-tag { grid-column: 1; display: inline-flex; align-items: center; justify-self: start; gap: 5px; padding: 2px 5px; border-radius: 5px; background: #263c55; color: #d3e8ff; font-size: 12px; white-space: nowrap; }
.weight-tag.core { background: #484032; color: #ffe3ad; }
.weight-tag img { object-fit: contain; }
.weight-row input { grid-column: 2; appearance: none; width: 100%; height: 22px; margin: 0; background: linear-gradient(to right, #8dcfc1 var(--weight-position), #435165 var(--weight-position)) center / calc(100% - 14px) 3px no-repeat; cursor: pointer; }
.weight-row input::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border: 2px solid #17212b; border-radius: 50%; background: #bbf0e4; }
.weight-row input::-moz-range-thumb { width: 11px; height: 11px; border: 2px solid #17212b; border-radius: 50%; background: #bbf0e4; }
output { grid-column: 3; color: #edf2f7; font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }
</style>
