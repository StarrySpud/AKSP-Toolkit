<template>
  <section class="held-panel" aria-labelledby="held-panel-title">
    <header class="held-header">
      <h2 id="held-panel-title">当前持有干员 <small>{{ pieceCount }} 枚</small></h2>
      <button
        type="button"
        class="collapse-button"
        :aria-label="collapsed ? '展开当前持有干员' : '收起当前持有干员'"
        :aria-expanded="!collapsed"
        aria-controls="held-panel-content"
        @click="emit('set-collapsed', !collapsed)"
      >{{ collapsed ? "▸" : "▾" }}</button>
    </header>
    <div v-show="!collapsed" id="held-panel-content" class="held-columns">
      <section class="held-covenants" aria-label="持有槽盟约设置">
        <header class="lineup-header">
          <div class="held-actions">
            <button type="button" :aria-pressed="covenantPanel === 'potential'" @click="emit('set-covenant-panel', 'potential')">
              潜在可激活盟约
            </button>
            <button type="button" :aria-pressed="covenantPanel === 'extra'" @click="emit('set-covenant-panel', 'extra')">
              额外核心盟约
            </button>
            <button type="button" :aria-pressed="covenantPanel === 'extra-additional'" @click="emit('set-covenant-panel', 'extra-additional')">
              额外附加盟约
            </button>
            <ModuleHelp :label="covenantPanel === 'potential' ? '潜在可激活盟约' : '额外盟约'"
              :text="covenantPanel !== 'potential'
                ? '填 1 相当于给一名已上场、原本没有该盟约的干员赋予此盟约。只用于判断激活等级，展示的人数保持原值。'
                : '点击卡片可设为目标盟约，基础价值乘 2。灰色名称表示当前未激活。层数可直接输入，单符号增减 1 层，双符号增减 10 层。清空持有槽会保留层数。'" />
          </div>
          <div class="held-actions">
            <button v-if="!covenantPanelCollapsed" type="button" @click="emit('set-covenant-icons', !covenantIcons)">
              {{ covenantIcons ? "显示名称" : "显示图标" }}
            </button>
            <button v-if="!covenantPanelCollapsed && covenantPanel === 'potential'"
              type="button" :disabled="!hasSavedLayers" @click="emit('reset-layers')">层数清零</button>
            <button
              type="button"
              class="collapse-button"
              :aria-label="covenantPanelCollapsed ? '展开盟约设置' : '收起盟约设置'"
              :aria-expanded="!covenantPanelCollapsed"
              aria-controls="held-covenants-content"
              @click="emit('set-covenant-panel-collapsed', !covenantPanelCollapsed)"
            >{{ covenantPanelCollapsed ? "▸" : "▾" }}</button>
          </div>
        </header>
        <div v-show="!covenantPanelCollapsed" id="held-covenants-content">
          <template v-if="covenantPanel === 'potential'">
            <ul v-if="covenants.length">
              <li v-for="{ name, active, layers } in covenants" :key="name" class="target-covenant-card"
                :class="{ 'is-target': targetCovenantSet.has(name) }" @click="emit('toggle-target-covenant', name)">
                <button type="button" class="layer-name target-covenant-toggle" :class="{ inactive: !active }"
                  :title="name" :aria-label="`目标盟约 ${name}`" :aria-pressed="targetCovenantSet.has(name)"
                  @click.stop="emit('toggle-target-covenant', name)">
                  <img v-if="covenantIcons" :src="getIconUrl(name)" :alt="name" width="18" height="18" loading="lazy" />
                  <span v-else>{{ name }}</span>
                </button>
                <div class="layer-stepper" role="group" :aria-label="`${name}层数调整`" @click.stop>
                  <button
                    v-for="{ delta, symbol, label } in layerSteps"
                    :key="delta"
                    type="button"
                    :aria-label="`${name}${label}`"
                    :title="label"
                    :disabled="delta < 0 ? layers === 0 : !validCovenantLayerCount(layers + delta)"
                    @click="adjustCovenantLayers(name, layers, delta)"
                  >{{ symbol }}</button>
                </div>
                <input type="number" min="0" step="1" :aria-label="`${name}层数`" :value="layers" @click.stop
                  @change="setCovenantCount($event, 'set-covenant-layers', name, layers)" />
              </li>
            </ul>
            <p v-else>当前持有槽暂无盟约。</p>
          </template>
          <template v-else>
            <ul>
              <li v-for="{ name, count } in extraCovenants" :key="name">
                <span class="layer-name" :title="name">
                  <img v-if="covenantIcons" :src="getIconUrl(name)" :alt="name" width="18" height="18" loading="lazy" />
                  <span v-else>{{ name }}</span>
                </span>
                <input type="number" min="0" step="1" :aria-label="`${name}额外棋子数`" :title="`${name}额外赋予名额`" :value="count"
                  @change="setCovenantCount($event, 'set-extra-count', name, count)" />
              </li>
            </ul>
          </template>
        </div>
      </section>
      <section aria-labelledby="held-slots-title"
        @dragover="allowOperatorDrop($event)" @drop="dropOperator($event, (name) => emit('buy', name))">
        <header class="lineup-header">
          <div class="held-heading">
            <h3 id="held-slots-title">持有槽</h3>
            <ModuleHelp label="持有槽" text="单击、拖入干员卡，或用「选择干员」购入。通常三枚同名普通棋子自动晋升，规程版星极只需两枚。出售只扣除所选棋子。" />
          </div>
          <button type="button" class="held-action" :disabled="!held.length" @click="emit('clear-held')">清空持有槽</button>
        </header>
        <OperatorPicker :key="versionId" :catalog="operatorCatalog" operator-label="持有槽干员" collapsible
          @add="emit('buy', $event)" />
        <ul v-if="held.length" class="pieces">
          <template v-for="operator in held" :key="operator.name">
            <li v-for="piece in pieceTypes.filter(({ key }) => operator[key])" :key="piece.key" class="piece"
              :class="{ promoted: piece.key === 'promoted' }">
              <button
                type="button"
                class="held-operator"
                draggable="true"
                :aria-label="`购入 ${operator.name}`"
                aria-keyshortcuts="Alt+Enter"
                @click="emit('buy', operator.name)"
                @dragstart="startOperatorDrag($event, operator.name)"
                @keydown.alt.enter.prevent="emit('add-target', operator.name)"
              >
                <img :src="operator.avatar" alt="" width="32" height="32" loading="lazy" />
                <span><strong>{{ operator.name }}</strong><small>{{ piece.label }} ×{{ operator[piece.key] }}</small></span>
              </button>
              <button type="button" class="held-sell" :aria-label="`${piece.sellLabel} ${operator.name}`"
                :title="piece.sellLabel" @click="emit('sell', operator.name, piece.action)">×</button>
            </li>
          </template>
        </ul>
        <p v-else>当前没有持有干员。</p>
      </section>
      <LineupView
        :key="lineupView"
        title-id="held-lineup-title"
        :title="showTarget ? '目标阵容' : '推荐阵容'"
        :lineup="showTarget ? targetLineup : lineup"
        :limit="showTarget ? targetLineupSize : lineupSize"
        :covenants="showTarget ? targetCovenants : lineupCovenants"
        :network-score="showTarget ? targetNetworkScore : lineupScore"
        :editable="showTarget"
        @set-limit="emit(showTarget ? 'set-target-limit' : 'set-lineup-size', $event)"
        @add="emit('add-target', $event)"
        @buy="emit('buy', $event)"
        @remove="emit('remove-target', $event)"
        @toggle-promotion="emit('toggle-target-promotion', $event)"
      >
        <template v-if="showTarget" #editor>
          <OperatorPicker :key="versionId" :catalog="operatorCatalog" collapsible
            :full="targetLineup.length >= targetLineupSize" @add="emit('add-target', $event)" />
        </template>
        <template #switch>
          <button type="button" class="held-action" :aria-pressed="showTarget"
            @click="emit('set-lineup-view', showTarget ? 'recommended' : 'target')"
            @dragover="!showTarget && allowOperatorDrop($event, targetLineup.length < targetLineupSize)"
            @drop="!showTarget && dropOperator($event, openTargetWithOperator, targetLineup.length < targetLineupSize)">
            {{ showTarget ? "切换为推荐阵容" : "切换为目标阵容" }}
          </button>
          <button v-if="showTarget" type="button" class="held-action" :disabled="!targetLineup.length"
            @click="emit('clear-target')">清空目标阵容</button>
          <button v-if="showTarget" type="button" class="held-action" :disabled="!canUndoTarget"
            @click="emit('undo-target')">撤销</button>
          <button v-if="showTarget" type="button" class="held-action" :disabled="!targetLineup.length"
            @click="emit('save-target-plan')">保存为终局方案</button>
        </template>
        <template v-if="!showTarget" #after-lineup>
          <section class="waiting-lineup" aria-labelledby="waiting-lineup-title">
            <h4 id="waiting-lineup-title">待部署区</h4>
            <ul v-if="waiting.length" class="pieces">
              <template v-for="operator in waiting" :key="operator.name">
                <li v-for="piece in pieceTypes.filter(({ key }) => operator[key])" :key="piece.key" class="piece waiting-piece"
                  :class="{ promoted: piece.key === 'promoted' }">
                  <img :src="operator.avatar" alt="" width="28" height="28" loading="lazy" />
                  <span><strong>{{ operator.name }}</strong><small>{{ piece.label }} ×{{ operator[piece.key] }}</small></span>
                </li>
              </template>
            </ul>
            <p v-else>暂无待部署干员。</p>
          </section>
        </template>
      </LineupView>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";
import ModuleHelp from "../components/ModuleHelp.vue";
import { getIconUrl } from "../utils/index.js";
import LineupView from "./LineupView.vue";
import OperatorPicker from "./OperatorPicker.vue";
import { allowOperatorDrop, dropOperator, startOperatorDrag } from "./operatorDrag.js";
import { validCovenantLayerCount } from "./operatorInventory.js";

const props = defineProps({
  held: { type: Array, required: true },
  covenants: { type: Array, required: true },
  targetCovenantSet: { type: Set, required: true },
  covenantIcons: { type: Boolean, default: false },
  covenantPanel: { type: String, required: true },
  covenantPanelCollapsed: { type: Boolean, required: true },
  extraCovenants: { type: Array, required: true },
  hasSavedLayers: { type: Boolean, default: false },
  lineup: { type: Array, required: true },
  lineupCovenants: { type: Object, required: true },
  lineupScore: { type: Number, required: true },
  lineupSize: { type: Number, required: true },
  lineupView: { type: String, required: true },
  targetLineup: { type: Array, required: true },
  targetLineupSize: { type: Number, required: true },
  targetCovenants: { type: Object, required: true },
  targetNetworkScore: Number,
  canUndoTarget: Boolean,
  operatorCatalog: { type: Array, required: true },
  versionId: { type: String, required: true },
  collapsed: { type: Boolean, required: true },
});
const emit = defineEmits([
  "sell", "set-collapsed", "set-lineup-size", "set-covenant-layers", "set-covenant-icons", "clear-held", "reset-layers",
  "set-covenant-panel", "set-covenant-panel-collapsed", "set-extra-count",
  "set-lineup-view", "set-target-limit", "add-target", "buy", "remove-target", "toggle-target-promotion",
  "toggle-target-covenant",
  "clear-target", "undo-target",
  "save-target-plan",
]);
const showTarget = computed(() => props.lineupView === "target");
function openTargetWithOperator(name) {
  emit("add-target", name);
  emit("set-lineup-view", "target");
}
const pieceCount = computed(() => props.held.reduce((total, { normal, promoted }) => total + normal + promoted, 0));
const waiting = computed(() => {
  const remaining = new Map(props.held.map((operator) => [operator.name, { ...operator }]));
  for (const { node, promoted } of props.lineup) remaining.get(node.name)[promoted ? "promoted" : "normal"]--;
  return [...remaining.values()].filter(({ normal, promoted }) => normal > 0 || promoted > 0);
});
const pieceTypes = [
  { key: "promoted", label: "晋升", sellLabel: "出售晋升棋子", action: "sell-promoted" },
  { key: "normal", label: "普通", sellLabel: "出售", action: "sell-normal" },
];
const layerSteps = [
  { delta: -10, symbol: "−−", label: "减少 10 层" },
  { delta: 10, symbol: "++", label: "增加 10 层" },
  { delta: -1, symbol: "−", label: "减少 1 层" },
  { delta: 1, symbol: "+", label: "增加 1 层" },
];

function setCovenantCount(event, action, name, previous) {
  const input = event.target;
  const count = input.value === "" && !input.validity.badInput ? 0 : input.valueAsNumber;
  input.value = validCovenantLayerCount(count) ? count : previous;
  if (validCovenantLayerCount(count) && count !== previous) emit(action, name, count);
}

function adjustCovenantLayers(name, layers, delta) {
  const next = Math.max(0, layers + delta);
  if (validCovenantLayerCount(next)) emit("set-covenant-layers", name, next);
}
</script>

<style scoped>
.held-panel { grid-column: 1 / -1; min-width: 0; border: 1px solid #303943; border-radius: 14px; background: #181f28; }
.held-header, .lineup-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.held-header { flex-shrink: 0; padding: 9px 16px; }
.held-panel h2, .held-panel h3 { margin: 0; font-size: 16px; }
.held-panel h2 small, .held-panel h3 small { margin-left: 5px; color: #abb9c9; font-size: 12px; font-weight: normal; }
.collapse-button, .lineup-header input, .held-actions button, .held-action {
  color: #edf2f7;
  background: #222d3a;
  border: 1px solid #3b4959;
  border-radius: 6px;
}
.collapse-button { width: 28px; height: 26px; cursor: pointer; }
.lineup-header label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.lineup-header input { width: 60px; padding: 2px 4px; }
.held-columns { display: grid; grid-template-columns: minmax(0, 38fr) minmax(0, 62fr); border-top: 1px solid #303943; }
.held-columns > section { min-width: 0; padding: 12px 16px 16px; }
.held-columns > :last-child { border-left: 1px solid #303943; }
p { margin: 6px 0 10px; color: #abb9c9; font-size: 12px; }
.pieces { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
.waiting-lineup { margin-top: 10px; padding-top: 8px; border-top: 1px solid #303943; }
.waiting-lineup h4 { margin: 0 0 6px; font-size: 13px; }
.waiting-piece { gap: 7px; padding: 4px 8px; font-size: 13px; }
.piece { display: flex; align-items: center; border: 1px solid #334151; border-radius: 7px; background: #222d3a; color: #edf2f7; }
.held-operator { display: flex; align-items: center; gap: 7px; padding: 4px 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.held-sell { margin-right: 4px; padding: 1px 5px; border: 1px solid #415166; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
.held-operator:hover, .held-sell:hover, .collapse-button:hover { background: #304153; }
.piece img { border-radius: 4px; object-fit: cover; }
.piece small { display: block; font-size: 11px; color: #abb9c9; }
.piece.promoted { border-color: #b5985b; }
.piece.promoted small { color: #ffe2ab; }
.held-columns > .held-covenants { grid-column: 1 / -1; padding-block: 6px; border-bottom: 1px solid #303943; }
.held-covenants p { margin-bottom: 0; }
.held-covenants ul { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 0; padding: 0; list-style: none; }
.held-covenants li { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 2px; width: 60px; padding: 3px; border: 1px solid #334151; border-radius: 6px; background: #202b38; }
.held-covenants .target-covenant-card { cursor: pointer; }
.held-covenants .target-covenant-card:hover { border-color: #7c8fa6; }
.held-covenants .target-covenant-card.is-target { border-color: #79b8ad; background: #2c4747; }
.is-target .layer-stepper button, .held-covenants .is-target input { border-color: #659b91; background: #23413f; }
.target-covenant-toggle { width: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; }
.layer-name { display: grid; place-items: center; min-height: 18px; color: #edf2f7; font-size: 12px; font-weight: 600; line-height: 1.2; text-align: center; overflow-wrap: anywhere; }
.layer-name.inactive { color: #8d99a8; }
.layer-name.inactive img { filter: grayscale(1); opacity: .55; }
.held-covenants img { object-fit: contain; }
.held-covenants input { display: block; min-width: 0; width: 100%; height: 20px; padding: 0 2px; border: 1px solid #415166; border-radius: 4px; background: #151e2a; color: #edf2f7; appearance: textfield; font-size: 12px; text-align: center; font-variant-numeric: tabular-nums; }
.held-covenants input::-webkit-inner-spin-button { appearance: none; }
.layer-stepper { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px; }
.layer-stepper button { display: grid; place-items: center; height: 14px; min-width: 0; padding: 0; border: 1px solid #415166; border-radius: 3px; background: #263444; color: #edf2f7; font-size: 10px; line-height: 1; cursor: pointer; }
.layer-stepper button:focus-visible, .held-covenants input:focus-visible { outline: 1px solid #a8ebda; outline-offset: 1px; }
.held-actions, .held-heading { display: flex; align-items: center; gap: 5px; }
.held-actions { flex-wrap: wrap; }
.held-actions button, .held-action { padding: 2px 6px; font-size: 12px; cursor: pointer; }
.held-actions button[aria-pressed="true"] { background: #2c4747; border-color: #79b8ad; }
.held-actions .collapse-button { width: 24px; height: 23px; }
.layer-stepper button:hover:enabled, .held-actions button:hover:enabled, .held-action:hover:enabled { background: #304153; }
.layer-stepper button:disabled, .held-actions button:disabled, .held-action:disabled { opacity: .45; cursor: default; }
@media (max-width: 660px) {
  .held-columns { grid-template-columns: minmax(0, 1fr); }
  .held-columns > :last-child { border-top: 1px solid #303943; border-left: none; }
}
</style>
