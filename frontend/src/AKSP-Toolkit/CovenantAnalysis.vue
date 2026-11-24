<template>
  <section class="analysis" :class="{ 'sidebar-collapsed': !activePanel }" aria-label="盟约分析">
    <aside class="analysis-sidebar" aria-label="图谱侧栏">
      <nav class="analysis-rail" aria-label="图谱侧栏面板">
        <button
          v-for="panel in panels"
          :key="panel.id"
          type="button"
          class="rail-button"
          :aria-label="`${activePanel === panel.id ? '收起' : '展开'}${panel.label}`"
          :aria-expanded="activePanel === panel.id"
          :aria-controls="`analysis-${panel.id}`"
          @click="activePanel = activePanel === panel.id ? null : panel.id"
        >
          <span class="rail-arrow" aria-hidden="true"></span>
          <span>{{ panel.label }}</span>
        </button>
      </nav>

      <section v-show="activePanel === 'settings'" id="analysis-settings" class="analysis-controls" aria-labelledby="analysis-settings-title">
        <header class="settings-head"><h2 id="analysis-settings-title">设置</h2></header>
        <div class="settings-content">
          <p class="counts">{{ graph.nodes.length }} 位干员 · {{ graph.edges.length }} 条盟约连线</p>

          <div class="control settings-options">
            <div class="option-group">
              <span id="cluster-layout-label">聚类视角</span>
              <div class="segmented" role="group" aria-labelledby="cluster-layout-label">
                <button :aria-pressed="clusterBy === CORE_GROUP" @click="clusterBy = CORE_GROUP">核心盟约</button>
                <button :aria-pressed="clusterBy === ADDITIONAL_GROUP" @click="clusterBy = ADDITIONAL_GROUP">附加盟约</button>
              </div>
              <label class="cluster-terminal">
                <input v-model="clusterTerminal" type="checkbox" />
                聚集终端干员
              </label>
            </div>

            <div class="option-group">
              <span id="node-display-label">节点显示</span>
              <div class="segmented" role="group" aria-labelledby="node-display-label">
                <button :aria-pressed="mode === 'avatar'" @click="mode = 'avatar'">头像</button>
                <button :aria-pressed="mode === 'name'" @click="mode = 'name'">名字</button>
              </div>
            </div>
          </div>

          <label class="control operator-picker">
            定位干员
            <select v-model="selectedName" :disabled="!graph.nodes.length">
              <option value="">全部干员</option>
              <option v-for="node in sortedNodes" :key="node.name" :value="node.name">{{ node.name }}</option>
            </select>
          </label>

          <section class="spectrum-settings" aria-labelledby="spectrum-title">
            <div class="spectrum-header">
              <div class="spectrum-title">
                <h3 id="spectrum-title">盟约色谱</h3>
                <ModuleHelp label="盟约色谱" text="拖动词条交换颜色。内侧箭头调细连线，外侧箭头调粗。" />
              </div>
              <div class="segmented" role="group" aria-label="编辑色谱">
                <button
                  v-for="spectrum in spectra"
                  :key="spectrum.group"
                  type="button"
                  :aria-pressed="spectrumGroup === spectrum.group"
                  @click="spectrumGroup = spectrum.group"
                >{{ spectrum.label }}</button>
              </div>
            </div>
            <div class="spectrum-rings">
              <CovenantSpectrum
                :key="activeSpectrum.group"
                :label="activeSpectrum.label"
                :entries="activeSpectrum.entries"
                :line-levels="lineLevels"
                @reorder="reorderCovenants(activeSpectrum.group, $event)"
                @adjust-line="adjustLine"
              />
            </div>
          </section>

          <section v-if="selected" class="selection" aria-label="选中干员">
            <h3>{{ selected.name }}</h3>
            <p>{{ selected.clusterName }}簇 · {{ graph.neighbors.get(selected).size }} 位关联干员</p>
            <p v-if="selected.isTerminal" class="terminal-mark">◆ 终端干员</p>
            <ul>
              <li v-for="name in selected.covenants" :key="name" v-on="covenantTooltipHandlers(name)">
                <span :style="{ background: graph.colorByCovenant.get(name) }" class="dot"></span>
                {{ name }}
              </li>
            </ul>
          </section>

          <div v-if="banned.length" class="control bans">
            <span>干员池 Ban</span>
            <p>{{ banned.join("、") }}</p>
          </div>

        </div>
      </section>

      <section v-show="activePanel === 'ranking'" id="analysis-ranking" class="analysis-controls" aria-labelledby="analysis-ranking-title">
        <header class="settings-head ranking-head">
          <h2 id="analysis-ranking-title">优推干员</h2>
          <div class="ranking-actions">
            <button type="button" :aria-pressed="inventory.stackingEnabled"
              @click="updateInventory({ stackingEnabled: !inventory.stackingEnabled })">优先叠层</button>
            <button type="button" :aria-pressed="inventory.directedSearch"
              @click="updateInventory({ directedSearch: !inventory.directedSearch })">定向搜索</button>
            <button type="button" :aria-pressed="inventory.considerHeld"
              @click="updateInventory({ considerHeld: !inventory.considerHeld })">考虑持有</button>
            <button type="button" class="weight-toggle" :aria-pressed="weightsEnabled"
              @click="weightsEnabled = !weightsEnabled">启用权重</button>
          </div>
        </header>
        <div class="settings-content">
          <p v-if="inventory.directedSearch && !directedCovenants.size" class="directed-search-note" role="status">
            目标阵容暂无可用于定向搜索的已激活盟约。可从终局方案设为目标阵容。
          </p>
          <OperatorRanking
            :key="version.id"
            v-model:tiers="rankingTiers"
            :graph="graph"
            :weights="weightsEnabled ? covenantWeights : null"
            :covenant-layers="inventory.covenantLayers"
            :target-covenants="targetCovenantSet"
            :directed-covenants="directedCovenants"
            :terminal-coefficient="terminalCoefficient"
            :pair-coefficient="pairCoefficient"
            :held-lineup-change-coefficient="heldLineupChangeCoefficient"
            :stacking-coefficient="stackingCoefficient"
            :stacking-enabled="inventory.stackingEnabled"
            :stackable-covenants="stackableCovenants"
            :stackable-covenant-coefficient="stackableCovenantCoefficient"
            :pair-names="pairNames"
            :promotion-names="promotionNames"
            :purchase-effects="purchaseEffects"
            :consider-held="inventory.considerHeld"
            :selected-name="selectedName"
            @select="buyOperator"
            @add-target-operator="emit('add-target-operator', $event)"
            @toggle-terminal="emit('toggle-terminal', $event)"
          />
        </div>
      </section>
    </aside>

    <div class="graph-column" :class="{ 'legend-hidden': legendHidden }">
      <div class="viewport">
        <canvas
          ref="canvas"
          tabindex="0"
          aria-label="干员盟约三维图。使用方向键旋转，加减键缩放，或通过定位干员选择节点。"
          @pointerdown="beginDrag"
          @pointermove="rotate"
          @pointerup="endDrag"
          @pointercancel="drag = null"
          @lostpointercapture="drag = null"
          @wheel.prevent="zoom($event.deltaY < 0 ? 1.12 : 1 / 1.12)"
          @keydown="handleKeys"
        ></canvas>
        <p v-if="!graph.nodes.length" class="empty">当前池子没有可用干员</p>
        <div
          v-if="selected && annotation?.name === selected.name"
          class="graph-annotation"
          :class="{ 'annotation-left': annotation.left }"
          :style="{ '--anchor-x': `${annotation.x}px`, '--anchor-y': `${annotation.y}px` }"
          aria-label="图中选中干员的盟约"
        >
          <button type="button" class="graph-operator" draggable="true" :aria-label="`购入 ${selected.name}`"
            aria-keyshortcuts="Alt+Enter" @click="buyOperator(selected.name)"
            @dragstart="startOperatorDrag($event, selected.name)"
            @keydown.alt.enter.prevent="emit('add-target-operator', selected.name)">{{ selected.name }}</button>
          <ul v-if="selected.covenants.length">
            <li v-for="name in selected.covenants" :key="name" v-on="covenantTooltipHandlers(name)">
              <span class="dot" :style="{ background: graph.colorByCovenant.get(name) }"></span>
              {{ name }}
            </li>
          </ul>
          <span v-else class="annotation-empty">无盟约</span>
        </div>
        <div class="view-actions" role="group" aria-label="图谱视角">
          <button v-if="legendHidden" ref="showLegendButton" type="button"
            aria-controls="graph-legend" aria-expanded="false" @click="setLegendHidden(false)">显示图例</button>
          <button aria-label="放大图谱" @click="zoom(1.2)">＋</button>
          <button aria-label="缩小图谱" @click="zoom(1 / 1.2)">−</button>
          <button @click="resetView">重置视角</button>
        </div>
        <ModuleHelp class="graph-help" label="图谱"
          text="拖动图谱旋转，滚轮缩放。点击干员节点可购入并查看关联，也可拖动选中说明里的干员名。" />
      </div>
      <section v-show="!legendHidden" id="graph-legend" class="color-legend" aria-label="图谱图例">
        <div v-for="spectrum in spectra" :key="spectrum.group" class="legend-row">
          <h3>{{ spectrum.label }}</h3>
          <ol :aria-label="spectrum.label" :style="{ '--legend-count': spectrum.entries.length }">
            <li
              v-for="entry in spectrum.entries"
              :key="entry.name"
              :style="{ '--legend-color': entry.color }"
              :title="entry.banned ? `${entry.name} · 已 Ban` : entry.name"
            >
              <button
                type="button"
                :aria-pressed="highlightedCovenant === entry.name"
                :aria-label="`高亮${entry.name}${entry.banned ? '（已 Ban）' : ''}`"
                v-on="covenantTooltipHandlers(entry.name)"
                @click="highlightedCovenant = highlightedCovenant === entry.name ? '' : entry.name"
              >
                <img :src="getIconUrl(entry.name)" alt="" width="15" height="15" />
                <span>{{ entry.name }}</span>
              </button>
            </li>
          </ol>
        </div>
        <div class="spectrum-key">
          <span><i class="dot" :style="{ background: UNGROUPED_COLOR }"></i> {{ ungroupedLabel }}</span>
          <span class="terminal-mark">◆ 终端干员</span>
          <button v-if="graph.affinityMembers.size" type="button" class="affinity-key"
            :aria-pressed="highlightedCovenant === AFFINITY_BOND_LABEL"
            aria-label="高亮相性羁绊"
            @click="highlightedCovenant = highlightedCovenant === AFFINITY_BOND_LABEL ? '' : AFFINITY_BOND_LABEL">
            <i aria-hidden="true"></i>{{ AFFINITY_BOND_LABEL }}
          </button>
          <button ref="hideLegendButton" type="button" class="hide-legend" aria-controls="graph-legend" aria-expanded="true"
            @click="setLegendHidden(true)">隐藏图例</button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { covenantTooltipHandlers } from "../composables/useCovenantTooltip.js";
import { ADDITIONAL_GROUP, CORE_GROUP } from "../data/versions.js";
import { getIconUrl } from "../utils/index.js";
import ModuleHelp from "../components/ModuleHelp.vue";
import { AFFINITY_BOND_LABEL } from "./affinityBonds.js";
import CovenantSpectrum from "./CovenantSpectrum.vue";
import OperatorRanking from "./OperatorRanking.vue";
import {
  buildCovenantGraph, COVENANT_LINE_WIDTHS, DEFAULT_LINE_LEVEL, UNGROUPED_COLOR,
} from "./covenantGraph.js";
import {
  DEFAULT_HELD_LINEUP_CHANGE_COEFFICIENT, DEFAULT_PAIR_COEFFICIENT, DEFAULT_STACKABLE_COVENANT_COEFFICIENT,
  DEFAULT_STACKING_COEFFICIENT, DEFAULT_TERMINAL_COEFFICIENT,
} from "./covenantWeights.js";
import { drawCovenantGraph } from "./drawCovenantGraph.js";
import { startOperatorDrag } from "./operatorDrag.js";
import { getPromotionCopies, normalizeInventory } from "./operatorInventory.js";

const props = defineProps({
  version: { type: Object, required: true },
  operators: { type: Array, required: true },
  banned: { type: Array, required: true },
  terminalNames: { type: Array, required: true },
  covenantWeights: { type: Object, default: () => ({}) },
  terminalCoefficient: { type: Number, default: DEFAULT_TERMINAL_COEFFICIENT },
  pairCoefficient: { type: Number, default: DEFAULT_PAIR_COEFFICIENT },
  heldLineupChangeCoefficient: { type: Number, default: DEFAULT_HELD_LINEUP_CHANGE_COEFFICIENT },
  stackingCoefficient: { type: Number, default: DEFAULT_STACKING_COEFFICIENT },
  stackableCovenantCoefficient: { type: Number, default: DEFAULT_STACKABLE_COVENANT_COEFFICIENT },
  stackableCovenants: { type: Set, default: () => new Set() },
  inventory: { type: Object, default: () => normalizeInventory() },
  held: { type: Array, default: () => [] },
  targetCovenantSet: { type: Set, default: () => new Set() },
  directedCovenants: { type: Set, default: () => new Set() },
  getPurchaseEffects: { type: Function, default: () => new Map() },
});
const emit = defineEmits(["toggle-terminal", "edit-held-pieces", "update-inventory", "add-target-operator"]);

const panels = [
  { id: "ranking", label: "优推干员" },
  { id: "settings", label: "设置" },
];
const activePanel = ref("ranking");
const weightsEnabled = ref(true);
const rankingTiers = ref([]);
const spectrumGroup = ref(CORE_GROUP);
const clusterBy = ref(CORE_GROUP);
const clusterTerminal = ref(false);
const ordersByVersion = ref({});
const lineLevelsByVersion = ref({});
const lineLevels = computed(() => lineLevelsByVersion.value[props.version.id] ?? {});
const graph = computed(() => buildCovenantGraph(props.version, props.operators, props.banned, {
  clusterBy: clusterBy.value,
  terminalNames: props.terminalNames,
  clusterTerminal: clusterTerminal.value,
  covenantOrder: ordersByVersion.value[props.version.id],
  affinityBonds: props.inventory.affinityBonds,
}));
const pairNames = computed(() => {
  if (!props.inventory.considerHeld) return new Set();
  const names = new Set(props.held.filter(({ normal }) => normal === 1).map(({ name }) => name));
  for (const { name } of graph.value.nodes) {
    if (getPromotionCopies(name, props.version) === 2) names.add(name);
  }
  return names;
});
const promotionNames = computed(() => new Set(props.inventory.considerHeld
  ? props.held.filter(({ name, normal }) => normal === getPromotionCopies(name, props.version) - 1)
    .map(({ name }) => name)
  : []));
const purchaseEffects = computed(() => props.inventory.considerHeld
  ? props.getPurchaseEffects(graph.value.nodes)
  : new Map());
const ungroupedLabel = computed(() => clusterBy.value === CORE_GROUP ? "无核心盟约" : "无附加盟约");
const spectra = computed(() => [
  { group: CORE_GROUP, label: "核心盟约" },
  { group: ADDITIONAL_GROUP, label: "附加盟约" },
].map((spectrum) => ({
  ...spectrum,
  entries: graph.value.legend.filter(({ group }) => group === spectrum.group),
})));
const activeSpectrum = computed(() => spectra.value.find(({ group }) => group === spectrumGroup.value));
const sortedNodes = computed(() => [...graph.value.nodes].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")));
const mode = ref("avatar");
const selectedName = ref("");
const highlightedCovenant = ref("");
const legendHidden = ref(false);
const showLegendButton = ref(null);
const hideLegendButton = ref(null);
const selected = computed(() => graph.value.nodes.find((node) => node.name === selectedName.value));
const canvas = ref(null);
const annotation = shallowRef(null);
const initialView = { yaw: -0.45, pitch: 0.24, zoom: 1 };
const view = { ...initialView };
const images = new Map();
let observer;
let context;
let frame;
let projected = [];
let drag = null;

function buyOperator(name) {
  if (!graph.value.nodes.some((node) => node.name === name)) return;
  selectedName.value = name;
  emit("edit-held-pieces", name, "buy");
}

function updateInventory(settings) {
  emit("update-inventory", settings);
}

const configurationFields = {
  activePanel, weightsEnabled, rankingTiers, spectrumGroup, clusterBy, clusterTerminal, ordersByVersion,
  lineLevelsByVersion, mode, selectedName, highlightedCovenant, legendHidden,
};
defineExpose({
  readConfiguration: () => ({
    ...Object.fromEntries(Object.entries(configurationFields).map(([name, state]) => [name, state.value])),
    view: { ...view },
  }),
  applyConfiguration(config) {
    for (const [name, state] of Object.entries(configurationFields)) state.value = config[name];
    if (!graph.value.colorByCovenant.has(highlightedCovenant.value)) highlightedCovenant.value = "";
    Object.assign(view, config.view);
    drag = null;
    requestDraw();
  },
});

async function setLegendHidden(hidden) {
  legendHidden.value = hidden;
  await nextTick();
  (hidden ? showLegendButton : hideLegendButton).value?.focus({ preventScroll: true });
}

function reorderCovenants(group, order) {
  const versionId = props.version.id;
  ordersByVersion.value[versionId] = { ...ordersByVersion.value[versionId], [group]: order };
}

function adjustLine(name, delta) {
  const level = (lineLevels.value[name] ?? DEFAULT_LINE_LEVEL) + delta;
  if (level < 1 || level > COVENANT_LINE_WIDTHS.length) return;
  lineLevelsByVersion.value[props.version.id] = { ...lineLevels.value, [name]: level };
}

function requestDraw() {
  if (context && frame === undefined) frame = requestAnimationFrame(render);
}

function imageFor(url) {
  if (!url) return null;
  if (!images.has(url)) {
    const image = new Image();
    image.onload = requestDraw;
    images.set(url, image);
    image.src = url;
  }
  const image = images.get(url);
  return image.complete && image.naturalWidth > 0 ? image : null;
}

function render() {
  frame = undefined;
  const { width, height } = canvas.value.getBoundingClientRect();
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.value.width !== pixelWidth || canvas.value.height !== pixelHeight) {
    canvas.value.width = pixelWidth;
    canvas.value.height = pixelHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  projected = drawCovenantGraph(context, {
    width, height, graph: graph.value, view, mode: mode.value, selected: selected.value, imageFor,
    lineLevels: lineLevels.value,
    highlightedCovenant: highlightedCovenant.value,
  });
  const point = selected.value && projected.find(({ node }) => node === selected.value);
  if (!point || point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
    annotation.value = null;
    return;
  }
  const gap = point.radius + 9;
  const left = point.x + gap + 170 > width && point.x > width / 2;
  annotation.value = {
    name: point.node.name,
    x: left ? width - point.x + gap : point.x + gap,
    y: point.y - 12,
    left,
  };
}

function resetView() {
  Object.assign(view, initialView);
  requestDraw();
}

function zoom(factor) {
  view.zoom = Math.min(3.5, Math.max(0.5, view.zoom * factor));
  requestDraw();
}

function turn(horizontal, vertical) {
  view.yaw += horizontal;
  view.pitch = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, view.pitch + vertical));
  requestDraw();
}

function beginDrag(event) {
  if (drag || event.button !== 0) return;
  drag = {
    id: event.pointerId, x: event.clientX, y: event.clientY,
    startX: event.clientX, startY: event.clientY, moved: false,
  };
  canvas.value.setPointerCapture(event.pointerId);
}

function rotate(event) {
  if (drag?.id !== event.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
  drag.moved = true;
  turn((event.clientX - drag.x) * 0.008, (event.clientY - drag.y) * 0.008);
  drag.x = event.clientX;
  drag.y = event.clientY;
}

function endDrag(event) {
  if (drag?.id !== event.pointerId) return;
  const { moved } = drag;
  drag = null;
  if (moved) return;
  const bounds = canvas.value.getBoundingClientRect();
  const hit = projected.findLast(({ x, y, radius }) =>
    Math.hypot(event.clientX - bounds.left - x, event.clientY - bounds.top - y) <= radius + 3,
  );
  if (hit) buyOperator(hit.node.name);
  else selectedName.value = "";
}

function handleKeys(event) {
  const turns = {
    ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12],
  };
  if (event.key in turns) turn(...turns[event.key]);
  else if (event.key === "+" || event.key === "=") zoom(1.2);
  else if (event.key === "-") zoom(1 / 1.2);
  else if (event.key === "Escape") {
    if (highlightedCovenant.value) highlightedCovenant.value = "";
    else selectedName.value = "";
  }
  else return;
  event.preventDefault();
}

watch(graph, () => {
  if (!selected.value) selectedName.value = "";
  if (!graph.value.colorByCovenant.has(highlightedCovenant.value)) highlightedCovenant.value = "";
  requestDraw();
});
watch([mode, selectedName, lineLevels, highlightedCovenant], requestDraw);

onMounted(() => {
  context = canvas.value.getContext("2d");
  if (!context) return;
  observer = new ResizeObserver(requestDraw);
  observer.observe(canvas.value);
  requestDraw();
});

onUnmounted(() => {
  observer?.disconnect();
  if (frame !== undefined) cancelAnimationFrame(frame);
  for (const image of images.values()) image.onload = null;
});
</script>

<style scoped>
.analysis {
  --control-text-size: 13px;
  display: grid;
  grid-template-columns: clamp(285px, 38vw, 495px) minmax(0, 1fr);
  grid-template-rows: minmax(min-content, 1fr);
  gap: 14px;
  min-height: 0;
  padding: 16px clamp(12px, 3vw, 40px) 14px;
}
.analysis.sidebar-collapsed { grid-template-columns: 38px minmax(0, 1fr); }
.analysis-sidebar { display: grid; grid-template-columns: 38px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); gap: 8px; min-width: 0; min-height: 0; }
.sidebar-collapsed .analysis-sidebar { grid-template-columns: 38px; }
.analysis-rail {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border: 1px solid #303943;
  border-radius: 12px;
  background: #181f28;
}
.analysis-rail .rail-button {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 10px 4px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #c5d2df;
  font-size: 13px;
  line-height: 1.2;
}
.analysis-rail .rail-button + .rail-button { border-top: 1px solid #303943; }
.analysis-rail .rail-button:hover { background: #263341; }
.analysis-rail .rail-button[aria-expanded="true"] { background: #2c4747; color: #e4fff8; }
.analysis-rail .rail-button:focus-visible { outline: 2px solid #a8ebda; outline-offset: -2px; }
.rail-button > span:last-child { writing-mode: vertical-rl; letter-spacing: 0.15em; }
.rail-arrow { width: 7px; height: 7px; border: solid currentColor; border-width: 0 0 2px 2px; transform: rotate(45deg); }
.rail-button[aria-expanded="false"] .rail-arrow { transform: rotate(225deg); }
.analysis-controls, .viewport {
  border: 1px solid #303943;
  border-radius: 14px;
  background: #181f28;
}
.analysis-controls { display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
.settings-head { display: flex; flex-shrink: 0; align-items: center; min-height: 41px; padding: 5px 16px; border-bottom: 1px solid #303943; }
.ranking-head { justify-content: space-between; flex-wrap: wrap; gap: 5px; }
.ranking-actions { display: flex; flex-wrap: wrap; gap: 4px; }
.ranking-actions button { padding: 3px 7px; font-size: 12px; }
.directed-search-note { margin: 0 0 8px; color: #abb9c9; font-size: 12px; }
.settings-content { min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; padding: 6px 16px 10px; line-height: 1.3; }
h2 { margin: 0; font-size: 17px; line-height: 1.3; }
h3 { margin: 0; font-size: 16px; }
.counts, .selection p, .bans p { margin: 6px 0 0; font-size: 13px; color: #abb9c9; }
.control { display: grid; gap: 5px; margin-top: 9px; font-size: 13px; color: #c5d2df; }
.settings-options { grid-template-columns: max-content minmax(0, 1fr); column-gap: 12px; align-items: start; }
.option-group { display: grid; gap: 4px; }
.option-group button { padding: 4px 7px; font-size: 12px; }
.operator-picker { grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 10px; }
.operator-picker select { padding-block: 5px; font-size: var(--control-text-size); }
.segmented { display: flex; flex-wrap: wrap; gap: 5px; }
.cluster-terminal { display: flex; gap: 6px; align-items: center; }
.cluster-terminal input { accent-color: #a8ebda; }
button, select {
  border: 1px solid #3b4959;
  border-radius: 7px;
  background: #222d3a;
  color: #f1f5fa;
  padding: 7px 10px;
}
button { cursor: pointer; }
button:hover { background: #304153; }
button[aria-pressed="true"] { background: #a8ebda; border-color: #a8ebda; color: #11241f; }
.selection { margin-top: 20px; padding-top: 14px; border-top: 1px solid #303943; }
.selection ul { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 10px 0 0; }
.selection li { border: 1px solid #3b4959; border-radius: 6px; padding: 2px 7px; font-size: 12px; }
.selection small { color: #f0adad; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.terminal-mark, .selection .terminal-mark { color: #ffe2ab; }
.bans p { margin-top: 0; overflow-wrap: anywhere; }
.spectrum-settings { display: grid; gap: 4px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #303943; }
.spectrum-settings p, .spectrum-key { margin: 0; color: #abb9c9; font-size: 12px; }
.spectrum-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 5px; }
.spectrum-title { display: flex; align-items: center; gap: 5px; }
.spectrum-header button { padding: 4px 7px; font-size: 12px; }
.spectrum-rings { display: grid; justify-items: center; padding: 9px; }
.spectrum-rings > .spectrum { width: min(100%, clamp(285px, calc(100svh - 385px), 375px)); }
.spectrum-key { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.spectrum-key { align-items: center; }
.affinity-key { display: inline-flex; align-items: center; gap: 5px; padding: 2px 6px; font-size: 12px; }
.affinity-key i { width: 13px; border-top: 2px dashed currentColor; }
.hide-legend { margin-left: auto; padding: 2px 7px; font-size: 12px; }
.graph-column { display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: 9px; min-width: 0; min-height: 0; }
.graph-column.legend-hidden { grid-template-rows: minmax(0, 1fr); gap: 0; }
.color-legend { display: grid; container-type: inline-size; gap: 7px; padding: 9px 11px; border: 1px solid #303943; border-radius: 10px; background: #181f28; }
.legend-row { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px; align-items: center; }
.legend-row h3 { padding-top: 4px; color: #c5d2df; font-size: 12px; }
.legend-row ol {
  display: grid;
  grid-template-columns: repeat(var(--legend-count), minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.legend-row li button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  padding: 2px 0;
  border: 0;
  border-radius: 0;
  border-top: 4px solid var(--legend-color);
  background: #222d3a;
  color: #edf2f7;
  text-align: center;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}
.legend-row img { display: block; object-fit: contain; }
.legend-row li button:hover { background: #334254; }
.legend-row li button[aria-pressed="true"] {
  background: #3c4b61;
  color: #fff;
  box-shadow: inset 0 0 0 1px var(--legend-color);
}
.legend-row li button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
@container (max-width: 710px) {
  .legend-row { grid-template-columns: minmax(0, 1fr); gap: 3px; }
  .legend-row h3 { padding-top: 0; line-height: 1.2; }
}
@container (max-width: 650px) {
  .legend-row li span { writing-mode: vertical-rl; }
}
.viewport {
  position: relative;
  min-height: min(180px, 23dvh);
  overflow: hidden;
  background: radial-gradient(ellipse at center, #202d3a, #111720 76%);
}
canvas { display: block; width: 100%; height: 100%; position: absolute; inset: 0; touch-action: none; cursor: grab; }
canvas:active { cursor: grabbing; }
canvas:focus-visible { outline: 2px solid #a8ebda; outline-offset: -3px; }
.graph-annotation {
  position: absolute;
  left: clamp(8px, var(--anchor-x), calc(100% - 176px));
  top: clamp(8px, var(--anchor-y), calc(100% - 118px));
  max-width: min(168px, calc(100% - 16px));
  padding: 6px 8px;
  border: 1px solid #516075;
  border-radius: 7px;
  background: #111923f5;
  color: #edf2f7;
  font-size: var(--control-text-size);
  line-height: 1.3;
  pointer-events: none;
}
.graph-annotation.annotation-left { left: auto; right: clamp(8px, var(--anchor-x), calc(100% - 176px)); }
.graph-operator { padding: 2px 5px; font-size: inherit; font-weight: 600; pointer-events: auto; }
.graph-annotation ul { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 0; padding: 0; list-style: none; }
.graph-annotation li { padding: 2px 4px; border-radius: 4px; background: #253345; font-size: 12px; white-space: nowrap; pointer-events: auto; }
.graph-annotation small { color: #f0adad; }
.annotation-empty { display: block; color: #abb9c9; }
.view-actions { position: absolute; display: flex; gap: 5px; right: 12px; bottom: 10px; }
.graph-help { position: absolute; top: 10px; left: 12px; }
.empty { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; color: #c0cbd7; }
@media (max-width: 760px) {
  .analysis, .analysis.sidebar-collapsed { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(min-content, 1fr); gap: 8px; padding-block: 8px; }
  .analysis .analysis-sidebar { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); max-height: min(150px, 17dvh); gap: 5px; }
  .sidebar-collapsed .analysis-sidebar { grid-template-rows: auto; }
  .analysis-rail { flex-direction: row; justify-self: start; }
  .analysis-rail .rail-button { flex-direction: row; width: auto; padding: 5px 8px; }
  .analysis-rail .rail-button + .rail-button { border-top: 0; border-left: 1px solid #303943; }
  .rail-button > span:last-child { writing-mode: horizontal-tb; letter-spacing: normal; }
  .control { margin-top: 12px; }
}
@media (min-width: 761px) {
  .analysis-sidebar { contain: size; }
}
</style>
