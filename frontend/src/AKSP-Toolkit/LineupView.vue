<template>
  <section class="lineup-view" :aria-labelledby="$slots.title ? undefined : titleId" :aria-label="$slots.title ? title : undefined"
    @dragover="editable && allowOperatorDrop($event, lineup.length < limit)"
    @drop="editable && dropOperator($event, (name) => emit('add', name), lineup.length < limit)">
    <header class="lineup-header">
      <div class="lineup-title">
        <h3 :id="titleId"><slot name="title">{{ title }}</slot> <small>{{ lineup.length }}/{{ limit }}</small></h3>
        <ModuleHelp :label="title" :text="helpText" />
      </div>
      <div class="lineup-actions">
        <slot name="switch" />
        <label v-if="!fixed">上场上限
          <input type="number" :min="editable ? Math.max(1, lineup.length) : 1" :max="MAX_LINEUP_SIZE"
            step="1" :value="limit" @change="changeLimit" />
        </label>
      </div>
    </header>
    <slot name="editor" />
    <p v-if="networkScore !== undefined" class="lineup-network-score">阵容总分 <strong>{{ formatRankingScore(networkScore) }}</strong></p>
    <p v-if="editable && lineup.length >= limit" class="lineup-note">目标阵容已满。</p>
    <div class="lineup-body">
      <div>
        <ol v-if="lineup.length" class="lineup-pieces">
          <li v-for="({ node, promoted: upgraded, pieceScore }, index) in lineup" :key="index" class="lineup-piece"
            :class="{ promoted: upgraded }">
            <button type="button" class="lineup-operator" draggable="true" :aria-label="`购入 ${node.name}`"
              aria-keyshortcuts="Alt+Enter" @click="emit('buy', node.name)"
              @dragstart="startOperatorDrag($event, node.name)" @keydown.alt.enter.prevent="emit('add', node.name)">
              <img :src="node.avatar" alt="" width="32" height="32" loading="lazy" />
              <span>
                <strong>{{ node.name }}</strong>
                <small>{{ upgraded ? "晋升" : "普通" }}<template v-if="pieceScore !== undefined"> · 棋子 +{{ formatRankingScore(pieceScore) }}</template></small>
              </span>
            </button>
            <div v-if="editable" class="lineup-piece-actions">
              <button type="button" :aria-label="`${upgraded ? '改为普通' : '改为晋升'} ${node.name}`"
                :title="upgraded ? '改为普通' : '改为晋升'" :aria-pressed="upgraded" @click="emit('toggle-promotion', index)">↑</button>
              <button type="button" :aria-label="`移除目标干员 ${node.name}`" title="移除" @click="emit('remove', index)">×</button>
            </div>
          </li>
        </ol>
        <slot v-else name="empty">
          <p class="lineup-note">{{ editable ? "尚未添加目标干员。" : "当前没有可推荐的持有棋子。" }}</p>
        </slot>
      </div>
      <aside class="lineup-covenants" :class="{ 'recommended-covenants': !editable }" :aria-labelledby="covenantsId">
        <h4 :id="covenantsId">已激活盟约</h4>
        <CovenantsPanel v-if="covenants.activeNames.length"
          :present-cov-list="covenants.activeNames" :present-cov-counts="covenants.counts"
          :activation-counts="covenants.activationCounts"
          :advanced-cov-levels="covenants.advancedLevels" show-levels />
        <p v-else class="lineup-note">暂无激活</p>
      </aside>
    </div>
    <slot name="after-lineup" />
  </section>
</template>

<script setup>
import { computed, useId } from "vue";
import CovenantsPanel from "../components/CovenantsPanel.vue";
import ModuleHelp from "../components/ModuleHelp.vue";
import { formatRankingScore } from "./covenantWeights.js";
import { allowOperatorDrop, dropOperator, startOperatorDrag } from "./operatorDrag.js";
import { MAX_LINEUP_SIZE, validLineupSize } from "./operatorInventory.js";

const props = defineProps({
  title: { type: String, required: true },
  titleId: { type: String, required: true },
  lineup: { type: Array, required: true },
  limit: { type: Number, required: true },
  covenants: { type: Object, required: true },
  networkScore: Number,
  editable: Boolean,
  fixed: Boolean,
});
const emit = defineEmits(["set-limit", "add", "buy", "remove", "toggle-promotion"]);
const covenantsId = useId();
const helpText = computed(() => {
  const holdingTip = "远见、奇迹和投资人可以由待部署区里的不同干员激活。同名干员的盟约人数只计一次。";
  const scoreTip = "阵容总分为已激活盟约分加上棋子分。核心盟约一级按固定权重 ×2 计分，二级及以上每级额外计入 2 × 滑杆倍率。Ⅰ至Ⅵ阶基础分依次为 0.5、0.8、1.1、1.4、1.7、2.0，晋升棋子分翻倍。" + holdingTip;
  if (props.fixed) return scoreTip + "额外盟约赋予已经上场、原本没有该盟约的干员。";
  if (props.editable) return "用「选择干员」筛选，拖入干员卡，或在卡片上按 Alt+Enter。新棋子默认晋升，可用右侧按钮改回普通或移除。"
    + (props.networkScore === undefined ? "" : scoreTip);
  return "从持有槽选出阵容总分最高的上场组合。" + scoreTip;
});

function changeLimit(event) {
  const input = event.target;
  const limit = input.valueAsNumber;
  if (validLineupSize(limit) && (!props.editable || limit >= props.lineup.length)) emit("set-limit", limit);
  else input.value = props.limit;
}

</script>

<style scoped>
.lineup-view { min-width: 0; container-type: inline-size; }
.lineup-header, .lineup-title, .lineup-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.lineup-header { justify-content: space-between; }
.lineup-header h3 { margin: 0; font-size: 16px; }
.lineup-header h3 small { margin-left: 4px; color: #abb9c9; font-size: 12px; font-weight: normal; }
.lineup-actions label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
.lineup-actions input { padding: 3px 6px; border: 1px solid #3b4959; border-radius: 6px; background: #222d3a; color: #edf2f7; font-size: 12px; }
.lineup-actions input { width: 52px; }
.lineup-note { margin: 6px 0 10px; color: #abb9c9; font-size: 12px; }
.lineup-network-score { margin: 6px 0; color: #a8ebda; font-size: 13px; }
.lineup-body { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(115px, 1fr); gap: 10px; margin-top: 6px; }
.lineup-pieces { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.lineup-piece { display: flex; align-items: center; gap: 3px; border: 1px solid #334151; border-radius: 7px; background: #222d3a; color: #edf2f7; }
.lineup-operator { display: flex; align-items: center; gap: 7px; padding: 4px 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.lineup-piece-actions { display: grid; gap: 2px; padding-right: 4px; }
.lineup-piece-actions button { padding: 0 4px; border: 1px solid #415166; border-radius: 4px; background: transparent; color: inherit; font-size: 12px; line-height: 1.1; cursor: pointer; }
.lineup-piece-actions [aria-pressed="true"] { color: #ffe2ab; }
.lineup-piece img { border-radius: 4px; object-fit: cover; }
.lineup-piece small { display: block; color: #abb9c9; font-size: 11px; }
.lineup-piece.promoted { border-color: #b5985b; }
.lineup-piece.promoted small { color: #ffe2ab; }
.lineup-operator:hover, .lineup-piece-actions button:hover { background: #304153; }
.lineup-covenants { min-width: 0; padding-left: 10px; border-left: 1px solid #303943; }
.lineup-covenants h4 { margin: 0 0 5px; font-size: 13px; }
.lineup-covenants :deep(.covenant-bar) { justify-content: flex-start; padding: 0; border: 0; background: transparent; }
.lineup-covenants :deep(.cov-level) { display: block; color: #a8ebda; font-size: 10px; line-height: 1.2; }
@container (max-width: 300px) {
  .lineup-body { grid-template-columns: minmax(0, 1fr); }
  .lineup-covenants { padding: 6px 0 0; border-left: 0; border-top: 1px solid #303943; }
}
</style>
